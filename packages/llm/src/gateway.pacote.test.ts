import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * ACHADO REAL, rodando o Docker: `gateway.fronteira.test.ts` garante que
 * nenhum módulo alcançável a partir de `gateway.ts` importa `node-llama-cpp`.
 * Passava — e mesmo assim o build do container **falhou**:
 *
 * ```
 * npm error path /app/node_modules/node-llama-cpp
 * npm error [node-llama-cpp] Git is not installed, please install it first to build llama.cpp
 * ```
 *
 * Porque eu tinha guardado o grafo de IMPORTS e esquecido o grafo de
 * DEPENDÊNCIAS. `@gerador/llm` declarava `node-llama-cpp` em `dependencies`,
 * então `npm install` tentava compilar 200 MB de binário nativo num Alpine sem
 * git nem make — antes de qualquer linha de código ser executada.
 *
 * A separação de arquivo continua certa e continua necessária; ela só não era
 * suficiente. Agora `node-llama-cpp` é peer OPCIONAL: quem usa o caminho local
 * (`packages/cli`) declara a dependência de verdade; quem usa só o gateway
 * (`packages/server`) não paga por ela.
 */
const AQUI = dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const RAIZ = resolve(AQUI, "..", "..", "..");

async function pacote(caminho: string): Promise<Record<string, Record<string, string> | undefined>> {
  return JSON.parse(await readFile(resolve(RAIZ, caminho, "package.json"), "utf-8"));
}

describe("fronteira de PACOTE do gateway (SPEC-31 Fase 4)", () => {
  it("@gerador/llm não obriga ninguém a instalar node-llama-cpp", async () => {
    const llm = await pacote("packages/llm");

    expect(llm.dependencies?.["node-llama-cpp"]).toBeUndefined();
    expect(llm.peerDependenciesMeta?.["node-llama-cpp"]).toEqual({ optional: true });
  });

  it("o server — que roda em container — não puxa o binário nativo por nenhum caminho", async () => {
    const server = await pacote("packages/server");
    const llm = await pacote("packages/llm");
    const aplicacao = await pacote("packages/aplicacao");

    for (const [nome, p] of [
      ["server", server],
      ["llm", llm],
      ["aplicacao", aplicacao],
    ] as const) {
      expect({ pacote: nome, temBinario: "node-llama-cpp" in (p.dependencies ?? {}) }).toEqual({
        pacote: nome,
        temBinario: false,
      });
    }
  });

  it("o CLI — que roda na máquina e carrega GGUF — declara a dependência de verdade", async () => {
    // O contraponto: sem isto, o modo local perderia o modelo embarcado e o
    // teste acima estaria "passando" por ter quebrado a outra metade.
    const cli = await pacote("packages/cli");

    expect(cli.dependencies?.["node-llama-cpp"]).toBeTruthy();
  });
});
