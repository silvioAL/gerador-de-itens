import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { carregarConfig } from "./loadConfig";

const diagramaConfig = {
  nodeTypes: { service: { label: "Serviço", derives: "service", techs: [], contextos: [], spec: [] } },
  edgeTypes: { publishes: { label: "publica", spec: [{ key: "roteamento", label: "Chave", type: "text" as const }] } },
  edgeRules: {},
};
const appConfig = { techs: [], contextos: [] };

function respostaJson(corpo: unknown, ok = true, status = 200) {
  return Promise.resolve({ ok, status, json: () => Promise.resolve(corpo) } as Response);
}

describe("carregarConfig (SPEC-21) — /campos-aresta ausente não pode derrubar a config inteira", () => {
  let fetchOriginal: typeof fetch;

  beforeEach(() => {
    fetchOriginal = global.fetch;
  });

  afterEach(() => {
    global.fetch = fetchOriginal;
    vi.restoreAllMocks();
  });

  it("quando /campos-aresta responde 404 (modo hospedado, sem a rota — SPEC-21 §2), a config carrega mesmo assim, sem campos de aresta", async () => {
    global.fetch = vi.fn((url: string) => {
      if (String(url).includes("/config/diagrama.json")) return respostaJson(diagramaConfig);
      if (String(url).includes("/config/app.json")) return respostaJson(appConfig);
      if (String(url).includes("/config/regras.json")) return respostaJson(undefined, false, 404);
      if (String(url).includes("/campos-no")) return respostaJson([]);
      if (String(url).includes("/campos-aresta")) return respostaJson({ erro: "não encontrado" }, false, 404);
      return respostaJson(undefined, false, 404);
    }) as unknown as typeof fetch;

    const resultado = await carregarConfig("time-x");

    expect(resultado.diagramaConfig.edgeTypes.publishes.spec).toEqual([
      { key: "roteamento", label: "Chave", type: "text" },
    ]);
  });
});

/**
 * §354 — quem RESOLVE o diagrama é o servidor.
 *
 * O web chegou a mesclar as sobreposições de conexão sozinho. O usuário
 * apontou (*"coisas do backend precisam ficar no backend"*), e a mescla foi
 * para `aplicacao/config/diagnostico.ts` — testada lá. O que sobra de
 * responsabilidade aqui é só: pedir ao servidor, e não ficar sem vocabulário
 * quando ele não responde.
 */
describe("carregarConfig — o diagrama vem resolvido do servidor", () => {
  let fetchOriginal: typeof fetch;

  const resolvido = {
    ...diagramaConfig,
    edgeRules: { motor: { valid: ["interno", "http"], default: "interno" } },
  };

  beforeEach(() => {
    fetchOriginal = global.fetch;
  });
  afterEach(() => {
    global.fetch = fetchOriginal;
    vi.restoreAllMocks();
  });

  it("usa `/config/diagrama` — não o arquivo estático", async () => {
    const pedidos: string[] = [];
    global.fetch = vi.fn((url: string) => {
      const u = String(url);
      pedidos.push(u);
      if (u.includes("/config/diagrama.json")) return respostaJson(diagramaConfig);
      if (u.endsWith("/config/diagrama")) return respostaJson(resolvido);
      if (u.includes("/config/app.json")) return respostaJson(appConfig);
      if (u.includes("/campos-no") || u.includes("/campos-aresta")) return respostaJson([]);
      return respostaJson(undefined, false, 404);
    }) as unknown as typeof fetch;

    const { diagramaConfig: cfg } = await carregarConfig("time-x");

    expect(cfg.edgeRules.motor).toEqual({ valid: ["interno", "http"], default: "interno" });
    expect(pedidos.some((u) => u.endsWith("/config/diagrama"))).toBe(true);
  });

  it("servidor fora do ar cai no arquivo estático — o canvas nunca fica sem vocabulário", async () => {
    global.fetch = vi.fn((url: string) => {
      const u = String(url);
      if (u.includes("/config/diagrama.json")) return respostaJson(diagramaConfig);
      if (u.includes("/config/app.json")) return respostaJson(appConfig);
      if (u.includes("/campos-no") || u.includes("/campos-aresta")) return respostaJson([]);
      return respostaJson(undefined, false, 500);
    }) as unknown as typeof fetch;

    const { diagramaConfig: cfg } = await carregarConfig("time-x");

    expect(cfg.nodeTypes.service.label).toBe("Serviço");
  });
});
