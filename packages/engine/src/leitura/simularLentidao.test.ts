import { describe, expect, it } from "vitest";
import type { DiagramaConfig } from "../config/types.js";
import type { Diagrama } from "../model/types.js";
import { readConfigFile } from "../test-support/fixtures.js";
import { lerDesenho } from "./lerDesenho.js";
import { simularCenario, simularCenarios, type CenarioDeLentidao } from "./simularLentidao.js";

/**
 * SPEC-66 fatia A — o "e se" sobre o desenho.
 */
const config = readConfigFile<DiagramaConfig>("diagrama.example.json");

function no(id: string, type: string, spec: Record<string, unknown> = {}) {
  return {
    id,
    type,
    label: id,
    x: 0,
    y: 0,
    status: "novo",
    spec: Object.fromEntries(Object.entries(spec).map(([k, valor]) => [k, { valor, origem: "manual" }])),
    specNA: {},
  };
}

function aresta(id: string, source: string, target: string, type: string, spec: Record<string, unknown> = {}) {
  return {
    id,
    source,
    target,
    type,
    spec: Object.fromEntries(Object.entries(spec).map(([k, valor]) => [k, { valor, origem: "manual" }])),
  };
}

function diagrama(nodes: unknown[], edges: unknown[]): Diagrama {
  return { nodes, edges } as unknown as Diagrama;
}

function cenario(parcial: Partial<CenarioDeLentidao> & { id: string }): CenarioDeLentidao {
  return { nome: parcial.id, origem: "manual", ajustes: [], ...parcial };
}

/** api →http(300)→ srv →http(700)→ bureau(2000 no nó). */
const desenho = () =>
  diagrama(
    [no("api", "service"), no("srv", "service"), no("bureau", "external", { timeoutMs: 2000 })],
    [
      aresta("e1", "api", "srv", "http", { timeoutMs: 300 }),
      aresta("e2", "srv", "bureau", "http", { timeoutMs: 700 }),
    ]
  );

describe("simularCenario — o e se", () => {
  it("hoje soma 3000; o bureau 3× mais lento leva a resposta a 7000", () => {
    // 300 + 700 + 2000 = 3000. Com o bureau em 6000: 300 + 700 + 6000 = 7000.
    const d = desenho();
    const hoje = lerDesenho(d, config);
    expect(hoje.tempoDoPiorTrecho!.ms).toBe(3000);

    const r = simularCenario(
      d,
      config,
      cenario({ id: "c1", ajustes: [{ tipo: "no", id: "bureau", fator: 3 }] }),
      hoje
    );

    expect(r.ms).toBe(7000);
    expect(r.delta).toBe(4000);
  });

  it("valor absoluto manda sobre multiplicador — é uma afirmação, não uma variação", () => {
    const r = simularCenario(
      desenho(),
      config,
      cenario({ id: "c1", ajustes: [{ tipo: "no", id: "bureau", fator: 10, ms: 500 }] })
    );

    expect(r.ms).toBe(1500);
  });

  it("diz QUEM domina — o total diz que dói, isto diz onde", () => {
    const r = simularCenario(desenho(), config, cenario({ id: "c1" }));

    expect(r.dominantes.map((d) => d.elemento.rotulo)).toEqual(["bureau"]);
    expect(r.dominantes[0].ms).toBe(2000);
  });

  it("empate devolve os DOIS — escolher um seria inventar", () => {
    // §248, terceira resposta, num caso novo.
    const d = diagrama(
      [no("api", "service"), no("a", "service"), no("b", "sql")],
      [aresta("e1", "api", "a", "http", { timeoutMs: 500 }), aresta("e2", "a", "b", "http", { timeoutMs: 500 })]
    );

    expect(simularCenario(d, config, cenario({ id: "c1" })).dominantes).toHaveLength(2);
  });

  it("o `≥` sobrevive ao cenário — ele não inventa número que o desenho não deu", () => {
    const d = diagrama(
      [no("api", "service"), no("srv", "service"), no("db", "sql")],
      [aresta("e1", "api", "srv", "http", { timeoutMs: 300 }), aresta("e2", "srv", "db", "http")]
    );

    const r = simularCenario(d, config, cenario({ id: "c1", ajustes: [{ tipo: "aresta", id: "e1", fator: 4 }] }));

    expect(r.ms).toBe(1200);
    expect(r.completo).toBe(false);
  });

  it("multiplicar o que ninguém declarou NÃO fabrica número", () => {
    // Um fator sobre um campo vazio daria um valor inventado com cara de
    // medida. O elemento segue sem valor, e a soma segue sendo piso.
    const d = diagrama(
      [no("api", "service"), no("db", "sql")],
      [aresta("e1", "api", "db", "http")]
    );

    const r = simularCenario(d, config, cenario({ id: "c1", ajustes: [{ tipo: "aresta", id: "e1", fator: 5 }] }));

    expect(r.ms).toBe(0);
    expect(r.completo).toBe(false);
  });

  it("o cenário NÃO escreve no desenho — ele é lente sobre uma cópia", () => {
    // Um "e se" que altera o diagrama de verdade transformaria ensaio em
    // mudança, e a pessoa perderia o original no primeiro clique.
    const d = desenho();
    simularCenario(d, config, cenario({ id: "c1", ajustes: [{ tipo: "no", id: "bureau", fator: 9 }] }));

    expect(lerDesenho(d, config).tempoDoPiorTrecho!.ms).toBe(3000);
  });

  it("ajuste que perdeu o alvo é DECLARADO, não engolido", () => {
    // §57 — o desenho mudou depois do cenário. Um ensaio que ignorou parte do
    // que lhe pediram tem que dizer, senão o número mente por omissão.
    const r = simularCenario(
      desenho(),
      config,
      cenario({ id: "c1", ajustes: [{ tipo: "no", id: "sumiu", fator: 3 }] })
    );

    expect(r.ajustesSemAlvo).toEqual([{ tipo: "no", id: "sumiu", fator: 3 }]);
    expect(r.ms).toBe(3000);
  });
});

describe("simularCenarios — a tabela", () => {
  it("todo Δ é contra HOJE, nunca contra a linha anterior", () => {
    // Comparar em cadeia faria a ordem das linhas mudar o significado dos
    // números — o mesmo cenário valeria coisas diferentes conforme a posição.
    const { hoje, resultados } = simularCenarios(desenho(), config, [
      cenario({ id: "c1", ajustes: [{ tipo: "no", id: "bureau", fator: 2 }] }),
      cenario({ id: "c2", ajustes: [{ tipo: "no", id: "bureau", fator: 3 }] }),
    ]);

    expect(hoje.tempoDoPiorTrecho!.ms).toBe(3000);
    expect(resultados.map((r) => r.ms)).toEqual([5000, 7000]);
    expect(resultados.map((r) => r.delta)).toEqual([2000, 4000]);
  });

  it("desenho sem tempo nenhum não estoura, e não finge Δ", () => {
    const d = diagrama([no("api", "service"), no("f", "rabbit")], [aresta("e1", "api", "f", "publishes")]);

    const { resultados } = simularCenarios(d, config, [cenario({ id: "c1" })]);

    expect(resultados[0].ms).toBeUndefined();
    expect(resultados[0].delta).toBeUndefined();
  });
});
