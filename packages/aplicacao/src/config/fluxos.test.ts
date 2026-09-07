import { describe, expect, it } from "vitest";
import { mensagemDeCiclo, normalizarFluxos, planoDoFluxo, validarEscritaFluxos } from "./fluxos.js";
import { ConfigInvalida } from "./normalizacao.js";

const FLUXO_JMETER = {
  id: "jmx-de-volumetria",
  nome: "JMX a partir da volumetria",
  nos: [
    { id: "volumetria", tipo: "conector", refId: "volumetria-dynatrace", posicao: { x: 0, y: 0 }, parametros: {} },
    { id: "gerador", tipo: "agente", refId: "especialista", posicao: { x: 200, y: 0 }, parametros: {} },
    { id: "commit", tipo: "conector", refId: "repo-da-casa", posicao: { x: 400, y: 0 }, parametros: {} },
  ],
  arestas: [
    { de: "volumetria", para: "gerador", mapeamento: [{ saida: "rps", entrada: "volumetria" }] },
    { de: "gerador", para: "commit", mapeamento: [{ saida: "texto", entrada: "arquivo" }] },
  ],
};

describe("normalizarFluxos (SPEC-105 fatia C)", () => {
  it("o exemplo da SPEC (§4.2) atravessa inteiro", () => {
    expect(normalizarFluxos({ fluxos: [FLUXO_JMETER] }).fluxos).toEqual([FLUXO_JMETER]);
  });

  it("descarta nó sem refId, tipo desconhecido e aresta para nó que não existe", () => {
    const { fluxos } = normalizarFluxos({
      fluxos: [
        {
          id: "f",
          nos: [
            { id: "a", tipo: "conector", refId: "c1" },
            { id: "sem-ref", tipo: "conector" },
            // "transformacao" deixou de servir de exemplo aqui: a fatia E o
            // tornou um tipo REAL, com executor.
            { id: "b", tipo: "laco", refId: "x" },
          ],
          arestas: [
            { de: "a", para: "sem-ref", mapeamento: [] },
            { de: "a", para: "a" },
          ],
        },
      ],
    });
    expect(fluxos[0].nos.map((n) => n.id)).toEqual(["a"]);
    // `a → a` sobrevive à normalização (os dois nós existem) — quem recusa o
    // laço é a validação de ESCRITA, com a mensagem de ciclo.
    expect(fluxos[0].arestas).toEqual([{ de: "a", para: "a", mapeamento: [] }]);
  });

  /** SPEC-109 fatia B — o nome que a pessoa dá ao nó (n8n) atravessa o
   * salvar; vazio ou só-espaço não vira dado. */
  it("o nome do nó persiste aparado, e vazio não entra", () => {
    const { fluxos } = normalizarFluxos({
      fluxos: [
        {
          id: "f",
          nos: [
            { id: "a", tipo: "conector", refId: "c1", nome: "  Ler volumetria do legado  " },
            { id: "b", tipo: "conector", refId: "c2", nome: "   " },
          ],
          arestas: [],
        },
      ],
    });
    expect(fluxos[0].nos[0].nome).toBe("Ler volumetria do legado");
    expect("nome" in fluxos[0].nos[1]).toBe(false);
  });
});

describe("planoDoFluxo — a MESMA ordenação do desenho (§4.4)", () => {
  it("ordena pela precedência das arestas", () => {
    const { fluxos } = normalizarFluxos({ fluxos: [FLUXO_JMETER] });
    expect(planoDoFluxo(fluxos[0]).ordem).toEqual(["volumetria", "gerador", "commit"]);
  });

  it("ciclo devolve o caminho, e a mensagem é a do desenho", () => {
    const { fluxos } = normalizarFluxos({
      fluxos: [
        {
          id: "f",
          nos: [
            { id: "a", tipo: "conector", refId: "c" },
            { id: "b", tipo: "agente", refId: "p" },
          ],
          arestas: [
            { de: "a", para: "b", mapeamento: [] },
            { de: "b", para: "a", mapeamento: [] },
          ],
        },
      ],
    });
    const plano = planoDoFluxo(fluxos[0]);
    expect(plano.ordem).toEqual([]);
    expect(mensagemDeCiclo(plano.ciclo!)).toMatch(/^Ciclo: (a → b → a|b → a → b)$/);
  });
});

describe("validarEscritaFluxos (SPEC-35 + prova da fatia C)", () => {
  it("fluxo com ciclo é RECUSADO com a mesma mensagem do desenho", () => {
    const comCiclo = {
      fluxos: [
        {
          id: "f",
          nos: [
            { id: "a", tipo: "conector", refId: "c" },
            { id: "b", tipo: "agente", refId: "p" },
          ],
          arestas: [
            { de: "a", para: "b", mapeamento: [] },
            { de: "b", para: "a", mapeamento: [] },
          ],
        },
      ],
    };
    expect(() => validarEscritaFluxos(comCiclo)).toThrow(ConfigInvalida);
    expect(() => validarEscritaFluxos(comCiclo)).toThrow(/^Ciclo: /);
  });

  it.each([
    [{ fluxos: [{ nos: [], arestas: [] }] }, /sem "id"/],
    // §359 — a frase nomeia o que falta ("adaptador" era jargão; o usuário
    // estranhou "adaptador PO" com razão: o agente escolhe um PAPEL).
    [{ fluxos: [{ id: "f", nos: [{ id: "a", tipo: "conector" }], arestas: [] }] }, /sem conector/],
    [{ fluxos: [{ id: "f", nos: [{ id: "a", tipo: "laço", refId: "x" }], arestas: [] }] }, /tipo desconhecido/],
    [
      { fluxos: [{ id: "f", nos: [{ id: "a", tipo: "conector", refId: "x" }], arestas: [{ de: "a", para: "fantasma" }] }] },
      /"fantasma", que não existe/,
    ],
    // SPEC-107 fatia A — o registro de funções é fechado e vive no código:
    // refId fora dele nunca ganharia executor, e falhar só na execução seria
    // o silêncio que a §9.3 recusa.
    [
      { fluxos: [{ id: "f", nos: [{ id: "a", tipo: "funcao", refId: "telepatia" }], arestas: [] }] },
      /a função "telepatia", que não existe \(funções: derivacao, ensaio\)/,
    ],
    // SPEC-107 fatia B — o projeto não tem adaptador: refId é "projeto".
    [
      { fluxos: [{ id: "f", nos: [{ id: "a", tipo: "projeto", refId: "minha-demanda" }], arestas: [] }] },
      /o refId precisa ser "projeto"/,
    ],
  ])("recusa com o motivo: %j", (documento, motivo) => {
    expect(() => validarEscritaFluxos(documento)).toThrow(motivo);
  });

  it("o exemplo da SPEC passa", () => {
    expect(() => validarEscritaFluxos({ fluxos: [FLUXO_JMETER] })).not.toThrow();
  });

  it("SPEC-107 fatia A — nó de função com refId do registro passa", () => {
    expect(() =>
      validarEscritaFluxos({ fluxos: [{ id: "f", nos: [{ id: "g", tipo: "funcao", refId: "derivacao" }], arestas: [] }] })
    ).not.toThrow();
  });

  it("SPEC-107 fatia B — nó de projeto com refId \"projeto\" passa", () => {
    expect(() =>
      validarEscritaFluxos({ fluxos: [{ id: "f", nos: [{ id: "p", tipo: "projeto", refId: "projeto" }], arestas: [] }] })
    ).not.toThrow();
  });
});
