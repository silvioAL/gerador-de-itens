import { describe, expect, it } from "vitest";
import type { DiagramaConfig, RegrasConfig } from "../config/types.js";
import type { Diagrama, No, Percurso, ValorSpec } from "../model/types.js";
import { avaliarPercursos } from "./conformidadeDePercurso.js";

const config: DiagramaConfig = {
  nodeTypes: {
    service: {
      label: "Serviço",
      derives: "service",
      techs: ["Backend"],
      contextos: [],
      spec: [{ key: "timeoutMs", label: "Timeout (ms)", type: "number" }],
    },
    // Um tipo que NÃO declara o campo: nó desses no caminho não é omissão.
    banco: { label: "Banco", derives: "db", techs: ["Backend"], contextos: [], spec: [{ key: "engine", label: "Engine", type: "text" }] },
  },
  edgeTypes: {},
  edgeRules: {},
};

function no(id: string, tipo = "service", timeoutMs?: number): No {
  const spec: Record<string, ValorSpec> = {};
  if (timeoutMs !== undefined) spec.timeoutMs = { valor: timeoutMs, origem: "manual" };
  return { id, type: tipo, x: 0, y: 0, label: id, status: "novo", spec, specNA: {} };
}
function diagrama(nodes: No[]): Diagrama {
  return { nodes, edges: [] };
}
function percurso(nos: string[], confirmado = true): Percurso {
  return { id: `pc::${nos.join(">")}`, rotulo: nos.join(" → "), nos, origem: "inferido", confirmado };
}

const REGRA_SOMA: RegrasConfig = {
  tipos: [],
  tamanhos: [],
  porTech: {},
  percursos: [
    {
      texto: "O caminho síncrono responde dentro do orçamento de latência",
      porque: "Cinco saltos dentro do padrão dão um caminho fora dele — é o que o cliente sente.",
      checagem: { campo: "timeoutMs", agregacao: "soma", operador: "lte", valor: 2000, unidade: "ms" },
    },
  ],
};

describe("avaliarPercursos — a régua sobre o CAMINHO (SPEC-57 fatia E)", () => {
  it("sem regra de percurso, não mede nada", () => {
    const d = diagrama([no("a", "service", 400), no("b", "service", 400)]);

    expect(avaliarPercursos(d, config, [percurso(["a", "b"])])).toEqual({ violacoes: [], naoMedidos: [] });
  });

  it("cinco nós DENTRO do padrão dão um caminho FORA dele — é a fatia inteira", () => {
    // Cada 450ms passaria em qualquer checagem por nó (`≤ 500ms`). A soma não.
    const nos = ["a", "b", "c", "d", "e"];
    const d = diagrama(nos.map((id) => no(id, "service", 450)));

    const { violacoes } = avaliarPercursos(d, config, [percurso(nos)], REGRA_SOMA);

    expect(violacoes).toHaveLength(1);
    expect(violacoes[0].esperado).toBe("≤ 2000ms");
    // A conta aparece: sem ela a pessoa sabe que está fora e não de quanto.
    expect(violacoes[0].atual).toContain("2250ms");
    expect(violacoes[0].atual).toContain("5 nós");
    expect(violacoes[0].porque).toContain("é o que o cliente sente");
  });

  it("dentro do orçamento não vira violação", () => {
    const d = diagrama([no("a", "service", 400), no("b", "service", 400)]);

    expect(avaliarPercursos(d, config, [percurso(["a", "b"])], REGRA_SOMA).violacoes).toEqual([]);
  });

  it("percurso NÃO confirmado não é medido — regra 2", () => {
    const nos = ["a", "b", "c", "d", "e"];
    const d = diagrama(nos.map((id) => no(id, "service", 900)));

    expect(avaliarPercursos(d, config, [percurso(nos, false)], REGRA_SOMA).violacoes).toEqual([]);
  });

  it("campo faltando num nó do caminho NÃO produz verde falso — vira 'não medido'", () => {
    // Somar só o que existe daria 800ms e um verde. O verde falso é o pior
    // resultado possível de uma medição: ele encerra a pergunta.
    const d = diagrama([no("a", "service", 400), no("b", "service"), no("c", "service", 400)]);

    const { violacoes, naoMedidos } = avaliarPercursos(d, config, [percurso(["a", "b", "c"])], REGRA_SOMA);

    expect(violacoes).toEqual([]);
    expect(naoMedidos).toHaveLength(1);
    expect(naoMedidos[0].nosSemValor).toEqual(["b"]);
    expect(naoMedidos[0].campo).toBe("timeoutMs");
  });

  it("nó cujo TIPO não tem o campo não é omissão — a régua o ignora e mede o resto", () => {
    // A diferença entre "não se aplica" e "aplica-se e está vazio" é o que
    // separa silêncio legítimo de verde falso.
    const d = diagrama([no("a", "service", 1200), no("db", "banco"), no("c", "service", 1200)]);

    const { violacoes, naoMedidos } = avaliarPercursos(d, config, [percurso(["a", "db", "c"])], REGRA_SOMA);

    expect(naoMedidos).toEqual([]);
    expect(violacoes).toHaveLength(1);
    expect(violacoes[0].atual).toContain("2 nós");
  });

  it("nenhum nó do caminho declara o campo: silêncio, nem violação nem não-medido", () => {
    const d = diagrama([no("db1", "banco"), no("db2", "banco")]);

    expect(avaliarPercursos(d, config, [percurso(["db1", "db2"])], REGRA_SOMA)).toEqual({
      violacoes: [],
      naoMedidos: [],
    });
  });

  it("nó apagado depois da confirmação faz o caminho virar não medido, não inventado", () => {
    const d = diagrama([no("a", "service", 400)]);

    const { naoMedidos } = avaliarPercursos(d, config, [percurso(["a", "sumiu"])], REGRA_SOMA);

    expect(naoMedidos[0].nosSemValor).toEqual(["sumiu"]);
  });

  it("`saltos` conta ARESTAS percorridas, não nós — `a → b` é um salto", () => {
    const regra: RegrasConfig = {
      tipos: [],
      tamanhos: [],
      porTech: {},
      percursos: [
        {
          texto: "No máximo 3 saltos entre a borda e o dado",
          checagem: { agregacao: "saltos", operador: "lte", valor: 3 },
        },
      ],
    };
    const nos = ["a", "b", "c", "d", "e"];
    const d = diagrama(nos.map((id) => no(id, "banco")));

    const { violacoes } = avaliarPercursos(d, config, [percurso(nos)], regra);

    // Cinco nós = quatro saltos. Contar nós e chamar de salto daria um
    // off-by-one num rótulo que a pessoa lê para calibrar a régua.
    expect(violacoes[0].atual).toBe("4 salto(s)");
    expect(violacoes[0].esperado).toBe("≤ 3");
  });

  it("`maximo` acusa o elo mais lento, não a soma", () => {
    const regra: RegrasConfig = {
      tipos: [],
      tamanhos: [],
      porTech: {},
      percursos: [
        { texto: "Nenhum elo sozinho passa de 500ms", checagem: { campo: "timeoutMs", agregacao: "maximo", operador: "lte", valor: 500, unidade: "ms" } },
      ],
    };
    const d = diagrama([no("a", "service", 100), no("b", "service", 900)]);

    const { violacoes } = avaliarPercursos(d, config, [percurso(["a", "b"])], regra);

    expect(violacoes[0].atual).toContain("maior de timeoutMs = 900ms");
  });
});
