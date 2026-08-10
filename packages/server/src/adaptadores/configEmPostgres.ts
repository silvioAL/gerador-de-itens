import { and, eq } from "drizzle-orm";
import {
  CAMPO_GLOBAL,
  type ChaveConfig,
  type DocumentoConfig,
  type RepositorioDeConfig,
} from "@gerador/aplicacao";
import type { BancoDeDados } from "../db/client.js";
import { configDocumentos } from "../db/schema.js";

/** SPEC-31 Fase 3 — adaptador Postgres da porta de Configuração (migração 0012). */
type LinhaConfig = typeof configDocumentos.$inferSelect;

function comoDocumentoConfig(linha: LinhaConfig): DocumentoConfig {
  return {
    chave: linha.chave as ChaveConfig,
    timeId: linha.timeId,
    documento: linha.documento,
    versaoTemplate: linha.versaoTemplate ?? null,
    // ISO-8601 como no adaptador de arquivo — a forma que atravessa HTTP.
    atualizadoEm: linha.atualizadoEm.toISOString(),
  };
}

export function criarRepositorioDeConfigEmPostgres(db: BancoDeDados): RepositorioDeConfig {
  async function buscar(chave: ChaveConfig, timeId: string): Promise<DocumentoConfig | null> {
    const [linha] = await db
      .select()
      .from(configDocumentos)
      .where(and(eq(configDocumentos.chave, chave), eq(configDocumentos.timeId, timeId)));
    return linha ? comoDocumentoConfig(linha) : null;
  }

  return {
    async obter(chave, timeId) {
      if (timeId && timeId !== CAMPO_GLOBAL) {
        const doTime = await buscar(chave, timeId);
        if (doTime) return doTime;
      }
      return buscar(chave, CAMPO_GLOBAL);
    },

    async salvar(chave, timeId, documento, versaoTemplate) {
      const [salvo] = await db
        .insert(configDocumentos)
        .values({ chave, timeId, documento, versaoTemplate })
        .onConflictDoUpdate({
          target: [configDocumentos.chave, configDocumentos.timeId],
          set: { documento, versaoTemplate, atualizadoEm: new Date() },
        })
        .returning();
      return comoDocumentoConfig(salvo);
    },
  };
}
