import { describe, expect, it } from "vitest";
import type { Aresta, Decisao, Diagrama, No } from "../model/types.js";
import {
  decisoesDoElemento,
  decisoesVigentes,
  excecoesComoDecisoes,
  propostasPendentes,
  resumirDecisoes,
} from "./decisoes.js";

function no(id: string): No {
  return { id, type: "service", x: 0, y: 0, label: id, status: "novo", spec: {}, specNA: {} };
}
function aresta(id: string, source: string, target: string): Aresta {
  return { id, source, target, type: "chamada" };
}
function diagrama(nodes: No[] = [], edges: Aresta[] = []): Diagrama {
  return { nodes, edges };
}
function decisao(p: Partial<Decisao> & { id: string }): Decisao {
  return {
    titulo: `título de ${p.id}`,
    alternativas: [{ titulo: "A" }, { titulo: "B", consequencia: "acopla ao legado" }],
    escolhida: "A",
    porque: "porque A isola o legado",
    status: "aceita",
    origem: "manual",
    autor: "quem decidiu",
    em: "2026-08-15T12:00:00.000Z",
    ...p,
  };
}

describe("decisões — o porquê ancorado no desenho (SPEC-57 fatia C)", () => {
  it("sem decisão nenhuma, não há nada a apontar", () => {
    // Mesma disciplina da fatia A: a capacidade nova não pode tornar errado o
    // que já existia.
    const resumo = resumirDecisoes(diagrama([no("n1"), no("n2")]), []);

    expect(resumo).toEqual({ vigentes: 0, propostas: 0, orfas: [], semPorque: [] });
  });

  it("regra 2: proposta do agente não vale até alguém aceitar", () => {
    const decisoes = [
      decisao({ id: "d1", status: "proposta", origem: "sugerido" }),
      decisao({ id: "d2" }),
    ];

    expect(decisoesVigentes(decisoes).map((d) => d.id)).toEqual(["d2"]);
    expect(propostasPendentes(decisoes).map((d) => d.id)).toEqual(["d1"]);
    // E ela não chega ao elemento: item nenhum pode alegar seguir decisão que
    // ninguém tomou.
    expect(decisoesDoElemento("n1", [decisao({ id: "d1", noId: "n1", status: "proposta" })])).toEqual([]);
  });

  it("decisão substituída sai da leitura de hoje sem sair do histórico", () => {
    const decisoes = [
      decisao({ id: "d1", noId: "n1", status: "substituida", substituidaPor: "d2" }),
      decisao({ id: "d2", noId: "n1" }),
    ];

    expect(decisoesDoElemento("n1", decisoes).map((d) => d.id)).toEqual(["d2"]);
    // Continua na lista: quem apaga a decisão revista faz o time repetir o ciclo.
    expect(decisoes).toHaveLength(2);
  });

  it("apagar o nó decidido NÃO limpa a decisão — ela vira órfã e reaparece", () => {
    // O evento que precisa ser visto, não silenciado (mesma régua do vínculo
    // quebrado em analisarLacunas).
    const antes = resumirDecisoes(diagrama([no("n1")]), [decisao({ id: "d1", noId: "n1" })]);
    const depois = resumirDecisoes(diagrama([]), [decisao({ id: "d1", noId: "n1" })]);

    expect(antes.orfas).toEqual([]);
    expect(depois.orfas).toEqual(["d1"]);
  });

  it("decisão sem âncora é da quebra inteira, e nunca é órfã", () => {
    const resumo = resumirDecisoes(diagrama([]), [decisao({ id: "d1" })]);

    expect(resumo.orfas).toEqual([]);
    expect(resumo.vigentes).toBe(1);
  });

  it("decisão ancorada em ARESTA também é encontrada, e também fica órfã", () => {
    const comAresta = diagrama([no("n1"), no("n2")], [aresta("e1", "n1", "n2")]);
    const d = [decisao({ id: "d1", arestaId: "e1" })];

    expect(decisoesDoElemento("e1", d).map((x) => x.id)).toEqual(["d1"]);
    expect(resumirDecisoes(comAresta, d).orfas).toEqual([]);
    expect(resumirDecisoes(diagrama([no("n1"), no("n2")]), d).orfas).toEqual(["d1"]);
  });

  it("decisão vigente sem porquê é apontada — é a fatia inteira faltando", () => {
    const resumo = resumirDecisoes(diagrama([no("n1")]), [
      decisao({ id: "d1", noId: "n1", porque: "   " }),
      decisao({ id: "d2", noId: "n1" }),
      // Proposta sem porquê não é cobrada: ela ainda não é decisão de ninguém.
      decisao({ id: "d3", noId: "n1", porque: "", status: "proposta" }),
    ]);

    expect(resumo.semPorque).toEqual(["d1"]);
  });

  it("a exceção de padrão é LIDA como decisão, sem virar uma cópia dela", () => {
    // O caso 3 da M5: emenda ao ADR do padrão. Derivada, não persistida — duas
    // cópias da mesma verdade divergem na primeira edição.
    const [d] = excecoesComoDecisoes([
      { noId: "n1", campo: "timeoutMs", motivo: "o parceiro é lento e o prazo é regulatório", autor: "ana", em: "2026-08-15T12:00:00.000Z" },
    ]);

    expect(d.noId).toBe("n1");
    expect(d.porque).toContain("parceiro é lento");
    expect(d.escolhida).toBe("Contrariar, com motivo registrado");
    // As duas opções aparecem: seguir o padrão era alternativa real.
    expect(d.alternativas).toHaveLength(2);
    // E ela NÃO entra no placar de decisões — o placar de conformidade já a conta.
    expect(resumirDecisoes(diagrama([no("n1")]), []).vigentes).toBe(0);
  });
});
