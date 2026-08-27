import { describe, expect, it } from "vitest";
import type { DiagramaConfig } from "../config/types.js";
import type { Diagrama } from "../model/types.js";
import { readConfigFile } from "../test-support/fixtures.js";
import { lerDesenho } from "./lerDesenho.js";
import {
  concluirEnsaio,
  ensaioCobra,
  estadoDoEnsaio,
  prazoEstourado,
  simularCenario,
  simularCenarios,
  type CenarioDeLentidao,
  type ResultadoDoCenario,
} from "./simularLentidao.js";

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

/**
 * SPEC-69 — o débito consciente.
 *
 * A inversão que reorganizou a SPEC veio do usuário: **todo ensaio cobra**. Se
 * só o aceito cobrasse, o débito que ninguém olhou continuaria invisível — e é
 * exatamente esse o inconsciente que a SPEC existe para acabar.
 */
describe("estadoDoEnsaio / ensaioCobra — o que tira do placar é ACEITAR, não olhar", () => {
  const base = (p: Partial<CenarioDeLentidao>): CenarioDeLentidao => ({
    id: "c1",
    nome: "x",
    origem: "manual",
    ajustes: [],
    ...p,
  });

  it("ensaio que ninguém olhou COBRA — é a inversão que dá nome à SPEC", () => {
    expect(estadoDoEnsaio(base({}))).toBe("por-avaliar");
    expect(ensaioCobra(base({}))).toBe(true);
  });

  it("estar EM REVISÃO não tira do placar", () => {
    // Sair da cobrança por ter aberto a linha seria a fórmula de fazer as
    // pessoas abrirem tudo sem ler.
    expect(ensaioCobra(base({ estado: "em-revisao" }))).toBe(true);
  });

  it("aceitar é a válvula — e é o §242 aplicado a um número que ninguém tinha", () => {
    expect(ensaioCobra(base({ estado: "aceito" }))).toBe(false);
  });

  it("quebra gravada ANTES do estado migra sozinha, e quem já aceitou não perde o gesto", () => {
    expect(estadoDoEnsaio(base({ aceito: true }))).toBe("aceito");
    expect(estadoDoEnsaio(base({ aceito: false }))).toBe("por-avaliar");
    // O estado explícito manda sobre o campo antigo.
    expect(estadoDoEnsaio(base({ aceito: true, estado: "em-revisao" }))).toBe("em-revisao");
  });
});

describe("prazoEstourado — o número do negócio é o que faz o número técnico decidir", () => {
  it("sem limite declarado, silêncio — ninguém prometeu nada", () => {
    expect(prazoEstourado(24000, [{ texto: "aprovar crédito" }])).toBeUndefined();
    expect(prazoEstourado(24000, [])).toBeUndefined();
  });

  it("acima do prazo, acusa citando a necessidade", () => {
    const p = prazoEstourado(24000, [{ texto: "aprovar crédito na hora", limiteMs: 5000 }]);
    expect(p).toEqual({ limiteMs: 5000, texto: "aprovar crédito na hora" });
  });

  it("dentro do prazo é silêncio, e o limite exato não estoura", () => {
    expect(prazoEstourado(4000, [{ texto: "x", limiteMs: 5000 }])).toBeUndefined();
    expect(prazoEstourado(5000, [{ texto: "x", limiteMs: 5000 }])).toBeUndefined();
  });

  it("com várias promessas, vale a MAIS APERTADA", () => {
    // Basta uma promessa curta para o prazo ser furado — a mesma escolha que
    // `avaliarResiliencia` faz com a paciência de quem chama.
    const p = prazoEstourado(3000, [
      { texto: "relatório mensal", limiteMs: 30000 },
      { texto: "aprovar na hora", limiteMs: 2000 },
    ]);
    expect(p?.texto).toBe("aprovar na hora");
  });
});

describe("concluirEnsaio — a conclusão escrita, para quem avalia não montá-la", () => {
  const resultado = (p: Partial<ResultadoDoCenario>): ResultadoDoCenario => ({
    cenarioId: "c1",
    nome: "Bureau em pico",
    leitura: { tempos: [], fanOut: [], terceiros: [], conexoesNaoClassificadas: [] },
    completo: true,
    dominantes: [],
    ajustesSemAlvo: [],
    contradicoes: [],
    ...p,
  });

  it("com prazo do negócio, a frase COMPARA com o que foi prometido", () => {
    const f = concluirEnsaio(resultado({ ms: 24000 }), 3000, [{ texto: "na hora", limiteMs: 5000 }])!;

    expect(f).toContain("24 s");
    expect(f).toContain("4,8×");
    expect(f).toContain("prazo de 5,0 s");
  });

  it("sem prazo, compara com HOJE e não inventa julgamento", () => {
    const f = concluirEnsaio(resultado({ ms: 24000 }), 3000, [])!;

    expect(f).toContain("de 3,0 s para 24 s");
    expect(f).not.toContain("acima");
  });

  it("nomeia o DOMINANTE — é o que vira 'está ruim por causa disto'", () => {
    const f = concluirEnsaio(
      resultado({
        ms: 24000,
        dominantes: [{ elemento: { tipo: "no", id: "b", rotulo: "bureau" }, ms: 24000 }],
      }),
      3000,
      []
    )!;

    expect(f).toContain("bureau responde por 24 s");
  });

  it("avisa quando o ensaio CRIA contradição que hoje não existe", () => {
    const f = concluirEnsaio(
      resultado({
        ms: 9000,
        contradicoes: [
          { tipo: "saturacao", noId: "api", rotulo: "api", esperado: "10", atual: "30", porque: "" },
        ],
      }),
      3000,
      []
    )!;

    expect(f).toContain("uma contradição que não existe hoje");
  });

  it("sem número não há conclusão — e `undefined` é a resposta", () => {
    // §248: uma frase sobre um número que não existe seria a pior das saídas.
    expect(concluirEnsaio(resultado({}), 3000, [])).toBeUndefined();
  });
});
