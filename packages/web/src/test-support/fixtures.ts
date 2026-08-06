import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
// packages/web/src/test-support -> repo root
const fixturesDir = resolve(here, "../../../../fixtures");

/** Mesmo princípio do engine: lê o fixture compartilhado direto da raiz, nunca copia. */
export function readFixture<T = unknown>(name: string): T {
  return JSON.parse(readFileSync(resolve(fixturesDir, name), "utf-8")) as T;
}
