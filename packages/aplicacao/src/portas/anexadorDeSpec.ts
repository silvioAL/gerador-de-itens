/**
 * SPEC-114 — a segunda chamada que a SPEC-98 §3.2 previu: depois que um item
 * já subiu pro tracker (`ExportadorDeItens`, primeira chamada), anexar a spec
 * DAQUELE item ao issue que a primeira chamada criou.
 *
 * Rota própria, não um parâmetro de `exportar(itens)` — mesma razão do
 * `PublicadorDeDocumento` (SPEC-81 §1.1): ciclo de vida e modo de falhar
 * diferentes. Aqui o modo de falhar é como o do `ExportadorDeItens` — parcial,
 * por item — porque anexar é tão "por item" quanto exportar.
 *
 * `conteudo` vai por item, não uma vez só (SPEC-114 §2.2): cada item tem a
 * SUA spec, recortada de `gerarSpec` para cobrir só aquele item.
 */
export interface PedidoDeAnexoDeSpec {
  /** `ItemGeradoSalvo.chave` — o item local, para casar o resultado com ele. */
  chave: string;
  /** O que a exportação (primeira chamada) devolveu — o endereço do issue lá fora. */
  chaveExterna: string;
  /** O markdown da spec deste item, já sem lacuna. */
  conteudo: string;
}

export interface AnexadorDeSpec {
  /**
   * Anexa a spec de cada item ao issue correspondente. Devolve um resultado
   * POR ITEM enviado, na mesma ordem — falha parcial é resposta, não exceção.
   */
  anexar(pedidos: PedidoDeAnexoDeSpec[]): Promise<Array<{ chave: string } | { chave: string; erro: string }>>;
}
