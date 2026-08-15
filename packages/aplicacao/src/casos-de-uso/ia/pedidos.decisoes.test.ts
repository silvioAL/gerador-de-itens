import { describe, expect, it } from "vitest";
import { montarPedidoDecisoes, PedidoInvalido } from "./pedidos.js";

/**
 * SPEC-57 fatia C — o agente propõe DECISÕES a partir do desenho medido.
 *
 * O que estes testes guardam não é o texto do prompt (que muda), e sim as três
 * disciplinas que separam isto de "gerar ADRs com IA": ele recebe a MEDIÇÃO,
 * é obrigado a dar as alternativas descartadas, e não re-litiga o que já foi
 * decidido.
 */
const COMPONENTES = [
  { id: "n1", rotulo: "srv-checkout", tipo: "Serviço" },
  { id: "n2", rotulo: "bureau-externo", tipo: "Sistema externo" },
];

describe("montarPedidoDecisoes", () => {
  it("sem componente desenhado, recusa em vez de inventar decisão", () => {
    // Decisão de arquitetura se ancora em um elemento. Pedir uma sobre uma mesa
    // em branco devolveria arquitetura genérica de blog.
    expect(() => montarPedidoDecisoes({ contextoEpico: "qualquer coisa" })).toThrow(PedidoInvalido);
    expect(() => montarPedidoDecisoes({ componentes: [] })).toThrow(/desenhe antes/i);
  });

  it("`noId` é um enum FECHADO — o agente não pode ancorar em nó inventado", () => {
    const pedido = montarPedidoDecisoes({ componentes: COMPONENTES });

    const item = (pedido.esquema as any).properties.decisoes.items;
    expect(item.properties.noId.enum).toEqual(["n1", "n2"]);
  });

  it("o esquema EXIGE duas alternativas — é a régua da fatia inteira", () => {
    // Proposta com uma opção só é a opinião do modelo vestida de decisão: a
    // pessoa não teria contra o que pesar.
    const pedido = montarPedidoDecisoes({ componentes: COMPONENTES });

    const item = (pedido.esquema as any).properties.decisoes.items;
    expect(item.properties.alternativas.minItems).toBe(2);
    // E cada descartada precisa do custo: alternativa sem consequência não
    // informa nada a quem vai escolher.
    expect(item.properties.alternativas.items.required).toContain("consequencia");
    expect(item.required).toEqual(expect.arrayContaining(["porque", "escolhida"]));
  });

  it("a MEDIÇÃO do motor entra no prompt, com o porquê do padrão", () => {
    // É o elo que faz a proposta ser sobre ESTE desenho. Sem ele o agente só
    // vê o diagrama e devolve arquitetura de referência.
    const pedido = montarPedidoDecisoes({
      componentes: COMPONENTES,
      violacoes: [
        {
          noId: "n2",
          campo: "timeoutMs",
          esperado: "≤ 500ms",
          atual: "3000",
          porque: "Chamada externa sem teto trava o chamador junto.",
        },
      ],
    });

    expect(pedido.prompt).toContain("n2.timeoutMs");
    expect(pedido.prompt).toContain("esperado ≤ 500ms, está 3000");
    expect(pedido.prompt).toContain("trava o chamador junto");
  });

  it("as lacunas de propósito também entram", () => {
    const pedido = montarPedidoDecisoes({
      componentes: COMPONENTES,
      lacunas: ["o pedido não pode ser cobrado duas vezes"],
    });

    expect(pedido.prompt).toContain("o pedido não pode ser cobrado duas vezes");
  });

  it("o que já foi decidido entra como proibição explícita", () => {
    // Agente que re-litiga decisão tomada ensina a pessoa a ignorar as
    // propostas — e aí a fatia inteira vira ruído.
    const pedido = montarPedidoDecisoes({
      componentes: COMPONENTES,
      jaDecididas: ["Fila em vez de chamada síncrona"],
    });

    expect(pedido.prompt).toMatch(/Já decidido[\s\S]*Fila em vez de chamada síncrona/);
  });

  it("o prompt diz, com todas as letras, que lista vazia é resposta correta", () => {
    // Sem isso o modelo preenche a cota, e decisão inventada faz a pessoa parar
    // de ler todas — inclusive as boas.
    const pedido = montarPedidoDecisoes({ componentes: COMPONENTES });

    expect(pedido.prompt).toMatch(/VAZIA/);
    expect(pedido.prompt).toMatch(/resposta correta/i);
    // E a régua contra o excesso, dita ao modelo e não só ao formulário.
    expect(pedido.prompt).toContain("NÃO é decisão");
  });
});
