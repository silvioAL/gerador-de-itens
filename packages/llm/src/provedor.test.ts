import { describe, expect, it } from "vitest";
import { MODELOS_CHAT, MODELO_CHAT, MODELO_CHAT_DEEPSEEK, modeloChatPorId, modeloPorId, urlDownload } from "./modelos.js";

describe("registro de modelos de chat (SPEC-25 Fases 0/1)", () => {
  it("o id do modelo local É o id do provedor — um espaço de ids só", () => {
    expect(MODELOS_CHAT.map((m) => m.id)).toEqual(["qwen-local", "deepseek-local"]);
  });

  it("o DeepSeek é marcado como raciocinador; o Qwen não", () => {
    expect(MODELO_CHAT_DEEPSEEK.raciocinador).toBe(true);
    expect(MODELO_CHAT.raciocinador).toBeUndefined();
  });

  it("id desconhecido/ausente cai no modelo padrão — config editada à mão nunca deixa o servidor sem modelo", () => {
    expect(modeloChatPorId(undefined).id).toBe("qwen-local");
    expect(modeloChatPorId("provedor-inventado").id).toBe("qwen-local");
    expect(modeloChatPorId("deepseek-local").id).toBe("deepseek-local");
  });

  it("modeloPorId só encontra o que existe (usado pelo `ia instalar --modelo`)", () => {
    expect(modeloPorId("deepseek-local")).toBe(MODELO_CHAT_DEEPSEEK);
    expect(modeloPorId("nao-existe")).toBeUndefined();
  });

  it("a URL de download do DeepSeek aponta pro repo/arquivo confirmados na Hugging Face", () => {
    expect(urlDownload(MODELO_CHAT_DEEPSEEK)).toBe(
      "https://huggingface.co/unsloth/DeepSeek-R1-0528-Qwen3-8B-GGUF/resolve/main/DeepSeek-R1-0528-Qwen3-8B-Q4_K_M.gguf"
    );
  });
});
