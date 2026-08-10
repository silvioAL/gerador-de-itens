import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * SPEC-31 Fase 4 — a fronteira que faz o modo hospedado caber num container
 * sem 200 MB de binário que nunca executa.
 *
 * `gateway.ts` é a porta de entrada do `@gerador/llm` para quem só fala HTTP
 * com um endpoint compatível com a API da OpenAI. Se qualquer módulo alcançável
 * a partir dele importar `node-llama-cpp` — inclusive só o TIPO, que obriga o
 * pacote a ser resolvível — a separação deixa de existir sem que nada quebre
 * visivelmente. Este teste caminha o grafo de imports de verdade.
 */
const AQUI = dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));

async function importadosPor(arquivo: string, vistos = new Set<string>()): Promise<Set<string>> {
  if (vistos.has(arquivo)) return vistos;
  vistos.add(arquivo);

  const conteudo = await readFile(arquivo, "utf-8");
  const especificadores = [...conteudo.matchAll(/from\s+"([^"]+)"/g)].map((m) => m[1]);

  for (const especificador of especificadores) {
    if (!especificador.startsWith(".")) {
      vistos.add(especificador);
      continue;
    }
    await importadosPor(resolve(dirname(arquivo), especificador.replace(/\.js$/, ".ts")), vistos);
  }
  return vistos;
}

describe("fronteira do gateway (SPEC-31 Fase 4)", () => {
  it("nada alcançável a partir de gateway.ts importa node-llama-cpp", async () => {
    const alcancados = await importadosPor(resolve(AQUI, "gateway.ts"));

    expect([...alcancados].filter((a) => a.includes("node-llama-cpp"))).toEqual([]);
  });

  it("o teste tem dentes: o índice normal do pacote ALCANÇA o binário", async () => {
    // Controle negativo — se este passar a dar vazio, o teste acima virou
    // decorativo e ninguém perceberia.
    const alcancados = await importadosPor(resolve(AQUI, "index.ts"));

    expect([...alcancados].some((a) => a.includes("node-llama-cpp"))).toBe(true);
  });
});
