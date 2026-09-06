import type { PapelConfigurado } from "../config/normalizacao.js";
import type { ItemDaFilaDaEsteira, RespostaAnterior } from "./filaDaEsteira.js";
import { corpoDoLote, itensDoPapel, TAM_LOTE_ESTEIRA } from "./lotesDaEsteira.js";
import { montarPedidoPipeline, preambuloDoPapel } from "./ia/pedidos.js";

/**
 * SPEC-107 G5 — **a corrida da esteira, PURA: o gêmeo servidor do laço da
 * revisão.**
 *
 * É o mesmo desenho do `useEsteiraDeAgentes` (SPEC-24), sem tela: um papel
 * por vez, os itens dele em LOTES de `TAM_LOTE_ESTEIRA`, uma chamada por
 * (papel × lote) com o pedido montado pelo MESMO `corpoDoLote` +
 * `montarPedidoPipeline` da revisão e da simulação (§263) — é o que torna a
 * prova da SPEC-105 F ("resultado idêntico item a item") possível: o dublê
 * determinístico semeia pela letra do prompt, e a letra é uma só.
 *
 * O encadeamento é POR ITEM (`acumuladas`): o que um papel escreveu para um
 * item entra como insumo do papel seguinte NAQUELE item — nunca o texto de
 * todos juntos.
 *
 * Falha de um lote não trava a corrida (a mesma régua do hook): os demais
 * lotes seguem, e a falha sai NOMEADA no retorno.
 */

export interface FalhaDaCorrida {
  papelId: string;
  papelNome: string;
  mensagem: string;
  /** Quantos itens do lote ficaram sem resposta deste papel. */
  itens: number;
}

export interface ResultadoDaCorrida {
  /** item → campo → valor, tudo que a corrida escreveu. */
  respostasPorItem: Record<string, Record<string, string>>;
  falhas: FalhaDaCorrida[];
}

/**
 * A corrida de UM papel — a unidade do NÓ agente na fiação: o nó recebe a
 * fila pela aresta, corre o papel dele e devolve a fila ATUALIZADA (as
 * respostas entram em `respostasExistentes`, que é como as acumuladas viajam
 * de um nó ao seguinte) mais as respostas que este papel escreveu.
 */
export async function correrPapelPelaFila(opcoes: {
  papel: PapelConfigurado;
  /** Todos os papéis ativos — o preâmbulo do papel nasce da lista inteira. */
  papeisAtivos: PapelConfigurado[];
  fila: ItemDaFilaDaEsteira[];
  contextoEpico?: string;
  contextoDoProduto?: string;
  completarEstruturado: (prompt: string, esquema: unknown) => Promise<unknown>;
}): Promise<{ fila: ItemDaFilaDaEsteira[]; respostasPorItem: Record<string, Record<string, string>>; falhas: FalhaDaCorrida[] }> {
  const { papel, papeisAtivos, fila, contextoEpico, contextoDoProduto, completarEstruturado } = opcoes;
  // O acumulador nasce das respostas que JÁ existiam (confirmadas/edições ou
  // papéis anteriores da fiação) — exatamente como o hook.
  const acumuladas = new Map<string, RespostaAnterior[]>(
    fila.map((item) => [item.atividadeChave, [...(item.respostasExistentes ?? [])]])
  );
  const respostasPorItem: Record<string, Record<string, string>> = {};
  const falhas: FalhaDaCorrida[] = [];

  const doPapel = itensDoPapel(papel.id, fila);
  for (let i = 0; i < doPapel.length; i += TAM_LOTE_ESTEIRA) {
    const lote = doPapel.slice(i, i + TAM_LOTE_ESTEIRA);
    const corpo = corpoDoLote(papel.id, lote, acumuladas, contextoEpico, contextoDoProduto);
    try {
      const pedido = montarPedidoPipeline({ preambulo: preambuloDoPapel(papel.id, papeisAtivos), ...corpo });
      const bruto = (await completarEstruturado(pedido.prompt, pedido.esquema)) as Record<string, Record<string, string>>;
      for (const item of lote) {
        for (const placeholder of item.placeholdersPorPapel[papel.id]) {
          const valor = bruto[item.atividadeChave]?.[placeholder.chave];
          // A grammar obriga todas as chaves; ausência é resposta incompleta
          // — o campo fica sem escrever (nunca um default, §9.3).
          if (valor === undefined) continue;
          acumuladas.get(item.atividadeChave)?.push({ rotulo: placeholder.rotulo, valor });
          (respostasPorItem[item.atividadeChave] ??= {})[placeholder.chave] = valor;
        }
      }
    } catch (erro) {
      falhas.push({
        papelId: papel.id,
        papelNome: papel.nome,
        mensagem: erro instanceof Error ? erro.message : String(erro),
        itens: lote.length,
      });
    }
  }

  return {
    // A fila que segue pela aresta: as acumuladas viram `respostasExistentes`
    // do próximo nó — é o `acumuladas` da revisão atravessando o grafo.
    fila: fila.map((item) => ({ ...item, respostasExistentes: acumuladas.get(item.atividadeChave) ?? [] })),
    respostasPorItem,
    falhas,
  };
}

export async function correrEsteiraPelaFila(opcoes: {
  fila: ItemDaFilaDaEsteira[];
  /** Papéis ATIVOS, na ordem de execução — a mesma lista que montou a fila. */
  papeisAtivos: PapelConfigurado[];
  contextoEpico?: string;
  contextoDoProduto?: string;
  /** Quem fala com o modelo — no servidor, `provedor.completarEstruturado`
   * (o MESMO funil da rota `/ia/pipeline/:papel`). Puro aqui: injetado. */
  completarEstruturado: (papelId: string, prompt: string, esquema: unknown) => Promise<unknown>;
}): Promise<ResultadoDaCorrida> {
  const { papeisAtivos, contextoEpico, contextoDoProduto, completarEstruturado } = opcoes;
  const respostasPorItem: Record<string, Record<string, string>> = {};
  const falhas: FalhaDaCorrida[] = [];

  let fila = opcoes.fila;
  for (const papel of papeisAtivos) {
    const resultado = await correrPapelPelaFila({
      papel,
      papeisAtivos,
      fila,
      contextoEpico,
      contextoDoProduto,
      completarEstruturado: (prompt, esquema) => completarEstruturado(papel.id, prompt, esquema),
    });
    fila = resultado.fila;
    falhas.push(...resultado.falhas);
    for (const [item, campos] of Object.entries(resultado.respostasPorItem)) {
      respostasPorItem[item] = { ...(respostasPorItem[item] ?? {}), ...campos };
    }
  }

  return { respostasPorItem, falhas };
}
