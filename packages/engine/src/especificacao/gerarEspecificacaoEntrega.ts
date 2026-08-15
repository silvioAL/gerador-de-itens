import type { Atividade, Aresta, Decisao, Diagrama, ExcecaoDePadrao, Necessidade, No, Origem, Percurso, StatusNo, ValorSpec } from "../model/types.js";
import { avaliarPercursos } from "../percurso/conformidadeDePercurso.js";
import { percursosQueContam } from "../percurso/percursos.js";
import { necessidadesDoElemento } from "../proposito/lacunas.js";
import { decisoesDoElemento, decisoesVigentes, excecoesComoDecisoes } from "../decisao/decisoes.js";
import type { DiagramaConfig, FieldSpec, RegrasConfig } from "../config/types.js";
import { camposVisiveis } from "../spec/campos.js";
import {
  CHAVE_CENARIO_FEATURE,
  CHAVE_ENTREGA_FINAL,
  CHAVE_CONTRATO_DEPENDENCIAS,
  CHAVE_CONTRATO_ERROS,
  CHAVE_CONTRATO_NO_VINCULADO,
  CHAVE_CONTRATO_REQUEST,
  CHAVE_CONTRATO_RESPONSE,
  CHAVE_CRITERIOS_ACEITE,
  CHAVE_HISTORIA_USUARIO,
  CHAVE_REGRAS_TESTE,
  MARCADOR_ESPECIFICAR,
  gerarChecklistProcesso,
  gerarChecklistTecnico,
  gerarCiclosDeTeste,
  gerarVolumetria,
  listarPlaceholders,
  respostaVisivel,
  respostaParaDocumento,
  MARCA_SUGERIDO,
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
  /** SPEC-58 fatia 4 — as decisões por inteiro, UMA vez, antes dos itens. */
  "decisoes",
  /** SPEC-58 fatia 2 — o que a PESSOA escreveu. Vazias = as seções somem, e o
   * documento sai idêntico ao de antes em quem nunca escreveu nada. */
  "tradeOffs",
  "riscos",
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

## Decisões

{{decisoes}}

## Trade-offs e o que ficou de fora

{{tradeOffs}}

## Riscos e o que pode dar errado

{{riscos}}

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
 * SPEC-35 — sem `{{itens}}` não há leitura válida de um template de
 * especificação: o documento sairia sem o corpo. As demais variáveis são
 * recomendadas — template enxuto é escolha legítima, mas dita em voz alta.
 */
export const VARIAVEIS_OBRIGATORIAS_ESPECIFICACAO = ["itens"] as const;

/** A consequência de cada ausência, em português — é o "motivo" que o usuário
 * pediu para ver, e mora aqui para borda e tela dizerem a MESMA frase. */
const CONSEQUENCIA_DA_AUSENCIA: Record<(typeof VARIAVEIS_ESPECIFICACAO)[number], string> = {
  titulo: "o documento sai sem título",
  contexto: "o texto do Contexto do épico não entra no documento",
  historiaPo: "a visão geral escrita pelo PO não entra no documento",
  itens: "o documento sai SEM os itens da quebra — os itens são o corpo do documento",
  definitionOfReady: "a seção Definition of Ready não entra no documento",
  definitionOfDone: "a seção Definition of Done não entra no documento",
  decisoes: "as decisões de arquitetura não entram no documento — quem lê fica sem o porquê do desenho",
  tradeOffs: "não há onde registrar o que se ganhou e o que se perdeu",
  riscos: "não há onde registrar o que pode dar errado",
};

export interface ProblemasDoTemplate {
  /** Bloqueiam o salvamento — a borda recusa com 400 e estas frases. */
  erros: string[];
  /** Salvam, mas a pessoa precisa saber o que deixa de sair no documento. */
  avisos: string[];
}

/** SPEC-35 — a validação única que borda e tela importam (nunca reimplementam). */
export function problemasDoTemplate(template: string): ProblemasDoTemplate {
  const erros: string[] = [];
  const avisos: string[] = [];

  for (const v of validarTemplate(template)) {
    erros.push(
      `{{${v}}} não existe — o motor não sabe preenchê-la (válidas: ${VARIAVEIS_ESPECIFICACAO.map((x) => `{{${x}}}`).join(", ")})`
    );
  }

  const usadas = extrairVariaveis(template);
  for (const v of VARIAVEIS_ESPECIFICACAO) {
    if (usadas.includes(v)) continue;
    const frase = `sem {{${v}}}, ${CONSEQUENCIA_DA_AUSENCIA[v]}`;
    if ((VARIAVEIS_OBRIGATORIAS_ESPECIFICACAO as readonly string[]).includes(v)) erros.push(frase);
    else avisos.push(frase);
  }

  return { erros, avisos };
}

/**
 * SPEC-47 — as variáveis do TEMPLATE DO ITEM. O corpo de cada item era
 * estrutura fixa no código: quem quisesse outra ordem, outro título de seção
 * ou uma seção nova (o caso que motivou isto: **a entrega final no fim de
 * cada item**) não tinha por onde. Agora é template, como o documento —
 * fechado de propósito, pela mesma razão do `VARIAVEIS_ESPECIFICACAO`:
 * template não inventa variável que o motor não sabe preencher.
 */
export const VARIAVEIS_ITEM = [
  "numero",
  "rotulo",
  "descricao",
  "tipo",
  "tamanho",
  "techs",
  "contextos",
  "dependencias",
  /** SPEC-57 fatia A — o propósito que este item atende. Vazia quando a quebra
   * não declarou necessidade, e aí a seção some sozinha. */
  "necessidades",
  /** SPEC-57 fatia C — POR QUE o elemento deste item é assim, com o que foi
   * descartado. Vazia quando não há decisão registrada, e a seção some. */
  "decisoes",
  /** SPEC-57 fatia E — de que CAMINHOS o elemento deste item participa. Vazia
   * quando nenhum percurso foi confirmado, e a seção some. */
  "percursos",
  "historiaUsuario",
  "especificacaoTecnica",
  "contratoArquitetura",
  "refinamentoTecnico",
  "checklistProcesso",
  "volumetria",
  "criteriosAceite",
  "criteriosContextuais",
  "regrasTeste",
  "cenarioGherkin",
  "entregaFinal",
] as const;

/**
 * O item como o produto o escreve hoje — mais a **Entrega final**, que é o
 * que faltava: o documento descrevia o trabalho e terminava no cenário de
 * teste, sem dizer o que fica pronto quando o item acaba.
 *
 * Seção cujo conteúdo está vazio some inteira (ver `aplicarTemplateDoItem`):
 * título de seção sem corpo é ruído em documento que alguém vai ler.
 */
export const TEMPLATE_ITEM_PADRAO = `### {{numero}}. {{rotulo}} — {{descricao}}

**Tipo:** {{tipo}} · **Tamanho:** {{tamanho}}
**Techs:** {{techs}} · **Contextos:** {{contextos}}
**Dependências:** {{dependencias}}

#### Necessidades atendidas

{{necessidades}}

#### Por que este desenho é assim

{{decisoes}}

#### Caminhos de que participa

{{percursos}}

#### História de usuário

{{historiaUsuario}}

#### Especificação técnica

{{especificacaoTecnica}}

#### Contrato de arquitetura

{{contratoArquitetura}}

#### Requisitos de refinamento técnico

{{refinamentoTecnico}}

#### Checklist de processo

{{checklistProcesso}}

#### Requisitos de volumetria

{{volumetria}}

#### Critérios de aceite (Gherkin)

{{criteriosAceite}}

{{criteriosContextuais}}

#### Regras de teste (QA)

{{regrasTeste}}

#### Cenário Gherkin adicional (QA)

{{cenarioGherkin}}

#### Entrega final

{{entregaFinal}}
`;

/** Nomes de variável que o template do item usa mas o motor não preenche. */
export function validarTemplateItem(template: string): string[] {
  const validas: readonly string[] = VARIAVEIS_ITEM;
  return extrairVariaveis(template).filter((v) => !validas.includes(v));
}

/** SPEC-47 — sem `{{entregaFinal}}` o item volta a terminar sem dizer o que
 * fica pronto (o pedido do §196); sem os três do topo, ninguém sabe o que é
 * o item. Aviso, não erro: template enxuto é escolha legítima, dita em voz
 * alta (mesma disciplina do template do documento). */
export function problemasDoTemplateItem(template: string): ProblemasDoTemplate {
  const erros = validarTemplateItem(template).map(
    (v) => `{{${v}}} não existe — o motor não sabe preenchê-la (válidas: ${VARIAVEIS_ITEM.map((x) => `{{${x}}}`).join(", ")})`
  );
  const usadas = extrairVariaveis(template);
  const avisos: string[] = [];
  if (!usadas.includes("entregaFinal")) avisos.push("sem {{entregaFinal}}, o item não diz o que fica pronto quando termina");
  if (!usadas.includes("historiaUsuario")) avisos.push("sem {{historiaUsuario}}, o item não diz para quem é nem por quê");
  if (!usadas.includes("especificacaoTecnica")) avisos.push("sem {{especificacaoTecnica}}, o item sai sem os campos do desenho");
  return { erros, avisos };
}

/**
 * SPEC-58 — tira do TEMPLATE do documento a seção de uma variável que veio
 * vazia, junto com o título que a precede.
 *
 * Por que não reusar a varredura de `aplicarTemplateDoItem` aqui: ela roda
 * sobre o texto **já preenchido**, e o documento preenchido contém os itens,
 * cujos blocos começam com `###` logo depois do `## Itens`. Para a varredura,
 * um título seguido de outro título é seção vazia — ela apagaria "## Itens"
 * inteiro. Rodar sobre o TEMPLATE, antes de substituir, evita isso por
 * construção.
 */
function removerSecaoDaVariavel(template: string, nome: string): string {
  const linhas = template.split("\n");
  const alvo = linhas.findIndex((l) => l.includes(`{{${nome}}}`));
  if (alvo < 0) return template;

  let inicio = alvo;
  while (inicio > 0 && !/^#{1,6}\s/.test(linhas[inicio])) inicio--;
  // Variável solta, sem título próprio: tira só a linha dela — apagar até o
  // topo levaria seção alheia junto.
  if (!/^#{1,6}\s/.test(linhas[inicio])) inicio = alvo;

  return [...linhas.slice(0, inicio), ...linhas.slice(alvo + 1)].join("\n");
}

/**
 * Aplica o template do item. Uma seção com conteúdo VAZIO some junto com o
 * título que a precede — sem isso, um item sem contrato de arquitetura sairia
 * com "#### Contrato de arquitetura" seguido de nada, que é exatamente o tipo
 * de ruído que o §188 mandou tirar do documento.
 */
export function aplicarTemplateDoItem(template: string, valores: Record<string, string>): string {
  REGEX_VARIAVEL.lastIndex = 0;
  const preenchido = template.replace(REGEX_VARIAVEL, (match, nome: string) =>
    nome in valores ? valores[nome] : match
  );

  const linhas = preenchido.split("\n");
  const saida: string[] = [];
  for (let i = 0; i < linhas.length; i++) {
    const linha = linhas[i];
    const ehTitulo = /^#{2,6}\s/.test(linha);
    if (ehTitulo) {
      // Olha o que vem até o próximo título: só espaço em branco = seção vazia.
      let j = i + 1;
      let temCorpo = false;
      for (; j < linhas.length && !/^#{2,6}\s/.test(linhas[j]); j++) {
        if (linhas[j].trim() !== "") temCorpo = true;
      }
      if (!temCorpo) {
        i = j - 1;
        continue;
      }
    }
    saida.push(linha);
  }
  return saida.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd();
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
/**
 * A decisão como quem VAI CONSTRUIR precisa ler: a escolha, o porquê, e —
 * indentado logo abaixo — o que foi descartado com o custo de cada opção.
 *
 * As descartadas entram no documento de propósito. Um item que diz só "usar
 * fila" produz alguém perguntando "por que não uma chamada simples?" na
 * primeira dúvida; com a linha riscada e o motivo, a pergunta já vem
 * respondida. É a fatia C inteira em três linhas de markdown.
 */
function descreverDecisao(d: Decisao): string {
  const linhas = [`- **${d.titulo}:** ${d.escolhida}${d.porque.trim() ? ` — ${d.porque}` : ""}`];
  if (d.contexto?.trim()) linhas.push(`  _${d.contexto.trim()}_`);
  for (const a of d.alternativas.filter((a) => a.titulo !== d.escolhida)) {
    linhas.push(`  - ~~${a.titulo}~~${a.consequencia ? ` — ${a.consequencia}` : ""}`);
  }
  return linhas.join("\n");
}

/**
 * SPEC-58 fatia 4 — a citação ENCURTADA no item.
 *
 * O corpo da decisão (contexto, alternativas descartadas, porquê extenso)
 * passa a viver uma vez no topo do documento. Repeti-lo em cada item era
 * tratar o documento como export: num export por item faz sentido, num texto
 * que alguém lê do começo ao fim é ruído — e ruído repetido é o que faz pular
 * seção. **O item aponta; o topo conta.**
 *
 * `descreverDecisao` continua existindo e é quem monta o bloco completo do
 * topo — as duas formas são deliberadas, não duplicação.
 */
function citarDecisao(d: Decisao): string {
  return `- ${d.titulo}${d.porque.trim() ? ` — ${d.porque}` : ""}`;
}

export function renderizarItemEspecificacao(
  numero: number,
  atividade: Atividade,
  diagrama: Diagrama,
  config: DiagramaConfig,
  regras?: RegrasConfig,
  respostas?: Record<string, ValorSpec>,
  /** SPEC-47 — o template do ITEM (o do time, quando existe). Sem ele, o
   * `TEMPLATE_ITEM_PADRAO`: a estrutura de sempre + a entrega final. */
  templateItem?: string,
  /** SPEC-57 fatia A (M8) — as necessidades da quebra, para o item CITAR o
   * propósito que ele atende. Sem elas a seção some sozinha (a remoção de
   * seção vazia do `aplicarTemplateDoItem` já cuida), então quebra sem
   * propósito declarado gera o mesmo documento de antes. */
  necessidades?: Necessidade[],
  /** SPEC-57 fatia C — as decisões da quebra, para o item carregar o PORQUÊ do
   * elemento que ele constrói. Mesma disciplina da fatia A: sem decisão
   * registrada a seção some e o documento sai igual ao de antes. */
  decisoes?: Decisao[],
  /** SPEC-57 fatia E — os caminhos CONFIRMADOS que passam pelo elemento deste
   * item. Já vêm filtrados por quem chama: saber de que caminho o componente
   * faz parte muda como ele é implementado — um nó num caminho síncrono
   * apertado não se escreve como um num caminho assíncrono. */
  percursosDoItem?: { rotulo: string; regra?: string }[]
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
  const respHistoria = respostaParaDocumento(historiaResp);
  const historiaUsuario = respHistoria
    ? `${respHistoria.texto}${respHistoria.sugerida ? `

${MARCA_SUGERIDO}` : ""}`
    : `_(sem história definida)_ ${MARCADOR_ESPECIFICAR}`;
  const criteriosContextuaisResp = respostas?.[CHAVE_CRITERIOS_ACEITE];
  const respCriterios = respostaParaDocumento(criteriosContextuaisResp);
  const criteriosContextuais = respCriterios
    ? `${respCriterios.texto}${respCriterios.sugerida ? `

${MARCA_SUGERIDO}` : ""}`
    : undefined;

  // SPEC-24 — contrato de arquitetura (papel Arquiteto) e regras de teste +
  // cenário Gherkin (papel QA): mesma régua "nada sugerido conta até
  // confirmado", só aparecem no documento quando resolvidos.
  const camposContrato = [
    ["Nó vinculado", respostas?.[CHAVE_CONTRATO_NO_VINCULADO]],
    ["Request", respostas?.[CHAVE_CONTRATO_REQUEST]],
    ["Response", respostas?.[CHAVE_CONTRATO_RESPONSE]],
    ["Erros", respostas?.[CHAVE_CONTRATO_ERROS]],
    ["Dependências", respostas?.[CHAVE_CONTRATO_DEPENDENCIAS]],
  ] as const;
  const contratoPreenchido = camposContrato.filter(([, resp]) => respostaParaDocumento(resp) !== null);
  const contratoArquitetura =
    contratoPreenchido.length > 0
      ? contratoPreenchido.map(([label, resp]) => `- **${label}:** ${String(resp!.valor)}`).join("\n")
      : undefined;

  const regrasTesteResp = respostas?.[CHAVE_REGRAS_TESTE];
  const respRegrasTeste = respostaParaDocumento(regrasTesteResp);
  const regrasTeste = respRegrasTeste
    ? `${respRegrasTeste.texto}${respRegrasTeste.sugerida ? `

${MARCA_SUGERIDO}` : ""}`
    : undefined;
  const cenarioFeatureResp = respostas?.[CHAVE_CENARIO_FEATURE];
  const respCenario = respostaParaDocumento(cenarioFeatureResp);
  const cenarioFeature = respCenario
    ? `${respCenario.texto}${respCenario.sugerida ? `

${MARCA_SUGERIDO}` : ""}`
    : undefined;

  // SPEC-47 — a entrega final: o que fica PRONTO quando o item termina.
  const respEntrega = respostaParaDocumento(respostas?.[CHAVE_ENTREGA_FINAL]);
  const entregaFinal = respEntrega
    ? `${respEntrega.texto}${respEntrega.sugerida ? `

${MARCA_SUGERIDO}` : ""}`
    : `_(a definir: o que fica pronto quando este item termina)_ ${MARCADOR_ESPECIFICAR}`;

  // A citação é da ORIGEM da atividade — o nó ou a aresta de onde ela nasceu.
  // Não vale usar `nosDeOrigem`, que para atividade de aresta devolve source e
  // target: o item herdaria o propósito dos dois vizinhos e citaria propósito
  // que não é dele.
  const necessidadesCitadas = [
    ...necessidadesDoElemento(atividade.origem.nodeId, necessidades),
    ...necessidadesDoElemento(atividade.origem.edgeId, necessidades),
  ];
  const textoNecessidades = necessidadesCitadas.map((n) => `- ${n.texto}`).join("\n");

  // Fatia C — a mesma régua de origem das necessidades, pelo mesmo motivo: um
  // item de aresta não herdaria a decisão dos dois vizinhos.
  const decisoesCitadas = [
    ...decisoesDoElemento(atividade.origem.nodeId, decisoes),
    ...decisoesDoElemento(atividade.origem.edgeId, decisoes),
  ];
  const textoDecisoes = decisoesCitadas.map(citarDecisao).join("\n");

  const textoPercursos = (percursosDoItem ?? [])
    .map((p) => `- ${p.rotulo}${p.regra ? ` — ${p.regra}` : ""}`)
    .join("\n");

  return aplicarTemplateDoItem(templateItem ?? TEMPLATE_ITEM_PADRAO, {
    numero: String(numero),
    rotulo: atividade.rotulo,
    descricao: atividade.descricao,
    tipo: atividade.tipo,
    tamanho: atividade.tamanho,
    techs: atividade.techs.join(", ") || "—",
    contextos: atividade.contextos.join(", ") || "—",
    dependencias: descreverDependencias(atividade),
    necessidades: textoNecessidades,
    decisoes: textoDecisoes,
    percursos: textoPercursos,
    historiaUsuario,
    especificacaoTecnica,
    contratoArquitetura: contratoArquitetura ?? "",
    refinamentoTecnico,
    checklistProcesso: checklistProcesso || "",
    volumetria: volumetria || "",
    criteriosAceite,
    criteriosContextuais: criteriosContextuais ? `_Cenários adicionais (contextuais):_

${criteriosContextuais}` : "",
    regrasTeste: regrasTeste ?? "",
    cenarioGherkin: cenarioFeature ? ["```gherkin", cenarioFeature, "```"].join("\n") : "",
    entregaFinal,
  });
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
  /** SPEC-24 — placeholders da esteira de agentes: contrato de arquitetura
   * (papel Arquiteto) e regras de teste/cenário Gherkin (papel QA), sempre
   * presentes como escalares próprios (decisão §4.2 — nenhum objeto
   * aninhado novo, mesma disciplina de história/critérios). */
  contrato: {
    noVinculado: FichaPlaceholder;
    request: FichaPlaceholder;
    response: FichaPlaceholder;
    erros: FichaPlaceholder;
    dependencias: FichaPlaceholder;
  };
  regrasTeste: FichaPlaceholder;
  cenarioFeature: FichaPlaceholder;
  /** SPEC-47 — o entregável do item, no fim da seção. */
  entregaFinal: FichaPlaceholder;
  checklistTecnico: FichaPlaceholder[];
  volumetria: FichaPlaceholder[];
  checklistProcessoMarkdown: string;
  ciclosTesteMarkdown: string;
  criteriosAceiteMarkdown: string;
}

/** Um placeholder específico (por chave, não por seção) já resolvido pra ficha
 * — usado pros campos de contrato/regrasTeste/cenarioFeature (SPEC-24), que
 * a UI referencia individualmente (ex.: só o campo "Request"), diferente de
 * checklistTecnico/volumetria (consumidos como lista). */
function acharPorChave(
  placeholders: PlaceholderRefinamento[],
  respostas: Record<string, ValorSpec> | undefined,
  chave: string
): FichaPlaceholder {
  const p = placeholders.find((x) => x.chave === chave)!;
  return { chave: p.chave, tech: p.tech, rotulo: p.rotulo, resposta: respostas?.[p.chave] };
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
    contrato: {
      noVinculado: acharPorChave(placeholders, respostas, CHAVE_CONTRATO_NO_VINCULADO),
      request: acharPorChave(placeholders, respostas, CHAVE_CONTRATO_REQUEST),
      response: acharPorChave(placeholders, respostas, CHAVE_CONTRATO_RESPONSE),
      erros: acharPorChave(placeholders, respostas, CHAVE_CONTRATO_ERROS),
      dependencias: acharPorChave(placeholders, respostas, CHAVE_CONTRATO_DEPENDENCIAS),
    },
    regrasTeste: acharPorChave(placeholders, respostas, CHAVE_REGRAS_TESTE),
    cenarioFeature: acharPorChave(placeholders, respostas, CHAVE_CENARIO_FEATURE),
    entregaFinal: acharPorChave(placeholders, respostas, CHAVE_ENTREGA_FINAL),
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
  /** SPEC-53 Fase 2 — o contexto do PRODUTO em texto. Vem ANTES do da demanda
   * na seção "Contexto": quem lê o documento precisa saber de que negócio se
   * trata antes de ler o que muda nesta entrega. */
  contextoDoProduto?: string;
  /** Título do documento — default "Especificação de solução" (não é mais o rótulo de uma atividade, SPEC-14 §2). */
  titulo?: string;
  /** Template com placeholders `{{variavel}}` — sem isso, usa `TEMPLATE_ESPECIFICACAO_PADRAO`. */
  template?: string;
  /** `quebra.time` — filtra "Times envolvidos" pra só listar os DIFERENTES do
   * time da própria quebra (timesEnvolvidos sempre inclui o time da quebra
   * por padrão desde a derivação; sem isso, a seção sempre listaria o próprio
   * time da quebra, redundante). */
  time?: string;
  /** SPEC-47 — template do ITEM (cada seção do documento). */
  templateItem?: string;
  /** SPEC-57 fatia A — `quebra.necessidades`, para cada item citar o propósito
   * que atende. Ausente = documento idêntico ao de antes. */
  necessidades?: Necessidade[];
  /** SPEC-57 fatia C — `quebra.decisoes`, para cada item carregar o porquê do
   * elemento que constrói. */
  decisoes?: Decisao[];
  /** SPEC-57 fatia E — `quebra.percursos`, para cada item dizer de que caminho
   * o componente dele participa. */
  percursos?: Percurso[];
  /** SPEC-58 fatia 2 — as seções que a pessoa escreveu. A máquina nunca as
   * sobrescreve; aqui elas só entram no texto montado. */
  tradeOffs?: string;
  riscos?: string;
  /** §242 — `quebra.excecoes`. Entram como decisões DERIVADAS (nunca
   * persistidas em duplicata): contrariar o padrão de propósito é decisão, e
   * quem lê a spec precisa dela junto das outras, não numa seção à parte. */
  excecoes?: ExcecaoDePadrao[];
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
/**
 * SPEC-57 fatia E (M8) — de que CAMINHOS o componente deste item participa, e
 * que régua vale sobre cada um.
 *
 * Por que isto entra na spec e não fica só no placar: saber que um serviço está
 * num caminho síncrono com orçamento de 2s **muda como ele é escrito**. Quem
 * implementa lendo só a ficha do componente não tem como saber disso — o
 * orçamento não está em nenhum campo dele, está na soma.
 *
 * Só caminhos CONFIRMADOS, pela regra 2: citar um palpite do motor num
 * documento que vai para fora seria dar a ele um peso que ele não tem.
 */
function percursosDoItem(
  atividade: Atividade,
  diagrama: Diagrama,
  config: DiagramaConfig,
  opcoes: OpcoesGerarEspecificacao
): { rotulo: string; regra?: string }[] {
  const elemento = atividade.origem.nodeId ?? atividade.origem.edgeId;
  if (!elemento) return [];

  const confirmados = percursosQueContam(opcoes.percursos ?? []).filter((p) => p.nos.includes(elemento));
  if (confirmados.length === 0) return [];

  const { violacoes } = avaliarPercursos(diagrama, config, confirmados, opcoes.regras);

  return confirmados.map((p) => {
    // A violação, quando existe, é a informação mais útil: ela diz que o
    // caminho JÁ está fora, e não só que existe uma régua sobre ele.
    const fora = violacoes.find((v) => v.percursoId === p.id);
    return {
      rotulo: p.rotulo,
      regra: fora ? `fora do padrão: ${fora.texto} (esperado ${fora.esperado}, está ${fora.atual})` : undefined,
    };
  });
}

export function gerarEspecificacaoEntrega(
  atividades: Atividade[],
  diagrama: Diagrama,
  config: DiagramaConfig,
  opcoes: OpcoesGerarEspecificacao = {}
): string {
  let template = opcoes.template ?? TEMPLATE_ESPECIFICACAO_PADRAO;
  const titulo = opcoes.titulo ?? "Especificação de solução";

  const todosOsTimes = new Set<string>();
  for (const a of atividades) {
    for (const t of a.timesEnvolvidos ?? []) {
      if (t !== opcoes.time) todosOsTimes.add(t);
    }
  }
  const partesContexto: string[] = [];
  if (opcoes.contextoDoProduto?.trim()) partesContexto.push(opcoes.contextoDoProduto.trim());
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
            renderizarItemEspecificacao(
              i + 1,
              a,
              diagrama,
              config,
              opcoes.regras,
              opcoes.respostasItens?.[a.chave],
              opcoes.templateItem,
              opcoes.necessidades,
              [...(opcoes.decisoes ?? []), ...excecoesComoDecisoes(opcoes.excecoes)],
              percursosDoItem(a, diagrama, config, opcoes)
            )
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

  // SPEC-58 fatia 4 — as decisões por inteiro, uma vez, antes dos itens. As
  // exceções entram junto (§242): contrariar o padrão de propósito é decisão,
  // e separá-las faria quem lê tratar as duas como coisas diferentes.
  const decisoesDoDocumento = [
    ...decisoesVigentes(opcoes.decisoes ?? []),
    ...excecoesComoDecisoes(opcoes.excecoes),
  ]
    .map(descreverDecisao)
    .join("\n\n");

  const valores: Record<(typeof VARIAVEIS_ESPECIFICACAO)[number], string> = {
    titulo,
    contexto,
    historiaPo,
    decisoes: decisoesDoDocumento,
    // Vazias somem com a seção (`aplicarTemplate` já cuida): quem nunca
    // escreveu nada continua recebendo o documento de antes.
    tradeOffs: opcoes.tradeOffs?.trim() ?? "",
    riscos: opcoes.riscos?.trim() ?? "",
    itens,
    definitionOfReady,
    definitionOfDone,
  };

  // SPEC-58 — seção nova que veio vazia sai do template inteira. Sem isto,
  // uma demanda sem decisão sairia com "## Decisões" seguido de nada, que é
  // exatamente o ruído que o §188 mandou tirar do documento — e ele pesa
  // ainda mais aqui, porque quem lê é quem nunca abriu a ferramenta.
  for (const nome of ["decisoes", "tradeOffs", "riscos"] as const) {
    if (!valores[nome].trim()) template = removerSecaoDaVariavel(template, nome);
  }

  REGEX_VARIAVEL.lastIndex = 0;
  return template
    .replace(REGEX_VARIAVEL, (match, nome: string) =>
      nome in valores ? valores[nome as (typeof VARIAVEIS_ESPECIFICACAO)[number]] : match
    )
    .replace(/\n{3,}/g, "\n\n");
}
