import { afterEach, describe, expect, it, vi } from "vitest";
import { carregarCenarios } from "./scenarios";

function respostaJson(corpo: unknown, ok = true): Response {
  return { ok, status: ok ? 200 : 404, json: () => Promise.resolve(corpo) } as Response;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("carregarCenarios", () => {
  it("busca o índice em config/cenarios/index.json, depois cada arquivo listado, em paralelo", async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url === "/config/cenarios/index.json") return Promise.resolve(respostaJson(["a.json", "b.json"]));
      if (url === "/config/cenarios/a.json") {
        return Promise.resolve(
          respostaJson({ id: "a", titulo: "A", descricao: "", tipos: [], categoria: "demo", designPatterns: [], quebra: {} })
        );
      }
      if (url === "/config/cenarios/b.json") {
        return Promise.resolve(
          respostaJson({ id: "b", titulo: "B", descricao: "", tipos: [], categoria: "demo", designPatterns: [], quebra: {} })
        );
      }
      throw new Error(`URL inesperada: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const cenarios = await carregarCenarios();

    expect(cenarios.map((c) => c.id)).toEqual(["a", "b"]);
    expect(fetchMock).toHaveBeenCalledWith("/config/cenarios/index.json");
    expect(fetchMock).toHaveBeenCalledWith("/config/cenarios/a.json");
    expect(fetchMock).toHaveBeenCalledWith("/config/cenarios/b.json");
  });

  it("índice em 404 (projeto novo via `gerador init`, sem config/cenarios/ ainda): degrada pra lista vazia, não quebra o app inteiro", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve(null) } as Response))
    );

    await expect(carregarCenarios()).resolves.toEqual([]);
  });

  it("índice existe mas responde erro real (500): rejeita com mensagem explicando o que falhou, não engole em silêncio", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve(null) } as Response))
    );

    await expect(carregarCenarios()).rejects.toThrow(/config\/cenarios\/index\.json/);
  });
});
