import { and, eq, isNull, lte, or, sql } from "drizzle-orm";
import { PARAMETRO_DA_EXPRESSAO, problemaNoCron, proximaOcorrencia, type Fluxo } from "@gerador/aplicacao";
import type { OpcoesApp } from "../app.js";
import { fluxoAgendamentos } from "../db/schema.js";

/**
 * SPEC-110 fatia E (D7) — **o relógio do produto.**
 *
 * *"senti falta de componente scheduler para outros desenhos"*. Duas peças
 * pequenas moram aqui: o SINCRONIZADOR (o desenho manda na tabela) e o TICK
 * (a tabela manda no disparo). O parser de cron é puro e vive na aplicação —
 * aqui só o que tem banco e relógio.
 *
 * ## O UPDATE atômico é o lock (D7)
 *
 * `UPDATE ... WHERE proximo_em <= now() AND ativo RETURNING *` reserva e
 * avança na MESMA instrução: duas instâncias competindo pegariam linhas
 * diferentes, nunca a mesma. Não é um lock distribuído completo — o v1 é
 * single-instance por decisão, e multi-instância é dívida declarada. O que
 * este desenho garante é que a dívida não vira disparo duplicado silencioso:
 * quem não pegou a linha simplesmente não a vê.
 */

type Db = OpcoesApp["db"];

/** O que o desenho diz: um agendamento por nó de gatilho `agendamento`. */
export function agendamentosDoFluxo(fluxo: Fluxo): { noId: string; expressao: string }[] {
  return fluxo.nos
    .filter((no) => no.tipo === "gatilho" && no.refId === "agendamento")
    .map((no) => ({
      noId: no.id,
      expressao: String((no.parametros as Record<string, unknown>)[PARAMETRO_DA_EXPRESSAO] ?? ""),
    }))
    .filter((a) => problemaNoCron(a.expressao) === null);
}

/**
 * **O desenho manda na tabela.** Salvar o fluxo sincroniza: cria o que nasceu,
 * atualiza a expressão que mudou (recalculando a próxima), e DESATIVA o que
 * saiu do desenho.
 *
 * Desativa em vez de apagar: `ultima_em` é histórico, e apagar a linha faria
 * "quando isto rodou pela última vez?" perder a resposta ao mexer no canvas.
 */
export async function sincronizarAgendamentos(
  db: Db,
  fluxo: Fluxo,
  timeId: string,
  email: string,
  agora = new Date()
): Promise<void> {
  const doDesenho = agendamentosDoFluxo(fluxo);
  const existentes = await db
    .select()
    .from(fluxoAgendamentos)
    .where(and(eq(fluxoAgendamentos.fluxoId, fluxo.id), eq(fluxoAgendamentos.timeId, timeId)));

  for (const { noId, expressao } of doDesenho) {
    const ja = existentes.find((e) => e.noId === noId);
    const proximo = proximaOcorrencia(expressao, agora);
    if (!ja) {
      await db.insert(fluxoAgendamentos).values({
        fluxoId: fluxo.id,
        noId,
        timeId,
        expressao,
        proximoEm: proximo,
        criadoPor: email,
      });
      continue;
    }
    /**
     * A próxima só é recalculada quando a EXPRESSÃO muda. Recalcular a cada
     * salvamento abriria uma janela de perda silenciosa: entre a hora marcada
     * e o tick que a colhe passam até 30s, e um salvamento qualquer nesse
     * intervalo — mover um nó, renomear o fluxo — empurraria o disparo para a
     * ocorrência seguinte. A rodada de hoje sumiria sem nada falhar.
     */
    const mudou = ja.expressao !== expressao;
    await db
      .update(fluxoAgendamentos)
      .set({ expressao, ativo: true, ...(mudou || !ja.proximoEm ? { proximoEm: proximo } : {}) })
      .where(eq(fluxoAgendamentos.id, ja.id));
  }

  for (const e of existentes) {
    if (doDesenho.some((a) => a.noId === e.noId)) continue;
    // O nó saiu do desenho (ou ficou com expressão inválida): o relógio para.
    await db.update(fluxoAgendamentos).set({ ativo: false }).where(eq(fluxoAgendamentos.id, e.id));
  }
}

export interface AgendamentoVencido {
  id: string;
  fluxoId: string;
  noId: string;
  timeId: string;
  expressao: string;
}

/**
 * **Reserva quem venceu, e já avança o relógio** — numa instrução só.
 *
 * A ordem importa: avançar DEPOIS de executar deixaria a janela em que um
 * segundo tick pegaria a mesma linha. Avançar junto com a reserva significa
 * que um fluxo que falha não re-dispara sozinho — e isso é deliberado: o
 * rastro guarda a falha, e re-tentar automaticamente sem política de retry
 * (que a §8 lista como lacuna) seria inventar comportamento.
 */
export async function reservarVencidos(db: Db, agora = new Date()): Promise<AgendamentoVencido[]> {
  const linhas = await db
    .select()
    .from(fluxoAgendamentos)
    .where(and(eq(fluxoAgendamentos.ativo, true), or(isNull(fluxoAgendamentos.proximoEm), lte(fluxoAgendamentos.proximoEm, agora))));

  const reservados: AgendamentoVencido[] = [];
  for (const linha of linhas) {
    const proximo = proximaOcorrencia(linha.expressao, agora);
    /**
     * `proximo_em` entra na condição do UPDATE: se outro tick já avançou esta
     * linha, o `WHERE` não casa e a atualização não acontece — é assim que a
     * reserva vira exclusiva sem transação explícita.
     */
    const atualizadas = await db
      .update(fluxoAgendamentos)
      .set({ proximoEm: proximo, ultimaEm: agora })
      .where(
        and(
          eq(fluxoAgendamentos.id, linha.id),
          eq(fluxoAgendamentos.ativo, true),
          linha.proximoEm === null ? isNull(fluxoAgendamentos.proximoEm) : eq(fluxoAgendamentos.proximoEm, linha.proximoEm)
        )
      )
      .returning({ id: fluxoAgendamentos.id });
    if (atualizadas.length === 0) continue;

    // Nunca disparar por causa de `proximo_em` nulo: uma linha recém-criada
    // sem cálculo entra no laço só para GANHAR a próxima, não para rodar.
    if (linha.proximoEm === null) continue;
    reservados.push({
      id: linha.id,
      fluxoId: linha.fluxoId,
      noId: linha.noId,
      timeId: linha.timeId,
      expressao: linha.expressao,
    });
  }
  return reservados;
}

/** Só para o diagnóstico e a prova: quantas linhas ativas existem. */
export async function contarAgendamentosAtivos(db: Db): Promise<number> {
  const [linha] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(fluxoAgendamentos)
    .where(eq(fluxoAgendamentos.ativo, true));
  return linha?.n ?? 0;
}

/** O agendamento órfão (o fluxo sumiu) para de tentar — desativar em vez de
 * apagar preserva `ultima_em`, que é a resposta de "quando isto rodou?". */
export async function desativarAgendamento(db: Db, id: string): Promise<void> {
  await db.update(fluxoAgendamentos).set({ ativo: false }).where(eq(fluxoAgendamentos.id, id));
}
