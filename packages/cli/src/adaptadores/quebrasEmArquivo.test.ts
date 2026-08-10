import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll } from "vitest";
import { testarContratoDeQuebras } from "@gerador/aplicacao/src/portas/contratoDeQuebras.js";
import { criarRepositorioDeQuebrasEmArquivo } from "./quebrasEmArquivo.js";

/**
 * SPEC-31 Fase 1 — o adaptador de arquivo respondendo à MESMA suíte que o de
 * Postgres. Contra disco de verdade, num diretório temporário: um fake de `fs`
 * validaria o fake, não o adaptador (e a ordenação por `mtime`, que este
 * adaptador usa, só existe no sistema de arquivos real).
 */
const temporarios: string[] = [];

afterAll(async () => {
  await Promise.all(temporarios.map((d) => rm(d, { recursive: true, force: true })));
});

testarContratoDeQuebras("arquivo", async () => {
  const dir = await mkdtemp(join(tmpdir(), "gerador-quebras-"));
  temporarios.push(dir);
  return {
    repo: criarRepositorioDeQuebrasEmArquivo(dir),
    // Cada teste ganha um diretório novo: limpar é não reusar.
    limpar: async () => {},
  };
});
