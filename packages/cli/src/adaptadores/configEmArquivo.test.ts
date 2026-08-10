import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll } from "vitest";
import { testarContratoDeConfig } from "@gerador/aplicacao/src/portas/contratoDeConfig.js";
import { criarRepositorioDeConfigEmArquivo } from "./configEmArquivo.js";

/** SPEC-31 Fase 3 — o adaptador de arquivo respondendo à MESMA suíte do de Postgres. */
const temporarios: string[] = [];

afterAll(async () => {
  await Promise.all(temporarios.map((d) => rm(d, { recursive: true, force: true })));
});

testarContratoDeConfig("arquivo", async () => {
  const dir = await mkdtemp(join(tmpdir(), "gerador-config-"));
  temporarios.push(dir);
  return {
    repo: criarRepositorioDeConfigEmArquivo(dir),
    limpar: async () => {},
  };
});
