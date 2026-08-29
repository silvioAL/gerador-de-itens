import { describe, expect, it } from "vitest";
import { montarPedidoDiagrama } from "./pedidos.js";
import { comoDecisao } from "../../portas/leitorDeAdr.js";
import { decisoesQuePodemVoltar } from "../../portas/escritorDeAdr.js";

const BASE = {
  descricao: "Busca por SKU no catálogo",
  tiposDeNo: [{ id: "service", rotulo: "Serviço" }],
};

function prompt(pedido: ReturnType<typeof montarPedidoDiagrama>): string {
  return JSON.stringify(pedido);
}

describe("o ADR da casa orienta o desenho proposto (SPEC-81 fatia D)", () => {
  it("as decisões já tomadas entram no pedido, com o porquê", () => {
    /**
     * É onde o ADR importado muda alguma coisa. Um ADR que diga *"fila em vez de
     * chamada síncrona"* deve impedir que a proposta nasça com a chamada
     * síncrona — e sem isto o modelo não tem como saber, porque a decisão vive
     * num repositório que ele nunca viu.
     */
    const pedido = montarPedidoDiagrama({
      ...BASE,
      decisoesDaCasa: [
        { titulo: "Integração com bureau", escolhida: "Fila", porque: "desacopla o tempo do parceiro" },
      ],
    });

    const texto = prompt(pedido);
    expect(texto).toContain("Decisões de arquitetura JÁ TOMADAS");
    expect(texto).toContain("Integração com bureau: Fila");
    expect(texto).toContain("desacopla o tempo do parceiro");
  });

  it("sem decisões, o pedido é EXATAMENTE o de antes", () => {
    // A garantia que impede esta fatia de mexer em quem não a usa: nenhuma
    // organização sem repositório de ADR vê o prompt mudar.
    const semCampo = montarPedidoDiagrama(BASE);
    const comVazio = montarPedidoDiagrama({ ...BASE, decisoesDaCasa: [] });

    expect(prompt(comVazio)).toBe(prompt(semCampo));
    expect(prompt(semCampo)).not.toContain("JÁ TOMADAS");
  });

  it("decisão sem escolhida nem porquê ainda orienta pelo título", () => {
    // ADR pobre é o caso comum (ver `comoDecisao`): o título sozinho já diz ao
    // modelo que o assunto foi decidido, e é melhor que silêncio.
    const texto = prompt(montarPedidoDiagrama({ ...BASE, decisoesDaCasa: [{ titulo: "Sem chamada síncrona ao bureau" }] }));

    expect(texto).toContain("Sem chamada síncrona ao bureau");
  });
});

describe("o ciclo do ADR fecha, e não se morde (SPEC-81 fatias C+E)", () => {
  it("o que entra importado NÃO volta — senão a casa recebe cópia da própria decisão", () => {
    /**
     * O teste que amarra as duas fatias. Sem ele, cada importação seguida de
     * publicação criaria uma cópia da decisão da casa dentro da casa, com outro
     * identificador — e a cada rodada mais uma.
     */
    const importada = comoDecisao({ id: "ADR-14", titulo: "Fila", status: "accepted" }, "2026-08-29T10:00:00.000Z");

    expect(importada.status).toBe("aceita");
    expect(decisoesQuePodemVoltar([importada])).toEqual([]);
  });

  it("mas a decisão tomada AQUI volta, com a âncora e os ensaios", () => {
    const local = {
      id: "d1",
      titulo: "Mongo em vez de SQL",
      alternativas: [{ titulo: "Postgres" }],
      escolhida: "Mongo",
      porque: "a forma varia por categoria",
      status: "aceita" as const,
      origem: "manual" as const,
      autor: "ana",
      em: "2026-08-29T10:00:00.000Z",
      noId: "n2",
      ensaioIds: ["e1"],
    };

    const [saida] = decisoesQuePodemVoltar([local], () => "produtos (Coleção Mongo)");

    expect(saida.id).toBe("d1");
    expect(saida.ancoradaEm).toBe("produtos (Coleção Mongo)");
    expect(saida.ensaios).toBe(1);
  });
});
