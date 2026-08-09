import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { verificarStatus } from "./status.js";
import { salvarCredencial } from "./credenciais.js";
import { ID_PROVEDOR_GATEWAY, MODELO_CHAT, MODELO_EMBEDDING } from "./modelos.js";

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
      // O gateway (Fase 2) aparece na MESMA lista de cards, sem credencial.
      ["compativel-openai", false, false, false],
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

  it("gateway selecionado sem credencial: não está pronto, e o motivo é a credencial", async () => {
    const status = await verificarStatus(base, ID_PROVEDOR_GATEWAY);
    expect(status.provedor).toBe(ID_PROVEDOR_GATEWAY);
    expect(status.pronto).toBe(false);
    expect(status.gateway.configurado).toBe(false);
    // O card do gateway fica selecionado (é a escolha da pessoa), só não pronto.
    expect(status.modelosChat.find((m) => m.remoto)?.selecionado).toBe(true);
    expect(status.modelosChat.find((m) => m.id === "qwen-local")?.selecionado).toBe(false);
  });

  it("gateway configurado fica pronto SEM nenhum modelo local baixado", async () => {
    // O ponto da Fase 2: quem roda tudo por gateway não deve precisar de 3 GB
    // em disco. O embedding local só serve ao RAG.
    await salvarCredencial(ID_PROVEDOR_GATEWAY, { baseUrl: "https://gw.interno/v1", chave: "sk-1234567890", modelo: "deepseek-chat" }, base);

    const status = await verificarStatus(base, ID_PROVEDOR_GATEWAY);
    expect(status.embeddingInstalado).toBe(false);
    expect(status.chatInstalado).toBe(true);
    expect(status.pronto).toBe(true);
    // Nunca a chave inteira — nem aqui, que vira JSON pra tela.
    expect(status.gateway.chaveMascarada).toBe("sk-…7890");
    expect(JSON.stringify(status)).not.toContain("sk-1234567890");
  });

  it("achado real: arquivo vazio (ex.: download interrompido sem o .part) não conta como instalado", async () => {
    const dirModelos = join(base, ".gerador", "models");
    mkdirSync(dirModelos, { recursive: true });
    writeFileSync(join(dirModelos, MODELO_CHAT.nomeArquivo), "");

    const status = await verificarStatus(base);
    expect(status.chatInstalado).toBe(false);
  });
});
