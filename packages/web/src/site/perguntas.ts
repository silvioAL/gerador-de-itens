/**
 * §350 — **as perguntas que quem chega realmente faz.**
 *
 * ## Origem
 *
 * O usuário, sobre o storytelling do site:
 *
 * > *"uma das coisas que me incomoda é o story telling da landing page: não
 * > comunicamos bem no sentido de demonstrar com perguntas que surgem, como:
 * > onde armazenar a camada perene que agregada ao uso da IA pode melhorar a
 * > qualidade da governança e a produtividade? Que tipo de informação é
 * > necessária? Como construir isso? Quais processos preciso? Como vai funcionar
 * > a governança disso? Considerando que a IA é uma tecnologia não
 * > determinística, como trabalhar a consistência e a evolução técnica entre os
 * > projetos? Quem serão os responsáveis?"*
 *
 * ## Por que isto é dado, e não texto solto na capa
 *
 * Porque **duas destas perguntas o produto ainda não responde**, e a régua da
 * casa é não prometer o que não existe (SPEC-76). Com a lista como dado, cada
 * pergunta aponta para a página que a responde — ou **declara que não há
 * resposta ainda**, e a trava confia nisso.
 *
 * Uma lista escrita à mão na capa envelheceria mentindo no dia em que a
 * governança ganhasse página: alguém acrescentaria a página e esqueceria de
 * mudar a marca. É o mesmo motivo pelo qual o ciclo é dado desde a SPEC-76.
 *
 * ## E por que as perguntas dele, e não as minhas
 *
 * As que o site tinha eram do ponto de vista do produto — *"o que é essa
 * camada?"*, *"o que a ferramenta faz?"*. As dele são do ponto de vista de quem
 * decide adotar: **onde guardo, o que preciso, quem responde por isso**. É a
 * diferença entre explicar o que se construiu e responder o que se perguntou.
 */

export interface PerguntaDeQuemChega {
  /** A pergunta, como alguém a faria em voz alta. */
  texto: string;
  /**
   * O `id` da página que responde — ou `null` quando ainda não há resposta.
   *
   * `null` não é lacuna a esconder: é o que a página mostra, marcado, pela mesma
   * régua dos estágios do ciclo que ainda não existem.
   */
  pagina: string | null;
  /** Quando não há resposta: o que falta, e onde isso está sendo tratado. */
  oQueFalta?: string;
}

export const PERGUNTAS: PerguntaDeQuemChega[] = [
  {
    texto: "Por que a IA que a gente já usa não resolveu isso?",
    pagina: "o-problema",
  },
  {
    texto: "Onde a camada perene fica guardada, e que informação ela precisa ter?",
    pagina: "o-conceito",
  },
  {
    texto: "Como eu construo isso, e por onde começo?",
    pagina: "o-ciclo",
  },
  {
    texto: "Que processos eu preciso ter antes?",
    pagina: "o-ciclo",
  },
  {
    texto: "A IA não é determinística — como manter consistência entre projetos e times?",
    pagina: "o-conceito",
  },
  {
    texto: "E quando eu preciso falar com o que a casa já tem?",
    pagina: "o-percurso",
  },
  {
    texto: "Isso funciona como diz? O que roda onde?",
    pagina: "arquitetura",
  },
  {
    /**
     * Sem resposta, e é a lacuna mais honesta desta lista.
     *
     * A SPEC-94 desenhou a análise crítica e a escala de maturidade; a SPEC-97
     * — a sessão de governança, agrupada por quem responde — **ainda não foi
     * escrita**. Marcar em vez de omitir é a régua da SPEC-76: a página que
     * esconde o que falta é a que envelhece mentindo.
     */
    texto: "Como funciona a governança disso, e quem são os responsáveis?",
    pagina: null,
    oQueFalta:
      "O produto já roteia cada pedido de mudança para quem responde pela área, e mede o ciclo de melhoria. O que falta é a visão que agrupa isso por papel — qualidade, arquitetura, agilidade — em vez de por artefato.",
  },
];
