import { and, eq } from "drizzle-orm";
import type { PerfilDeTime, PerfisDeTimes, RepositorioDePerfisTime } from "@gerador/aplicacao";
import type { BancoDeDados } from "../db/client.js";
import { perfisTime } from "../db/schema.js";

/**
 * SPEC-31 Fase 2 — adaptador Postgres dos perfis de time.
 *
 * Traduz linhas `(time, tipoNo, campo, valor)` na forma aninhada da porta, que
 * é a que a `packages/web` e o `PerfisConfig` do engine falam.
 */
function paraFormaAninhada(
  linhas: { timeId: string; tipoNo: string; campo: string; valor: string }[]
): PerfisDeTimes {
  const perfis: PerfisDeTimes = {};
  for (const linha of linhas) {
    perfis[linha.timeId] ??= {};
    perfis[linha.timeId][linha.tipoNo] ??= {};
    perfis[linha.timeId][linha.tipoNo][linha.campo] = linha.valor;
  }
  return perfis;
}

export function criarRepositorioDePerfisTimeEmPostgres(db: BancoDeDados): RepositorioDePerfisTime {
  return {
    async listarTodos() {
      return paraFormaAninhada(await db.select().from(perfisTime));
    },

    async obter(timeId): Promise<PerfilDeTime> {
      const linhas = await db.select().from(perfisTime).where(eq(perfisTime.timeId, timeId));
      return paraFormaAninhada(linhas)[timeId] ?? {};
    },

    async definir(timeId, tipoNo, valores) {
      // Upsert campo a campo: é o que dá a semântica de mesclar em vez de
      // substituir, sem precisar ler o perfil inteiro antes.
      for (const [campo, valor] of Object.entries(valores)) {
        await db
          .insert(perfisTime)
          .values({ timeId, tipoNo, campo, valor })
          .onConflictDoUpdate({
            target: [perfisTime.timeId, perfisTime.tipoNo, perfisTime.campo],
            set: { valor, atualizadoEm: new Date() },
          });
      }

      const linhas = await db
        .select()
        .from(perfisTime)
        .where(and(eq(perfisTime.timeId, timeId), eq(perfisTime.tipoNo, tipoNo)));
      return paraFormaAninhada(linhas)[timeId]?.[tipoNo] ?? {};
    },
  };
}
