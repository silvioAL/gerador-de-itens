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

    const padrao = await verificarStatus(base);
    expect(padrao.pronto).toBe(true);
    expect(padrao.modelosChat.map((m) => [m.id, m.instalado, m.selecionado, m.raciocinador])).toEqual([
      ["qwen-local", true, true, true],
    ]);
    expect(padrao.provedor).toBe("qwen-local");
  });

  it("`pronto` é sobre o modelo SELECIONADO — id desconhecido cai no padrão, nunca deixa sem modelo", async () => {
    const dirModelos = join(base, ".gerador", "models");
    mkdirSync(dirModelos, { recursive: true });
    writeFileSync(join(dirModelos, MODELO_EMBEDDING.nomeArquivo), "embedding-baixado");
    // Só o embedding no disco: o chat selecionado não está instalado.
    const semChat = await verificarStatus(base, "provedor-que-nao-existe");
    expect(semChat.provedor).toBe("qwen-local");
    expect(semChat.chatInstalado).toBe(false);
    expect(semChat.pronto).toBe(false);
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
