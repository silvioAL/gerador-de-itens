import { ESTAGIOS_DO_CICLO, type EstadoDoEstagio } from "./ciclo";

/**
 * SPEC-83 fatias C e D — **os conceitos da landing, como DADO.**
 *
 * ## Por que dado, e não prosa nos componentes
 *
 * Mesma razão do `ciclo.ts`, e ela já se provou duas vezes: régua escrita em
 * prosa envelhece calada. Escrita como dado, ela é conferível — e a fatia F
 * cruza estas listas com o produto de verdade.
 *
 * O caso mais grave está nas **conexões**: quase nenhuma existe hoje. Desenhar
 * cinco setas acesas seria a maior promessa falsa que esta página já teria
 * feito, e é exatamente o que a régua da SPEC-76 proíbe. Por isso elas carregam
 * a MESMA marca dos estágios do ciclo.
 *
 * > E aqui a máquina de marcação, que ficaria sem uso quando os 13 estágios
 * > ficassem verdes, ganha o segundo cliente — num diagrama em que as marcas
 * > voltam a ser variadas, que é onde ela comunica.
 */

/**
 * A evolução do trabalho com IA. Três estágios, e o produto se posiciona no
 * terceiro.
 *
 * Não é história da tecnologia: é o argumento de por que a ferramenta existe.
 * O estágio 2 é **progresso real** e está escrito como tal — uma página que
 * tratasse agente e skill como erro perderia exatamente o leitor que já os usa,
 * que é o leitor que ela quer.
 */
export interface EstagioDaEvolucao {
  numero: 1 | 2 | 3;
  titulo: string;
  oQuePersiste: string;
  oQueFalta?: string;
  /** Verdadeiro no estágio em que este produto opera. */
  aqui?: boolean;
}

export const EVOLUCAO: EstagioDaEvolucao[] = [
  {
    numero: 1,
    titulo: "O prompt",
    oQuePersiste: "Nada. Cada conversa recomeça do zero.",
    oQueFalta: "Não é reaproveitável e não é conferível.",
  },
  {
    numero: 2,
    titulo: "O agente, a skill, o arquivo de instrução",
    oQuePersiste: "A instrução. É onde a maior parte das organizações está, e é progresso real.",
    oQueFalta:
      "Continua sendo texto dizendo ao modelo o que fazer: não mede nada, não deriva nada, e nada do que afirma é conferível. Dois agentes que se contradizem não acusam o conflito — os dois respondem com confiança.",
  },
  {
    numero: 3,
    titulo: "A camada",
    oQuePersiste:
      "A régua. Tipos, campos obrigatórios, medidas com número, checklists por contexto, templates versionados — dado consultável, não texto. O agente opera dentro dela.",
    aqui: true,
  },
];

/**
 * As quatro camadas. A ordem é de fora para dentro, e a IA fica no fim porque é
 * onde ela está no diagrama: no meio, tocando todas, contida por todas.
 */
export interface Camada {
  id: string;
  titulo: string;
  oQueE: string;
  ondeVive: string;
  /** A de apontamentos é a única que não se guarda — e é a que explica o produto. */
  destaque?: string;
}

export const CAMADAS: Camada[] = [
  {
    id: "perene",
    titulo: "Perene",
    oQueE:
      "O que não muda a cada demanda: contexto do produto, padrões por tecnologia, checklists de processo, réguas, templates, design system.",
    ondeVive: "as áreas de configuração, versionadas, com PDCA",
  },
  {
    id: "demanda",
    titulo: "Da demanda",
    oQueE: "O que é desta vez: o desenho, o volume declarado, os ensaios, as decisões e o que foi recusado.",
    ondeVive: "a quebra",
  },
  {
    id: "apontamentos",
    titulo: "Apontamentos",
    oQueE:
      "O que o motor calcula: prontidão, lacunas contáveis, itens derivados, o que contraria padrão, o que estoura régua.",
    ondeVive: "nunca digitada — e some quando a causa some",
    destaque:
      "É a camada que ninguém desenha e a que explica o produto: ela não é guardada como verdade, é recalculada. Por isso o mesmo desenho dá sempre os mesmos itens, e por isso discordar de um apontamento é mudar uma regra — não apagar uma linha.",
  },
  {
    id: "ia",
    titulo: "IA generativa",
    oQueE: "Escreve o texto dentro do que as três acima determinam.",
    ondeVive: "contida, e nada dela conta antes da confirmação",
  },
];

/**
 * As bordas: o que entra e o que sai, e em que estado cada caminho está.
 *
 * `estado` usa exatamente o mesmo vocabulário do ciclo — e não por economia de
 * tipo: é a mesma pergunta ("isto existe?") feita sobre outra coisa, e responder
 * com duas escalas diferentes obrigaria quem lê a aprender duas legendas.
 */
export interface Conexao {
  id: string;
  /** `entra` alimenta a camada perene ou o desenho; `sai` leva o que se produziu. */
  sentido: "entra" | "sai";
  titulo: string;
  detalhe: string;
  estado: EstadoDoEstagio;
  /**
   * SPEC-90 — **em que estágio do ciclo este salto acontece.**
   *
   * É o que faltava para o diagrama de fluxo poder desenhar o desvio no ponto
   * certo, em vez de listar os caminhos ao lado. Aponta para um `id` de
   * `ESTAGIOS_DO_CICLO`, e há teste que falha se o estágio não existir — uma
   * conexão que aponta para o vazio é um caminho que a página promete e o
   * produto não tem.
   */
  noEstagio: string;
  oQueFalta?: string;
}

export const CONEXOES: Conexao[] = [
  {
    id: "adr-entra",
    noEstagio: "desenho",
    sentido: "entra",
    titulo: "ADRs da casa",
    detalhe:
      "As decisões que já foram tomadas entram pela conversa, como texto editável — do mesmo jeito que a voz entra. A pessoa lê antes de enviar, e o que veio de fora chega marcado como importado. A decisão nasce ancorada no desenho que ela ajudou a criar, nunca solta.",
    /**
     * SPEC-85 §0.4 — **deixou de ser `parcial`.**
     *
     * Dizia *"falta a tela para importar"* e continuou dizendo isso depois de o
     * §325 entregar a tela e o §326 entregar a importação pela conversa. A trava
     * da SPEC-84 fatia C cobrava `ESTAGIOS_DO_CICLO`; esta lista mora no arquivo
     * vizinho, e ninguém a vigiava.
     */
    estado: "completo",
  },
  {
    id: "arquitetura-entra",
    noEstagio: "contexto",
    sentido: "entra",
    titulo: "Arquitetura de negócio",
    detalhe: "Objetivo, regras permanentes, sistemas e restrições vindos de onde a casa já os guarda.",
    estado: "ausente",
    /**
     * SPEC-85 fatia B — a frase passou a citar o § que responde por ela.
     *
     * *"Avaliado e adiado"* era exatamente o tipo de frase que não envelhece:
     * continua plausível para sempre, inclusive depois de falsa. É a mesma
     * lição do §327, aplicada à lista vizinha.
     *
     * (E aqui é preciso ser exato: o §324 entregou a PORTA — ler a arquitetura
     * de negócio da casa por gateway, com proposta campo a campo. O que não
     * existe é o caminho de entrada automático, porque depende de a organização
     * guardar isso em formato legível, e disso não temos medição.)
     */
    oQueFalta:
      "O §324 entregou a leitura por gateway e a proposta campo a campo. O que falta é a casa ter isso em formato legível — e disso não temos medição.",
  },
  {
    id: "itens-sai",
    noEstagio: "itens",
    sentido: "sai",
    titulo: "Itens → issue tracker",
    detalhe:
      "Os itens prontos sobem para o tracker da casa por um endereço configurável. O gerador não implementa Jira: implementar um tracker seria escolher o tracker de todo mundo.",
    estado: "completo",
  },
  {
    id: "documento-sai",
    noEstagio: "especificacao",
    sentido: "sai",
    titulo: "Documento → base de conhecimento",
    detalhe:
      "A página é atualizada no lugar, diz de onde veio e se o desenho mudou desde então — em vez de virar mais uma cópia que envelhece.",
    estado: "completo",
  },
  {
    id: "spec-sai",
    noEstagio: "specs-para-ia",
    sentido: "sai",
    titulo: "Spec → desenvolvimento com IA",
    detalhe:
      "A spec é o que um agente de código consome direto, com as seções que um documento não tem: a origem, as recusas e as fatias com prova. Ela diz quantas lacunas carrega antes de você baixá-la, e nenhum modelo escreve as três — recusar é decidir.",
    // SPEC-85 §0.4 — deixou de ser `parcial` no §327, que construiu a tela.
    estado: "completo",
  },
];

/** Quantas conexões existem, para a página dizer o número sem contá-lo à mão. */
export function contagemDasConexoes(): { existem: number; total: number } {
  return {
    existem: CONEXOES.filter((c) => c.estado !== "ausente").length,
    total: CONEXOES.length,
  };
}

/**
 * Os títulos que a landing já usa em outro lugar — a fatia F cobra que nenhuma
 * seção nova os repita.
 *
 * O §263 em forma de lista: o custo de repetir já foi medido duas vezes (a tese
 * em quatro lugares no §316, e as cinco etapas da `Jornada` reproduzindo
 * estágios do ciclo).
 */
export function titulosJaContados(): string[] {
  return [
    ...ESTAGIOS_DO_CICLO.map((e) => e.titulo),
    ...CAMADAS.map((c) => c.titulo),
    ...EVOLUCAO.map((e) => e.titulo),
    ...CONEXOES.map((c) => c.titulo),
  ];
}
