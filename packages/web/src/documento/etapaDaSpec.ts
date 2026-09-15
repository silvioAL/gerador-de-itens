import type { ItemGerado } from "../api/client";

/**
 * SPEC-115 fatia E — **o pipeline por item, lido do estado persistido.**
 *
 * A SPEC-98 §3.2 desenhou o percurso e o usuário decidiu que ele é assíncrono
 * (*"pode ser assíncrona, sem problemas, sabemos que demora"*):
 *
 * ```
 * item 1: história ✓  id ✓  spec ✓        (concluído)
 * item 2: história ✓  id ✓  spec ⏳       (anexando)
 * item 3: história ⏳                      (criando)
 * item 4:                                  (na fila)
 * ```
 *
 * ## Por que isto é uma função pura, e não estado de componente
 *
 * Porque a etapa **não é guardada em lugar nenhum**: ela é DERIVADA dos campos
 * que o item já carrega do servidor. É isso que faz o pipeline sobreviver ao
 * F5 sem nenhuma máquina de estado no cliente — recarregar a página relê os
 * mesmos campos e chega na mesma etapa, por construção.
 *
 * Guardar a etapa seria criar uma segunda fonte da mesma verdade, e a primeira
 * divergência entre as duas apareceria exatamente no caso que interessa: a aba
 * que ficou aberta durante um envio de minutos.
 */
export type EtapaDaSpec = "naFila" | "noTracker" | "anexando" | "anexada" | "falhou";

/**
 * A ordem importa, e é a do próprio percurso: cada teste só é feito depois de o
 * anterior ter falhado. `falhou` vem primeiro porque é a única etapa que
 * contradiz as outras — um item com erro E com `linkExterno` está parado, não
 * "no tracker esperando".
 */
export function etapaDaSpec(item: ItemGerado): EtapaDaSpec {
  if (item.specErro) return "falhou";
  if (item.specAnexada) return "anexada";
  if (item.specEnviadaEm) return "anexando";
  if (item.linkExterno) return "noTracker";
  return "naFila";
}

/**
 * O que cada etapa mostra. Os três símbolos do §3.2 da SPEC-98 (✓ ⏳ e o vazio)
 * mais o vermelho, porque "a falha para o lote e diz qual" é régua do §5 — erro
 * que passa correndo numa animação é erro escondido.
 */
export const ROTULO_DA_ETAPA: Record<EtapaDaSpec, { texto: string; icone: string; cor: string }> = {
  naFila: { texto: "na fila — a história ainda não subiu", icone: "○", cor: "var(--texto-mudo)" },
  noTracker: { texto: "história ✓ · id ✓ — spec ainda não", icone: "◐", cor: "var(--amarelo)" },
  anexando: { texto: "anexando a spec agora", icone: "⏳", cor: "var(--acento)" },
  anexada: { texto: "história ✓ · id ✓ · spec ✓", icone: "✓", cor: "var(--verde)" },
  falhou: { texto: "a spec não chegou", icone: "⚠", cor: "var(--vermelho)" },
};

/**
 * O mesmo estado, em duas palavras — para o chip do card, onde a frase inteira
 * não cabe. A frase longa continua no `title`: o chip identifica, o `title`
 * explica, e nenhum dos dois inventa um estado que o outro não tem.
 */
export const ROTULO_DO_CHIP_DA_SPEC: Record<EtapaDaSpec, string> = {
  naFila: "sem issue",
  noTracker: "spec pendente",
  anexando: "spec indo",
  anexada: "spec anexada",
  falhou: "spec não chegou",
};

export interface ContagemDoPipeline {
  naFila: number;
  noTracker: number;
  anexando: number;
  anexada: number;
  falhou: number;
  /** Quantos itens o pipeline tem no total — o denominador de "quanto falta". */
  total: number;
}

/**
 * SPEC-98 §5 — **a contagem real, que é o que substitui a barra fingida.**
 *
 * *"Se a estimativa de lotes for um palpite, a barra precisa dizer que é — ou
 * ser substituída por contagem real, que é honesta por construção."* Aqui não
 * há palpite nenhum: cada número é a quantidade de itens naquela etapa, agora.
 */
export function contarPipeline(itens: ItemGerado[]): ContagemDoPipeline {
  const contagem: ContagemDoPipeline = { naFila: 0, noTracker: 0, anexando: 0, anexada: 0, falhou: 0, total: itens.length };
  for (const item of itens) contagem[etapaDaSpec(item)] += 1;
  return contagem;
}

/**
 * Há envio em curso? É o que liga o polling da tela e a animação — e o que o
 * desliga quando o último item chega. Perguntar ao dado em vez de a um
 * cronômetro é o que faz um F5 no meio do envio continuar acompanhando.
 */
export function temEnvioEmCurso(itens: ItemGerado[]): boolean {
  return itens.some((i) => etapaDaSpec(i) === "anexando");
}
