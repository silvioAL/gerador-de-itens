import type { Atividade, Aresta, Diagrama, No, ValorSpec } from "../model/types.js";
import type { DiagramaConfig, FieldSpec, RegrasConfig } from "../config/types.js";
import { camposVisiveis } from "../spec/campos.js";
import {
  gerarChecklistProcesso,
  gerarChecklistTecnico,
  gerarCiclosDeTeste,
  gerarVolumetria,
} from "../refinamento/gerarRefinamento.js";

function nodeById(diagrama: Diagrama, id: string): No | undefined {
  return diagrama.nodes.find((n) => n.id === id);
}

function formatarValor(valor: unknown): string {
  if (valor === undefined || valor === null || valor === "") return "(não preenchido)";
  if (typeof valor === "boolean") return valor ? "sim" : "não";
  return String(valor);
}

/** Sub-campos de conteúdo longo (textarea) ficam em linha própria, indentados
 * — o resumo (method/path/ação) numa linha só fica ilegível se um contrato de
 * request/response JSON de várias linhas for espremido junto. */
function descreverItemLista(item: Record<string, unknown>, itemSpec: FieldSpec[]): string {
  const curtos = itemSpec.filter((s) => s.type !== "textarea");
  const longos = itemSpec.filter((s) => s.type === "textarea");
  const resumo = curtos.map((s) => `${s.label}: ${formatarValor(item[s.key])}`).join(" · ");
  const detalhes = longos
    .filter((s) => item[s.key] !== undefined && item[s.key] !== "")
    .map((s) => `   ${s.label}: ${formatarValor(item[s.key])}`);
  return [resumo, ...detalhes].join("\n");
}

/** Campo `type: "lista"` (ex.: Endpoints) não cabe numa célula de tabela — um
 * item por linha numerada, fora da tabela de campos escalares. */
function descreverCampoLista(campo: FieldSpec, valorSpec: ValorSpec | undefined): string {
  const itens = Array.isArray(valorSpec?.valor) ? (valorSpec.valor as Record<string, unknown>[]) : [];
  if (itens.length === 0) return `**${campo.label}:** (nenhum item)`;
  const linhas = itens.map((item, i) => `${i + 1}. ${descreverItemLista(item, campo.itemSpec ?? [])}`);
  return [`**${campo.label}:**`, "", ...linhas].join("\n");
}

function descreverEspecificacaoNo(no: No, config: DiagramaConfig, arestas: Aresta[]): string {
  const cfg = config.nodeTypes[no.type];
  const linhas: string[] = [`##### ${no.label} (${cfg?.label ?? no.type}, ${no.status})`, ""];

  if (!cfg) {
    linhas.push(`_Tipo "${no.type}" não encontrado na config carregada._`);
    return linhas.join("\n");
  }

  const visiveis = camposVisiveis(cfg.spec, no, arestas);
  if (visiveis.length === 0) {
    linhas.push("_Nenhum campo aplicável._");
    return linhas.join("\n");
  }

  const camposEscalares = visiveis.filter((c) => c.type !== "lista");
  const camposLista = visiveis.filter((c) => c.type === "lista");

  if (camposEscalares.length > 0) {
    linhas.push("| Campo | Valor | Proveniência |", "|---|---|---|");
    for (const campo of camposEscalares) {
      const na = no.specNA?.[campo.key];
      if (na) {
        linhas.push(`| ${campo.label} | N/A — ${na.motivo || "(sem motivo)"} | — |`);
        continue;
      }
      const valorSpec = no.spec[campo.key];
      if (!valorSpec) {
        linhas.push(`| ${campo.label} | (não preenchido) | — |`);
        continue;
      }
      linhas.push(`| ${campo.label} | ${formatarValor(valorSpec.valor)} | ${valorSpec.origem} |`);
    }
  }

  for (const campo of camposLista) {
    const na = no.specNA?.[campo.key];
    linhas.push(
      "",
      na ? `**${campo.label}:** N/A — ${na.motivo || "(sem motivo)"}` : descreverCampoLista(campo, no.spec[campo.key])
    );
  }

  return linhas.join("\n");
}

const CENARIO_GHERKIN_GENERICO =
  "```gherkin\nDado <contexto>\nQuando <ação>\nEntão <resultado esperado>\n```\n\n_(preencher com os cenários reais deste item)_";

/**
 * Resolve o cenário Gherkin de boas práticas pro tipo de nó/aresta desta
 * atividade (SPEC-14 §9) — mesma convenção de `specResumoPorAresta`: o nó
 * ALVO da aresta (quem é usado/afetado) é quem decide o cenário, não a
 * origem. Sem configuração pro tipo, cai no placeholder genérico.
 */
function resolverCenarioGherkin(atividade: Atividade, diagrama: Diagrama, config: DiagramaConfig): string {
  let cfgAlvo: DiagramaConfig["nodeTypes"][string] | undefined;
  let tipoAresta: string | undefined;

  if (atividade.origem.edgeId) {
    const edge = diagrama.edges.find((e) => e.id === atividade.origem.edgeId);
    if (edge) {
      tipoAresta = edge.type;
      const alvo = nodeById(diagrama, edge.target);
      cfgAlvo = alvo ? config.nodeTypes[alvo.type] : undefined;
    }
  } else if (atividade.origem.nodeId) {
    const no = nodeById(diagrama, atividade.origem.nodeId);
    cfgAlvo = no ? config.nodeTypes[no.type] : undefined;
  }

  const porAresta = tipoAresta ? cfgAlvo?.cenarioGherkinPorAresta?.[tipoAresta] : undefined;
  return porAresta ?? cfgAlvo?.cenarioGherkinPadrao ?? CENARIO_GHERKIN_GENERICO;
}

function descreverDependencias(atividade: Atividade): string {
  if (atividade.dependencias.length === 0) return "Nenhuma.";
  return atividade.dependencias.map((d) => (d.alvoChave ? `${d.type} → ${d.alvoChave}` : d.type)).join(", ");
}

/** Nós de origem de uma atividade — para atividade de aresta, source e target
 * (nessa ordem: quem chama, depois o recurso usado/afetado), não só o nó que
 * `origem.nodeId` guarda (que pra aresta é sempre a origem, nunca o alvo).
 * Exportada pra `gerarDiagramaHtml` (SPEC-21) reusar o mesmo mapeamento
 * atividade→nós, sem duplicar a lógica de resolução de origem. */
export function nosDeOrigem(atividade: Atividade, diagrama: Diagrama): No[] {
  if (atividade.origem.edgeId) {
    const edge = diagrama.edges.find((e) => e.id === atividade.origem.edgeId);
    if (edge) {
      const source = nodeById(diagrama, edge.source);
      const target = nodeById(diagrama, edge.target);
      return [source, target].filter((n): n is No => n !== undefined);
    }
  }
  if (atividade.origem.nodeId) {
    const no = nodeById(diagrama, atividade.origem.nodeId);
    return no ? [no] : [];
  }
  return [];
}

/**
 * As 6 seções do documento (SPEC-14 §4/§7) — nomes de variável usados tanto
 * no template quanto na validação (`validarTemplate`). Fechado de propósito:
 * um template não pode inventar variável nova, só usar (ou omitir) as que o
 * motor sabe preencher.
 */
export const VARIAVEIS_ESPECIFICACAO = [
  "titulo",
  "contexto",
  "historiaPo",
  "itens",
  "definitionOfReady",
  "definitionOfDone",
] as const;

/**
 * Template global padrão (seed de `especificacao_templates` no server e
 * fallback do CLI, que roda sem banco). Mudar aqui não atualiza sozinho o
 * seed já gravado — mesmo raciocínio de "os dois arquivos sempre
 * sincronizados" já usado pra config/diagrama vs packages/cli/templates.
 */
export const TEMPLATE_ESPECIFICACAO_PADRAO = `# {{titulo}}

## Contexto
{{contexto}}

## Visão geral
{{historiaPo}}

## Itens

{{itens}}

## Definition of Ready
{{definitionOfReady}}

## Definition of Done
{{definitionOfDone}}
`;

const REGEX_VARIAVEL = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;

/** Todos os nomes de variável (`{{nome}}`) referenciados por um template, sem duplicatas. */
export function extrairVariaveis(template: string): string[] {
  const encontradas = new Set<string>();
  let m: RegExpExecArray | null;
  REGEX_VARIAVEL.lastIndex = 0;
  while ((m = REGEX_VARIAVEL.exec(template))) encontradas.add(m[1]);
  return [...encontradas];
}

/** Nomes de variável que o template usa mas o motor não sabe preencher — vazio = válido (SPEC-14 §7). */
export function validarTemplate(template: string): string[] {
  const validas: readonly string[] = VARIAVEIS_ESPECIFICACAO;
  return extrairVariaveis(template).filter((v) => !validas.includes(v));
}

/**
 * Renderiza uma atividade como seção do documento (SPEC-14 §4) — não é
 * template editável pelo usuário, só a estrutura de fora é (título/contexto/
 * visão geral/DoR/DoD). Especificação técnica, refinamento e critérios de
 * aceite são legitimamente por-atividade, então vivem aqui, não como
 * variável de topo repetida por item. Exportado (não só usado internamente
 * por `gerarEspecificacaoEntrega`) pra a revisão web renderizar o mesmo
 * conteúdo por item, expandido inline — nunca duas fontes de verdade pro
 * mesmo texto.
 */
export function renderizarItemEspecificacao(
  numero: number,
  atividade: Atividade,
  diagrama: Diagrama,
  config: DiagramaConfig,
  regras?: RegrasConfig
): string {
  const nos = nosDeOrigem(atividade, diagrama);
  const especificacaoTecnica =
    nos.length > 0
      ? nos.map((no) => descreverEspecificacaoNo(no, config, diagrama.edges)).join("\n\n")
      : "_Nenhum nó de origem associado a esta atividade._";

  const checklist = regras ? gerarChecklistTecnico(regras, atividade.techs, atividade.contextos) : "";
  const ciclosTeste = regras ? gerarCiclosDeTeste(regras, atividade.techs, atividade.contextos) : "";
  const refinamentoTecnico =
    [checklist, ciclosTeste ? `**Ciclos de teste:**\n\n${ciclosTeste}` : ""].filter((b) => b.length > 0).join("\n\n") ||
    "_Nenhum requisito técnico específico para esta combinação de tech/contexto._";

  const volumetria = regras ? gerarVolumetria(regras, atividade.techs, atividade.contextos) : "";
  const checklistProcesso = regras
    ? gerarChecklistProcesso(regras, atividade.techs, atividade.contextos, nos, diagrama.edges)
    : "";

  const criteriosAceite = resolverCenarioGherkin(atividade, diagrama, config);

  return [
    `### ${numero}. ${atividade.rotulo} — ${atividade.descricao}`,
    "",
    `**Tipo:** ${atividade.tipo} · **Tamanho:** ${atividade.tamanho}`,
    `**Techs:** ${atividade.techs.join(", ") || "—"} · **Contextos:** ${atividade.contextos.join(", ") || "—"}`,
    `**Dependências:** ${descreverDependencias(atividade)}`,
    "",
    "#### Especificação técnica",
    "",
    especificacaoTecnica,
    "",
    "#### Requisitos de refinamento técnico",
    "",
    refinamentoTecnico,
    ...(checklistProcesso ? ["", "#### Checklist de processo", "", checklistProcesso] : []),
    ...(volumetria ? ["", "#### Requisitos de volumetria", "", volumetria] : []),
    "",
    "#### Critérios de aceite (Gherkin)",
    "",
    criteriosAceite,
  ].join("\n");
}

export interface OpcoesGerarEspecificacao {
  regras?: RegrasConfig;
  /** `quebra.demandInfo` — de onde vem a demanda, pra seção "Contexto" (SPEC-14 §4). */
  demandInfo?: string;
  /** Título do documento — default "Especificação de solução" (não é mais o rótulo de uma atividade, SPEC-14 §2). */
  titulo?: string;
  /** Template com placeholders `{{variavel}}` — sem isso, usa `TEMPLATE_ESPECIFICACAO_PADRAO`. */
  template?: string;
  /** `quebra.time` — filtra "Times envolvidos" pra só listar os DIFERENTES do
   * time da própria quebra (timesEnvolvidos sempre inclui o time da quebra
   * por padrão desde a derivação; sem isso, a seção sempre listaria o próprio
   * time da quebra, redundante). */
  time?: string;
}

/**
 * Gera a especificação de entrega da quebra inteira (SPEC-14) — um documento
 * só cobrindo todas as atividades derivadas, não mais um artefato por
 * atividade atômica (achado de uso real: uma atividade de "setup" sozinha não
 * é uma história de usuário, e repetir Contexto/Visão geral por atividade
 * produzia documentos rasos e repetitivos).
 */
export function gerarEspecificacaoEntrega(
  atividades: Atividade[],
  diagrama: Diagrama,
  config: DiagramaConfig,
  opcoes: OpcoesGerarEspecificacao = {}
): string {
  const template = opcoes.template ?? TEMPLATE_ESPECIFICACAO_PADRAO;
  const titulo = opcoes.titulo ?? "Especificação de solução";

  const todosOsTimes = new Set<string>();
  for (const a of atividades) {
    for (const t of a.timesEnvolvidos ?? []) {
      if (t !== opcoes.time) todosOsTimes.add(t);
    }
  }
  const partesContexto: string[] = [];
  if (opcoes.demandInfo) partesContexto.push(opcoes.demandInfo);
  if (todosOsTimes.size > 0) partesContexto.push(`Times envolvidos: ${[...todosOsTimes].join(", ")}`);
  const contexto = partesContexto.length > 0 ? partesContexto.join("\n\n") : "_Sem contexto adicional informado._";

  // Papel/benefício não são inferíveis a partir do modelo — o motor monta o
  // esqueleto uma vez só (não repetido por item), quem preenche (humano ou o
  // subagente de refino, SPEC-14 §3) decide o resto.
  const historiaPo = "Como <papel>, quero <ação> para que <benefício — detalhar>.";

  const itens =
    atividades.length > 0
      ? atividades.map((a, i) => renderizarItemEspecificacao(i + 1, a, diagrama, config, opcoes.regras)).join("\n\n---\n\n")
      : "_Nenhum item nesta quebra._";

  // DoR/DoD são contextuais (achado do usuário, SPEC-14 §5) — o motor
  // direciona com um baseline objetivo, a heurística fina é do subagente de
  // refino, não inventada aqui.
  const definitionOfReady = [
    "- [ ] Contexto e objetivo de negócio claros pra quem for implementar",
    "- [ ] Dependências (itens enabler/dependent) mapeadas",
    "- [ ] Nenhum campo obrigatório em aberto na especificação técnica (prontidão verde)",
    "",
    "_(item específico deste fluxo — completar com base no contexto; não é uma lista fechada)_",
  ].join("\n");

  const definitionOfDone = [
    "- [ ] Código revisado",
    "- [ ] Sem regressão na suíte de testes automatizados",
    "",
    "_(critério específico deste fluxo — completar com base no contexto; não é uma lista fechada)_",
  ].join("\n");

  const valores: Record<(typeof VARIAVEIS_ESPECIFICACAO)[number], string> = {
    titulo,
    contexto,
    historiaPo,
    itens,
    definitionOfReady,
    definitionOfDone,
  };

  REGEX_VARIAVEL.lastIndex = 0;
  return template.replace(REGEX_VARIAVEL, (match, nome: string) =>
    nome in valores ? valores[nome as (typeof VARIAVEIS_ESPECIFICACAO)[number]] : match
  );
}
