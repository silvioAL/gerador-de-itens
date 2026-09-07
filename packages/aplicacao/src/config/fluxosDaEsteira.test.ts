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
  it("SPEC-107 G5 — a esteira completa: demanda → papéis na ordem → grava", () => {
    const fluxo = fluxoDaEsteira(PAPEIS_PADRAO)!;
    expect(fluxo.id).toBe(ID_DO_FLUXO_DA_ESTEIRA);
    expect(fluxo.origem).toBe("fabrica");
    // SPEC-110 fatia A — a fábrica sempre desenha o GATILHO na frente: o
    // fluxo diz quando roda, e o botão vira o gesto dele.
    expect(planoDoFluxo(fluxo).ordem).toEqual(["gatilho", "demanda", "po", "arquiteto", "especialista", "qa", "grava"]);
    expect(fluxo.nos[0]).toMatchObject({ id: "gatilho", tipo: "gatilho", refId: "manual" });
    expect(fluxo.arestas[0]).toEqual({ de: "gatilho", para: "demanda", mapeamento: [] });
    // A FILA entra no primeiro papel vinda da demanda, com os contextos.
    expect(fluxo.arestas[1]).toEqual({
      de: "demanda",
      para: "po",
      mapeamento: [
        { saida: "filaDaEsteira", entrada: "fila" },
        { saida: "contextoEpico", entrada: "contextoEpico" },
        { saida: "contextoDoProduto", entrada: "contextoDoProduto" },
      ],
    });
    // O encadeamento é o `acumuladas` da revisão atravessando o grafo: a fila
    // (com as respostas acumuladas) segue de papel em papel.
    expect(fluxo.arestas[2].de).toBe("po");
    expect(fluxo.arestas[2].para).toBe("arquiteto");
    expect(fluxo.arestas[2].mapeamento).toContainEqual({ saida: "fila", entrada: "fila" });
    expect(fluxo.arestas[2].mapeamento).toContainEqual({ saida: "respostasItens", entrada: "respostasItens" });
    // E o destino grava as sugestões PENDENTES na demanda (§5.5).
    expect(fluxo.arestas).toContainEqual({
      de: "qa",
      para: "grava",
      mapeamento: [{ saida: "respostasItens", entrada: "respostasItens" }],
    });
    expect(fluxo.arestas).toContainEqual({
      de: "demanda",
      para: "grava",
      mapeamento: [{ saida: "demandaId", entrada: "demandaId" }],
    });
  });

  it("papel desligado fica fora da cadeia — como fica fora da revisão", () => {
    const papeis = PAPEIS_PADRAO.map((p) => (p.id === "arquiteto" ? { ...p, ativo: false } : p));
    const fluxo = fluxoDaEsteira(papeis)!;
    expect(planoDoFluxo(fluxo).ordem).toEqual(["gatilho", "demanda", "po", "especialista", "qa", "grava"]);
    expect(fluxo.arestas.map((a) => [a.de, a.para])).toEqual([
      ["gatilho", "demanda"],
      ["demanda", "po"],
      ["po", "especialista"],
      ["especialista", "qa"],
      ["qa", "grava"],
      ["demanda", "grava"],
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

  /**
   * SPEC-109 fatia A — a cópia que vence é SELADA, porque a vitória sem selo
   * é uma porta sem volta: uma esteira de 4 nós pré-G5 ficou meses no banco
   * escondendo a completa, e a tela não tinha como saber (nem avisar, nem
   * oferecer "voltar à derivada").
   */
  it("o declarado que esconde uma fábrica leva o selo sombreiaFabrica", () => {
    const vigor = fluxosEmVigor(PAPEIS_PADRAO, {
      fluxos: [
        { id: ID_DO_FLUXO_DA_ESTEIRA, nome: "Minha esteira", nos: [{ id: "po", tipo: "agente", refId: "po" }], arestas: [] },
        { id: "meu", nome: "Meu fluxo", nos: [{ id: "a", tipo: "agente", refId: "po" }], arestas: [] },
      ],
    });
    expect(vigor.find((f) => f.id === ID_DO_FLUXO_DA_ESTEIRA)?.sombreiaFabrica).toBe(true);
    // Declarado que não colide com fábrica nenhuma não é cópia de nada — sem selo.
    expect(vigor.find((f) => f.id === "meu")?.sombreiaFabrica).toBeUndefined();
    // A fábrica nunca se sombreia a si mesma.
    expect(vigor.find((f) => f.id === ID_DO_FLUXO_DO_ENSAIO)?.sombreiaFabrica).toBeUndefined();
  });
});

describe("fluxoDoEnsaio (SPEC-107 G4)", () => {
  it("existe SEMPRE — ensaiar é capacidade do motor, não depende de destino", () => {
    const vigor = fluxosEmVigor([], {});
    const ensaio = vigor.find((f) => f.id === ID_DO_FLUXO_DO_ENSAIO)!;
    expect(ensaio.origem).toBe("fabrica");
  });

  it("a fiação é gatilho → projeto.desenho → funcao(ensaio), na ordem do plano", () => {
    const fluxo = fluxoDoEnsaio();
    expect(planoDoFluxo(fluxo).ordem).toEqual(["gatilho", "demanda", "ensaio"]);
    expect(fluxo.nos.map((n) => [n.tipo, n.refId])).toEqual([
      ["gatilho", "manual"],
      ["projeto", "projeto"],
      ["funcao", "ensaio"],
    ]);
    expect(fluxo.arestas).toEqual([
      { de: "gatilho", para: "demanda", mapeamento: [] },
      { de: "demanda", para: "ensaio", mapeamento: [{ saida: "desenho", entrada: "desenho" }] },
    ]);
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
