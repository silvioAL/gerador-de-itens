import { describe, expect, it } from "vitest";
import { MODELOS_CHAT, MODELO_CHAT, modeloChatPorId, modeloPorId, urlDownload } from "./modelos.js";

describe("registro de modelos de chat (SPEC-25 Fases 0/1)", () => {
  it("o id do modelo local É o id do provedor — um espaço de ids só", () => {
    expect(MODELOS_CHAT.map((m) => m.id)).toEqual(["qwen-local"]);
  });

  it("o Qwen3 é marcado como raciocinador — sem isso a grammar mata o <think> dele", () => {
    // Achado que decidiu a Fase 1: o modelo que a ferramenta já usava pensa
    // por padrão, e a geração estruturada em fase única suprimia isso.
    expect(MODELO_CHAT.raciocinador).toBe(true);
  });

  it("id desconhecido/ausente cai no modelo padrão — config editada à mão nunca deixa o servidor sem modelo", () => {
    expect(modeloChatPorId(undefined).id).toBe("qwen-local");
    expect(modeloChatPorId("provedor-inventado").id).toBe("qwen-local");
    expect(modeloChatPorId("qwen-local").id).toBe("qwen-local");
  });

  it("modeloPorId só encontra o que existe (usado pelo `ia instalar --modelo`)", () => {
    expect(modeloPorId("qwen-local")).toBe(MODELO_CHAT);
    expect(modeloPorId("nao-existe")).toBeUndefined();
  });

  it("a URL de download aponta pro repo/arquivo confirmados na Hugging Face", () => {
    expect(urlDownload(MODELO_CHAT)).toBe(
      "https://huggingface.co/Qwen/Qwen3-4B-GGUF/resolve/main/Qwen3-4B-Q4_K_M.gguf"
    );
  });
});
