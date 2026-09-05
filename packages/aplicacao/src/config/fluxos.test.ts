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
            { id: "b", tipo: "transformacao", refId: "x" },
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
    [{ fluxos: [{ id: "f", nos: [{ id: "a", tipo: "conector" }], arestas: [] }] }, /sem "refId"/],
    [{ fluxos: [{ id: "f", nos: [{ id: "a", tipo: "laço", refId: "x" }], arestas: [] }] }, /tipo desconhecido/],
    [
      { fluxos: [{ id: "f", nos: [{ id: "a", tipo: "conector", refId: "x" }], arestas: [{ de: "a", para: "fantasma" }] }] },
      /"fantasma", que não existe/,
    ],
  ])("recusa com o motivo: %j", (documento, motivo) => {
    expect(() => validarEscritaFluxos(documento)).toThrow(motivo);
  });

  it("o exemplo da SPEC passa", () => {
    expect(() => validarEscritaFluxos({ fluxos: [FLUXO_JMETER] })).not.toThrow();
  });
});
