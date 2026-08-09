import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir, platform } from "node:os";
import { join } from "node:path";
import { caminhoCredenciais, lerCredenciais, resumirCredencial, salvarCredencial } from "./credenciais.js";

let base: string;

beforeEach(() => {
  base = mkdtempSync(join(tmpdir(), "gerador-cred-"));
});

afterEach(() => {
  rmSync(base, { recursive: true, force: true });
});

describe("credenciais (SPEC-25 §4.4)", () => {
  it("moram em ~/.gerador, NUNCA em config/ — config vai pro git", () => {
    // Esta é a regra de segurança da fase inteira: se algum dia alguém
    // apontar isto pra `config/`, este teste quebra antes de a chave vazar
    // num commit.
    const caminho = caminhoCredenciais(base);
    expect(caminho).toBe(join(base, ".gerador", "credenciais.json"));
    expect(caminho).not.toContain("config");
  });

  it("sem arquivo é estado normal (quem só usa modelo local), não erro", async () => {
    await expect(lerCredenciais(base)).resolves.toEqual({});
  });

  it("salva e lê de volta, preservando cabeçalhos extras do wrapper", async () => {
    await salvarCredencial("compativel-openai", {
      baseUrl: "https://gw.interno/v1",
      chave: "sk-abc123456789",
      modelo: "deepseek-chat",
      cabecalhos: { "X-Time": "plataforma" },
    }, base);

    const lidas = await lerCredenciais(base);
    expect(lidas["compativel-openai"]).toEqual({
      baseUrl: "https://gw.interno/v1",
      chave: "sk-abc123456789",
      modelo: "deepseek-chat",
      cabecalhos: { "X-Time": "plataforma" },
    });
  });

  it("salvar um provedor não apaga o outro", async () => {
    await salvarCredencial("a", { baseUrl: "http://a", chave: "k1", modelo: "m1" }, base);
    await salvarCredencial("b", { baseUrl: "http://b", chave: "k2", modelo: "m2" }, base);
    expect(Object.keys(await lerCredenciais(base))).toEqual(["a", "b"]);
  });

  it("arquivo corrompido não derruba o servidor — cai no vazio", async () => {
    await salvarCredencial("a", { baseUrl: "http://a", chave: "k", modelo: "m" }, base);
    const { writeFileSync } = await import("node:fs");
    writeFileSync(caminhoCredenciais(base), "{ isto não é json");
    await expect(lerCredenciais(base)).resolves.toEqual({});
  });

  it.skipIf(platform() === "win32")("grava com permissão 0600 — só o dono lê", async () => {
    await salvarCredencial("a", { baseUrl: "http://a", chave: "k", modelo: "m" }, base);
    expect(statSync(caminhoCredenciais(base)).mode & 0o777).toBe(0o600);
  });

  it("o arquivo em disco contém a chave, mas o resumo NÃO", async () => {
    await salvarCredencial("a", { baseUrl: "http://a", chave: "sk-supersecreta99", modelo: "m" }, base);
    // Em disco sim: é o ponto do arquivo. Fora dele, nunca.
    expect(readFileSync(caminhoCredenciais(base), "utf-8")).toContain("sk-supersecreta99");

    const resumo = resumirCredencial((await lerCredenciais(base)).a);
    expect(resumo).toEqual({
      configurado: true,
      baseUrl: "http://a",
      modelo: "m",
      chaveMascarada: "sk-…ta99",
    });
    expect(JSON.stringify(resumo)).not.toContain("supersecreta");
  });

  it("credencial pela metade não conta como configurada", () => {
    expect(resumirCredencial(undefined).configurado).toBe(false);
    expect(resumirCredencial({ baseUrl: "http://a" }).configurado).toBe(false);
    expect(resumirCredencial({ chave: "k" }).configurado).toBe(false);
    // A base URL parcial ainda volta, pra UI conseguir mostrar o que já tem.
    expect(resumirCredencial({ baseUrl: "http://a" }).baseUrl).toBe("http://a");
  });
});
