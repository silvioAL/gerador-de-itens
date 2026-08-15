import { describe, expect, it } from "vitest";
import type { DiagramaConfig, RegrasConfig } from "../config/types.js";
import type { Diagrama, No } from "../model/types.js";
import { avaliarConformidade, violacoesAceitas, violacoesDoNo, violacoesEmAberto } from "./conformidade.js";
import { derivar } from "../derive/derivar.js";

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
        { key: "ttl", label: "TTL (ms)", type: "number" },
        { key: "backoff", label: "Backoff (ms)", type: "number" },
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

  describe("§241 — a contradição entre DOIS campos", () => {
    // A classe de defeito que nenhum campo isolado revela: dois valores
    // individualmente razoáveis que se contradizem. `ttl` de 5s com 5 retries
    // de 2s parece sensato em cada campo, e garante que a mensagem morre antes
    // da última tentativa.
    const regrasTtl: RegrasConfig = {
      ...regras,
      porTech: {
        Integracao: {
          checklistTecnico: [
            {
              texto: "TTL maior que o tempo total de retry",
              contextos: [],
              checagem: {
                campo: "ttl",
                operador: "gte",
                valorDe: "backoff",
                multiplicadoPor: "retry",
                unidade: "ms",
              },
            },
          ],
          testes: [],
        },
      },
    };

    it("acusa quando o produto dos dois campos passa do valor conferido", () => {
      const violacoes = avaliarConformidade(
        diagrama([no("fila", { ttl: 5000, backoff: 2000, retry: 5 })]),
        config,
        regrasTtl
      );

      expect(violacoes).toHaveLength(1);
      // A mensagem traz os NOMES e a CONTA: sem os nomes ninguém sabe o que
      // mudar; sem o número ninguém sabe o quanto.
      expect(violacoes[0].esperado).toBe("≥ backoff × retry (= 10000ms)");
      expect(violacoes[0].atual).toBe("5000");
    });

    it("não acusa quando a conta fecha", () => {
      expect(
        avaliarConformidade(diagrama([no("fila", { ttl: 12000, backoff: 2000, retry: 5 })]), config, regrasTtl)
      ).toEqual([]);
    });

    it("campo comparado ausente CALA a checagem — não vira violação", () => {
      // Acusar aqui seria acusar o desenho por um campo que a regra pressupõe
      // e o tipo de nó não tem.
      expect(avaliarConformidade(diagrama([no("fila", { ttl: 1 })]), config, regrasTtl)).toEqual([]);
      expect(
        avaliarConformidade(diagrama([no("fila", { ttl: 1, backoff: 2000 })]), config, regrasTtl)
      ).toEqual([]);
    });

    it("sem `multiplicadoPor`, compara direto com o outro campo", () => {
      const semFator: RegrasConfig = {
        ...regras,
        porTech: {
          Integracao: {
            checklistTecnico: [
              { texto: "t", contextos: [], checagem: { campo: "ttl", operador: "gte", valorDe: "backoff" } },
            ],
            testes: [],
          },
        },
      };

      expect(avaliarConformidade(diagrama([no("f", { ttl: 100, backoff: 200 })]), config, semFator)).toHaveLength(1);
      expect(avaliarConformidade(diagrama([no("f", { ttl: 300, backoff: 200 })]), config, semFator)).toEqual([]);
    });
  });

  describe("§242 — o padrão que ensina, e que aceita ser contrariado", () => {
    const regrasComPorque: RegrasConfig = {
      ...regras,
      porTech: {
        Integracao: {
          checklistTecnico: [
            {
              texto: "Timeout de chamada externa",
              contextos: [],
              porque: "Veio do incidente de 2025: o parceiro travou e derrubou o checkout junto.",
              checagem: { campo: "timeout", operador: "lte", valor: 500, unidade: "ms" },
            },
          ],
          testes: [],
        },
      },
    };

    it("a violação carrega o PORQUÊ do padrão — cobrança sem lei publicada é multa", () => {
      const [v] = avaliarConformidade(diagrama([no("gw", { timeout: 800 })]), config, regrasComPorque);
      expect(v.porque).toContain("incidente de 2025");
    });

    it("exceção registrada tira do vermelho, mas NÃO do histórico", () => {
      // Apagar a violação faria a decisão desaparecer junto — e o que se quer
      // é o oposto: a exceção é o registro de que alguém decidiu.
      const excecao = {
        noId: "gw",
        campo: "timeout",
        motivo: "O parceiro não suporta menos que 800ms; acordado com o time de integração.",
        autor: "silvio@exemplo",
        em: "2026-08-15T10:00:00.000Z",
      };
      const violacoes = avaliarConformidade(diagrama([no("gw", { timeout: 800 })]), config, regrasComPorque, [
        excecao,
      ]);

      expect(violacoes).toHaveLength(1);
      expect(violacoes[0].excecao).toEqual(excecao);
      expect(violacoesEmAberto(violacoes)).toEqual([]);
      expect(violacoesAceitas(violacoes)).toHaveLength(1);
    });

    it("a exceção é do PAR nó+campo — não vale para outro nó nem para outro padrão", () => {
      const excecao = { noId: "gw", campo: "timeout", motivo: "m", autor: "a", em: "2026-01-01T00:00:00.000Z" };
      const violacoes = avaliarConformidade(
        diagrama([no("gw", { timeout: 800 }), no("outro", { timeout: 900 })]),
        config,
        regrasComPorque,
        [excecao]
      );

      expect(violacoesEmAberto(violacoes).map((v) => v.noId)).toEqual(["outro"]);
    });

    it("violação com exceção NÃO vira item derivado", () => {
      // Gerar trabalho para o que alguém já resolveu conscientemente é o jeito
      // mais rápido de ensinar a ignorar o backlog.
      const d = diagrama([no("gw", { timeout: 800 })]);
      const semExcecao = derivar(d, config, { regras: regrasComPorque });
      expect(semExcecao.some((a) => a.chave.includes("::padrao::"))).toBe(true);

      const comExcecao = derivar(d, config, {
        regras: regrasComPorque,
        excecoes: [{ noId: "gw", campo: "timeout", motivo: "m", autor: "a", em: "2026-01-01T00:00:00.000Z" }],
      });
      expect(comExcecao.some((a) => a.chave.includes("::padrao::"))).toBe(false);
    });
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

/**
 * §240 — o padrão chegando ao ITEM. Enquanto a violação só existia no placar,
 * ela morria na tela: quem implementa lê o backlog, não o desenho.
 */
describe("derivar — violação de padrão vira item", () => {
  it("cada violação vira uma atividade com o esperado E o atual na descrição", () => {
    const atividades = derivar(diagrama([no("gateway", { timeout: 800 })]), config, { regras });

    const doPadrao = atividades.filter((a) => a.chave.includes("::padrao::"));
    expect(doPadrao).toHaveLength(1);
    expect(doPadrao[0].chave).toBe("gateway::padrao::timeout");
    // Os dois números: sem eles quem implementa volta ao desenho pra descobrir
    // o que ajustar.
    expect(doPadrao[0].descricao).toContain("≤ 500ms");
    expect(doPadrao[0].descricao).toContain("está 800");
    expect(doPadrao[0].descricao).toContain("Timeout de chamada externa");
    expect(doPadrao[0].origem).toEqual({ nodeId: "gateway" });
  });

  it("sem regras, a derivação é EXATAMENTE a de antes", () => {
    const semRegras = derivar(diagrama([no("n1", { timeout: 9999 })]), config, {});
    expect(semRegras.some((a) => a.chave.includes("::padrao::"))).toBe(false);
  });

  it("dentro do padrão não gera item — a régua é sobre o valor", () => {
    const atividades = derivar(diagrama([no("n1", { timeout: 300 })]), config, { regras });
    expect(atividades.some((a) => a.chave.includes("::padrao::"))).toBe(false);
  });

  it("é Débito Técnico só quando o nó JÁ EXISTE; no nó novo é Task", () => {
    // Num nó novo o valor fora do padrão ainda não foi construído — é decisão
    // a corrigir, não dívida herdada. Chamar tudo de débito esvazia a palavra.
    const novo = derivar(diagrama([no("n1", { timeout: 800 })]), config, { regras });
    expect(novo.find((a) => a.chave.includes("::padrao::"))?.tipo).toBe("Task");

    const existente: No = { ...no("n2", { timeout: 800 }), status: "existente" };
    const herdado = derivar(diagrama([existente]), config, { regras });
    expect(herdado.find((a) => a.chave.includes("::padrao::"))?.tipo).toBe("Débito Técnico");
  });

  it("a chave é estável — regerar não duplica nem renomeia", () => {
    const d = diagrama([no("gateway", { timeout: 800 }), no("outro", { timeout: 700 })]);
    const primeira = derivar(d, config, { regras }).map((a) => a.chave);
    const segunda = derivar(d, config, { regras }).map((a) => a.chave);
    expect(segunda).toEqual(primeira);
  });
});
