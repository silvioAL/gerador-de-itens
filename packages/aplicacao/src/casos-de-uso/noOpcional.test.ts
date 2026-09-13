import { describe, expect, it } from "vitest";
import { executarFluxo, type ExecutoresDoFluxo } from "./fluxos.js";
import type { Fluxo } from "../config/fluxos.js";

/**
 * SPEC-112 fatia A (D1) — **o nó que fica no desenho e não roda sozinho.**
 *
 * Pedido literal do usuário sobre o ensaio: *"é condicional, portanto o usuário
 * clica e usa se quiser"*, e *"plugada por conector, o sistema deve ser capaz
 * de lidar com isso"*. A etapa continua ligada por aresta — visível, religável,
 * parte do desenho — e é o MOTOR que aprende a passar por ela.
 *
 * O buraco que estas provas fecham foi medido antes de escrever: a regra 1 do
 * executor derruba quem depende de um nó que não rodou (*"a origem X não rodou
 * — entrada ausente não vira default"*). Sem tratar `pulado` à parte, plugar o
 * ensaio mataria o resto da linha.
 */

const chamados: string[] = [];
const EXECUTORES: ExecutoresDoFluxo = {
  conector: async (no) => {
    chamados.push(no.id);
    return { saiu: no.id };
  },
  agente: async (no) => {
    chamados.push(no.id);
    return { texto: `de ${no.id}` };
  },
  funcao: async (no) => {
    chamados.push(no.id);
    return { leitura: no.id };
  },
  projeto: async (no) => {
    chamados.push(no.id);
    return { desenho: { de: no.id } };
  },
  transformacao: async (no) => {
    chamados.push(no.id);
    return {};
  },
  subfluxo: async (no) => {
    chamados.push(no.id);
    return {};
  },
};

const no = (id: string, extra: Partial<Fluxo["nos"][number]> = {}): Fluxo["nos"][number] => ({
  id,
  tipo: "conector",
  refId: "qualquer",
  posicao: { x: 0, y: 0 },
  parametros: {},
  ...extra,
});

/** `entra → opcional → depois`: a linha que o pulado NÃO pode quebrar. */
const FLUXO: Fluxo = {
  id: "com-opcional",
  nome: "com opcional",
  nos: [no("entra"), no("opcional", { opcional: true }), no("depois")],
  arestas: [
    { de: "entra", para: "opcional", mapeamento: [{ saida: "saiu", entrada: "de" }] },
    { de: "opcional", para: "depois", mapeamento: [{ saida: "saiu", entrada: "doOpcional" }] },
    { de: "entra", para: "depois", mapeamento: [{ saida: "saiu", entrada: "daEntrada" }] },
  ],
};

describe("o nó opcional na corrida linear", () => {
  it("é PULADO — e o rastro diz isso, em vez de omiti-lo", async () => {
    chamados.length = 0;
    const r = await executarFluxo(FLUXO, EXECUTORES);

    expect(chamados).toEqual(["entra", "depois"]);
    const pulado = r.nos.find((n) => n.noId === "opcional")!;
    // D5 — some do rastro seria não distinguir "não existia" de "não rodou".
    expect(pulado).toBeDefined();
    expect(pulado.estado).toBe("pulado");
  });

  it("**não derruba quem depende dele** — é o buraco que a fatia fecha", async () => {
    chamados.length = 0;
    const r = await executarFluxo(FLUXO, EXECUTORES);

    const depois = r.nos.find((n) => n.noId === "depois")!;
    expect(depois.estado).toBe("sucesso");
    expect(depois.erro).toBeUndefined();
  });

  it("a aresta que sai dele não traz dado — o destino roda com o que sobrou", async () => {
    chamados.length = 0;
    const entradas: Record<string, unknown>[] = [];
    const r = await executarFluxo(
      { ...FLUXO, nos: FLUXO.nos.map((n) => (n.id === "depois" ? { ...n, tipo: "funcao" as const } : n)) },
      { ...EXECUTORES, funcao: async (n, p) => (entradas.push(p), { ok: true }) }
    );
    expect(r.nos.find((n) => n.noId === "depois")?.estado).toBe("sucesso");
    // Veio o da entrada; não veio o do pulado. Sem invenção de default.
    expect(entradas[0]).toEqual({ daEntrada: "entra" });
    expect("doOpcional" in entradas[0]).toBe(false);
  });

  it("um nó que FALHA continua derrubando — a regra 1 não foi afrouxada", async () => {
    const comFalha: Fluxo = {
      ...FLUXO,
      nos: [no("entra"), no("quebra"), no("depois")],
      arestas: [
        { de: "entra", para: "quebra", mapeamento: [] },
        { de: "quebra", para: "depois", mapeamento: [] },
      ],
    };
    const r = await executarFluxo(comFalha, {
      ...EXECUTORES,
      conector: async (n) => {
        if (n.id === "quebra") throw new Error("caiu");
        return { saiu: n.id };
      },
    });
    expect(r.nos.find((n) => n.noId === "quebra")?.estado).toBe("falhou");
    const depois = r.nos.find((n) => n.noId === "depois")!;
    expect(depois.estado).toBe("nao-executado");
    expect(depois.erro).toContain("falhou");
  });
});

describe("pedir a etapa opcional", () => {
  it("`ateNo` apontando para ELE o faz rodar — é o gesto “rodar esta etapa”", async () => {
    chamados.length = 0;
    const r = await executarFluxo(FLUXO, EXECUTORES, { ateNo: "opcional" });

    expect(chamados).toContain("opcional");
    expect(r.nos.find((n) => n.noId === "opcional")?.estado).toBe("sucesso");
    // E só o fecho de ancestrais roda: quem vem DEPOIS não é chamado.
    expect(chamados).not.toContain("depois");
  });

  it("pedir OUTRO nó não acorda o opcional que estiver no caminho", async () => {
    // Você pediu `depois`, não o opcional. Rodá-lo "de brinde" seria decidir
    // por quem clicou — e o opcional existe justamente para não ser automático.
    chamados.length = 0;
    await executarFluxo(FLUXO, EXECUTORES, { ateNo: "depois" });
    expect(chamados).toEqual(["entra", "depois"]);
  });
});
