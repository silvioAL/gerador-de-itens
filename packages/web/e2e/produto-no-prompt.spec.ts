/**
 * SPEC-107 G5c-3 — **este spec MORREU com a tela de revisão** (JOURNEY §385).
 *
 * O que ele provava: o contexto do PRODUTO entra no prompt da esteira,
 * separado do contexto da demanda, e na ordem certa. Onde a prova mora agora:
 * - a FORMA (as duas seções, a ordem, os rótulos) é dos testes de anatomia do
 *   montador (`aplicacao/casos-de-uso/ia/pedidos.anatomia.test.ts`) — o MESMO
 *   `montarPedidoPipeline` que a fiação executa (§263);
 * - a ENTREGA (o produto da demanda chega à corrida) é da fiação: o nó fonte
 *   emite `contextoDoProduto` (G5a) e `troca-de-contexto.spec.ts` prova pela
 *   assinatura do dublê que trocar o produto muda o que o modelo recebe.
 */
