import type { No } from "../../model/types.js";

export interface RegraMapeamentoGraphify {
  /** Regex (string) testada contra `source_file`. Primeira regra que bate vence. */
  padrao: string;
  /** Tipo de nó em `diagrama.json` do projeto alvo. */
  tipo: string;
}

export interface GraphifyMappingConfig {
  regras: RegraMapeamentoGraphify[];
}

interface GraphifyNode {
  id: string;
  label: string;
  source_file?: string;
  source_location?: string;
  [chave: string]: unknown;
}

export interface GraphifyGraph {
  nodes: GraphifyNode[];
}

export interface ResultadoImportacao {
  nodes: No[];
  /** `source_file` de cada arquivo que não bateu com nenhuma regra — nunca adivinhado, sempre listado. */
  naoMapeados: string[];
}

function nomeBase(caminho: string): string {
  const partes = caminho.split(/[/\\]/);
  const arquivo = partes[partes.length - 1] ?? caminho;
  return arquivo.replace(/\.[^.]+$/, "");
}

function encontrarTipo(sourceFile: string, regras: RegraMapeamentoGraphify[]): string | undefined {
  for (const regra of regras) {
    if (new RegExp(regra.padrao, "i").test(sourceFile)) return regra.tipo;
  }
  return undefined;
}

/**
 * Lê o `graph.json` que o Graphify já produz (AST local, sem IA) e propõe nós
 * `status: existente` / `origem: extraido` — nunca `manual` para algo que
 * ninguém decidiu agora, e nunca um tipo adivinhado sem regra explícita
 * (arquivo sem mapeamento vai para `naoMapeados`, não vira nó com tipo errado).
 *
 * O grafo do Graphify não carrega "tipo de entidade" nenhum — só rótulo,
 * arquivo-fonte e linha — por isso o mapeamento é por padrão de caminho de
 * arquivo, configurável em `config/graphify-mapping.json`, não por um campo
 * que o grafo simplesmente não tem.
 */
export function importarGrafo(grafo: GraphifyGraph, mapeamento: GraphifyMappingConfig): ResultadoImportacao {
  const porArquivo = new Map<string, GraphifyNode>();
  for (const no of grafo.nodes) {
    if (!no.source_file) continue;
    const existente = porArquivo.get(no.source_file);
    // Mantém o nó de menor "source_location" (o mais próximo do topo do arquivo)
    // como representante — é o que melhor aproxima "o arquivo inteiro".
    if (!existente || (no.source_location ?? "") < (existente.source_location ?? "")) {
      porArquivo.set(no.source_file, no);
    }
  }

  const nodes: No[] = [];
  const naoMapeados: string[] = [];
  let indice = 0;

  for (const [sourceFile, noGrafo] of porArquivo) {
    const tipo = encontrarTipo(sourceFile, mapeamento.regras);
    if (!tipo) {
      naoMapeados.push(sourceFile);
      continue;
    }
    const coluna = indice % 4;
    const linha = Math.floor(indice / 4);
    indice++;

    nodes.push({
      id: `graphify-${indice}`,
      type: tipo,
      status: "existente",
      label: nomeBase(sourceFile),
      x: 120 + coluna * 240,
      y: 100 + linha * 160,
      spec: {},
      specNA: {},
    });
  }

  return { nodes, naoMapeados };
}
