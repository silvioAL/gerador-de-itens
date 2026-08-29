import type { Atividade } from "../model/types.js";
import type { SpecEscrita } from "../model/types.js";
import { MARCADOR_ESPECIFICAR } from "../refinamento/gerarRefinamento.js";

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
  "origem",
  "contexto",
  "medicao",
  "recusas",
  "fatias",
  "itens",
] as const;

export type VariavelSpec = (typeof VARIAVEIS_SPEC)[number];

/**
 * As três que o modelo não escreve. É a lista que a fatia D guarda, e ela mora
 * aqui — ao lado do gerador que a respeita — em vez de num teste, para que
 * quem acrescentar uma seção de julgamento tenha que passar por este arquivo.
 */
export const SECOES_DE_JULGAMENTO = ["origem", "recusas", "fatias"] as const satisfies readonly VariavelSpec[];

export type SecaoDeJulgamento = (typeof SECOES_DE_JULGAMENTO)[number];

/** O que se perde quando a variável não está no template — a mesma mecânica de
 * `CONSEQUENCIA_DA_AUSENCIA`, e a mesma razão: borda e tela dizem a MESMA frase. */
const CONSEQUENCIA_DA_AUSENCIA_SPEC: Record<VariavelSpec, string> = {
  titulo: "a spec sai sem título",
  origem: "a spec sai sem dizer quem pediu — e daqui a seis meses ninguém sabe se ela responde ao que foi pedido",
  contexto: "a spec sai sem o contexto do produto e da demanda",
  medicao: "a spec sai sem o que o motor mediu — e vira opinião com aparência de apuração",
  recusas: "a spec sai sem o que NÃO entra, e recusa que não está escrita não existe",
  fatias: "a spec sai SEM as fatias — e uma spec sem fatia com prova é uma lista de desejos",
  itens: "a spec sai sem os itens que ela cobre, e ninguém sabe o que ela especifica",
};

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

export const TEMPLATE_SPEC_PADRAO = `# {{titulo}}

## Origem
{{origem}}

## Contexto
{{contexto}}

## O que foi medido
{{medicao}}

## O que NÃO entra
{{recusas}}

## Fatias
{{fatias}}

## Itens que esta spec cobre
{{itens}}
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
}

/**
 * A seção de julgamento vazia **não vira texto de modelo, nem some**: vira
 * lacuna contável.
 *
 * Some seria pior que vazio — o §311 mediu exatamente isso: lacuna que o
 * documento entrega sem marcador não entra em conta nenhuma, e a pessoa aprova
 * um artefato incompleto sem nada acusar.
 */
function secaoDeJulgamento(texto: string | undefined, oQuePedir: string): string {
  const escrito = texto?.trim();
  if (escrito) return escrito;
  return `_(${oQuePedir})_ ${MARCADOR_ESPECIFICAR}`;
}

const PEDIDO_DA_SECAO: Record<SecaoDeJulgamento, string> = {
  origem: "quem pediu, e com que palavras",
  recusas: "o que NÃO entra, e por quê",
  fatias: "o que fica verdade em cada fatia, e como se prova",
};

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

  const valores: Record<VariavelSpec, string> = {
    titulo: opcoes.titulo ?? "Spec",
    origem: secaoDeJulgamento(opcoes.escrita?.origem, PEDIDO_DA_SECAO.origem),
    contexto: opcoes.contexto?.trim() || "_Sem contexto adicional informado._",
    // `medicao` NÃO é seção de julgamento: ela é derivada do que o motor já
    // calculou. Vazia significa "o motor não apontou nada", que é uma afirmação
    // legítima — e por isso não leva marcador.
    medicao: medicao || "_O motor não apontou nada neste desenho._",
    recusas: secaoDeJulgamento(opcoes.escrita?.recusas, PEDIDO_DA_SECAO.recusas),
    fatias: secaoDeJulgamento(opcoes.escrita?.fatias, PEDIDO_DA_SECAO.fatias),
    // Spec órfã é afirmação, não vazio: ela diz que ninguém sabe o que esta
    // spec especifica, e a SPEC-80 §3 chama isso de lacuna.
    itens: itens || `_(nenhum item vinculado)_ ${MARCADOR_ESPECIFICAR}`,
  };

  return template.replace(REGEX_VARIAVEL, (bruto, nome: string) =>
    nome in valores ? valores[nome as VariavelSpec] : bruto
  );
}
