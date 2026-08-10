import { describe, expect, it } from "vitest";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MODELOS_CHAT, MODELO_CHAT, ID_PROVEDOR_GATEWAY, modeloChatPorId, modeloPorId, urlDownload } from "./modelos.js";
import { criarProvedorPorId } from "./provedor.js";
import { lerCredenciais, salvarCredencial } from "./credenciais.js";

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

/**
 * ACHADO #286 — o typecheck que a CI não rodava apontava uma divergência real:
 * `baseUrlTranscricao` existia na porta (`CredencialIa`) e no provedor
 * (`OpcoesProvedorOpenAI`), mas NÃO em `CredencialProvedor`, que é o que o
 * modo local persiste. `criarProvedorPorId` montava o provedor sem o campo.
 *
 * Efeito visível: no `gerador open`, com Ollama no chat e Whisper na voz, a
 * transcrição ia pro endereço do CHAT, batia no Ollama e voltava 404 — o
 * mesmo sintoma que a mensagem de erro da SPEC-30 descreve.
 *
 * Mesma classe do bug da migração 0015 (campo existia na UI e sumia na
 * persistência), do outro lado da fronteira.
 */
describe("criarProvedorPorId — campos que atravessam a credencial (#286)", () => {
  it("baseUrlTranscricao e visao chegam ao provedor, em vez de sumirem no caminho", async () => {
    const base = await mkdtemp(join(tmpdir(), "gerador-cred-"));
    await salvarCredencial(
      ID_PROVEDOR_GATEWAY,
      {
        baseUrl: "http://ollama:11434/v1",
        chave: "k",
        modelo: "qwen2.5:7b",
        baseUrlTranscricao: "http://whisper:9000/v1",
        visao: true,
      },
      base
    );

    // Observa PARA ONDE o áudio vai, não se o método existe: `transcrever`
    // existe de qualquer jeito, e um teste que só checasse isso passaria igual
    // antes e depois da correção — ou seja, não testaria nada.
    //
    // O dublê entra ANTES de criar o provedor: ele captura o `fetch` na
    // construção (`opcoes.fetchImpl ?? fetch`), então trocar depois não teria
    // efeito — e o teste sairia batendo na rede de verdade.
    const urls: string[] = [];
    const fetchOriginal = globalThis.fetch;
    globalThis.fetch = (async (url: string) => {
      urls.push(String(url));
      return { ok: true, status: 200, text: async () => "transcrito" } as unknown as Response;
    }) as unknown as typeof fetch;

    try {
      const provedor = await criarProvedorPorId(ID_PROVEDOR_GATEWAY, base);
      await provedor.transcrever?.(new Uint8Array([1, 2, 3]), { formato: "audio/webm", vocabulario: "RabbitMQ" });
    } finally {
      globalThis.fetch = fetchOriginal;
    }

    // ANTES da correção esta URL era http://ollama:11434/... (o endereço do
    // CHAT), e o Ollama devolvia 404 porque não transcreve.
    expect(urls[0]).toContain("whisper:9000");
    expect(urls[0]).toContain("/audio/transcriptions");

    const salva = (await lerCredenciais(base))[ID_PROVEDOR_GATEWAY];
    expect(salva?.baseUrlTranscricao).toBe("http://whisper:9000/v1");
  });
});
