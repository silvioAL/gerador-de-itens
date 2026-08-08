import type { Atividade, Aresta, Diagrama, No, Origem, StatusNo, ValorSpec } from "../model/types.js";
import type { DiagramaConfig, FieldSpec, RegrasConfig } from "../config/types.js";
import { camposVisiveis } from "../spec/campos.js";
import {
  CHAVE_CRITERIOS_ACEITE,
  CHAVE_HISTORIA_USUARIO,
  MARCADOR_ESPECIFICAR,
  gerarChecklistProcesso,
  gerarChecklistTecnico,
  gerarCiclosDeTeste,
  gerarVolumetria,
  listarPlaceholders,
  respostaVisivel,
  type PlaceholderRefinamento,
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
function descreverCampoLista(campo: FichaCampoLista): string {
  if (campo.itens.length === 0) return `**${campo.label}:** (nenhum item)`;
  const linhas = campo.itens.map((item, i) => `${i + 1}. ${descreverItemLista(item, campo.itemSpec)}`);
  return [`**${campo.label}:**`, "", ...linhas].join("\n");
}

/** Campo escalar de `No.spec` já resolvido — dado bruto (não texto), pra
 * servir tanto o formatador de markdown quanto uma UI estruturada futura
 * (Fase 1a, SPEC-23). `origem`/`valor` ausentes juntos = campo nunca
 * preenchido; `na` presente = marcado como N/A (os dois nunca coexistem). */
export interface FichaCampoEscalar {
  key: string;
  label: string;
  valor?: unknown;
  origem?: Origem;
  na?: string;
}

/** Campo `type: "lista"` já resolvido — itens brutos (não pré-formatados),
 * pra uma UI conseguir editar item a item sem reparsear markdown. */
export interface FichaCampoLista {
  key: string;
  label: string;
  itemSpec: FieldSpec[];
  itens: Record<string, unknown>[];
  na?: string;
}

/** Especificação técnica de um nó de origem, como dado estruturado — o que
 * `descreverEspecificacaoNo` (abaixo) formata em markdown, e o que uma ficha
 * rica (Fase 1d, SPEC-23) vai renderizar/editar diretamente, sem precisar
 * reparsear a tabela markdown. */
export interface FichaEspecificacaoNo {
  noId: string;
  label: string;
  tipoLabel: string;
  status: StatusNo;
  /** `false` quando o tipo do nó não existe na config carregada — nesse caso
   * `camposEscalares`/`camposLista` ficam vazios de propósito, não é erro. */
  tipoConhecido: boolean;
  camposEscalares: FichaCampoEscalar[];
  camposLista: FichaCampoLista[];
}

/** Resolve a especificação técnica de um nó pra dado estruturado — mesma
 * fonte (`camposVisiveis`, `No.spec`/`specNA`) que antes ia direto pro
 * markdown; agora fica disponível como objeto pra quem precisar (Fase 1a). */
export function estruturarEspecificacaoNo(no: No, config: DiagramaConfig, arestas: Aresta[]): FichaEspecificacaoNo {
  const cfg = config.nodeTypes[no.type];
  if (!cfg) {
    return {
      noId: no.id, label: no.label, tipoLabel: no.type, status: no.status,
      tipoConhecido: false, camposEscalares: [], camposLista: [],
    };
  }

  const visiveis = camposVisiveis(cfg.spec, no, arestas);
  const camposEscalares: FichaCampoEscalar[] = [];
  const camposLista: FichaCampoLista[] = [];

  for (const campo of visiveis) {
    const na = no.specNA?.[campo.key];
    if (campo.type === "lista") {
      const valorSpec = no.spec[campo.key];
      camposLista.push({
        key: campo.key,
        label: campo.label,
        itemSpec: campo.itemSpec ?? [],
        itens: Array.isArray(valorSpec?.valor) ? (valorSpec.valor as Record<string, unknown>[]) : [],
        na: na?.motivo,
      });
    } else {
      const valorSpec = no.spec[campo.key];
      camposEscalares.push({
        key: campo.key,
        label: campo.label,
        valor: valorSpec?.valor,
        origem: valorSpec?.origem,
        na: na?.motivo,
      });
    }
  }

  return { noId: no.id, label: no.label, tipoLabel: cfg.label, status: no.status, tipoConhecido: true, camposEscalares, camposLista };
}

/** Formata a especificação estruturada de um nó em markdown — mesmo texto
 * que a versão anterior gerava direto de `No`, agora derivado do dado
 * estruturado (`estruturarEspecificacaoNo`), não recalculado do zero. */
function descreverEspecificacaoNo(ficha: FichaEspecificacaoNo): string {
  const linhas: string[] = [`##### ${ficha.label} (${ficha.tipoLabel}, ${ficha.status})`, ""];

  if (!ficha.tipoConhecido) {
    linhas.push(`_Tipo "${ficha.tipoLabel}" não encontrado na config carregada._`);
    return linhas.join("\n");
  }

  if (ficha.camposEscalares.length === 0 && ficha.camposLista.length === 0) {
    linhas.push("_Nenhum campo aplicável._");
    return linhas.join("\n");
  }

  if (ficha.camposEscalares.length > 0) {
    linhas.push("| Campo | Valor | Proveniência |", "|---|---|---|");
    for (const campo of ficha.camposEscalares) {
      if (campo.na !== undefined) {
        linhas.push(`| ${campo.label} | N/A — ${campo.na || "(sem motivo)"} | — |`);
        continue;
      }
      if (campo.origem === undefined) {
        linhas.push(`| ${campo.label} | (não preenchido) | — |`);
        continue;
      }
      linhas.push(`| ${campo.label} | ${formatarValor(campo.valor)} | ${campo.origem} |`);
    }
  }

  for (const campo of ficha.camposLista) {
    linhas.push(
      "",
      campo.na !== undefined ? `**${campo.label}:** N/A — ${campo.na || "(sem motivo)"}` : descreverCampoLista(campo)
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
  regras?: RegrasConfig,
  respostas?: Record<string, ValorSpec>
): string {
  const nos = nosDeOrigem(atividade, diagrama);
  const especificacaoTecnica =
    nos.length > 0
      ? nos.map((no) => descreverEspecificacaoNo(estruturarEspecificacaoNo(no, config, diagrama.edges))).join("\n\n")
      : "_Nenhum nó de origem associado a esta atividade._";

  const checklist = regras
    ? gerarChecklistTecnico(regras, atividade.techs, atividade.contextos, nos, diagrama.edges, respostas)
    : "";
  const ciclosTeste = regras ? gerarCiclosDeTeste(regras, atividade.techs, atividade.contextos) : "";
  const refinamentoTecnico =
    [checklist, ciclosTeste ? `**Ciclos de teste:**\n\n${ciclosTeste}` : ""].filter((b) => b.length > 0).join("\n\n") ||
    "_Nenhum requisito técnico específico para esta combinação de tech/contexto._";

  const volumetria = regras ? gerarVolumetria(regras, atividade.techs, atividade.contextos, respostas) : "";
  const checklistProcesso = regras
    ? gerarChecklistProcesso(regras, atividade.techs, atividade.contextos, nos, diagrama.edges)
    : "";

  const criteriosAceite = resolverCenarioGherkin(atividade, diagrama, config);

  // Fase 1d-ii, SPEC-23: os dois únicos campos que a IA sempre pode escrever
  // pra qualquer item, independente de `regras` — história de usuário real
  // (não a frase mecânica de `atividade.descricao`) e cenários de teste
  // contextuais além do scaffold determinístico.
  const historiaResp = respostas?.[CHAVE_HISTORIA_USUARIO];
  const historiaUsuario = respostaVisivel(historiaResp) ? String(historiaResp.valor) : `_(sem história definida)_ ${MARCADOR_ESPECIFICAR}`;
  const criteriosContextuaisResp = respostas?.[CHAVE_CRITERIOS_ACEITE];
  const criteriosContextuais = respostaVisivel(criteriosContextuaisResp) ? String(criteriosContextuaisResp.valor) : undefined;

  return [
    `### ${numero}. ${atividade.rotulo} — ${atividade.descricao}`,
    "",
    `**Tipo:** ${atividade.tipo} · **Tamanho:** ${atividade.tamanho}`,
    `**Techs:** ${atividade.techs.join(", ") || "—"} · **Contextos:** ${atividade.contextos.join(", ") || "—"}`,
    `**Dependências:** ${descreverDependencias(atividade)}`,
    "",
    "#### História de usuário",
    "",
    historiaUsuario,
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
    ...(criteriosContextuais ? ["", "_Cenários adicionais (contextuais):_", "", criteriosContextuais] : []),
  ].join("\n");
}

/** Um placeholder de checklist técnico/volumetria já resolvido pra uma
 * atividade específica — mesma `chave`/`tech`/`rotulo` de
 * `PlaceholderRefinamento` (`listarPlaceholders`), com a resposta (se
 * houver) já anexada, pronto pra uma UI ler direto sem juntar as duas
 * fontes ela mesma. */
export interface FichaPlaceholder {
  chave: string;
  tech: string;
  rotulo: string;
  resposta?: ValorSpec;
}

/**
 * Representação estruturada de uma atividade (Fase 1a, SPEC-23) — o que
 * `renderizarItemEspecificacao` formata em markdown hoje, disponível como
 * dado pra uma UI editável renderizar/editar direto, sem reparsear texto.
 * `checklistProcessoMarkdown`/`ciclosTesteMarkdown`/`criteriosAceiteMarkdown`
 * ficam como markdown puro de propósito — nenhum consumidor de UI precisa
 * editar essas três seções ainda (são geradas por regra, não por resposta
 * humana/IA como o checklist técnico/volumetria); estruturá-las agora seria
 * especulativo. Revisitar quando a ficha rica (Fase 1d) precisar delas.
 */
export interface FichaItem {
  numero: number;
  chave: string;
  rotulo: string;
  descricao: string;
  tipo: Atividade["tipo"];
  tamanho: Atividade["tamanho"];
  techs: string[];
  contextos: string[];
  dependencias: Atividade["dependencias"];
  timesEnvolvidos?: string[];
  especificacaoTecnica: FichaEspecificacaoNo[];
  /** Fase 1d-ii, SPEC-23 — sempre presente (independente de `regras`), pra
   * cobrir o pedido original: a IA escreve a história do item, não só
   * responde checklist técnico. */
  historiaUsuario: FichaPlaceholder;
  criteriosAceiteContextual: FichaPlaceholder;
  checklistTecnico: FichaPlaceholder[];
  volumetria: FichaPlaceholder[];
  checklistProcessoMarkdown: string;
  ciclosTesteMarkdown: string;
  criteriosAceiteMarkdown: string;
}

/**
 * Monta a ficha estruturada de uma atividade — reusa `estruturarEspecificacaoNo`
 * pros nós de origem e `listarPlaceholders` pro checklist técnico/volumetria
 * (mesma fonte que `renderizarItemEspecificacao` usa pra gerar o markdown,
 * nunca uma segunda lógica de derivação). `respostas` é o mesmo mapa de
 * `quebra.respostasItens?.[atividade.chave]` já usado em `renderizarItemEspecificacao`.
 */
export function montarFichaItem(
  numero: number,
  atividade: Atividade,
  diagrama: Diagrama,
  config: DiagramaConfig,
  regras?: RegrasConfig,
  respostas?: Record<string, ValorSpec>
): FichaItem {
  const nos = nosDeOrigem(atividade, diagrama);
  const especificacaoTecnica = nos.map((no) => estruturarEspecificacaoNo(no, config, diagrama.edges));

  // `regras` opcional na assinatura pública, mas história/critérios de
  // aceite sempre existem (Fase 1d-ii, SPEC-23) — `listarPlaceholders` já
  // trata `porTech[tech]` ausente sem erro, então um `RegrasConfig` vazio
  // basta pra só obter os 2 placeholders fixos quando não há `regras` real.
  const placeholders = listarPlaceholders(
    regras ?? { tipos: [], tamanhos: [], porTech: {} },
    atividade.techs,
    atividade.contextos,
    nos,
    diagrama.edges
  );
  const paraFicha = (secao: PlaceholderRefinamento["secao"]): FichaPlaceholder[] =>
    placeholders
      .filter((p) => p.secao === secao)
      .map((p) => ({ chave: p.chave, tech: p.tech, rotulo: p.rotulo, resposta: respostas?.[p.chave] }));

  return {
    numero,
    chave: atividade.chave,
    rotulo: atividade.rotulo,
    descricao: atividade.descricao,
    tipo: atividade.tipo,
    tamanho: atividade.tamanho,
    techs: atividade.techs,
    contextos: atividade.contextos,
    dependencias: atividade.dependencias,
    timesEnvolvidos: atividade.timesEnvolvidos,
    especificacaoTecnica,
    historiaUsuario: paraFicha("historiaUsuario")[0],
    criteriosAceiteContextual: paraFicha("criteriosAceite")[0],
    checklistTecnico: paraFicha("checklistTecnico"),
    volumetria: paraFicha("volumetria"),
    checklistProcessoMarkdown: regras
      ? gerarChecklistProcesso(regras, atividade.techs, atividade.contextos, nos, diagrama.edges)
      : "",
    ciclosTesteMarkdown: regras ? gerarCiclosDeTeste(regras, atividade.techs, atividade.contextos) : "",
    criteriosAceiteMarkdown: resolverCenarioGherkin(atividade, diagrama, config),
  };
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
  /** `quebra.respostasItens` — respostas (humanas ou IA confirmada) aos
   * placeholders "<- ✍️ especificar" de cada atividade, chaveadas por
   * `Atividade.chave` (Fase 1, SPEC-23). */
  respostasItens?: Record<string, Record<string, ValorSpec>>;
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
      ? atividades
          .map((a, i) =>
            renderizarItemEspecificacao(i + 1, a, diagrama, config, opcoes.regras, opcoes.respostasItens?.[a.chave])
          )
          .join("\n\n---\n\n")
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
