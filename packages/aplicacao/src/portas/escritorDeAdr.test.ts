import { describe, expect, it } from "vitest";
import type { Decisao } from "@gerador/engine";
import { decisoesQuePodemVoltar } from "./escritorDeAdr.js";

function decisao(parcial: Partial<Decisao>): Decisao {
  return {
    id: "d1",
    titulo: "Mongo em vez de SQL",
    alternativas: [{ titulo: "Postgres" }],
    escolhida: "Mongo",
    porque: "a forma varia por categoria",
    status: "aceita",
    origem: "manual",
    autor: "ana",
    em: "2026-08-29T10:00:00.000Z",
    ...parcial,
  };
}

describe("o que volta para o repositório de ADR da casa (SPEC-81 fatia E)", () => {
  it("decisão IMPORTADA não volta — veio de lá", () => {
    /**
     * A recusa da SPEC-81 §5 vista do outro lado. Reenviar criaria uma cópia da
     * decisão da casa dentro do repositório da própria casa, com outro
     * identificador — e a partir daí ninguém sabe qual é a original.
     *
     * `importadoDe` é o campo que torna isso verificável em vez de convencional.
     */
    const decisoes = [decisao({ id: "local" }), decisao({ id: "adr:ADR-14", importadoDe: "https://adr/14" })];

    expect(decisoesQuePodemVoltar(decisoes).map((a) => a.id)).toEqual(["local"]);
  });

  it("decisão PROPOSTA não volta — proposta não é fato", () => {
    // Um repositório de ADR cheio de rascunho deixa de ser registro do que foi
    // decidido e vira rascunho compartilhado.
    const decisoes = [
      decisao({ id: "aceita", status: "aceita" }),
      decisao({ id: "proposta", status: "proposta" }),
      decisao({ id: "substituida", status: "substituida" }),
    ];

    expect(decisoesQuePodemVoltar(decisoes).map((a) => a.id)).toEqual(["aceita", "substituida"]);
  });

  it("leva o que este produto tem e um ADR comum não tem", () => {
    /**
     * As decisões daqui nascem ancoradas num elemento do desenho e ligadas à
     * conta que as justificou (§307). Deixar isso para trás na exportação seria
     * publicar um ADR mais pobre do que o que temos.
     */
    const decisoes = [decisao({ noId: "n2", ensaioIds: ["e1", "e2"] })];

    const [adr] = decisoesQuePodemVoltar(decisoes, (id) => (id === "n2" ? "produtos (Coleção Mongo)" : undefined));

    expect(adr.ancoradaEm).toBe("produtos (Coleção Mongo)");
    expect(adr.ensaios).toBe(2);
  });

  it("elemento sem rótulo conhecido não vira id cru na página", () => {
    // Um id de nó só faz sentido aqui dentro. Publicar `n2` numa wiki é ruído
    // para quem lê do outro lado.
    const [adr] = decisoesQuePodemVoltar([decisao({ noId: "n2" })]);

    expect(adr.ancoradaEm).toBeUndefined();
  });

  it("a decisão substituída leva PARA QUE foi substituída", () => {
    // É metade do valor de um ADR aposentado: sem o sucessor, quem lê fica
    // sabendo que a decisão morreu e não o que vale hoje.
    const [adr] = decisoesQuePodemVoltar([decisao({ status: "substituida", substituidaPor: "d9" })]);

    expect(adr.substituidaPor).toBe("d9");
  });

  it("sem decisão que possa voltar, a lista é vazia — e é assim que a tela sabe não oferecer o botão", () => {
    expect(decisoesQuePodemVoltar([decisao({ status: "proposta" })])).toEqual([]);
    expect(decisoesQuePodemVoltar([])).toEqual([]);
  });
});
