import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { validarTemplate } from "@gerador/engine";
import type { OpcoesApp } from "../app.js";
import { exigirTime } from "../auth/middleware.js";
import { registrarAuditoria } from "../auditoria.js";
import { CAMPO_GLOBAL, especificacaoTemplates } from "../db/schema.js";

const corpoTemplate = z.object({
  timeId: z.string().min(1).default(CAMPO_GLOBAL),
  conteudo: z.string().min(1),
});

/** `timeId` do recurso pro middleware `exigirTime` — `__global__` não exige time nenhum. */
function comoTimeParaAutorizacao(timeId: string): string | null {
  return timeId === CAMPO_GLOBAL ? null : timeId;
}

/**
 * Template da especificação de entrega (SPEC-14) — 1 documento por quebra,
 * então 1 template por `timeId` (não mais por tipo de item). Leitura aberta
 * (sem sessão) — mesma régua de campos-no/perfis-time.
 */
export async function registrarRotasEspecificacaoTemplate(app: FastifyInstance, { db }: OpcoesApp) {
  app.get("/especificacao-template", async (req) => {
    const { timeId } = req.query as { timeId?: string };
    if (timeId) {
      const [doTime] = await db.select().from(especificacaoTemplates).where(eq(especificacaoTemplates.timeId, timeId));
      if (doTime) return doTime;
    }
    const [global] = await db.select().from(especificacaoTemplates).where(eq(especificacaoTemplates.timeId, CAMPO_GLOBAL));
    return global ?? null;
  });

  // Upsert por chave natural (timeId) — não expõe id sintético pro cliente
  // ter que buscar antes de editar.
  app.put(
    "/especificacao-template",
    { preHandler: exigirTime((req) => comoTimeParaAutorizacao((req.body as { timeId?: string })?.timeId ?? CAMPO_GLOBAL)) },
    async (req, reply) => {
      const corpo = corpoTemplate.safeParse(req.body);
      if (!corpo.success) return reply.code(400).send({ erro: corpo.error.flatten() });

      const variaveisDesconhecidas = validarTemplate(corpo.data.conteudo);
      if (variaveisDesconhecidas.length > 0) {
        return reply.code(400).send({
          erro: `variável(is) desconhecida(s) no template: ${variaveisDesconhecidas.map((v) => `{{${v}}}`).join(", ")}`,
        });
      }

      const [salvo] = await db
        .insert(especificacaoTemplates)
        .values(corpo.data)
        .onConflictDoUpdate({
          target: especificacaoTemplates.timeId,
          set: { conteudo: corpo.data.conteudo, atualizadoEm: new Date() },
        })
        .returning();
      registrarAuditoria(db, {
        email: req.usuario!.email,
        acao: "atualizar",
        recurso: "especificacao_templates",
        recursoId: salvo.id,
      });
      return salvo;
    }
  );
}
