import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { importarGrafo, type GraphifyGraph, type GraphifyMappingConfig, type Quebra } from "@gerador/engine";

async function lerJson<T>(caminho: string): Promise<T> {
  return JSON.parse(await readFile(caminho, "utf-8")) as T;
}

async function lerJsonOpcional<T>(caminho: string): Promise<T | undefined> {
  try {
    return await lerJson<T>(caminho);
  } catch {
    return undefined;
  }
}

/**
 * Leitura de arquivo para arquivo, pura — não chama o Graphify. O fluxo é
 * `/graphify .` rodado à parte, depois este comando sobre o `graph.json` dele.
 * Nada aqui vira `origem: "manual"` nem tem tipo adivinhado sem regra —
 * ver `packages/engine/src/adapters/graphify/importarGrafo.ts`.
 */
export async function importGraphify(args: string[]): Promise<void> {
  const caminhoGrafo = args[0];
  if (!caminhoGrafo || caminhoGrafo.startsWith("--")) {
    throw new Error("uso: gerador import-graphify <graph.json> [--out quebra-rascunho.json]");
  }

  const idxOut = args.indexOf("--out");
  const caminhoOut = idxOut >= 0 ? args[idxOut + 1] : "quebra-rascunho.json";

  const mapeamento = await lerJsonOpcional<GraphifyMappingConfig>(resolve("config", "graphify-mapping.json"));
  if (!mapeamento) {
    throw new Error(
      "config/graphify-mapping.json não encontrado — rode 'gerador init' ou crie um mapeamento de padrão de arquivo para tipo de nó."
    );
  }

  const grafo = await lerJson<GraphifyGraph>(resolve(caminhoGrafo));
  const resultado = importarGrafo(grafo, mapeamento);

  const quebra: Quebra = {
    diagrama: { nodes: resultado.nodes, edges: [] },
  };

  await writeFile(resolve(caminhoOut), JSON.stringify(quebra, null, 2), "utf-8");

  console.log(`Rascunho gravado em ${caminhoOut}: ${resultado.nodes.length} nó(s) existente(s)/extraído(s).`);
  console.log("Nenhuma aresta foi inferida — o grafo do Graphify descreve estrutura de código (imports/calls), não arquitetura (publica/consome/chama).");
  if (resultado.naoMapeados.length > 0) {
    console.log(`\n${resultado.naoMapeados.length} arquivo(s) sem regra de mapeamento (não viraram nó, não foram adivinhados):`);
    for (const arquivo of resultado.naoMapeados.slice(0, 20)) console.log(`  - ${arquivo}`);
    if (resultado.naoMapeados.length > 20) console.log(`  ... e mais ${resultado.naoMapeados.length - 20}.`);
    console.log("Adicione regras a config/graphify-mapping.json, ou modele esses nós manualmente.");
  }
  console.log("\nRevise o rascunho antes de derivar — nada aqui deveria virar prontidão verde sem alguém olhar.");
}
