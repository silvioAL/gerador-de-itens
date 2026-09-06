import type { ItemDaFilaDaEsteira, RespostaAnterior } from "./filaDaEsteira.js";

/**
 * SPEC-107 G5 — **os lotes da esteira, PUROS e fora do navegador.**
 *
 * A corrida da esteira manda um LOTE de itens por chamada (achado real: uma
 * chamada por item era 4×N; com lotes são 4×⌈N/5⌉), e o corpo desse lote é o
 * que vira prompt (`montarPedidoPipeline`). A fiação semeada precisa montar o
 * MESMO corpo — o dublê determinístico semeia a resposta com o prompt
 * inteiro, então a prova da SPEC-105 F ("resultado idêntico item a item") só
 * existe com um montador só (§263). Este módulo veio de
 * `web/src/review/lotesDaEsteira.ts` à letra; a simulação (#299) continua no
 * web, importando daqui.
 */

/** O teto do lote. Justificativa medida na SPEC-24 Fase E: a janela de SAÍDA
 * do modelo local é o limite real — 5 itens × ~9 campos cabe com folga. */
export const TAM_LOTE_ESTEIRA = 5;

/** O corpo que a esteira POSTa em `/ia/pipeline/:papel` para um lote —
 * exatamente o mesmo objeto nos três caminhos: corrida da revisão, simulação
 * (#299) e a fiação semeada. */
export function corpoDoLote(
  papelId: string,
  lote: ItemDaFilaDaEsteira[],
  acumuladas: Map<string, RespostaAnterior[]>,
  contextoEpico?: string,
  /** SPEC-53 — o que o PRODUTO é. Separado do contexto da demanda até dentro
   * do corpo da requisição: quem lê o prompt precisa distinguir o permanente
   * do circunstancial. */
  contextoDoProduto?: string
) {
  return {
    contextoEpico,
    contextoDoProduto,
    itens: lote.map((item) => ({
      chave: item.atividadeChave,
      rotulo: item.atividadeRotulo,
      contextoNo: item.contextoNo,
      placeholders: item.placeholdersPorPapel[papelId] ?? [],
      // Snapshot, não a referência viva — o acumulador continua crescendo
      // depois desta chamada.
      respostasAnteriores: [...(acumuladas.get(item.atividadeChave) ?? [])],
    })),
  };
}

/** Os itens que sobram para um papel: quem não tem placeholder dele é pulado
 * — ausência de trabalho legítima, não fila vazia. */
export function itensDoPapel(papelId: string, fila: ItemDaFilaDaEsteira[]): ItemDaFilaDaEsteira[] {
  return fila.filter((item) => (item.placeholdersPorPapel[papelId] ?? []).length > 0);
}
