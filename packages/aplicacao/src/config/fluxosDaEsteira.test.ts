import { describe, expect, it } from "vitest";
import { fluxoDaEsteira, fluxosEmVigor, ID_DO_FLUXO_DA_ESTEIRA, planoDoFluxo } from "./fluxos.js";
import { PAPEIS_PADRAO } from "./normalizacao.js";

/**
 * SPEC-106 — *"o pipeline de IA também unificado: se trata do desenho da mesma
 * coisa"*. A esteira derivada como fluxo, nunca copiada — reordenar um papel
 * na configuração reordena o fluxo sozinho.
 */
describe("fluxoDaEsteira", () => {
  it("os quatro papéis de fábrica viram a cadeia na ordem do array", () => {
    const fluxo = fluxoDaEsteira(PAPEIS_PADRAO)!;
    expect(fluxo.id).toBe(ID_DO_FLUXO_DA_ESTEIRA);
    expect(fluxo.origem).toBe("fabrica");
    expect(planoDoFluxo(fluxo).ordem).toEqual(["po", "arquiteto", "especialista", "qa"]);
    // O encadeamento é o `acumuladas` da revisão, agora visível: o texto de
    // cada papel entra no seguinte com a chave do papel de ORIGEM.
    expect(fluxo.arestas[0]).toEqual({ de: "po", para: "arquiteto", mapeamento: [{ saida: "texto", entrada: "po" }] });
  });

  it("papel desligado fica fora da cadeia — como fica fora da revisão", () => {
    const papeis = PAPEIS_PADRAO.map((p) => (p.id === "arquiteto" ? { ...p, ativo: false } : p));
    const fluxo = fluxoDaEsteira(papeis)!;
    expect(planoDoFluxo(fluxo).ordem).toEqual(["po", "especialista", "qa"]);
    expect(fluxo.arestas.map((a) => [a.de, a.para])).toEqual([
      ["po", "especialista"],
      ["especialista", "qa"],
    ]);
  });

  it("sem papel ativo não há fluxo — melhor ausência que uma cadeia vazia", () => {
    expect(fluxoDaEsteira(PAPEIS_PADRAO.map((p) => ({ ...p, ativo: false })))).toBeNull();
    expect(fluxoDaEsteira([])).toBeNull();
  });
});

describe("fluxosEmVigor", () => {
  it("declarados vêm primeiro, e a esteira derivada entra no fim", () => {
    const vigor = fluxosEmVigor(PAPEIS_PADRAO, {
      fluxos: [{ id: "meu", nome: "Meu fluxo", nos: [{ id: "a", tipo: "agente", refId: "po" }], arestas: [] }],
    });
    expect(vigor.map((f) => [f.id, f.origem])).toEqual([
      ["meu", "declarado"],
      [ID_DO_FLUXO_DA_ESTEIRA, "fabrica"],
    ]);
  });

  it("um declarado com o id da esteira vence a fábrica — é o 'editar uma cópia'", () => {
    const vigor = fluxosEmVigor(PAPEIS_PADRAO, {
      fluxos: [{ id: ID_DO_FLUXO_DA_ESTEIRA, nome: "Minha esteira", nos: [{ id: "po", tipo: "agente", refId: "po" }], arestas: [] }],
    });
    expect(vigor).toHaveLength(1);
    expect(vigor[0].origem).toBe("declarado");
    expect(vigor[0].nome).toBe("Minha esteira");
  });
});
