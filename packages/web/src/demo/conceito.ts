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
  oQueFalta?: string;
}

export const CONEXOES: Conexao[] = [
  {
    id: "adr-entra",
    sentido: "entra",
    titulo: "ADRs da casa",
    detalhe:
      "As decisões que já foram tomadas entram como contexto e como ponto de partida: um ADR pode virar desenho, e o que veio de fora chega marcado como importado.",
    estado: "parcial",
    oQueFalta: "A porta e o adaptador existem; falta a tela para importar.",
  },
  {
    id: "arquitetura-entra",
    sentido: "entra",
    titulo: "Arquitetura de negócio",
    detalhe: "Objetivo, regras permanentes, sistemas e restrições vindos de onde a casa já os guarda.",
    estado: "ausente",
    oQueFalta: "Avaliado e adiado: depende de a organização ter isso em formato legível, e não medimos.",
  },
  {
    id: "itens-sai",
    sentido: "sai",
    titulo: "Itens → issue tracker",
    detalhe:
      "Os itens prontos sobem para o tracker da casa por um endereço configurável. O gerador não implementa Jira: implementar um tracker seria escolher o tracker de todo mundo.",
    estado: "completo",
  },
  {
    id: "documento-sai",
    sentido: "sai",
    titulo: "Documento → base de conhecimento",
    detalhe:
      "A página é atualizada no lugar, diz de onde veio e se o desenho mudou desde então — em vez de virar mais uma cópia que envelhece.",
    estado: "completo",
  },
  {
    id: "spec-sai",
    sentido: "sai",
    titulo: "Spec → desenvolvimento com IA",
    detalhe:
      "O documento vira instrução executável para um agente de código, com as seções que um documento não tem: a origem, as recusas e as fatias com prova.",
    estado: "parcial",
    oQueFalta: "O artefato existe; falta a tela para escrevê-lo e o vínculo aparecer.",
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
