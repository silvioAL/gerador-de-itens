import { describe, expect, it } from "vitest";
import type { DiagramaConfig, RegrasConfig } from "../config/types.js";
import type { Decisao, Diagrama, No, Percurso, ValorSpec } from "../model/types.js";
import { deltaDeDecisao, deltaDePercurso, piorou } from "./remedicao.js";

const config: DiagramaConfig = {
  nodeTypes: {
    service: {
      label: "Serviço",
      derives: "service",
      techs: ["Backend"],
      contextos: ["Backend-chamadas http"],
      spec: [{ key: "timeoutMs", label: "Timeout", type: "number" }],
    },
  },
  edgeTypes: {},
  edgeRules: {},
};

function no(id: string, timeoutMs?: number): No {
  const spec: Record<string, ValorSpec> = {};
  if (timeoutMs !== undefined) spec.timeoutMs = { valor: timeoutMs, origem: "manual" };
  return { id, type: "service", x: 0, y: 0, label: id, status: "novo", spec, specNA: {} };
}

const REGRAS: RegrasConfig = {
  tipos: [],
  tamanhos: [],
  porTech: { Backend: { checklistTecnico: [], testes: [] } },
  percursos: [
    {
      texto: "orçamento de latência",
      checagem: { campo: "timeoutMs", agregacao: "soma", operador: "lte", valor: 1000, unidade: "ms" },
    },
  ],
};

const CAMINHO: Percurso = { id: "pc::n1>n2", rotulo: "n1 → n2", nos: ["n1", "n2"], origem: "inferido" };

const BASE: Decisao = {
  id: "d1",
  noId: "n1",
  titulo: "Fila em vez de síncrono",
  alternativas: [{ titulo: "A" }, { titulo: "B" }],
  escolhida: "A",
  porque: "desacopla",
  status: "proposta",
  origem: "sugerido",
  autor: "agente",
  em: "2026-08-16T10:00:00.000Z",
};

describe("deltaDeDecisao — o placar depois do aceite (§263)", () => {
  const diagrama: Diagrama = { nodes: [no("n1")], edges: [] };

  it("aceitar move a proposta para vigente — os dois lados da mesma conta", () => {
    const { linhas } = deltaDeDecisao(diagrama, [BASE], "d1");

    expect(linhas).toEqual([
      { rotulo: "propostas esperando", antes: 1, depois: 0 },
      { rotulo: "decisões vigentes", antes: 0, depois: 1 },
    ]);
  });

  it("proposta SEM porquê acusa que aceitar cria dívida", () => {
    // A régua da fatia: o delta existe para mostrar o trabalho que o aceite
    // CRIA, e não só o que ele resolve.
    const { linhas, alerta } = deltaDeDecisao(diagrama, [{ ...BASE, porque: "" }], "d1");

    expect(linhas).toContainEqual({ rotulo: "decisões sem o porquê", antes: 0, depois: 1 });
    expect(alerta).toContain("ninguém vai conseguir explicar");
  });

  it("proposta COM porquê não inventa linha nem alerta", () => {
    // Uma linha "0 → 0" em toda proposta ensina a não ler as outras.
    const { linhas, alerta } = deltaDeDecisao(diagrama, [BASE], "d1");

    expect(linhas.some((l) => l.rotulo.includes("porquê"))).toBe(false);
    expect(alerta).toBeUndefined();
  });

  it("id que não é proposta devolve vazio em vez de explodir", () => {
    // A tela chama isto no render: lançar aqui apagaria o painel por um id velho.
    expect(deltaDeDecisao(diagrama, [{ ...BASE, status: "aceita" }], "d1").linhas).toEqual([]);
    expect(deltaDeDecisao(diagrama, [BASE], "nao-existe").linhas).toEqual([]);
  });
});

describe("deltaDePercurso — o backlog depois de confirmar (§263)", () => {
  it("confirmar um caminho FORA da régua põe item no backlog", () => {
    // 900 + 900 = 1800ms contra um teto de 1000: confirmar faz a régua valer, e
    // a régua valendo vira trabalho (§249).
    const diagrama: Diagrama = { nodes: [no("n1", 900), no("n2", 900)], edges: [] };

    const { linhas, alerta } = deltaDePercurso(diagrama, config, [CAMINHO], "pc::n1>n2", { regras: REGRAS });

    expect(piorou(linhas[0])).toBe(true);
    expect(linhas[0].depois).toBe(linhas[0].antes + 1);
    expect(alerta).toContain("já está fora dela");
  });

  it("caminho DENTRO da régua não cria item nem alerta", () => {
    const diagrama: Diagrama = { nodes: [no("n1", 100), no("n2", 100)], edges: [] };

    const { linhas, alerta } = deltaDePercurso(diagrama, config, [CAMINHO], "pc::n1>n2", { regras: REGRAS });

    expect(piorou(linhas[0])).toBe(false);
    expect(alerta).toBeUndefined();
  });

  it("caminho sem o campo avisa que confirmar NÃO vai medir — o zero enganoso", () => {
    // Sem esta frase o delta mostraria "0 → 0" e leria como "não custa nada",
    // quando o que acontece é que a medição não acontece.
    const diagrama: Diagrama = { nodes: [no("n1", 900), no("n2")], edges: [] };

    const { linhas, alerta } = deltaDePercurso(diagrama, config, [CAMINHO], "pc::n1>n2", { regras: REGRAS });

    expect(piorou(linhas[0])).toBe(false);
    expect(alerta).toContain("não vai medir");
    expect(alerta).toContain("timeoutMs");
  });

  it("caminho JÁ confirmado devolve vazio — não há o que remedir", () => {
    const diagrama: Diagrama = { nodes: [no("n1", 900), no("n2", 900)], edges: [] };

    expect(
      deltaDePercurso(diagrama, config, [{ ...CAMINHO, confirmado: true }], "pc::n1>n2", { regras: REGRAS }).linhas
    ).toEqual([]);
  });

  it("sem regra de percurso, confirmar não muda nada — a régua nova não cobra quem não a usa", () => {
    const diagrama: Diagrama = { nodes: [no("n1", 900), no("n2", 900)], edges: [] };

    const { linhas, alerta } = deltaDePercurso(diagrama, config, [CAMINHO], "pc::n1>n2");

    expect(linhas[0].antes).toBe(linhas[0].depois);
    expect(alerta).toBeUndefined();
  });
});
