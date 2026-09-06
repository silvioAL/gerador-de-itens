import { describe, expect, it } from "vitest";
import { correrEsteiraPelaFila } from "./corridaDaEsteira.js";
import type { ItemDaFilaDaEsteira } from "./filaDaEsteira.js";
import type { PapelConfigurado } from "../config/normalizacao.js";

/**
 * SPEC-107 G5 — a corrida pura: o gêmeo servidor do `useEsteiraDeAgentes`.
 * O que se prova é a FORMA da corrida (lotes de 5, encadeamento por item,
 * falha isolada não trava) — a letra do prompt é dos montadores, já guardados
 * pelos testes de anatomia e pela simulação (#299).
 */

const PAPEIS: PapelConfigurado[] = [
  { id: "po", nome: "PO", grupo: "po", ativo: true, contextos: [] },
  { id: "qa", nome: "QA", grupo: "qa", ativo: true, contextos: [] },
];

function item(chave: string, papeis: Record<string, string[]>): ItemDaFilaDaEsteira {
  return {
    atividadeChave: chave,
    atividadeRotulo: `Item ${chave}`,
    contextoNo: "api (Serviço, novo)",
    placeholdersPorPapel: Object.fromEntries(
      PAPEIS.map((p) => [p.id, (papeis[p.id] ?? []).map((c) => ({ chave: c, tech: "Backend", rotulo: `rotulo ${c}` }))])
    ),
    respostasExistentes: [],
  };
}

describe("correrEsteiraPelaFila (SPEC-107 G5)", () => {
  it("corta em lotes de 5 por papel — 7 itens = 2 chamadas, como a revisão", async () => {
    const fila = Array.from({ length: 7 }, (_, i) => item(`i${i}`, { po: ["_h"] }));
    const chamadas: string[] = [];
    await correrEsteiraPelaFila({
      fila,
      papeisAtivos: PAPEIS,
      completarEstruturado: async (papelId, _prompt, esquema) => {
        chamadas.push(papelId);
        const e = esquema as { properties: Record<string, { properties: Record<string, unknown> }> };
        return Object.fromEntries(
          Object.entries(e.properties).map(([k, v]) => [k, Object.fromEntries(Object.keys(v.properties).map((c) => [c, "x"]))])
        );
      },
    });
    expect(chamadas).toEqual(["po", "po"]);
  });

  it("encadeia POR ITEM: o que o PO escreveu para um item chega ao QA daquele item, não ao vizinho", async () => {
    const fila = [item("a", { po: ["_h"], qa: ["_t"] }), item("b", { po: ["_h"], qa: ["_t"] })];
    const promptsDoQa: string[] = [];
    const { respostasPorItem, falhas } = await correrEsteiraPelaFila({
      fila,
      papeisAtivos: PAPEIS,
      completarEstruturado: async (papelId, prompt, esquema) => {
        if (papelId === "qa") promptsDoQa.push(prompt);
        const e = esquema as { properties: Record<string, { properties: Record<string, unknown> }> };
        return Object.fromEntries(
          Object.entries(e.properties).map(([k, v]) => [
            k,
            Object.fromEntries(Object.keys(v.properties).map((c) => [c, `${papelId}-para-${k}`])),
          ])
        );
      },
    });

    expect(falhas).toEqual([]);
    expect(respostasPorItem["a"]["_h"]).toBe("po-para-a");
    expect(respostasPorItem["a"]["_t"]).toBe("qa-para-a");
    // O prompt do QA carrega a resposta do PO no BLOCO do item certo: o
    // trecho entre o cabeçalho do item "a" e o do item "b" contém a resposta
    // de "a" — e não a de "b".
    const prompt = promptsDoQa[0];
    const blocoA = prompt.slice(prompt.indexOf('(chave "a")'), prompt.indexOf('(chave "b")'));
    expect(blocoA).toContain("po-para-a");
    expect(blocoA).not.toContain("po-para-b");
  });

  it("falha de um lote não trava a corrida — sai nomeada, e o resto segue", async () => {
    const fila = [item("a", { po: ["_h"], qa: ["_t"] })];
    const { respostasPorItem, falhas } = await correrEsteiraPelaFila({
      fila,
      papeisAtivos: PAPEIS,
      completarEstruturado: async (papelId, _prompt, esquema) => {
        if (papelId === "po") throw new Error("modelo travou neste lote");
        const e = esquema as { properties: Record<string, { properties: Record<string, unknown> }> };
        return Object.fromEntries(
          Object.entries(e.properties).map(([k, v]) => [k, Object.fromEntries(Object.keys(v.properties).map((c) => [c, "ok"]))])
        );
      },
    });

    expect(falhas).toEqual([{ papelId: "po", papelNome: "PO", mensagem: "modelo travou neste lote", itens: 1 }]);
    expect(respostasPorItem["a"]["_t"]).toBe("ok");
    expect(respostasPorItem["a"]["_h"]).toBeUndefined();
  });

  it("papel sem trabalho é pulado — ausência legítima, não chamada vazia", async () => {
    const fila = [item("a", { po: ["_h"] })];
    const chamadas: string[] = [];
    await correrEsteiraPelaFila({
      fila,
      papeisAtivos: PAPEIS,
      completarEstruturado: async (papelId, _p, esquema) => {
        chamadas.push(papelId);
        const e = esquema as { properties: Record<string, { properties: Record<string, unknown> }> };
        return Object.fromEntries(
          Object.entries(e.properties).map(([k, v]) => [k, Object.fromEntries(Object.keys(v.properties).map((c) => [c, "x"]))])
        );
      },
    });
    expect(chamadas).toEqual(["po"]);
  });
});
