import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { caminhoDoModelo, diretorioDeModelos, garantirDiretorioDeModelos } from "./cache.js";
import { MODELO_CHAT } from "./modelos.js";

describe("cache — diretório local de modelos", () => {
  it("resolve pra <base>/.gerador/models, sem precisar existir ainda", () => {
    const base = join(tmpdir(), "gerador-llm-cache-teste-nao-existe");
    expect(diretorioDeModelos(base)).toBe(join(base, ".gerador", "models"));
  });

  it("caminhoDoModelo junta o diretório com o nome do arquivo do modelo", () => {
    const base = join(tmpdir(), "gerador-llm-cache-teste");
    expect(caminhoDoModelo(MODELO_CHAT, base)).toBe(join(base, ".gerador", "models", MODELO_CHAT.nomeArquivo));
  });

  it("garantirDiretorioDeModelos cria o diretório (recursivo) se não existir", async () => {
    const base = mkdtempSync(join(tmpdir(), "gerador-llm-cache-"));
    try {
      const dir = await garantirDiretorioDeModelos(base);
      expect(existsSync(dir)).toBe(true);
      expect(dir).toBe(join(base, ".gerador", "models"));
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });
});
