import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
// packages/engine/src/test-support -> repo root
const fixturesDir = resolve(here, "../../../../fixtures");
const configDir = resolve(here, "../../../../config");

/**
 * Lê um fixture compartilhado (mesmo arquivo usado por qualquer outra
 * implementação do engine, ex. uma futura suíte de outra linguagem). Nunca copiar
 * o conteúdo para dentro de um pacote — ler direto da raiz do repo.
 */
export function readFixture<T = unknown>(name: string): T {
  return JSON.parse(readFileSync(resolve(fixturesDir, name), "utf-8")) as T;
}

/** Lê um arquivo de `config/` na raiz do repo (mesmo diretório que a CLI/web usarão em runtime). */
export function readConfigFile<T = unknown>(name: string): T {
  return JSON.parse(readFileSync(resolve(configDir, name), "utf-8")) as T;
}
