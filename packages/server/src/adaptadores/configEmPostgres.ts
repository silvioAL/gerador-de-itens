import { and, eq, isNull } from "drizzle-orm";
import {
  CAMPO_GLOBAL,
  type ChaveConfig,
  type DocumentoConfig,
  type RepositorioDeConfig,
} from "@gerador/aplicacao";
import type { BancoDeDados } from "../db/client.js";
import { ALVO_CONFLITO_CONFIG, configDocumentos } from "../db/schema.js";

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
  /**
   * SPEC-86 fatia B — **o `isNull` aqui não é detalhe: sem ele a migração 0040
   * quebraria a leitura de todo mundo.**
   *
   * Antes da coluna, `(chave, timeId)` identificava uma linha só. Com ela, o
   * documento de um produto tem a mesma chave e o mesmo time — e esta consulta
   * passaria a devolver ora um, ora outro, dependendo da ordem do plano. O time
   * receberia o checklist de um produto qualquer sem nada acusar.
   */
  async function buscar(chave: ChaveConfig, timeId: string): Promise<DocumentoConfig | null> {
    const [linha] = await db
      .select()
      .from(configDocumentos)
      .where(
        and(
          eq(configDocumentos.chave, chave),
          eq(configDocumentos.timeId, timeId),
          isNull(configDocumentos.produtoId)
        )
      );
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

    /**
     * Sem escada, de propósito (SPEC-86 §1). Ou o produto declarou, ou não
     * declarou — quem soma com o do time é `regrasEmVigor`, no engine. Cair no
     * global aqui faria o produto "herdar" por substituição, que é o
     * congelamento que a SPEC existe para evitar.
     */
    async obterDoProduto(chave, timeId, produtoId) {
      const [linha] = await db
        .select()
        .from(configDocumentos)
        .where(
          and(
            eq(configDocumentos.chave, chave),
            eq(configDocumentos.timeId, timeId),
            eq(configDocumentos.produtoId, produtoId)
          )
        );
      return linha ? comoDocumentoConfig(linha) : null;
    },

    async salvar(chave, timeId, documento, versaoTemplate) {
      const [salvo] = await db
        .insert(configDocumentos)
        .values({ chave, timeId, documento, versaoTemplate })
        .onConflictDoUpdate({
          // O alvo acompanha o índice único, que ganhou `produtoId` na 0040.
          target: [...ALVO_CONFLITO_CONFIG],
          set: { documento, versaoTemplate, atualizadoEm: new Date() },
        })
        .returning();
      return comoDocumentoConfig(salvo);
    },

    async salvarDoProduto(chave, timeId, produtoId, documento, versaoTemplate) {
      const [salvo] = await db
        .insert(configDocumentos)
        .values({ chave, timeId, produtoId, documento, versaoTemplate })
        .onConflictDoUpdate({
          target: [...ALVO_CONFLITO_CONFIG],
          set: { documento, versaoTemplate, atualizadoEm: new Date() },
        })
        .returning();
      return comoDocumentoConfig(salvo);
    },
  };
}
