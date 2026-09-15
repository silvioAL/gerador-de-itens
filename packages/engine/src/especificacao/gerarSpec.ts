import type { Atividade } from "../model/types.js";
import type { SpecEscrita } from "../model/types.js";
import { MARCADOR_ESPECIFICAR } from "../refinamento/gerarRefinamento.js";
import {
  derivarSecoesDeJulgamento,
  titulosDasDecisoesQueValem,
  type MaterialDeJulgamento,
} from "./derivarJulgamento.js";

/**
 * SPEC-80 fatias B e D — **a spec de SDD como artefato do motor.**
 *
 * ## Por que um módulo, e não mais um template do documento
 *
 * O documento de solução responde *"o que vamos construir, e por quê"*. Uma
 * spec responde *"o que vamos construir, o que NÃO vamos, e como saberemos que
 * ficou pronto"* — e as duas perguntas do meio não têm onde morar no documento.
 *
 * A SPEC-75 §2.2 nomeou duas delas (recusas e fatias com prova); a escrita da
 * SPEC-80 acrescentou a terceira (a origem). As três têm o mesmo traço, e é ele
 * que organiza este arquivo inteiro: **carregam julgamento.**
 *
 * ## A régua da fatia D, e ela é estrutural
 *
 * > *"As seções que carregam julgamento — a origem, as recusas, a régua — não
 * > podem ser escritas pelo modelo."* (SPEC-75 §2.3, repetida na SPEC-80 §2)
 *
 * Não é preferência de estilo: uma spec com aparência de spec deste repositório
 * e conteúdo plausível-mas-vazio é **pior que nenhuma**, porque custa a leitura
 * de alguém e carrega autoridade que não merece.
 *
 * Aqui isso vira mecânica, não recomendação: as seções de julgamento saem do
 * `SpecEscrita` — escrito por gente — ou saem com o marcador da SPEC-73, e a
 * lacuna entra na conta. **Não existe caminho por onde uma resposta de modelo
 * chegue a elas**, e `gerarSpec.trava.test.ts` é o que impede esse caminho de
 * aparecer depois.
 */

/**
 * O conjunto FECHADO, como o do documento (SPEC-14 §7) e pelo mesmo motivo:
 * template é configurável, mas variável que o motor não sabe preencher sai como
 * texto literal no artefato — e ninguém descobre até ler o que foi publicado.
 */
export const VARIAVEIS_SPEC = [
  "titulo",
  /** SPEC-119 fatia C — o contrato de leitura, três linhas, antes de tudo. */
  "abertura",
  "origem",
  "contexto",
  "medicao",
  /** SPEC-119 fatia A — as decisões pelo lado POSITIVO: o que usar, e por quê. */
  "decisoes",
  "recusas",
  "fatias",
  "itens",
  /** SPEC-119 fatia E — as restrições repetidas no fim, condensadas. */
  "fechamento",
] as const;

export type VariavelSpec = (typeof VARIAVEIS_SPEC)[number];

/**
 * As que o modelo não escreve. É a lista que a fatia D guarda, e ela mora
 * aqui — ao lado do gerador que a respeita — em vez de num teste, para que
 * quem acrescentar uma seção de julgamento tenha que passar por este arquivo.
 *
 * **SPEC-119 fatia A acrescentou `decisoes`, e ela pertence aqui pelo mesmo
 * motivo que `recusas`:** as duas saem da MESMA `Decisao` aceita — uma pelo
 * lado escolhido, outra pelo descartado. Deixar a escolhida de fora abriria,
 * para o lado positivo, exatamente o caminho que a fatia D fecha para o
 * negativo — e com mais consequência: um modelo escrevendo *"use Fila"* manda
 * na implementação, enquanto *"síncrono ficou fora"* só a limita.
 */
export const SECOES_DE_JULGAMENTO = ["origem", "decisoes", "recusas", "fatias"] as const satisfies readonly VariavelSpec[];

export type SecaoDeJulgamento = (typeof SECOES_DE_JULGAMENTO)[number];

/** O que se perde quando a variável não está no template — a mesma mecânica de
 * `CONSEQUENCIA_DA_AUSENCIA`, e a mesma razão: borda e tela dizem a MESMA frase. */
const CONSEQUENCIA_DA_AUSENCIA_SPEC: Record<VariavelSpec, string> = {
  titulo: "a spec sai sem título",
  abertura: "a spec chega ao agente de código sem dizer o que fazer com ela — e ele decide sozinho o que é tarefa",
  origem: "a spec sai sem dizer quem pediu — e daqui a seis meses ninguém sabe se ela responde ao que foi pedido",
  contexto: "a spec sai sem o contexto do produto e da demanda",
  medicao: "a spec sai sem o que o motor mediu — e vira opinião com aparência de apuração",
  decisoes: "a spec sai sem as restrições já decididas — e quem implementa escolhe de novo o que já tinha dono",
  recusas: "a spec sai sem o que NÃO entra, e recusa que não está escrita não existe",
  fatias: "a spec sai SEM as fatias — e uma spec sem fatia com prova é uma lista de desejos",
  itens: "a spec sai sem os itens que ela cobre, e ninguém sabe o que ela especifica",
  fechamento: "as restrições ficam só no meio do documento — que é onde a atenção de um modelo cai (SPEC-119 §3.1)",
};

/**
 * SPEC-119 fatia B — **cada seção declara o que ela OBRIGA.**
 *
 * O §3.7 mediu a falta: nada na spec de hoje diz que `recusas` é inegociável e
 * que `contexto` é pano de fundo. Um agente de código que não sabe a força de
 * cada seção trata todas igual — e a primeira coisa que ele faz com uma lista
 * de problemas (`medicao`) é tentar resolvê-los, que é literalmente aquilo
 * para que ele foi treinado (§3.2).
 */
export type ForcaDaSecao = "restricao" | "escopo" | "diagnostico" | "contexto";

const ROTULO_DA_FORCA: Record<ForcaDaSecao, string> = {
  restricao: "Restrição",
  escopo: "Escopo",
  diagnostico: "Diagnóstico",
  contexto: "Contexto",
};

/**
 * A moldura viaja NO TEXTO, e não no template — e a escolha é deliberada.
 *
 * O template é configurável (SPEC-80), e uma casa que já customizou o dela
 * perderia a marcação de força em silêncio se ela morasse lá. É o que a
 * SPEC-119 §6.4 cobra ao contrário: variável nova avisa, mas régua do produto
 * não fica à mercê de um template antigo.
 *
 * `titulo`, `abertura` e `fechamento` ficam de fora: são a moldura, não seções.
 */
const MOLDURA_DA_SECAO: Partial<Record<VariavelSpec, { forca: ForcaDaSecao; frase: string }>> = {
  decisoes: {
    forca: "restricao",
    frase: "cada linha já foi decidida por gente. Implemente dentro dela; não reabra a escolha.",
  },
  recusas: {
    forca: "restricao",
    frase: "o que está listado aqui está FORA. Não implemente, não sugira, não deixe preparado.",
  },
  fatias: {
    forca: "escopo",
    frase: "é isto que há para construir, e é por isto que se prova que terminou.",
  },
  itens: {
    forca: "escopo",
    frase: "os itens que esta spec cobre. O que não está aqui não é desta spec.",
  },
  contexto: {
    forca: "contexto",
    frase: "pano de fundo do produto e da demanda. Orienta; não obriga.",
  },
  // SPEC-119 §3.3 — a origem é rastreabilidade, e um agente a lê como pedido
  // literal. A frase precisa dizer que o pedido JÁ foi traduzido.
  origem: {
    forca: "contexto",
    frase:
      "as palavras de quem pediu, para conferência. O pedido já foi traduzido nos itens desta spec — não o implemente outra vez.",
  },
  // SPEC-119 §3.2 — sem esta linha a lista de apontamentos vira escopo
  // fantasma.
  medicao: {
    forca: "diagnostico",
    frase: "é o que o motor apurou sobre o desenho. Não é tarefa — a menos que apareça como item desta spec.",
  },
};

function comMoldura(variavel: VariavelSpec, corpo: string): string {
  const moldura = MOLDURA_DA_SECAO[variavel];
  if (!moldura) return corpo;
  return `> **${ROTULO_DA_FORCA[moldura.forca]}.** ${moldura.frase}\n\n${corpo}`;
}

/**
 * Duas obrigatórias, e as duas por motivos diferentes.
 *
 * `fatias` porque é o corpo — é o análogo de `{{itens}}` no documento, e sem ela
 * não sobra spec. `recusas` porque é a única seção cuja ausência **muda o que a
 * spec afirma**: uma spec sem recusas se lê como "tudo cabe", e é exatamente o
 * modo como uma spec vira lista de desejos.
 */
export const VARIAVEIS_OBRIGATORIAS_SPEC = ["fatias", "recusas"] as const;

const REGEX_VARIAVEL = /\{\{(\w+)\}\}/g;

/**
 * SPEC-119 fatia E — **a ordem muda, e o motivo não é estético.**
 *
 * O §3.1 mediu: `O que NÃO entra` é a seção mais valiosa para um agente de
 * código e estava na posição 4 de 6. Modelos degradam atenção no meio de
 * contextos longos; o que obriga funciona cedo **e repetido no fim**.
 *
 * A ordem nova é a ordem em que quem vai escrever código precisa das coisas:
 *
 * 1. o contrato de leitura — o que fazer com este documento
 * 2. o que OBRIGA — decisões e recusas
 * 3. o que CONSTRUIR — fatias e itens
 * 4. o que orienta sem obrigar — contexto, origem, medição
 * 5. as restrições outra vez, condensadas
 *
 * **O humano não some desta conta.** A spec é revisada por gente antes de subir
 * (SPEC-80 §2), e é dessa revisão que ela tira autoridade — por isso a moldura
 * é de UMA linha por seção, e não um preâmbulo de instruções ao modelo
 * (SPEC-119 §4).
 */
export const TEMPLATE_SPEC_PADRAO = `# {{titulo}}

{{abertura}}

## Decisões que restringem
{{decisoes}}

## O que NÃO entra
{{recusas}}

## Fatias
{{fatias}}

## Itens que esta spec cobre
{{itens}}

## Contexto
{{contexto}}

## Origem
{{origem}}

## O que foi medido
{{medicao}}

---

{{fechamento}}
`;

export function extrairVariaveisSpec(template: string): string[] {
  const encontradas = new Set<string>();
  let m: RegExpExecArray | null;
  REGEX_VARIAVEL.lastIndex = 0;
  while ((m = REGEX_VARIAVEL.exec(template))) encontradas.add(m[1]);
  return [...encontradas];
}

export interface ProblemasDoTemplateSpec {
  erros: string[];
  avisos: string[];
}

/** SPEC-80 fatia B — a validação única, no molde de `problemasDoTemplate`. A
 * borda recusa por `erros` e só avisa pelo resto: template enxuto é escolha
 * legítima, mas dita em voz alta (SPEC-73 §7.3). */
export function problemasDoTemplateSpec(template: string): ProblemasDoTemplateSpec {
  const erros: string[] = [];
  const avisos: string[] = [];
  const validas: readonly string[] = VARIAVEIS_SPEC;

  for (const v of extrairVariaveisSpec(template).filter((x) => !validas.includes(x))) {
    erros.push(
      `{{${v}}} não existe — o motor não sabe preenchê-la (válidas: ${VARIAVEIS_SPEC.map((x) => `{{${x}}}`).join(", ")})`
    );
  }

  const usadas = extrairVariaveisSpec(template);
  for (const v of VARIAVEIS_SPEC) {
    if (usadas.includes(v)) continue;
    const frase = `sem {{${v}}}, ${CONSEQUENCIA_DA_AUSENCIA_SPEC[v]}`;
    if ((VARIAVEIS_OBRIGATORIAS_SPEC as readonly string[]).includes(v)) erros.push(frase);
    else avisos.push(frase);
  }

  return { erros, avisos };
}

export interface CoberturaDaSpec {
  /** As atividades que a spec declara cobrir, e que existem no desenho. */
  cobertas: Atividade[];
  /** Derivadas hoje e que nenhuma spec cobre — a lacuna do lado do item. */
  descobertas: Atividade[];
  /**
   * Chaves que a spec declara e que **não existem mais**: o item foi removido
   * do desenho, ou rederivado com outra chave.
   *
   * É a única das três que ninguém pensa em olhar, e a que envelhece pior — a
   * spec continua parecendo completa enquanto aponta para o vazio. É o mesmo
   * defeito que o §315 acabou de consertar no tour, do lado do documento.
   */
  orfas: string[];
}

/**
 * SPEC-80 fatia C — quem cobre o quê, calculado e não digitado.
 *
 * Função pura, e no engine, pela razão de sempre (§263): a tela, a conta de
 * lacunas e a geração da spec precisam da MESMA resposta, e três leituras da
 * mesma pergunta divergem na primeira mudança.
 */
export function coberturaDaSpec(atividades: Atividade[], escrita?: SpecEscrita): CoberturaDaSpec {
  const declaradas = new Set(escrita?.itensCobertos ?? []);
  const existentes = new Set(atividades.map((a) => a.chave));

  return {
    cobertas: atividades.filter((a) => declaradas.has(a.chave)),
    descobertas: atividades.filter((a) => !declaradas.has(a.chave)),
    orfas: [...declaradas].filter((c) => !existentes.has(c)),
  };
}

export interface OpcoesGerarSpec {
  titulo?: string;
  template?: string;
  /** O que a pessoa escreveu. As seções de julgamento saem daqui ou não saem. */
  escrita?: SpecEscrita;
  /** Contexto do produto + da demanda, já montado — o mesmo texto do documento. */
  contexto?: string;
  /** O que o motor mediu: apontamentos, lacunas, o que contraria padrão. */
  medicao?: string[];
  /**
   * As atividades derivadas da demanda. Quais delas a spec cobre sai de
   * `escrita.itensCobertos` via `coberturaDaSpec` — quem chama passa TUDO e o
   * motor decide, em vez de cada tela filtrar do seu jeito.
   */
  itens?: Atividade[];
  /**
   * SPEC-115 (§410) — **o material já decidido, de onde as seções de julgamento
   * saem quando ninguém as escreveu à mão.**
   *
   * Ausente = comportamento de antes, byte a byte: seção vazia vira lacuna. Quem
   * não tem decisão aceita nem necessidade confirmada continua vendo a mesma
   * spec que via.
   *
   * O que chega aqui NÃO vem do modelo. Vem de `Decisao` que alguém aceitou, de
   * `Necessidade` confirmada e dos itens que o desenho produziu — e é essa
   * procedência que mantém a trava da fatia D de pé com a derivação ligada.
   */
  julgamento?: MaterialDeJulgamento;
  /**
   * SPEC-119 fatia F — **onde está o CORPO do item, em relação a esta spec.**
   *
   * Ausente = `"fora"`, que é a leitura conservadora: um arquivo baixado não
   * carrega o item junto. Quem anexa ao issue que o item já criou (SPEC-114)
   * declara `"mesmo-issue"` — e aí a spec pode AFIRMAR onde estão os critérios
   * de aceite, em vez de apontar para "a seção dele" e torcer.
   */
  corpoDoItem?: LugarDoCorpoDoItem;
}

/**
 * SPEC-119 fatia F — onde o corpo do item vive em relação a esta spec.
 *
 * O §3.4 achou um ponteiro pendurado: as fatias derivadas dizem *"Prova: os
 * critérios de aceite deste item, na seção dele"*, e isso pressupõe que o corpo
 * do item viaja junto. Viaja no caminho da SPEC-114 (a spec se anexa ao issue
 * que o item já criou) e **não** viaja no markdown que alguém baixa.
 *
 * O produto sabe qual dos dois é. Passar a dizer é o que transforma suposição
 * em garantia: um ponteiro afirmado é conferível, enquanto um implícito aponta
 * para lugar nenhum no dia em que a suposição deixa de valer.
 */
export type LugarDoCorpoDoItem = "mesmo-issue" | "fora";

/**
 * A seção de julgamento vazia **não vira texto de modelo, nem some**: vira
 * lacuna contável.
 *
 * Some seria pior que vazio — o §311 mediu exatamente isso: lacuna que o
 * documento entrega sem marcador não entra em conta nenhuma, e a pessoa aprova
 * um artefato incompleto sem nada acusar.
 */
function secaoDeJulgamento(texto: string | undefined, oQuePedir: string, derivado?: string): string {
  const escrito = texto?.trim();
  if (escrito) return escrito;
  /**
   * SPEC-115 (§410) — **o derivado entra ANTES da lacuna, e depois do que uma
   * pessoa escreveu.**
   *
   * A ordem é a regra inteira. Texto de gente vence sempre (SPEC-58 regra 3: o
   * julgamento de alguém não é sobrescrito por motor nenhum). Na ausência dele,
   * o que o produto JÁ SABE — porque alguém já decidiu — vale mais que uma
   * caixa em branco cobrando que a mesma pessoa redigite aquilo.
   *
   * E a lacuna continua existindo para o caso que ela nomeia: quando não há de
   * onde derivar, ninguém decidiu nada, e a spec precisa dizer isso em vez de
   * inventar.
   *
   * **A trava da SPEC-80 fatia D continua valendo, e não por cortesia:** o que
   * chega aqui como `derivado` saiu de `Decisao` aceita, de necessidade
   * confirmada e de item derivado do desenho — tudo material que passou por uma
   * pessoa. O modelo nunca escreve nestas três seções; ele propõe decisões, e
   * proposta não aceita não deriva nada (ver `derivarJulgamento.ts`).
   */
  const doMotor = derivado?.trim();
  if (doMotor) return doMotor;
  return `_(${oQuePedir})_ ${MARCADOR_ESPECIFICAR}`;
}

const PEDIDO_DA_SECAO: Record<SecaoDeJulgamento, string> = {
  origem: "quem pediu, e com que palavras",
  decisoes: "o que já foi decidido, e por quê",
  recusas: "o que NÃO entra, e por quê",
  fatias: "o que fica verdade em cada fatia, e como se prova",
};

/**
 * SPEC-119 fatia C — **o contrato de leitura, três linhas.**
 *
 * O §3.5 mediu a falta e estimou o retorno: *"três linhas de abertura custam
 * quase nada e mudam o comportamento mais que qualquer reorganização"*. É a
 * única parte deste arquivo escrita para o leitor que não é gente, e ela cabe
 * em três linhas exatamente porque a spec continua sendo revisada por quem é.
 *
 * A terceira linha é a **fatia F**: onde estão os critérios de aceite. O §3.4
 * achou um ponteiro pendurado — as fatias dizem *"na seção dele"* presumindo
 * que o corpo do item viaja junto. Viaja no caminho da SPEC-114 e não viaja no
 * markdown que alguém baixa, e o produto sabe qual dos dois é. Dizer é o que
 * transforma suposição em garantia.
 */
function aberturaDaSpec(lugar: LugarDoCorpoDoItem): string {
  const ondeEstaOAceite =
    lugar === "mesmo-issue"
      ? "Os critérios de aceite de cada item estão no corpo do issue ao qual esta spec está anexada — leia-o antes de começar."
      : "Os critérios de aceite de cada item estão no corpo do item, que NÃO viaja neste arquivo — busque-o antes de começar.";

  return [
    "> **Como ler esta spec.** Você vai implementar os itens listados em *Itens que esta spec cobre* — só eles.",
    "> As seções marcadas **Restrição** são inegociáveis; o que está em *O que NÃO entra* está fora do escopo, mesmo que pareça fácil.",
    `> ${ondeEstaOAceite}`,
  ].join("\n");
}

/**
 * SPEC-119 fatia E — **as restrições outra vez, no fim, condensadas.**
 *
 * Não é repetição por ênfase: é o §3.1 aplicado. O que obriga funciona cedo e
 * repetido no fim, e o meio de um contexto longo é onde a atenção cai.
 *
 * Condensadas, e a palavra carrega peso: aqui vão os TÍTULOS das decisões e um
 * ponteiro para a seção das recusas — nunca o texto delas. Duas cópias do mesmo
 * conteúdo divergem no primeiro que alguém editar (§323), e a spec passaria a
 * dizer duas coisas sobre a mesma restrição.
 */
function fechamentoDaSpec(titulos: string[]): string {
  const decisoes =
    titulos.length > 0
      ? `${titulos.length === 1 ? "1 decisão restringe" : `${titulos.length} decisões restringem`} esta implementação (${titulos.join("; ")})`
      : "nenhuma decisão foi registrada para esta demanda";

  return `> **Antes de abrir o PR, releia as restrições.** ${decisoes}; e o que está em *O que NÃO entra* continua fora do escopo.`;
}

/**
 * Gera a spec. Determinística, como todo o resto do motor: a mesma entrada
 * produz sempre o mesmo texto, e é isso que permite comparar o antes e o depois
 * de uma mudança.
 */
export function gerarSpec(opcoes: OpcoesGerarSpec = {}): string {
  const template = opcoes.template ?? TEMPLATE_SPEC_PADRAO;

  const cobertura = coberturaDaSpec(opcoes.itens ?? [], opcoes.escrita);
  const linhas = cobertura.cobertas.map((a, i) => `${i + 1}. ${a.rotulo}`);
  // A chave órfã entra NA LISTA, marcada. Escondê-la deixaria a spec parecendo
  // completa enquanto aponta para item que não existe mais — ver `CoberturaDaSpec`.
  for (const chave of cobertura.orfas) {
    linhas.push(`- ~~${chave}~~ — este item não existe mais no desenho ${MARCADOR_ESPECIFICAR}`);
  }
  const itens = linhas.join("\n");
  const medicao = (opcoes.medicao ?? []).map((m) => `- ${m}`).join("\n");

  /**
   * SPEC-115 (§410) — a derivação enxerga os itens que a spec REALMENTE cobre,
   * não tudo que foi passado. Uma spec recortada para um item só (SPEC-114
   * §2.2) que listasse as fatias da demanda inteira descreveria um escopo que
   * ela não tem.
   */
  const derivado = opcoes.julgamento
    ? derivarSecoesDeJulgamento({
        ...opcoes.julgamento,
        itens: cobertura.cobertas,
        // SPEC-119 fatia F — quem gera declara onde o corpo do item está, e a
        // derivação das fatias escreve a prova de acordo. O default é o mesmo
        // dos dois lados ("fora"), para não haver duas leituras da mesma
        // pergunta (§263).
        corpoDoItem: opcoes.corpoDoItem ?? "fora",
      })
    : {};

  const cru: Record<VariavelSpec, string> = {
    titulo: opcoes.titulo ?? "Spec",
    abertura: aberturaDaSpec(opcoes.corpoDoItem ?? "fora"),
    origem: secaoDeJulgamento(opcoes.escrita?.origem, PEDIDO_DA_SECAO.origem, derivado.origem),
    contexto: opcoes.contexto?.trim() || "_Sem contexto adicional informado._",
    // `medicao` NÃO é seção de julgamento: ela é derivada do que o motor já
    // calculou. Vazia significa "o motor não apontou nada", que é uma afirmação
    // legítima — e por isso não leva marcador.
    medicao: medicao || "_O motor não apontou nada neste desenho._",
    decisoes: secaoDeJulgamento(opcoes.escrita?.decisoes, PEDIDO_DA_SECAO.decisoes, derivado.decisoes),
    recusas: secaoDeJulgamento(opcoes.escrita?.recusas, PEDIDO_DA_SECAO.recusas, derivado.recusas),
    fatias: secaoDeJulgamento(opcoes.escrita?.fatias, PEDIDO_DA_SECAO.fatias, derivado.fatias),
    // Spec órfã é afirmação, não vazio: ela diz que ninguém sabe o que esta
    // spec especifica, e a SPEC-80 §3 chama isso de lacuna.
    itens: itens || `_(nenhum item vinculado)_ ${MARCADOR_ESPECIFICAR}`,
    /**
     * O fechamento cita os títulos das decisões ACEITAS, e não o que está
     * escrito na seção. São duas coisas diferentes de propósito: quem escreveu
     * a seção à mão pode ter escrito qualquer coisa, e o que se repete no fim é
     * o que o produto SABE que foi decidido.
     */
    fechamento: fechamentoDaSpec(titulosDasDecisoesQueValem(opcoes.julgamento?.decisoes ?? [])),
  };

  // SPEC-119 fatia B — a força de cada seção entra aqui, num lugar só, depois
  // de o conteúdo estar resolvido. Espalhá-la pelas linhas acima faria uma
  // seção nova nascer sem moldura e ninguém notar.
  const valores = Object.fromEntries(
    VARIAVEIS_SPEC.map((v) => [v, comMoldura(v, cru[v])])
  ) as Record<VariavelSpec, string>;

  return template.replace(REGEX_VARIAVEL, (bruto, nome: string) =>
    nome in valores ? valores[nome as VariavelSpec] : bruto
  );
}
