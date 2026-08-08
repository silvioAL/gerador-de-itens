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
    expect(status).toEqual({
      chatInstalado: false,
      embeddingInstalado: false,
      pronto: false,
      caminhoModelos: join(base, ".gerador", "models"),
    });
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
