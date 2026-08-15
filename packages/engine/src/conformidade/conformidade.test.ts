import { describe, expect, it } from "vitest";
import type { DiagramaConfig, RegrasConfig } from "../config/types.js";
import type { Diagrama, No } from "../model/types.js";
import { avaliarConformidade, violacoesDoNo } from "./conformidade.js";

const config: DiagramaConfig = {
  nodeTypes: {
    externo: {
      label: "API Externa",
      derives: "service",
      techs: ["Integracao"],
      contextos: ["Backend-integracao"],
      spec: [
        { key: "timeout", label: "Timeout (ms)", type: "number" },
        { key: "retry", label: "Retries", type: "number" },
        { key: "dono", label: "Dono", type: "text" },
      ],
    },
    // Mesma tech, spec SEM o campo da checagem — o caso que prova que a regra
    // por tech não pode acusar um tipo de nó que nem tem o campo.
    outro: {
      label: "Outro",
      derives: "service",
      techs: ["Integracao"],
      contextos: ["Backend-integracao"],
      spec: [{ key: "nome", label: "Nome", type: "text" }],
    },
  },
  edgeTypes: {},
  edgeRules: {},
};

const regras: RegrasConfig = {
  tipos: ["História"],
  tamanhos: ["P"],
  porTech: {
    Integracao: {
      checklistTecnico: [
        {
          texto: "Timeout de chamada externa",
          contextos: [],
          checagem: { campo: "timeout", operador: "lte", valor: 500, unidade: "ms" },
        },
        { texto: "Requisito só de texto, sem checagem", contextos: [] },
      ],
      testes: [],
    },
  },
};

function no(id: string, spec: Record<string, unknown>, type = "externo"): No {
  return {
    id,
    type,
    x: 0,
    y: 0,
    label: id,
    status: "novo",
    spec: Object.fromEntries(Object.entries(spec).map(([k, v]) => [k, { valor: v, origem: "manual" as const }])),
    specNA: {},
  };
}
const diagrama = (nodes: No[]): Diagrama => ({ nodes, edges: [] });

describe("avaliarConformidade — o padrão virando régua (SPEC-57 fatia B)", () => {
  it("valor dentro do padrão não vira violação; fora, vira — com esperado e atual", () => {
    expect(avaliarConformidade(diagrama([no("n1", { timeout: 300 })]), config, regras)).toEqual([]);

    const violacoes = avaliarConformidade(diagrama([no("gateway", { timeout: 800 })]), config, regras);

    expect(violacoes).toHaveLength(1);
    expect(violacoes[0]).toMatchObject({
      noId: "gateway",
      campo: "timeout",
      texto: "Timeout de chamada externa",
      esperado: "≤ 500ms",
      atual: "800",
    });
  });

  it("sem regras, não há conformidade a avaliar — e isso não é erro", () => {
    // Instalação que nunca configurou regra não passa a estar em violação.
    expect(avaliarConformidade(diagrama([no("n1", { timeout: 9999 })]), config, undefined)).toEqual([]);
  });

  it("requisito SEM checagem continua sendo só texto — não gera violação nenhuma", () => {
    // O checklist textual segue existindo; conferível é um subconjunto dele.
    const soTexto: RegrasConfig = {
      ...regras,
      porTech: { Integracao: { checklistTecnico: [{ texto: "só texto", contextos: [] }], testes: [] } },
    };
    expect(avaliarConformidade(diagrama([no("n1", {})]), config, soTexto)).toEqual([]);
  });

  it("campo ausente no nó NÃO vira violação", () => {
    // A regra é por tech, e uma tech vale para tipos de nó com specs
    // diferentes. Acusar aqui seria acusar o desenho por descasamento de config.
    expect(avaliarConformidade(diagrama([no("n1", { nome: "x" }, "outro")]), config, regras)).toEqual([]);
  });

  it("campo vazio não vira violação de comparação — mas vira de `preenchido`", () => {
    // Vazio é trabalho da PRONTIDÃO. Duas dimensões acusando a mesma coisa
    // dobraria o vermelho sem dobrar a informação.
    expect(avaliarConformidade(diagrama([no("n1", { timeout: "" })]), config, regras)).toEqual([]);

    const exigeDono: RegrasConfig = {
      ...regras,
      porTech: {
        Integracao: {
          checklistTecnico: [
            { texto: "Dono declarado", contextos: [], checagem: { campo: "dono", operador: "preenchido" } },
          ],
          testes: [],
        },
      },
    };
    expect(avaliarConformidade(diagrama([no("n1", { dono: "" })]), config, exigeDono)).toHaveLength(1);
  });

  it("o `when` do requisito vale para conferir tanto quanto para listar", () => {
    // `when.field` é chave do SPEC do nó (não `status`, que é do modelo) —
    // mesma semântica que o checklist já usa, e é o ponto de importar o
    // helper em vez de reimplementar a régua.
    const comWhen: RegrasConfig = {
      ...regras,
      porTech: {
        Integracao: {
          checklistTecnico: [
            {
              texto: "Timeout apertado só quando o dono é terceiro",
              contextos: [],
              when: { field: "dono", equals: "terceiro" },
              checagem: { campo: "timeout", operador: "lte", valor: 500 },
            },
          ],
          testes: [],
        },
      },
    };

    expect(
      avaliarConformidade(diagrama([no("interno", { timeout: 800, dono: "nosso" })]), config, comWhen)
    ).toEqual([]);
    expect(
      avaliarConformidade(diagrama([no("parceiro", { timeout: 800, dono: "terceiro" })]), config, comWhen)
    ).toHaveLength(1);
  });

  it("cada operador compara o que promete", () => {
    const comOperador = (operador: string, valor: number): RegrasConfig => ({
      ...regras,
      porTech: {
        Integracao: {
          checklistTecnico: [
            { texto: "t", contextos: [], checagem: { campo: "retry", operador: operador as never, valor } },
          ],
          testes: [],
        },
      },
    });
    const comRetry = (r: number) => diagrama([no("n1", { retry: r })]);

    expect(avaliarConformidade(comRetry(3), config, comOperador("lt", 3))).toHaveLength(1);
    expect(avaliarConformidade(comRetry(3), config, comOperador("lte", 3))).toEqual([]);
    expect(avaliarConformidade(comRetry(3), config, comOperador("gte", 5))).toHaveLength(1);
    expect(avaliarConformidade(comRetry(3), config, comOperador("gt", 1))).toEqual([]);
    expect(avaliarConformidade(comRetry(3), config, comOperador("eq", 3))).toEqual([]);
    expect(avaliarConformidade(comRetry(3), config, comOperador("ne", 3))).toHaveLength(1);
  });

  it("violacoesDoNo separa por nó — é o que o semáforo mostra no popover", () => {
    const violacoes = avaliarConformidade(
      diagrama([no("a", { timeout: 800 }), no("b", { timeout: 100 }), no("c", { timeout: 700 })]),
      config,
      regras
    );

    expect(violacoes).toHaveLength(2);
    expect(violacoesDoNo(violacoes, "a")).toHaveLength(1);
    expect(violacoesDoNo(violacoes, "b")).toHaveLength(0);
  });
});
