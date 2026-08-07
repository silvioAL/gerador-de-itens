import type { No } from "../../model/types.js";

export interface RegraMapeamentoGraphify {
  /** Regex (string) testada contra `source_file` (caminho do arquivo). */
  padrao?: string;
  /** Regex testada contra `label` (nome da classe/símbolo) — pega convenção de
   * nome (`*Producer`, `*Repository`, `*Delegate`...) mesmo quando a pasta não
   * denuncia a tecnologia. */
  padraoLabel?: string;
  /** Regex testada contra o nome de tudo que o arquivo importa/estende/implementa
   * (arestas `imports`/`imports_from`/`extends`/`implements` do Graphify) — pega
   * o caso em que nem caminho nem nome de classe seguem convenção nenhuma, mas o
   * código referencia um símbolo conhecido de uma tecnologia (`JavaDelegate`,
   * `KafkaTemplate`, `JpaRepository`...). */
  padraoImporta?: string;
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

interface GraphifyEdge {
  source: string;
  target: string;
  relation?: string;
  [chave: string]: unknown;
}

export interface GraphifyGraph {
  nodes: GraphifyNode[];
  /** Arestas do grafo (`links` no `graph.json` bruto do Graphify) — opcional
   * porque `padraoImporta` é o único uso que precisa delas; grafos sem essa
   * chave continuam funcionando normalmente, só sem esse sinal a mais. */
  links?: GraphifyEdge[];
}

export interface ResultadoImportacao {
  nodes: No[];
  /** `source_file` de cada arquivo que não bateu com nenhuma regra — nunca adivinhado, sempre listado. */
  naoMapeados: string[];
}

/** Relações do Graphify que representam "esse arquivo referencia esse símbolo"
 * — a base do sinal de `padraoImporta`. `calls` fica de fora de propósito: é
 * chamada de método (granularidade fina demais, vira ruído), não referência a
 * um símbolo/tipo que identifique tecnologia. */
const RELACOES_DE_REFERENCIA = new Set(["imports", "imports_from", "extends", "implements"]);

function nomeBase(caminho: string): string {
  const partes = caminho.split(/[/\\]/);
  const arquivo = partes[partes.length - 1] ?? caminho;
  return arquivo.replace(/\.[^.]+$/, "");
}

/** Símbolos (rótulo do nó-alvo) que cada arquivo importa/estende/implementa,
 * agregando todas as arestas de referência que saem de qualquer nó daquele
 * arquivo — não só do nó "representante" escolhido pra virar o `No` do canvas. */
function construirSimbolosReferenciadosPorArquivo(grafo: GraphifyGraph): Map<string, Set<string>> {
  const porArquivo = new Map<string, Set<string>>();
  if (!grafo.links?.length) return porArquivo;

  const idParaLabel = new Map<string, string>();
  const idParaArquivo = new Map<string, string>();
  for (const no of grafo.nodes) {
    idParaLabel.set(no.id, no.label);
    if (no.source_file) idParaArquivo.set(no.id, no.source_file);
  }

  for (const aresta of grafo.links) {
    if (!aresta.relation || !RELACOES_DE_REFERENCIA.has(aresta.relation)) continue;
    const arquivo = idParaArquivo.get(aresta.source);
    const rotuloAlvo = idParaLabel.get(aresta.target);
    if (!arquivo || !rotuloAlvo) continue;
    if (!porArquivo.has(arquivo)) porArquivo.set(arquivo, new Set());
    porArquivo.get(arquivo)!.add(rotuloAlvo);
  }

  return porArquivo;
}

/**
 * Primeira regra que bate vence — mas "bater" agora testa até três sinais por
 * regra (qualquer um dos definidos é suficiente): caminho do arquivo, nome da
 * classe, e o que ela importa/estende/implementa. Um arquivo real raramente
 * segue todas as convenções de nomenclatura ao mesmo tempo; exigir os três
 * juntos (AND) voltaria a perder caso real — cada sinal sozinho já é uma
 * evidência explícita, nunca um chute.
 */
function encontrarTipo(
  sourceFile: string,
  label: string,
  simbolosReferenciados: Set<string> | undefined,
  regras: RegraMapeamentoGraphify[]
): string | undefined {
  for (const regra of regras) {
    if (regra.padrao && new RegExp(regra.padrao, "i").test(sourceFile)) return regra.tipo;
    if (regra.padraoLabel && new RegExp(regra.padraoLabel, "i").test(label)) return regra.tipo;
    if (regra.padraoImporta && simbolosReferenciados) {
      const regexImporta = new RegExp(regra.padraoImporta, "i");
      for (const simbolo of simbolosReferenciados) {
        if (regexImporta.test(simbolo)) return regra.tipo;
      }
    }
  }
  return undefined;
}

/**
 * Lê o `graph.json` que o Graphify já produz (AST local, sem IA) e propõe nós
 * `status: existente` / `origem: extraido` — nunca `manual` para algo que
 * ninguém decidiu agora, e nunca um tipo adivinhado sem regra explícita
 * (arquivo sem mapeamento vai para `naoMapeados`, não vira nó com tipo errado).
 *
 * O grafo do Graphify não carrega "tipo de entidade" nenhum (classe/interface,
 * anotação...) — só rótulo, arquivo-fonte, linha e arestas de referência
 * (imports/extends/implements). O mapeamento em `config/graphify-mapping.json`
 * usa os três: caminho (`padrao`), nome de classe (`padraoLabel`) e o que a
 * classe referencia (`padraoImporta`) — nunca um campo que o grafo não tem.
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

  const simbolosReferenciadosPorArquivo = construirSimbolosReferenciadosPorArquivo(grafo);

  const nodes: No[] = [];
  const naoMapeados: string[] = [];
  let indice = 0;

  for (const [sourceFile, noGrafo] of porArquivo) {
    const tipo = encontrarTipo(
      sourceFile,
      noGrafo.label,
      simbolosReferenciadosPorArquivo.get(sourceFile),
      mapeamento.regras
    );
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
