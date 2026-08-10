import { eq } from "drizzle-orm";
import {
  CAMPO_GLOBAL,
  type RepositorioDeTemplateEspecificacao,
  type TemplateEspecificacao,
} from "@gerador/aplicacao";
import type { BancoDeDados } from "../db/client.js";
import { especificacaoTemplates } from "../db/schema.js";

/** SPEC-31 Fase 2 — adaptador Postgres do template da especificação de entrega. */
type LinhaTemplate = typeof especificacaoTemplates.$inferSelect;

function comoTemplate(linha: LinhaTemplate): TemplateEspecificacao {
  return {
    id: linha.id,
    timeId: linha.timeId,
    conteudo: linha.conteudo,
    // ISO-8601 como no adaptador de arquivo — a forma que atravessa HTTP.
    atualizadoEm: linha.atualizadoEm.toISOString(),
  };
}

export function criarRepositorioDeTemplateEspecificacaoEmPostgres(
  db: BancoDeDados
): RepositorioDeTemplateEspecificacao {
  return {
    async obter(timeId) {
      if (timeId && timeId !== CAMPO_GLOBAL) {
        const [doTime] = await db
          .select()
          .from(especificacaoTemplates)
          .where(eq(especificacaoTemplates.timeId, timeId));
        if (doTime) return comoTemplate(doTime);
      }
      const [global] = await db
        .select()
        .from(especificacaoTemplates)
        .where(eq(especificacaoTemplates.timeId, CAMPO_GLOBAL));
      return global ? comoTemplate(global) : null;
    },

    async salvar(timeId, conteudo) {
      const [salvo] = await db
        .insert(especificacaoTemplates)
        .values({ timeId, conteudo })
        .onConflictDoUpdate({
          target: especificacaoTemplates.timeId,
          set: { conteudo, atualizadoEm: new Date() },
        })
        .returning();
      return comoTemplate(salvo);
    },
  };
}
