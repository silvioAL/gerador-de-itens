import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll } from "vitest";
import { testarContratoDeCredenciais } from "@gerador/aplicacao/src/portas/contratoDeCredenciais.js";
import { criarRepositorioDeCredenciaisEmArquivo } from "./credenciaisEmArquivo.js";

/** SPEC-31 Fase 4 — o adaptador de arquivo respondendo à MESMA suíte do de
 * Postgres, contra disco de verdade (nunca o `~` do usuário). */
const temporarios: string[] = [];

afterAll(async () => {
  await Promise.all(temporarios.map((d) => rm(d, { recursive: true, force: true })));
});

testarContratoDeCredenciais("arquivo", async () => {
  const dir = await mkdtemp(join(tmpdir(), "gerador-cred-"));
  temporarios.push(dir);
  return { repo: criarRepositorioDeCredenciaisEmArquivo(dir), limpar: async () => {} };
});
