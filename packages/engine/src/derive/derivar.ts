import type {
  Atividade,
  Dependencia,
  Diagrama,
  No,
  Tamanho,
  TipoItem,
} from "../model/types.js";
import type { DiagramaConfig, EdgeTypeConfig, NodeTypeConfig } from "../config/types.js";

export interface ContextoQuebra {
  time?: string;
}

/** Sufixo da chave da atividade de criação, por kind de `derives`. */
const SUFIXO_CRIACAO: Record<string, string> = { service: "setup" };
function sufixoCriacao(kind: string): string {
  return SUFIXO_CRIACAO[kind] ?? "criacao";
}

function pickSpec(no: No, chaves: string[]): Record<string, unknown> | undefined {
  const resumo: Record<string, unknown> = {};
  for (const chave of chaves) {
    const valor = no.spec[chave]?.valor;
    if (valor !== undefined) resumo[chave] = valor;
  }
  return Object.keys(resumo).length > 0 ? resumo : undefined;
}

/** Sempre inclui o time da própria quebra (default pra toda atividade — achado
 * do usuário: só aparecer no item que toca outro time lia como dado quebrado
 * no resto), mais o `time` de qualquer nó que tenha um explícito e diferente
 * do time da quebra — não só nós `existente` (achado: um nó `novo` que outro
 * time vai implementar é tão válido quanto um sistema `existente` de outro
 * time). Editável por item hoje só indiretamente, via o campo "time
 * responsável" do nó no canvas (PropertiesPanel) — atividade derivada não é
 * editável direto, só o diagrama. */
function temposEnvolvidos(nos: No[], quebra: ContextoQuebra): string[] {
  const times = new Set<string>();
  if (quebra.time) times.add(quebra.time);
  for (const no of nos) {
    if (no.time && no.time !== quebra.time) {
      times.add(no.time);
    }
  }
  return [...times];
}

function nodeById(diagrama: Diagrama, id: string): No {
  const no = diagrama.nodes.find((n) => n.id === id);
  if (!no) throw new Error(`Nó "${id}" referenciado por uma aresta não existe no diagrama.`);
  return no;
}

function derivarService(no: No, cfg: NodeTypeConfig, quebra: ContextoQuebra): Atividade[] {
  const atividades: Atividade[] = [];

  if (no.status === "novo") {
    atividades.push({
      chave: `${no.id}::setup`,
      rotulo: "",
      tipo: "História",
      tamanho: "M",
      descricao: `Setup inicial de ${no.label}.`,
      techs: cfg.techs,
      contextos: [],
      dependencias: [{ type: "enabler" }],
      origem: { nodeId: no.id },
      timesEnvolvidos: temposEnvolvidos([no], quebra),
    });
  }

  const contextoHttp = cfg.techs.length > 0 ? [`${cfg.techs[0]}-chamadas http`] : [];
  (no.endpoints ?? []).forEach((ep, idx) => {
    const dependencias: Dependencia[] =
      no.status === "novo" ? [{ type: "dependent", alvoChave: `${no.id}::setup` }] : [];
    atividades.push({
      chave: `${no.id}::ep${idx}`,
      rotulo: "",
      tipo: "História",
      tamanho: "M",
      descricao: `Implementar endpoint ${ep.method} ${ep.path} em ${no.label}.`,
      techs: cfg.techs,
      contextos: contextoHttp,
      dependencias,
      origem: { nodeId: no.id },
      timesEnvolvidos: temposEnvolvidos([no], quebra),
    });
  });

  return atividades;
}

/** Regra genérica de criação, usada por qualquer `derives` sem regra dedicada. */
function derivarCriacaoGenerica(
  no: No,
  cfg: NodeTypeConfig,
  quebra: ContextoQuebra,
  opcoes: { tipo: TipoItem; tamanho: Tamanho; specResumoKeys?: string[] }
): Atividade[] {
  if (no.status !== "novo") return [];
  return [
    {
      chave: `${no.id}::${sufixoCriacao(cfg.derives)}`,
      rotulo: "",
      tipo: opcoes.tipo,
      tamanho: opcoes.tamanho,
      descricao: `Criar ${no.label}.`,
      techs: cfg.techs,
      contextos: cfg.contextos,
      dependencias: [{ type: "enabler" }],
      origem: { nodeId: no.id },
      specResumo: opcoes.specResumoKeys ? pickSpec(no, opcoes.specResumoKeys) : undefined,
      timesEnvolvidos: temposEnvolvidos([no], quebra),
    },
  ];
}

function derivarNo(no: No, config: DiagramaConfig, quebra: ContextoQuebra): Atividade[] {
  const cfg = config.nodeTypes[no.type];
  if (!cfg) throw new Error(`Tipo de nó "${no.type}" não existe em diagrama.json.`);

  switch (cfg.derives) {
    case "service":
      return derivarService(no, cfg, quebra);
    case "queue":
      return derivarCriacaoGenerica(no, cfg, quebra, {
        tipo: "Task",
        tamanho: "PP",
        specResumoKeys: cfg.specResumo,
      });
    default:
      return derivarCriacaoGenerica(no, cfg, quebra, { tipo: "Task", tamanho: "PP", specResumoKeys: cfg.specResumo });
  }
}

// Duas arestas herdadas de quando só mensageria existia — preservadas por nome
// para não quebrar chaves estáveis já em uso (`e1::publish`, não `e1::publishes`).
// Qualquer outro tipo de aresta usa o próprio nome do tipo como sufixo.
const SUFIXO_ARESTA_LEGADO: Record<string, string> = { publishes: "publish", consumes: "consume" };
function sufixoAresta(tipoAresta: string): string {
  return SUFIXO_ARESTA_LEGADO[tipoAresta] ?? tipoAresta;
}

/**
 * Genérico para qualquer tipo de aresta declarado em `config.edgeTypes` — nada
 * aqui sabe o que é "mensageria" ou "HTTP"; o `target` é convencionalmente de
 * quem vêm techs/contextos/specResumo (é o recurso sendo usado/afetado).
 */
function derivarEdgeGenerica(
  edge: Diagrama["edges"][number],
  diagrama: Diagrama,
  config: DiagramaConfig,
  quebra: ContextoQuebra,
  cfgEdge: EdgeTypeConfig
): Atividade {
  const source = nodeById(diagrama, edge.source);
  const target = nodeById(diagrama, edge.target);
  const cfgSource = config.nodeTypes[source.type];
  const cfgTarget = config.nodeTypes[target.type];
  if (!cfgSource || !cfgTarget) {
    throw new Error(`Tipo de nó inexistente nas pontas da aresta "${edge.id}".`);
  }

  const dependencias: Dependencia[] = [];
  if (source.status === "novo") {
    dependencias.push({ type: "dependent", alvoChave: `${source.id}::${sufixoCriacao(cfgSource.derives)}` });
  }
  if (target.status === "novo") {
    dependencias.push({ type: "dependent", alvoChave: `${target.id}::${sufixoCriacao(cfgTarget.derives)}` });
  }

  const verbo = cfgEdge.verbo ?? cfgEdge.label;
  const chavesResumo = cfgTarget.specResumoPorAresta?.[edge.type];

  return {
    chave: `${edge.id}::${sufixoAresta(edge.type)}`,
    rotulo: "",
    tipo: "História",
    tamanho: cfgEdge.tamanhoPadrao ?? "P",
    descricao: `${source.label} ${verbo} ${target.label}.`,
    techs: cfgTarget.techs,
    contextos: cfgTarget.contextos,
    dependencias,
    origem: { nodeId: source.id, edgeId: edge.id },
    specResumo: chavesResumo ? pickSpec(target, chavesResumo) : undefined,
    timesEnvolvidos: temposEnvolvidos([source, target], quebra),
  };
}

function derivarEdge(
  edge: Diagrama["edges"][number],
  diagrama: Diagrama,
  config: DiagramaConfig,
  quebra: ContextoQuebra
): Atividade[] {
  const cfgEdge = config.edgeTypes[edge.type];
  if (!cfgEdge || cfgEdge.gerarAtividade === false) return [];
  return [derivarEdgeGenerica(edge, diagrama, config, quebra, cfgEdge)];
}

function rotular(atividades: Atividade[]): Atividade[] {
  const largura = String(atividades.length).length < 2 ? 2 : String(atividades.length).length;
  return atividades.map((a, i) => ({ ...a, rotulo: String(i + 1).padStart(largura, "0") }));
}

/** Diagrama (nós + arestas) → lista de atividades, na ordem de nodes[] seguida de edges[]. */
export function derivar(
  diagrama: Diagrama,
  config: DiagramaConfig,
  quebra: ContextoQuebra
): Atividade[] {
  const doNodes = diagrama.nodes.flatMap((no) => derivarNo(no, config, quebra));
  const doEdges = diagrama.edges.flatMap((edge) => derivarEdge(edge, diagrama, config, quebra));
  return rotular([...doNodes, ...doEdges]);
}
