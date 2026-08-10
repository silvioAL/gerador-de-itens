import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync, existsSync, readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ReadableStream } from "node:stream/web";
import { baixarModelo } from "./download.js";
import { caminhoDoModelo } from "./cache.js";
import { MODELO_CHAT } from "./modelos.js";

let base: string;

beforeEach(() => {
  base = mkdtempSync(join(tmpdir(), "gerador-llm-download-"));
});

afterEach(() => {
  rmSync(base, { recursive: true, force: true });
});

function fetchFake(corpo: string, opcoes: { ok?: boolean; status?: number; contentLength?: string | null } = {}) {
  const bytes = new TextEncoder().encode(corpo);
  return vi.fn(async () => ({
    ok: opcoes.ok ?? true,
    status: opcoes.status ?? 200,
    headers: { get: (nome: string) => (nome === "content-length" ? (opcoes.contentLength ?? String(bytes.length)) : null) },
    // Um `Response` de verdade sempre tem `text()`. Este dublê não tinha, e
    // quebrou quando o tratamento de HTTP não-ok passou a LER o corpo pra
    // distinguir página de bloqueio corporativo de "arquivo não existe".
    // Corrigir o dublê, não o código: dublê incompleto é o que deixa o produto
    // parecer certo enquanto o caminho real quebra.
    text: async () => corpo,
    body: new ReadableStream({
      start(controller) {
        controller.enqueue(bytes);
        controller.close();
      },
    }),
  })) as unknown as typeof fetch;
}

describe("baixarModelo", () => {
  it("baixa o arquivo, escreve o conteúdo certo, e chama onProgresso", async () => {
    const progresso: number[] = [];
    const caminho = await baixarModelo(MODELO_CHAT, {
      baseDir: base,
      fetchImpl: fetchFake("conteudo-de-teste"),
      onProgresso: (p) => progresso.push(p.bytesBaixados),
    });

    expect(caminho).toBe(caminhoDoModelo(MODELO_CHAT, base));
    expect(existsSync(caminho)).toBe(true);
    expect(readFileSync(caminho, "utf-8")).toBe("conteudo-de-teste");
    expect(progresso.length).toBeGreaterThan(0);
    expect(existsSync(`${caminho}.part`)).toBe(false);
  });

  it("se o modelo já existe, não baixa de novo (não chama fetch)", async () => {
    const dirModelos = join(base, ".gerador", "models");
    mkdirSync(dirModelos, { recursive: true });
    writeFileSync(join(dirModelos, MODELO_CHAT.nomeArquivo), "ja-instalado");
    const fetchMock = fetchFake("outro-conteudo");

    const caminho = await baixarModelo(MODELO_CHAT, { baseDir: base, fetchImpl: fetchMock });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(readFileSync(caminho, "utf-8")).toBe("ja-instalado");
  });

  it("HTTP não-ok: lança erro, não deixa arquivo nenhum pra trás", async () => {
    await expect(
      baixarModelo(MODELO_CHAT, { baseDir: base, fetchImpl: fetchFake("", { ok: false, status: 404 }) })
    ).rejects.toThrow(/404/);
    expect(existsSync(caminhoDoModelo(MODELO_CHAT, base))).toBe(false);
  });

  it("achado real: Content-Length não bate com o que foi recebido — descarta o .part, não marca como instalado", async () => {
    await expect(
      baixarModelo(MODELO_CHAT, {
        baseDir: base,
        fetchImpl: fetchFake("conteudo-curto", { contentLength: "999999" }),
      })
    ).rejects.toThrow(/incompleto/);

    const caminho = caminhoDoModelo(MODELO_CHAT, base);
    expect(existsSync(caminho)).toBe(false);
    expect(existsSync(`${caminho}.part`)).toBe(false);
  });
});
