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

  it("o schema restringe o alvo ao enum — teste-automatizado fica fora até o mapeamento pra regras.testes ser medido", () => {
    const { esquema } = montarPedidoConfigurarConversa({ mensagens });
    const propostas = (esquema as unknown as { properties: { propostas: { items: { properties: { alvo: { enum: string[] } } } } } })
      .properties.propostas.items.properties.alvo.enum;
    expect(propostas).toEqual([...ALVOS_DA_CONVERSA_DE_CONFIG]);
    expect(propostas).toContain("regra-refinamento");
    expect(propostas).not.toContain("teste-automatizado");
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
    const propostas = (esquema as unknown as { properties: { propostas: { minItems?: number } } }).properties.propostas;
    expect(propostas.minItems).toBeUndefined();
    expect(prompt).toContain("Lista vazia é resposta correta");
  });
});

/**
 * §271 — o contexto do produto escrito com apoio do assistente.
 */
describe("montarPedidoSugerirConfig — alvo contexto-do-produto", () => {
  it("pede as CINCO seções de uma vez, e todas obrigatórias no schema", () => {
    // Uma por vez daria cinco respostas que não se conhecem: as seções são um
    // texto só partido em pedaços, e quem descreve o produto descreve tudo.
    const { esquema } = montarPedidoSugerirConfig({
      alvo: "contexto-do-produto",
      instrucao: "portabilidade de conta salário",
    });

    const props = (esquema as unknown as { properties: Record<string, unknown>; required: string[] });
    expect(Object.keys(props.properties).sort()).toEqual(
      ["objetivo", "quemUsa", "regrasDeNegocio", "restricoes", "sistemas"].sort()
    );
    expect(props.required.sort()).toEqual(Object.keys(props.properties).sort());
  });

  it("manda separar o que vale SEMPRE do que é desta entrega", () => {
    // É a confusão que estraga o campo: regra de uma demanda escrita como se
    // valesse para o produto inteiro contamina todas as demandas seguintes.
    const { prompt } = montarPedidoSugerirConfig({
      alvo: "contexto-do-produto",
      instrucao: "portabilidade de conta salário",
      contexto: "Portabilidade",
    });

    expect(prompt).toContain("valem SEMPRE");
    expect(prompt).toContain("nesta entrega");
    // E manda deixar em branco o que não sabe: contexto de negócio inventado
    // vira item errado com cara de item certo.
    expect(prompt).toContain("string vazia");
  });
});
