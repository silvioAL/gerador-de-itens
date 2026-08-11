import { describe, expect, it } from "vitest";
import {
  ALVOS_DA_CONVERSA_DE_CONFIG,
  PedidoInvalido,
  montarPedidoConfigurarConversa,
  montarPedidoSugerirConfig,
} from "./pedidos.js";

/**
 * SPEC-34 Fase 1 — o primeiro passo da conversa de configuração.
 *
 * O que importa afirmar aqui é o CONTRATO entre os dois passos: o enum de
 * `alvo` no schema do passo 1 só pode conter alvos que o passo 2
 * (`montarPedidoSugerirConfig`) aceita — se divergirem, o modelo propõe um
 * alvo que a materialização recusa com 400, e a conversa quebra no meio.
 */
describe("montarPedidoConfigurarConversa (SPEC-34 Fase 1)", () => {
  const mensagens = [
    { autor: "agente" as const, texto: "O que você quer configurar?" },
    { autor: "voce" as const, texto: "todo serviço novo precisa declarar o runbook de plantão" },
  ];

  it("todo alvo que o passo 1 pode propor é aceito pelo passo 2 — o contrato entre as duas chamadas", () => {
    for (const alvo of ALVOS_DA_CONVERSA_DE_CONFIG) {
      // Se o alvo não existir na tabela, isto lança PedidoInvalido e o teste quebra.
      const { esquema } = montarPedidoSugerirConfig({ alvo, instrucao: "qualquer instrução" });
      expect(esquema).toBeTruthy();
    }
  });

  it("o schema restringe o alvo ao enum da Fase 1 — regras ficam pra Fase 2, junto das retrospectivas", () => {
    const { esquema } = montarPedidoConfigurarConversa({ mensagens });
    const propostas = (esquema as { properties: { propostas: { items: { properties: { alvo: { enum: string[] } } } } } })
      .properties.propostas.items.properties.alvo.enum;
    expect(propostas).toEqual([...ALVOS_DA_CONVERSA_DE_CONFIG]);
    expect(propostas).not.toContain("regra-refinamento");
  });

  it("a conversa inteira entra no prompt, com quem disse o quê", () => {
    const { prompt } = montarPedidoConfigurarConversa({ mensagens, resumoConfig: "16 tipos de nó; 4 papéis" });
    expect(prompt).toContain("Pessoa: todo serviço novo precisa declarar o runbook de plantão");
    expect(prompt).toContain("Você: O que você quer configurar?");
    expect(prompt).toContain("16 tipos de nó; 4 papéis");
    // A instrução destilada precisa ser autossuficiente — é a regra que faz o
    // segundo passo funcionar sem ver a conversa.
    expect(prompt).toContain("sem ver esta conversa");
  });

  it("sem nenhuma fala da pessoa é 400, não uma chamada de IA desperdiçada", () => {
    expect(() => montarPedidoConfigurarConversa({ mensagens: [] })).toThrow(PedidoInvalido);
    expect(() =>
      montarPedidoConfigurarConversa({ mensagens: [{ autor: "agente", texto: "olá" }] })
    ).toThrow(PedidoInvalido);
    expect(() => montarPedidoConfigurarConversa({ mensagens: [{ autor: "voce", texto: "   " }] })).toThrow(
      PedidoInvalido
    );
  });

  it("lista vazia de propostas é resposta válida do schema — perguntar de volta não é falha", () => {
    const { esquema, prompt } = montarPedidoConfigurarConversa({ mensagens });
    const propostas = (esquema as { properties: { propostas: { minItems?: number } } }).properties.propostas;
    expect(propostas.minItems).toBeUndefined();
    expect(prompt).toContain("Lista vazia é resposta correta");
  });
});
