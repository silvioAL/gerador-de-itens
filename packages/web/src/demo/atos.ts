/**
 * SPEC-92 fatia B — **os cinco atos, como DADO.**
 *
 * ## Por que uma lista, e não cinco `<section>` escritas à mão
 *
 * A mesma disciplina que `ciclo.ts` e `conceito.ts` já impõem às peças: a
 * navegação, as âncoras e as travas leem daqui. Uma barra escrita à mão com
 * cinco `<a href>` diverge da página no dia em que alguém renomear uma seção — e
 * diverge **em silêncio**, que é a forma como as duas últimas rodadas da landing
 * envelheceram (§327, §328).
 *
 * Com a lista como fonte, um ato sem seção correspondente derruba a trava no
 * mesmo commit. É a régua "não prometer o que não existe" (SPEC-76) aplicada à
 * navegação: **um item de menu é uma promessa de que há algo do outro lado.**
 *
 * ## Por que CINCO
 *
 * É o que cabe num menu que se lê de uma vez, e o número veio da SPEC-92 §3. Não
 * é medição — é escolha, e está dita como escolha.
 *
 * ## O `nome` é curto e a `pergunta` é longa, e isso é de propósito
 *
 * O menu carrega o nome; a moldura do ato carrega a pergunta. Repetir a pergunta
 * no menu faria uma barra que ninguém lê inteira — e o §323 mediu o que a
 * repetição custa nesta página.
 */
export interface Ato {
  /** A âncora. Sem `#/` na frente: `rotaDoHash` trata `#/...` como rota do app,
   *  e a landing é renderizada ANTES do roteador (SPEC-92 §7.2). */
  id: string;
  /** O rótulo no menu. Curto — cinco deles cabem numa barra. */
  nome: string;
  /** A pergunta que o ato responde. É ela que substitui a prosa de abertura. */
  pergunta: string;
}

export const ATOS: Ato[] = [
  {
    id: "o-problema",
    nome: "O problema",
    pergunta: "Por que a IA que você já tem não basta?",
  },
  {
    id: "a-tese",
    nome: "A tese",
    pergunta: "O que é essa camada, e o que ela contém?",
  },
  {
    id: "o-ciclo",
    nome: "O ciclo",
    pergunta: "O que a ferramenta faz, do começo ao fim?",
  },
  {
    id: "o-percurso",
    nome: "O percurso",
    pergunta: "Por onde passa, e quando fala com o que você já tem?",
  },
  {
    id: "comecar",
    nome: "Começar",
    pergunta: "E agora?",
  },
];

/**
 * A âncora de um ato, com o `#`.
 *
 * Existe como função porque o menu e a trava precisam concordar sobre a forma
 * dela, e duas concatenações escritas em lugares diferentes divergem na primeira
 * vez que alguém mudar o formato.
 */
export function ancoraDoAto(ato: Ato): string {
  return `#${ato.id}`;
}
