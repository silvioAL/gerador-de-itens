/**
 * SPEC-81 fatia B — **publicar o documento de desenho na base de conhecimento.**
 *
 * ## Por que porta própria, e não um parâmetro do `exportar(itens)`
 *
 * Foi instrução explícita do usuário — *"chamada exclusiva, separada das de
 * publicação dos itens"* —, e ela se justifica por contrato:
 *
 * |                | Itens → tracker             | Documento → base de conhecimento |
 * |----------------|-----------------------------|----------------------------------|
 * | Ciclo de vida  | criado uma vez, vive lá     | **página viva**, republicada     |
 * | Idempotência   | exportar 2× **duplica**     | publicar 2× **atualiza no lugar**|
 * | Falha          | parcial, por item           | é uma coisa só                   |
 * | Permissão      | quem abre issue             | quem escreve na wiki             |
 *
 * Um parâmetro a mais faria a porta mentir sobre os quatro.
 *
 * ## O risco que o contrato existe para conter
 *
 * Uma página publicada é uma **cópia**, e cópia envelhece. É o §263 em escala de
 * documento — e a SPEC-83 §0.2 acabou de medir a versão pequena disso, a tese do
 * produto escrita em quatro lugares sem nenhum canônico.
 *
 * Por isso o payload carrega **de onde veio, quando, e se o original já mudou
 * desde então**. O produto sabe as três: a última é o `atualizadoEm` que o §312
 * tornou honesto. Uma página publicada que diga *"gerada de um documento que
 * mudou desde então"* é mais honesta que a maioria das wikis corporativas — e é
 * de graça, porque o dado já existe.
 */
export interface DocumentoParaPublicar {
  /** A demanda de onde este documento veio — é a identidade estável da página. */
  demandaId: string;
  demandaTitulo: string;
  /** O markdown inteiro, como o download entrega. */
  markdown: string;
  /** ISO-8601 — quando o documento foi gerado. */
  geradoEm: string;
  /**
   * ISO-8601 — quando a demanda mudou pela última vez.
   *
   * Vai junto para que a página publicada possa dizer se envelheceu. Sem isto,
   * quem lê a wiki não tem como saber que o desenho andou.
   */
  demandaAtualizadaEm: string;
  /**
   * O documento já estava desatualizado em relação ao desenho na hora de
   * publicar (SPEC-58 §5).
   *
   * Publicar assim **não é impedido** — é o §230: bloquear ensinaria a
   * contornar. Mas vai declarado, e a página do outro lado pode dizer.
   */
  desatualizado: boolean;
}

export interface DocumentoPublicado {
  /** A URL da página criada ou atualizada. */
  linkExterno: string;
  /**
   * `true` quando o gateway atualizou uma página existente em vez de criar.
   *
   * Não é telemetria: é a prova de que a idempotência funcionou. Uma segunda
   * publicação que devolvesse `criada` significa que a casa ficou com duas
   * páginas do mesmo documento, e é isso que transforma publicação em lixo.
   */
  atualizada: boolean;
}

export interface PublicadorDeDocumento {
  /**
   * Publica o documento e devolve onde ele foi parar.
   *
   * Falha é **exceção**, e não resultado — ao contrário do `ExportadorDeItens`.
   * A diferença não é estilo: lá o resultado é por item e a falha parcial é
   * informação útil; aqui é uma coisa só, e "publicou pela metade" não existe.
   */
  publicar(documento: DocumentoParaPublicar): Promise<DocumentoPublicado>;
}
