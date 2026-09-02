/**
 * SPEC-100 fatia C (§349) — **ler um documento da casa, por link.**
 *
 * ## O pedido
 *
 * > *"deve ser possível fazer uma chamada para o gateway passando o link de uma
 * > página Confluence para que ele consulte e traga as informações, e assim o
 * > assistente já monte o desenho com as informações disponíveis."*
 *
 * E, depois, a decisão que a generalizou (SPEC-100):
 *
 * > *"o sistema deve ser agnóstico… o que importa é poder **importar um
 * > documento** do Confluence para trabalhar e desenhar."*
 *
 * ## Por que uma porta nova, e não `leitorDeAdr` com um parâmetro
 *
 * As duas leituras que já existem — ADR e arquitetura de negócio — buscam
 * **tipos de coisa**: o gateway sabe onde o repositório de decisões mora e
 * devolve uma lista estruturada. Aqui é o inverso: **a pessoa diz o endereço**, e
 * o que volta é texto que ninguém prometeu formatar.
 *
 * São contratos diferentes em tudo o que importa — quem escolhe o alvo, o que
 * volta, e o que fazer com o resultado. Um parâmetro a mais em `lerAdrs()` faria
 * a porta mentir sobre os três, que é a mesma razão pela qual a SPEC-81 §1.1
 * recusou juntar publicação de item com publicação de documento.
 *
 * ## O que volta é TEXTO, e isso é decisão
 *
 * Um Confluence devolve *storage format*; um Notion, blocos; um Google Docs,
 * outra coisa. **Traduzir é problema do gateway** — a mesma fronteira do §348: o
 * produto não sabe o que é um espaço, e também não sabe o que é uma macro de
 * Confluence.
 *
 * O que o produto exige é o mínimo sobre o qual dá para trabalhar: um texto e de
 * onde ele veio.
 */

export interface DocumentoExterno {
  /**
   * O conteúdo, em texto corrido ou markdown.
   *
   * Sem estrutura garantida de propósito: o que vem da casa vem no formato da
   * casa, e exigir markdown limpo faria o produto recusar exatamente as páginas
   * que ele existe para ler.
   */
  conteudo: string;
  /** O título da página, quando o gateway o conhece. */
  titulo?: string;
  /**
   * O link de onde veio — **eco do que foi pedido**, e não invenção do gateway.
   *
   * Vai para a proveniência: o desenho que nascer disto precisa dizer de onde
   * veio, e um mês depois a pergunta *"de onde saiu esse componente?"* tem
   * resposta.
   */
  link: string;
  /** Quando a página foi atualizada pela última vez, se a casa registra. */
  atualizadoEm?: string;
}

export interface LeitorDeDocumento {
  /**
   * Busca o documento naquele endereço.
   *
   * `undefined` quando não deu — e **não exceção**, pela mesma razão dos outros
   * leitores: importar é um caminho auxiliar, e derrubar a tela porque uma página
   * não respondeu transformaria um atalho em obstáculo. Quem chama decide o que
   * dizer.
   */
  ler(link: string): Promise<DocumentoExterno | undefined>;
}
