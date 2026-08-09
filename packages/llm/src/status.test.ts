import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { verificarStatus } from "./status.js";
import { MODELO_CHAT, MODELO_EMBEDDING } from "./modelos.js";

let base: string;

beforeEach(() => {
  base = mkdtempSync(join(tmpdir(), "gerador-llm-status-"));
});

afterEach(() => {
  rmSync(base, { recursive: true, force: true });
});

describe("verificarStatus", () => {
  it("nenhum modelo presente: os dois false, pronto false", async () => {
    const status = await verificarStatus(base);
    expect(status).toMatchObject({
      chatInstalado: false,
      embeddingInstalado: false,
      pronto: false,
      caminhoModelos: join(base, ".gerador", "models"),
      provedor: "qwen-local",
    });
  });

  it("SPEC-25: reporta os modelos de chat um a um, marcando o selecionado", async () => {
    const dirModelos = join(base, ".gerador", "models");
    mkdirSync(dirModelos, { recursive: true });
    writeFileSync(join(dirModelos, MODELO_CHAT.nomeArquivo), "qwen-baixado");
    writeFileSync(join(dirModelos, MODELO_EMBEDDING.nomeArquivo), "embedding-baixado");

    // Sem seleção explícita, o padrão (Qwen) manda — e está instalado.
    const padrao = await verificarStatus(base);
    expect(padrao.pronto).toBe(true);
    expect(padrao.modelosChat.map((m) => [m.id, m.instalado, m.selecionado])).toEqual([
      ["qwen-local", true, true],
      ["deepseek-local", false, false],
    ]);

    // Selecionando o DeepSeek (que NÃO está baixado), a IA deixa de estar
    // pronta — mesmo com o Qwen no disco. `pronto` é sobre o selecionado.
    const comDeepSeek = await verificarStatus(base, "deepseek-local");
    expect(comDeepSeek.chatInstalado).toBe(false);
    expect(comDeepSeek.pronto).toBe(false);
    expect(comDeepSeek.provedor).toBe("deepseek-local");
  });

  it("só o modelo de chat presente: pronto continua false (precisa dos dois)", async () => {
    const dirModelos = join(base, ".gerador", "models");
    mkdirSync(dirModelos, { recursive: true });
    writeFileSync(join(dirModelos, MODELO_CHAT.nomeArquivo), "conteudo-fake-nao-vazio");

    const status = await verificarStatus(base);
    expect(status.chatInstalado).toBe(true);
    expect(status.embeddingInstalado).toBe(false);
    expect(status.pronto).toBe(false);
  });

  it("os dois modelos presentes e não-vazios: pronto true", async () => {
    const dirModelos = join(base, ".gerador", "models");
    mkdirSync(dirModelos, { recursive: true });
    writeFileSync(join(dirModelos, MODELO_CHAT.nomeArquivo), "conteudo-fake-chat");
    writeFileSync(join(dirModelos, MODELO_EMBEDDING.nomeArquivo), "conteudo-fake-embedding");

    const status = await verificarStatus(base);
    expect(status.pronto).toBe(true);
  });

  it("achado real: arquivo vazio (ex.: download interrompido sem o .part) não conta como instalado", async () => {
    const dirModelos = join(base, ".gerador", "models");
    mkdirSync(dirModelos, { recursive: true });
    writeFileSync(join(dirModelos, MODELO_CHAT.nomeArquivo), "");

    const status = await verificarStatus(base);
    expect(status.chatInstalado).toBe(false);
  });
});
