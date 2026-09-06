import { describe, expect, it } from "vitest";
import {
  fluxoDaEsteira,
  fluxoDoEnsaio,
  fluxosEmVigor,
  ID_DO_FLUXO_DA_ESTEIRA,
  ID_DO_FLUXO_DO_ENSAIO,
  planoDoFluxo,
} from "./fluxos.js";
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
  it("declarados vêm primeiro, e as derivadas entram no fim", () => {
    const vigor = fluxosEmVigor(PAPEIS_PADRAO, {
      fluxos: [{ id: "meu", nome: "Meu fluxo", nos: [{ id: "a", tipo: "agente", refId: "po" }], arestas: [] }],
    });
    expect(vigor.map((f) => [f.id, f.origem])).toEqual([
      ["meu", "declarado"],
      [ID_DO_FLUXO_DA_ESTEIRA, "fabrica"],
      [ID_DO_FLUXO_DO_ENSAIO, "fabrica"],
    ]);
  });

  it("um declarado com o id da esteira vence a fábrica — é o 'editar uma cópia'", () => {
    const vigor = fluxosEmVigor(PAPEIS_PADRAO, {
      fluxos: [{ id: ID_DO_FLUXO_DA_ESTEIRA, nome: "Minha esteira", nos: [{ id: "po", tipo: "agente", refId: "po" }], arestas: [] }],
    });
    expect(vigor.map((f) => f.id)).toEqual([ID_DO_FLUXO_DA_ESTEIRA, ID_DO_FLUXO_DO_ENSAIO]);
    expect(vigor[0].origem).toBe("declarado");
    expect(vigor[0].nome).toBe("Minha esteira");
  });
});

describe("fluxoDoEnsaio (SPEC-107 G4)", () => {
  it("existe SEMPRE — ensaiar é capacidade do motor, não depende de destino", () => {
    const vigor = fluxosEmVigor([], {});
    const ensaio = vigor.find((f) => f.id === ID_DO_FLUXO_DO_ENSAIO)!;
    expect(ensaio.origem).toBe("fabrica");
  });

  it("a fiação é projeto.desenho → funcao(ensaio), na ordem do plano", () => {
    const fluxo = fluxoDoEnsaio();
    expect(planoDoFluxo(fluxo).ordem).toEqual(["demanda", "ensaio"]);
    expect(fluxo.nos.map((n) => [n.tipo, n.refId])).toEqual([
      ["projeto", "projeto"],
      ["funcao", "ensaio"],
    ]);
    expect(fluxo.arestas).toEqual([{ de: "demanda", para: "ensaio", mapeamento: [{ saida: "desenho", entrada: "desenho" }] }]);
  });

  it("um declarado com o id do ensaio vence a fábrica", () => {
    const vigor = fluxosEmVigor([], {
      fluxos: [{ id: ID_DO_FLUXO_DO_ENSAIO, nome: "Meu ensaio", nos: [{ id: "a", tipo: "funcao", refId: "ensaio" }], arestas: [] }],
    });
    const doVigor = vigor.filter((f) => f.id === ID_DO_FLUXO_DO_ENSAIO);
    expect(doVigor).toHaveLength(1);
    expect(doVigor[0].origem).toBe("declarado");
  });
});
