import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll } from "vitest";
import { testarContratoDeCamposNo } from "@gerador/aplicacao/src/portas/contratoDeCamposNo.js";
import { criarRepositorioDeCamposNoEmArquivo } from "./camposNoEmArquivo.js";

/** SPEC-31 Fase 2 — o adaptador de arquivo respondendo à MESMA suíte do de
 * Postgres, contra disco de verdade num diretório temporário. */
const temporarios: string[] = [];

afterAll(async () => {
  await Promise.all(temporarios.map((d) => rm(d, { recursive: true, force: true })));
});

testarContratoDeCamposNo("arquivo", async () => {
  const dir = await mkdtemp(join(tmpdir(), "gerador-camposNo-"));
  temporarios.push(dir);
  return {
    repo: criarRepositorioDeCamposNoEmArquivo(dir),
    // Cada teste ganha um diretório novo: limpar é não reusar.
    limpar: async () => {},
  };
});
