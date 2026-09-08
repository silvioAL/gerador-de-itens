import { describe, expect, it } from "vitest";
import { executarFluxo } from "../casos-de-uso/fluxos.js";
import {
  fluxoDaEsteira,
  fluxoDaExportacao,
  fluxoDoEnsaio,
  fluxosDaPublicacao,
  noDeGatilhoManual,
  validarEscritaFluxos,
  type Fluxo,
} from "./fluxos.js";
import { GATILHOS_DO_SISTEMA, gatilhoDoSistema } from "./gatilhos.js";
import { ConfigInvalida, PAPEIS_PADRAO, normalizarExportador } from "./normalizacao.js";

/**
 * SPEC-110 fatia A — **o gatilho como nó.**
 *
 * A queixa: *"não entendi qual o objetivo do botão executar"*. O botão não
 * tinha propósito legível porque o "quando" era convenção escondida no shell.
 * As provas desta fatia cobram as três consequências: o registro é fechado, a
 * fábrica sempre desenha o gatilho, e o executor dele é um no-op que carimba a
 * ORIGEM do disparo no rastro.
 */

const EXECUTORES_QUE_EXPLODEM = {
  conector: async () => {
    throw new Error("não devia ser chamado");
  },
  agente: async () => {
    throw new Error("não devia ser chamado");
  },
  funcao: async () => {
    throw new Error("não devia ser chamado");
  },
  projeto: async () => {
    throw new Error("não devia ser chamado");
  },
  transformacao: async () => {
    throw new Error("não devia ser chamado");
  },
};

describe("GATILHOS_DO_SISTEMA (o registro fechado)", () => {
  it("o manual existe e nomeia o GESTO, não o tipo", () => {
    const manual = gatilhoDoSistema("manual")!;
    expect(manual).toBeDefined();
    expect(manual.nome).toContain("Manual");
    // D1 — sem contrato de dados no v1: o gatilho é âncora de "quando".
    expect(manual.saida).toEqual([]);
    // O cartão do canvas leva o rótulo CURTO: a frase inteira estica o cartão
    // e esconde o vizinho sob ele (medido na validação visual da fatia).
    expect(manual.rotuloCurto.length).toBeLessThan(16);
  });

  it("gatilho desconhecido não existe — a lista é fechada de propósito (§242)", () => {
    expect(gatilhoDoSistema("quando-der-vontade")).toBeUndefined();
    // SPEC-110 fatia E — a família cresceu com o relógio, e ela cresce por
    // DECISÃO: cada membro chega com quem o honre no mesmo commit (§242).
    // O `webhook` entra na fatia L; o `screen`, na SPEC-111.
    expect(GATILHOS_DO_SISTEMA.map((g) => g.id)).toEqual(["manual", "agendamento"]);
  });
});

describe("as fábricas desenham o gatilho (D1)", () => {
  const exportador = normalizarExportador({
    destinos: [
      { id: "tracker", rotulo: "Tracker", operacao: "itens", endpoint: "https://t/itens" },
      { id: "wiki", rotulo: "Wiki", operacao: "documento", endpoint: "https://w/doc" },
    ],
  });

  it("a esteira, a exportação, a publicação e o ensaio começam por gatilho manual", () => {
    const derivados = [
      fluxoDaEsteira(PAPEIS_PADRAO)!,
      fluxoDaExportacao(exportador)!,
      ...fluxosDaPublicacao(exportador),
      fluxoDoEnsaio(),
    ];
    expect(derivados.length).toBeGreaterThanOrEqual(4);
    for (const fluxo of derivados) {
      expect(fluxo.nos[0], fluxo.id).toMatchObject({ id: "gatilho", tipo: "gatilho", refId: "manual" });
      // A aresta do disparo não carrega dado — e é por isso que a tela a
      // rotula "dispara" em vez de acusá-la de "sem mapeamento".
      expect(fluxo.arestas[0], fluxo.id).toEqual({ de: "gatilho", para: fluxo.nos[1].id, mapeamento: [] });
    }
  });

  it("nenhum nó do desenho ficou por cima de outro — o gatilho empurrou a fila", () => {
    const fluxo = fluxoDaEsteira(PAPEIS_PADRAO)!;
    const posicoes = fluxo.nos.map((n) => `${n.posicao.x}/${n.posicao.y}`);
    expect(new Set(posicoes).size).toBe(posicoes.length);
  });
});

describe("validarEscritaFluxos e o gatilho", () => {
  const comNos = (nos: unknown[]): unknown => ({ fluxos: [{ id: "f", nome: "F", nos, arestas: [] }] });

  it("recusa DOIS gatilhos — 'qual vale?' não pode ter resposta silenciosa (D1)", () => {
    expect(() =>
      validarEscritaFluxos(
        comNos([
          { id: "g1", tipo: "gatilho", refId: "manual" },
          { id: "g2", tipo: "gatilho", refId: "manual" },
        ])
      )
    ).toThrow(ConfigInvalida);
    expect(() =>
      validarEscritaFluxos(
        comNos([
          { id: "g1", tipo: "gatilho", refId: "manual" },
          { id: "g2", tipo: "gatilho", refId: "manual" },
        ])
      )
    ).toThrow(/dois|2 gatilhos/i);
  });

  it("recusa gatilho fora do registro — nunca ganharia executor (§9.3)", () => {
    expect(() => validarEscritaFluxos(comNos([{ id: "g", tipo: "gatilho", refId: "quando-der" }]))).toThrow(
      /não existe/
    );
  });

  it("ACEITA zero gatilhos (D8) — o declarado antigo continua rodando pelo botão", () => {
    expect(() => validarEscritaFluxos(comNos([{ id: "a", tipo: "agente", refId: "po" }]))).not.toThrow();
  });

  it("aceita UM gatilho", () => {
    expect(() =>
      validarEscritaFluxos(
        comNos([
          { id: "gatilho", tipo: "gatilho", refId: "manual" },
          { id: "a", tipo: "agente", refId: "po" },
        ])
      )
    ).not.toThrow();
  });
});

describe("o executor do gatilho é um no-op que carimba a origem", () => {
  const fluxoSoDeGatilho: Fluxo = {
    id: "so-gatilho",
    nome: "Só o gatilho",
    nos: [noDeGatilhoManual({ x: 0, y: 0 })],
    arestas: [],
  };

  it("roda sem chamar executor nenhum, e o rastro diz ✓ com origem manual", async () => {
    const r = await executarFluxo(fluxoSoDeGatilho, EXECUTORES_QUE_EXPLODEM);
    expect(r.nos).toHaveLength(1);
    expect(r.nos[0]).toMatchObject({ noId: "gatilho", tipo: "gatilho", estado: "sucesso", origem: "manual" });
    // Saída vazia: o gatilho manual não emite dado (D1).
    expect(r.saidas["gatilho"]).toEqual({});
  });

  it("a origem declarada pelo disparo chega ao rastro — é o que a fatia E vai provar no histórico", async () => {
    const r = await executarFluxo(fluxoSoDeGatilho, EXECUTORES_QUE_EXPLODEM, { origemDoDisparo: "agendamento" });
    expect(r.nos[0].origem).toBe("agendamento");
  });

  it("só o gatilho carrega origem — os outros nós não têm o que dizer sobre 'por que rodou'", async () => {
    const fluxo: Fluxo = {
      id: "gatilho-e-transformacao",
      nome: "…",
      nos: [
        noDeGatilhoManual({ x: 0, y: 0 }),
        { id: "molda", tipo: "transformacao", refId: "transformacao", posicao: { x: 200, y: 0 }, parametros: {} },
      ],
      arestas: [{ de: "gatilho", para: "molda", mapeamento: [] }],
    };
    const r = await executarFluxo(fluxo, { ...EXECUTORES_QUE_EXPLODEM, transformacao: async () => ({ ok: true }) });
    expect(r.nos.map((n) => n.noId)).toEqual(["gatilho", "molda"]);
    expect(r.nos[1].origem).toBeUndefined();
  });
});
