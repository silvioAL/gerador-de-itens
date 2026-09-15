/**
 * SPEC-120 fatias A e B — **quantos itens cabem numa chamada.**
 *
 * ## O que este módulo é, e o que ele deliberadamente não é
 *
 * A SPEC-120 §0.2 mediu o terreno antes de propor: o §409 já persistiu o estado
 * **por item** (`specEnviadaEm`, `specErro`, `specAnexada`), e é exatamente o
 * que o lote precisa. Um lote é só **quantos itens vão por chamada HTTP** — o
 * estado, o acompanhamento na tela e o resultado parcial já são por item e não
 * mudam.
 *
 * Por isso aqui não há envio, nem rede, nem estado: uma função pura que recebe
 * uma lista e devolve listas. Quem emenda as chamadas é o adaptador, que é
 * quem já sabia fazer uma.
 *
 * ## A garantia que não se negocia
 *
 * > *"O lote é fatiado **por item, nunca no meio de um**. Meio item é truncagem
 * > com outro nome."* (SPEC-98 §4.1, repetida na SPEC-120 §1.1)
 *
 * É o que explica o caso estranho desta função: um item sozinho maior que o
 * teto de tamanho **vai sozinho, inteiro**, estourando o teto. A alternativa
 * seria cortá-lo — e uma spec cortada no meio de um bloco de código é pior que
 * uma chamada que falha, porque ela sobe e parece completa.
 */

export interface LimitesDoLote {
  /** Quantos itens, no máximo, por chamada. */
  itens: number;
  /** Quantos caracteres, somando os itens da chamada, antes de fechar o lote. */
  caracteres: number;
}

/**
 * Cinco, respondendo a pergunta que a SPEC-98 §4.2 deixou aberta:
 *
 * > *"MCPs são lentos e tem limitações de tokens, pode ser necessário subir 5
 * > itens por vez"*
 *
 * **E 5 não é a garantia**, o que a SPEC-120 §1.1 faz questão de dizer em voz
 * alta: o que estoura contexto é a spec, não a contagem. Cinco itens pequenos e
 * cinco grandes diferem por uma ordem de grandeza. Um limite em itens é fácil
 * de entender e de configurar, e falha justamente no caso que existe para
 * evitar — por isso ele vem acompanhado do teto de tamanho, e o lote fecha
 * quando **qualquer um dos dois** estourar.
 */
export const ITENS_POR_LOTE_PADRAO = 5;

/**
 * O teto de tamanho, e ele é um proxy grosseiro de propósito.
 *
 * Caracteres não são tokens — a razão varia com o idioma, com o markdown e com
 * o tokenizador de quem está do outro lado. Medir tokens de verdade exigiria
 * saber qual modelo atende o gateway, que é justamente o que este produto não
 * sabe nem quer saber (a mesma fronteira da SPEC-49).
 *
 * E grosseiro serve: o que se quer não é chegar perto do limite. ~60 mil
 * caracteres é da ordem de 15 mil tokens, folgado para qualquer MCP que
 * responda a este produto, e pequeno o bastante para o lote fechar antes de o
 * outro lado reclamar.
 */
export const CARACTERES_POR_LOTE_PADRAO = 60_000;

export const LOTE_PADRAO: LimitesDoLote = {
  itens: ITENS_POR_LOTE_PADRAO,
  caracteres: CARACTERES_POR_LOTE_PADRAO,
};

/**
 * Fatia a lista em lotes que respeitam os DOIS tetos.
 *
 * `tamanhoDe` é de quem chama porque só quem chama sabe o que vai no corpo: o
 * exportador manda o markdown do item, o anexador manda a spec. Medir aqui
 * exigiria este módulo conhecer os dois payloads, e ele não conhece nenhum.
 *
 * Limite menor que 1 vira 1 em vez de erro — não por tolerância, mas porque a
 * alternativa é um laço infinito: um lote de zero itens nunca consome a lista.
 * Configuração ruim degrada para a chamada mais lenta possível, nunca para o
 * produto travado.
 */
export function fatiarEmLotes<T>(itens: T[], tamanhoDe: (item: T) => number, limites: LimitesDoLote): T[][] {
  const maxItens = Math.max(1, Math.floor(limites.itens));
  const maxCaracteres = Math.max(1, Math.floor(limites.caracteres));

  const lotes: T[][] = [];
  let atual: T[] = [];
  let soma = 0;

  for (const item of itens) {
    const tamanho = Math.max(0, tamanhoDe(item));
    const estouraContagem = atual.length >= maxItens;
    /**
     * `atual.length > 0 &&` é o que garante a régua do cabeçalho: sem ele, um
     * item sozinho maior que o teto fecharia um lote vazio a cada volta e o
     * laço nunca consumiria a lista. Com ele, o item grande vai sozinho e
     * INTEIRO — que é o comportamento que a SPEC-98 §4.1 exige.
     */
    const estouraTamanho = atual.length > 0 && soma + tamanho > maxCaracteres;

    if (estouraContagem || estouraTamanho) {
      lotes.push(atual);
      atual = [];
      soma = 0;
    }
    atual.push(item);
    soma += tamanho;
  }

  if (atual.length > 0) lotes.push(atual);
  return lotes;
}

/**
 * SPEC-120 fatia C — **a recusa do destino é sinal, não só erro.**
 *
 * Um 413 (payload grande demais) ou um erro de contexto devolvido pelo MCP diz
 * uma coisa específica: *este lote não coube*. Marcar os cinco itens como
 * falhos joga fora a informação — e a pessoa fica com cinco erros idênticos e
 * nenhuma pista de que bastava mandar menos.
 *
 * ## Por que reconhecer pelo TEXTO, e por que isso está certo aqui
 *
 * O 413 é o sinal limpo e o mais raro: wrappers de MCP costumam devolver 400 ou
 * 500 com a reclamação no corpo. Casar texto é frágil, e a fragilidade é
 * aceitável porque o custo de errar é **baixo dos dois lados**: um falso
 * positivo tenta de novo com menos itens (e, se não for isso, falha de novo com
 * o mesmo motivo); um falso negativo vira o erro por item que já existia.
 *
 * O que NÃO se faz aqui é adivinhar em cima de um erro genérico: sem sinal de
 * tamanho, não há redução.
 */
const SINAIS_DE_LOTE_GRANDE = [
  "payload too large",
  "request entity too large",
  "content too large",
  "too many tokens",
  "context length",
  "context_length_exceeded",
  "maximum context",
  "token limit",
  "limite de tokens",
  "muito grande",
];

export function pareceLoteGrandeDemais(status: number, motivo: string): boolean {
  if (status === 413) return true;
  const texto = motivo.toLowerCase();
  return SINAIS_DE_LOTE_GRANDE.some((sinal) => texto.includes(sinal));
}
