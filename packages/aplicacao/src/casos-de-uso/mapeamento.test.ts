import { describe, expect, it } from "vitest";
import { avisosDeMapeamento, type ContratoDoNoNoFluxo } from "./mapeamento.js";
import { normalizarFluxos } from "../config/fluxos.js";
import type { NoDoFluxo } from "../config/fluxos.js";

const FLUXO = normalizarFluxos({
  fluxos: [
    {
      id: "f",
      nos: [
        { id: "a", tipo: "projeto", refId: "projeto" },
        { id: "b", tipo: "funcao", refId: "derivacao" },
        { id: "c", tipo: "agente", refId: "po" },
      ],
      arestas: [
        {
          de: "a",
          para: "b",
          mapeamento: [
            { saida: "itens", entrada: "desenho" },
            { saida: "desenho", entrada: "desenho" },
          ],
        },
        { de: "b", para: "c", mapeamento: [{ saida: "itens", entrada: "itens" }] },
      ],
    },
  ],
}).fluxos[0];

const CONTRATOS: Record<string, ContratoDoNoNoFluxo> = {
  a: { saida: [{ chave: "itens", rotulo: "Itens", tipo: "lista" }, { chave: "desenho", rotulo: "Desenho", tipo: "objeto" }, { chave: "markdown", rotulo: "Doc", tipo: "documento" }] },
  b: { entrada: [{ chave: "desenho", rotulo: "Desenho", tipo: "objeto" }], saida: [{ chave: "itens", rotulo: "Itens", tipo: "lista" }] },
};

const contratoDe = (no: NoDoFluxo) => CONTRATOS[no.id] ?? null;

describe("avisosDeMapeamento (SPEC-107 fatia F — aviso, não bloqueio)", () => {
  it("avisa quando os tipos declarados não combinam, com os dois lados nomeados", () => {
    const avisos = avisosDeMapeamento(FLUXO, contratoDe);
    expect(avisos).toHaveLength(1);
    expect(avisos[0].texto).toContain('"itens" (lista) → "desenho" (objeto)');
    // O par certo (objeto → objeto) e o lado sem contrato (agente) não avisam.
  });

  it("texto e documento são compatíveis nos DOIS sentidos — documento é semântica, não envelope", () => {
    const fluxo = normalizarFluxos({
      fluxos: [
        {
          id: "f",
          nos: [
            { id: "a", tipo: "projeto", refId: "projeto" },
            { id: "b", tipo: "conector", refId: "x" },
          ],
          arestas: [{ de: "a", para: "b", mapeamento: [{ saida: "markdown", entrada: "corpo" }] }],
        },
      ],
    }).fluxos[0];
    const avisos = avisosDeMapeamento(fluxo, (no) =>
      no.id === "a"
        ? { saida: [{ chave: "markdown", rotulo: "Doc", tipo: "documento" }] }
        : { entrada: [{ chave: "corpo", rotulo: "Corpo", tipo: "texto" }] }
    );
    expect(avisos).toEqual([]);
  });

  it("lado sem forma declarada não avisa — ausência não é incompatibilidade", () => {
    expect(avisosDeMapeamento(FLUXO, () => null)).toEqual([]);
  });
});
