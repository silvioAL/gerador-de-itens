import { montarPedidoPipeline, preambuloDoPapel } from "@gerador/aplicacao";
import type { PapelConfigurado, RespostaAnteriorIa } from "../api/client";
import { TAM_LOTE_ESTEIRA, type ItemFilaEsteira } from "./useEsteiraDeAgentes";

/**
 * #299 — "simular a esteira sem gastar chamada de IA (e ver o prompt que
 * sairia)".
 *
 * O ponto delicado da feature é não construir uma SEGUNDA versão do prompt.
 * Uma simulação que monta o texto do seu jeito responde "o que eu acho que
 * sairia", que é pior do que não ter simulação — dá confiança sem base.
 *
 * Aqui não há segunda versão. `montarPedidoPipeline` é a MESMA função que a
 * borda chama (`routes/ia.ts` e `openApiLocal.ts`, ambas com o mesmo
 * `montarPedidoPipeline({ preambulo: preambuloDoPapel(...), ...corpo })`), e
 * `corpoDoLote` abaixo é a MESMA função que a corrida de verdade usa pra montar
 * o que envia. Simulação e execução divergem só se alguém mudar uma das duas
 * sem a outra — e é exatamente isso que `lotesDaEsteira.test.ts` recusa.
 */

/** O corpo que a esteira POSTa em `/ia/pipeline/:papel` para um lote.
 * Extraído do hook pra ser exatamente o mesmo objeto nos dois caminhos. */
export function corpoDoLote(
  papelId: string,
  lote: ItemFilaEsteira[],
  acumuladas: Map<string, RespostaAnteriorIa[]>,
  contextoEpico?: string
) {
  return {
    contextoEpico,
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
export function itensDoPapel(papelId: string, fila: ItemFilaEsteira[]): ItemFilaEsteira[] {
  return fila.filter((item) => (item.placeholdersPorPapel[papelId] ?? []).length > 0);
}

export interface LoteSimulado {
  papelId: string;
  papelNome: string;
  /** 1-based, pra falar "lote 2 de 3" na tela sem aritmética na view. */
  indice: number;
  total: number;
  chaves: string[];
  prompt: string;
  /** Tamanho em caracteres. Não é contagem de token — e é dito assim na tela,
   * porque um número que parece token e não é vira decisão errada de janela. */
  caracteres: number;
}

export interface EntradaSimulacao {
  fila: ItemFilaEsteira[];
  papeis: PapelConfigurado[];
  contextoEpico?: string;
  /** Respostas que já existem antes da corrida (edições confirmadas). */
  existentesPorItem?: Map<string, RespostaAnteriorIa[]>;
}

/**
 * Reproduz a corrida inteira SEM chamar o modelo: mesma ordem de papéis, mesma
 * divisão em lotes, mesmo encadeamento.
 *
 * O encadeamento é simulado com um marcador no lugar da resposta que o modelo
 * daria — é a única coisa que não dá pra saber sem gastar a chamada, e mentir
 * aqui (inventando um texto plausível) faria a pessoa dimensionar a janela de
 * contexto por um número falso.
 */
export const RESPOSTA_NAO_GERADA = "(resposta deste papel — só existe depois de rodar de verdade)";

export function simularEsteira({ fila, papeis, contextoEpico, existentesPorItem }: EntradaSimulacao): LoteSimulado[] {
  const acumuladas = new Map<string, RespostaAnteriorIa[]>(existentesPorItem ?? []);
  const simulados: LoteSimulado[] = [];

  for (const papel of papeis.filter((p) => p.ativo !== false)) {
    const itens = itensDoPapel(papel.id, fila);
    const total = Math.ceil(itens.length / TAM_LOTE_ESTEIRA);

    for (let i = 0; i < itens.length; i += TAM_LOTE_ESTEIRA) {
      const lote = itens.slice(i, i + TAM_LOTE_ESTEIRA);
      const corpo = corpoDoLote(papel.id, lote, acumuladas, contextoEpico);
      const { prompt } = montarPedidoPipeline({
        preambulo: preambuloDoPapel(papel.id, papeis),
        ...corpo,
      });

      simulados.push({
        papelId: papel.id,
        papelNome: papel.nome,
        indice: Math.floor(i / TAM_LOTE_ESTEIRA) + 1,
        total,
        chaves: lote.map((item) => item.atividadeChave),
        prompt,
        caracteres: prompt.length,
      });
    }

    // O papel seguinte recebe o que este teria produzido. Só o RÓTULO é real;
    // o valor é o marcador acima.
    for (const item of itens) {
      const anteriores = acumuladas.get(item.atividadeChave) ?? [];
      acumuladas.set(item.atividadeChave, [
        ...anteriores,
        ...(item.placeholdersPorPapel[papel.id] ?? []).map((p) => ({
          rotulo: p.rotulo,
          valor: RESPOSTA_NAO_GERADA,
        })),
      ]);
    }
  }

  return simulados;
}
