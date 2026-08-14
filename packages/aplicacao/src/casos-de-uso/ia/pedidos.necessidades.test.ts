import { describe, expect, it } from "vitest";
import { montarPedidoNecessidades } from "./pedidos.js";
import { PedidoInvalido } from "./pedidos.js";

/**
 * SPEC-57 fatia D — o agente propõe o PROPÓSITO. O que estes testes guardam
 * não é o texto do prompt (que muda), e sim as decisões que o tornam honesto:
 * ele não pode inventar componente, não pode repetir o que já foi declarado, e
 * não pode ser chamado sem contexto de onde tirar propósito.
 */
describe("montarPedidoNecessidades", () => {
  it("sem contexto nenhum, recusa em vez de inventar propósito", () => {
    expect(() => montarPedidoNecessidades({})).toThrow(PedidoInvalido);
    expect(() => montarPedidoNecessidades({ contextoEpico: "   " })).toThrow(/contexto/i);
  });

  it("o contexto do produto sozinho já basta", () => {
    const pedido = montarPedidoNecessidades({ contextoDoProduto: "Portabilidade de conta." });
    expect(pedido.prompt).toContain("Portabilidade de conta.");
  });

  it("`atendidaPor` é um enum FECHADO dos componentes desenhados", () => {
    const pedido = montarPedidoNecessidades({
      contextoEpico: "cobrança recorrente",
      componentes: [
        { id: "n1", rotulo: "worker-pagamento", tipo: "service" },
        { id: "n2", rotulo: "fila-cobranca", tipo: "rabbit" },
      ],
    });

    const item = (pedido.esquema as any).properties.necessidades.items;
    expect(item.properties.atendidaPor.items.enum).toEqual(["n1", "n2"]);
    expect(pedido.prompt).toContain("n1: worker-pagamento");
  });

  it("sem componente desenhado, o campo de vínculo SOME do esquema", () => {
    // Enum vazio não dá ao modelo o que responder — e um esquema que pede um
    // campo impossível é o jeito mais rápido de receber lixo de volta.
    const pedido = montarPedidoNecessidades({ contextoEpico: "cobrança recorrente" });

    const item = (pedido.esquema as any).properties.necessidades.items;
    expect(item.properties.atendidaPor).toBeUndefined();
    expect(pedido.prompt).toContain("Não há componentes desenhados ainda");
  });

  it("as já declaradas entram como proibição explícita, não como sugestão", () => {
    const pedido = montarPedidoNecessidades({
      contextoEpico: "cobrança",
      jaDeclaradas: ["não cobrar duas vezes"],
    });

    expect(pedido.prompt).toContain("NÃO repita");
    expect(pedido.prompt).toContain("- não cobrar duas vezes");
  });

  it("o motivo é obrigatório no esquema — proposta sem porquê é caixa-preta", () => {
    const pedido = montarPedidoNecessidades({ contextoEpico: "cobrança" });
    const item = (pedido.esquema as any).properties.necessidades.items;
    expect(item.required).toContain("motivo");
  });
});
