import { describe, expect, it } from "vitest";
import { executarFluxo } from "../casos-de-uso/fluxos.js";
import { noDeGatilhoManual, validarEscritaFluxos, type Fluxo } from "./fluxos.js";
import { ConfigInvalida } from "./normalizacao.js";
import { CAMPO_DA_DECISAO, TELAS_DO_SISTEMA, problemaNaSaidaDaTela, telaDoSistema } from "./telas.js";

/**
 * SPEC-110 fatia B — **a tela como nó: o executor é GENTE.**
 *
 * O pedido do usuário, à letra: *"seria feita a conexão com essa screen, o
 * agente iria gerar o ensaio, e depois o usuário revisa, e decide avançar
 * para a derivação, ou retornar"*. As provas cobram as três consequências: a
 * execução SUSPENDE na tela levando o que ela mostra, o Avançar continua com
 * a decisão da pessoa, e a saída é validada contra o contrato declarado.
 */

const EXECUTORES = {
  conector: async () => ({}),
  agente: async () => ({}),
  funcao: async (no: { id: string }) => ({ leitura: { de: no.id }, itens: ["a", "b"] }),
  projeto: async () => ({ desenho: { diagrama: {} } }),
  transformacao: async () => ({}),
};

/** gatilho → funcao(produz) → TELA → funcao(depois) */
const FLUXO_COM_TELA: Fluxo = {
  id: "com-tela",
  nome: "Com tela",
  nos: [
    noDeGatilhoManual({ x: 0, y: 0 }),
    { id: "produz", tipo: "funcao", refId: "ensaio", posicao: { x: 200, y: 0 }, parametros: {} },
    { id: "revisa", tipo: "tela", refId: "bancada-de-ensaios", posicao: { x: 400, y: 0 }, parametros: {} },
    { id: "depois", tipo: "funcao", refId: "derivacao", posicao: { x: 600, y: 0 }, parametros: {} },
  ],
  arestas: [
    { de: "gatilho", para: "produz", mapeamento: [] },
    { de: "produz", para: "revisa", mapeamento: [{ saida: "leitura", entrada: "ensaio" }] },
    { de: "revisa", para: "depois", mapeamento: [] },
  ],
};

describe("TELAS_DO_SISTEMA (o registro fechado)", () => {
  it("as três telas do sistema são as que já existem no produto", () => {
    expect(TELAS_DO_SISTEMA.map((t) => t.id)).toEqual(["bancada-de-ensaios", "documento", "mesa"]);
    expect(telaDoSistema("nao-existe")).toBeUndefined();
  });

  it("TODA tela emite a decisão — é o que torna avançar/retornar fiável (D2)", () => {
    for (const tela of TELAS_DO_SISTEMA) {
      expect(tela.saida.map((c) => c.chave), tela.id).toContain(CAMPO_DA_DECISAO.chave);
    }
  });

  it("o cartão leva rótulo curto — a frase inteira esconde o vizinho (lição da fatia A)", () => {
    for (const tela of TELAS_DO_SISTEMA) {
      expect(tela.rotuloCurto.length, tela.id).toBeLessThan(22);
    }
  });
});

describe("problemaNaSaidaDaTela", () => {
  const bancada = telaDoSistema("bancada-de-ensaios")!;

  it("aceita a decisão do catálogo, e só ela", () => {
    expect(problemaNaSaidaDaTela(bancada, { decisao: "avancar" })).toBeNull();
    expect(problemaNaSaidaDaTela(bancada, { decisao: "retornar" })).toBeNull();
    expect(problemaNaSaidaDaTela(bancada, { decisao: "talvez" })).toMatch(/decisao/);
    expect(problemaNaSaidaDaTela(bancada, {})).toMatch(/decisao/);
  });

  it("campo obrigatório ausente é recusado NOMEANDO — não vira default (§9.3)", () => {
    const comObrigatorio = {
      saida: [CAMPO_DA_DECISAO, { chave: "motivo", rotulo: "Motivo", tipo: "texto" as const, obrigatorio: true }],
    };
    expect(problemaNaSaidaDaTela(comObrigatorio, { decisao: "avancar" })).toMatch(/"motivo"/);
    expect(problemaNaSaidaDaTela(comObrigatorio, { decisao: "avancar", motivo: "" })).toMatch(/"motivo"/);
    expect(problemaNaSaidaDaTela(comObrigatorio, { decisao: "avancar", motivo: "ok" })).toBeNull();
  });
});

describe("validarEscritaFluxos e a tela", () => {
  it("recusa tela fora do registro — nunca ganharia executor (§9.3)", () => {
    expect(() =>
      validarEscritaFluxos({
        fluxos: [{ id: "f", nome: "F", nos: [{ id: "t", tipo: "tela", refId: "inventada" }], arestas: [] }],
      })
    ).toThrow(ConfigInvalida);
  });

  it("aceita as do sistema", () => {
    expect(() =>
      validarEscritaFluxos({
        fluxos: [{ id: "f", nome: "F", nos: [{ id: "t", tipo: "tela", refId: "mesa" }], arestas: [] }],
      })
    ).not.toThrow();
  });
});

describe("o executor da tela (a suspensão que espera GENTE)", () => {
  it("SUSPENDE na tela, levando o que ela vai mostrar — e o que vem depois não roda", async () => {
    const r = await executarFluxo(FLUXO_COM_TELA, EXECUTORES);
    expect(r.aguardandoTela).toEqual({
      noId: "revisa",
      refId: "bancada-de-ensaios",
      entradas: { ensaio: { de: "produz" } },
    });
    // A tela NÃO está no rastro: ela não rodou, está esperando (a mesma régua
    // do gate — esperando não é falha nem pulo).
    expect(r.nos.map((n) => n.noId)).toEqual(["gatilho", "produz"]);
    // E o gate de confirmação continua sendo OUTRA coisa.
    expect(r.aguardandoEm).toBeUndefined();
  });

  it("o AVANÇAR continua com a decisão da pessoa como saída do nó", async () => {
    const primeira = await executarFluxo(FLUXO_COM_TELA, EXECUTORES);
    const r = await executarFluxo(FLUXO_COM_TELA, EXECUTORES, {
      retomarDe: {
        saidas: primeira.saidas,
        concluidos: primeira.nos.filter((n) => n.estado === "sucesso").map((n) => n.noId),
        saidaDaTela: { noId: "revisa", saida: { decisao: "avancar", ensaioAprovado: { ok: true } } },
      },
    });
    expect(r.aguardandoTela).toBeUndefined();
    expect(r.nos.map((n) => [n.noId, n.estado])).toEqual([
      ["revisa", "sucesso"],
      ["depois", "sucesso"],
    ]);
    // A saída da tela é a da PESSOA, e o rastro guarda o que ela viu.
    expect(r.saidas["revisa"]).toEqual({ decisao: "avancar", ensaioAprovado: { ok: true } });
    expect(r.nos.find((n) => n.noId === "revisa")?.entradas).toEqual({ ensaio: { de: "produz" } });
  });

  it("retomar SEM a decisão suspende na mesma tela — o nó não roda sozinho", async () => {
    const primeira = await executarFluxo(FLUXO_COM_TELA, EXECUTORES);
    const r = await executarFluxo(FLUXO_COM_TELA, EXECUTORES, {
      retomarDe: {
        saidas: primeira.saidas,
        concluidos: primeira.nos.filter((n) => n.estado === "sucesso").map((n) => n.noId),
      },
    });
    expect(r.aguardandoTela?.noId).toBe("revisa");
    expect(r.nos).toHaveLength(0);
  });

  it("a decisão de OUTRO nó não destrava esta tela", async () => {
    const r = await executarFluxo(FLUXO_COM_TELA, EXECUTORES, {
      retomarDe: { saidas: {}, concluidos: [], saidaDaTela: { noId: "outra", saida: { decisao: "avancar" } } },
    });
    expect(r.aguardandoTela?.noId).toBe("revisa");
  });

  it("duas telas na fiação param DUAS vezes — vários pontos de revisão são vários", async () => {
    const fluxo: Fluxo = {
      ...FLUXO_COM_TELA,
      nos: [
        ...FLUXO_COM_TELA.nos,
        { id: "revisa2", tipo: "tela", refId: "documento", posicao: { x: 800, y: 0 }, parametros: {} },
      ],
      arestas: [...FLUXO_COM_TELA.arestas, { de: "depois", para: "revisa2", mapeamento: [] }],
    };
    const primeira = await executarFluxo(fluxo, EXECUTORES);
    expect(primeira.aguardandoTela?.noId).toBe("revisa");
    const segunda = await executarFluxo(fluxo, EXECUTORES, {
      retomarDe: {
        saidas: primeira.saidas,
        concluidos: primeira.nos.filter((n) => n.estado === "sucesso").map((n) => n.noId),
        saidaDaTela: { noId: "revisa", saida: { decisao: "avancar" } },
      },
    });
    expect(segunda.aguardandoTela?.noId).toBe("revisa2");
  });
});
