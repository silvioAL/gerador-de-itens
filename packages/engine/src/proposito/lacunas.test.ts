import { describe, expect, it } from "vitest";
import type { Aresta, Diagrama, Necessidade, No } from "../model/types.js";
import { analisarLacunas, necessidadeConta, necessidadesDoElemento } from "./lacunas.js";

function no(id: string): No {
  return { id, type: "service", x: 0, y: 0, label: id, status: "novo", spec: {}, specNA: {} };
}
function aresta(id: string, source: string, target: string): Aresta {
  return { id, source, target, type: "chamada" };
}
function diagrama(nodes: No[] = [], edges: Aresta[] = []): Diagrama {
  return { nodes, edges };
}
function necessidade(p: Partial<Necessidade> & { id: string }): Necessidade {
  return { texto: `texto de ${p.id}`, origem: "manual", atendidaPor: [], ...p };
}

describe("analisarLacunas — o propósito ligado ao desenho (SPEC-57 fatia A)", () => {
  it("sem necessidade declarada, NÃO existe lacuna", () => {
    // A feature não pode tornar errado o que já existia. Quebra que nunca
    // declarou propósito continua tão pronta quanto era.
    const lacunas = analisarLacunas(diagrama([no("n1"), no("n2")]), []);

    expect(lacunas.semElemento).toEqual([]);
    expect(lacunas.elementosSemNecessidade).toEqual([]);
  });

  it("necessidade sem vínculo é lacuna; com vínculo vivo, não é", () => {
    const d = diagrama([no("n1")]);

    expect(analisarLacunas(d, [necessidade({ id: "r1" })]).semElemento).toEqual(["r1"]);
    expect(
      analisarLacunas(d, [necessidade({ id: "r1", atendidaPor: ["n1"] })]).semElemento
    ).toEqual([]);
  });

  it("apagar o nó que atendia a necessidade faz ela voltar a ser lacuna", () => {
    // O ponto da decisão de não cascatear: o vínculo órfão é o evento que
    // precisa REAPARECER. Limpar em silêncio esconderia justamente isto.
    const antes = analisarLacunas(diagrama([no("n1")]), [
      necessidade({ id: "r1", atendidaPor: ["n1"] }),
    ]);
    expect(antes.semElemento).toEqual([]);
    expect(antes.vinculosQuebrados).toEqual([]);

    const depois = analisarLacunas(diagrama([]), [necessidade({ id: "r1", atendidaPor: ["n1"] })]);
    expect(depois.semElemento).toEqual(["r1"]);
    expect(depois.vinculosQuebrados).toEqual([{ necessidadeId: "r1", elementoId: "n1" }]);
  });

  it("um vínculo vivo basta, mesmo com outro quebrado ao lado", () => {
    const lacunas = analisarLacunas(diagrama([no("n2")]), [
      necessidade({ id: "r1", atendidaPor: ["n1", "n2"] }),
    ]);

    expect(lacunas.semElemento).toEqual([]);
    expect(lacunas.vinculosQuebrados).toEqual([{ necessidadeId: "r1", elementoId: "n1" }]);
  });

  it("aresta também pode atender — ligar não é a única coisa que ela faz", () => {
    const d = diagrama([no("n1"), no("n2")], [aresta("e1", "n1", "n2")]);
    const lacunas = analisarLacunas(d, [necessidade({ id: "r1", atendidaPor: ["e1"] })]);

    expect(lacunas.semElemento).toEqual([]);
  });

  describe("regra 2 — nada conta até ser confirmado", () => {
    it("necessidade sugerida e não confirmada não acusa lacuna nem dá nó por atendido", () => {
      const d = diagrama([no("n1")]);
      const sugerida = necessidade({ id: "r1", origem: "sugerido", atendidaPor: ["n1"] });

      const lacunas = analisarLacunas(d, [sugerida]);

      expect(lacunas.naoConfirmadas).toEqual(["r1"]);
      expect(lacunas.semElemento).toEqual([]);
      // E o nó continua órfão: o agente sugerindo vínculo NÃO pode fechar o
      // buraco que ele mesmo deveria expor.
      expect(lacunas.elementosSemNecessidade).toEqual(["n1"]);
    });

    it("confirmada, a mesma necessidade passa a contar dos dois lados", () => {
      const d = diagrama([no("n1")]);
      const confirmada = necessidade({
        id: "r1",
        origem: "sugerido",
        confirmado: true,
        atendidaPor: ["n1"],
      });

      const lacunas = analisarLacunas(d, [confirmada]);

      expect(lacunas.naoConfirmadas).toEqual([]);
      expect(lacunas.elementosSemNecessidade).toEqual([]);
    });

    it("`manual` conta sem precisar de confirmação — quem escreveu já decidiu", () => {
      expect(necessidadeConta(necessidade({ id: "r1" }))).toBe(true);
      expect(necessidadeConta(necessidade({ id: "r2", origem: "inferido" }))).toBe(false);
      expect(necessidadeConta(necessidade({ id: "r3", origem: "extraido" }))).toBe(true);
    });
  });

  it("nó sem necessidade é informativo, e só aparece quando há propósito declarado", () => {
    const d = diagrama([no("n1"), no("n2")]);

    expect(analisarLacunas(d, []).elementosSemNecessidade).toEqual([]);
    expect(
      analisarLacunas(d, [necessidade({ id: "r1", atendidaPor: ["n1"] })]).elementosSemNecessidade
    ).toEqual(["n2"]);
  });
});

describe("necessidadesDoElemento — a citação que chega ao item", () => {
  const necessidades = [
    necessidade({ id: "r1", texto: "não cobrar duas vezes", atendidaPor: ["n1"] }),
    necessidade({ id: "r2", texto: "confirmar em 2s", atendidaPor: ["n1", "n2"] }),
    necessidade({ id: "r3", origem: "sugerido", atendidaPor: ["n1"] }),
  ];

  it("devolve as confirmadas que este elemento atende, e ignora as outras", () => {
    expect(necessidadesDoElemento("n1", necessidades).map((n) => n.id)).toEqual(["r1", "r2"]);
    expect(necessidadesDoElemento("n2", necessidades).map((n) => n.id)).toEqual(["r2"]);
    expect(necessidadesDoElemento("n9", necessidades)).toEqual([]);
  });

  it("sem elemento de origem, não cita nada", () => {
    // Item derivado de aresta tem `nodeId` indefinido — não pode virar exceção.
    expect(necessidadesDoElemento(undefined, necessidades)).toEqual([]);
  });
});
