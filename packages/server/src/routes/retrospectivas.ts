import { desc, eq } from "drizzle-orm";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import type { OpcoesApp } from "../app.js";
import { exigirTime } from "../auth/middleware.js";
import { exigirPermissao, organizacaoPadraoDe } from "../auth/permissoes.js";
import { registrarAuditoria } from "../auditoria.js";
import { retrospectivas } from "../db/schema.js";

/**
 * SPEC-34 Fase 2 — a ingestão de retrospectivas que o fluxo 5 (SPEC-23)
 * prometia e o hospedado nunca teve. O recurso `retrospectivas` esperava em
 * `RECURSOS_SEM_ROTA` desde a SPEC-28 com o motivo assinado "antecipando a
 * feature" — estas rotas são a feature chegando, e ele sai da lista.
 *
 * Mesma régua de campos: escrita exige o time (e a permissão `editar`);
 * leitura exige `ler` — retro é material interno do time, não é a config
 * pública de tipos que o GET de campos serve pra montar formulário.
 */
const corpoRetrospectiva = z.object({
  timeId: z.string().min(1),
  titulo: z.string().min(1),
  texto: z.string().min(1),
});

export async function registrarRotasRetrospectivas(app: FastifyInstance, { db }: OpcoesApp) {
  const pode = (acao: "ler" | "editar", resolverTimeId: Parameters<typeof exigirPermissao>[4]) =>
    exigirPermissao(db, organizacaoPadraoDe(db), "retrospectivas", acao, resolverTimeId);

  const timeDoCorpo = (req: FastifyRequest) => (req.body as { timeId?: string })?.timeId ?? null;
  const timeDaQuery = (req: FastifyRequest) => (req.query as { timeId?: string })?.timeId ?? null;
  const timeDaRetro = async (req: FastifyRequest) => {
    const { id } = req.params as { id: string };
    const [linha] = await db.select().from(retrospectivas).where(eq(retrospectivas.id, id));
    return linha?.timeId ?? null;
  };

  app.get(
    "/retrospectivas",
    { preHandler: [exigirTime(timeDaQuery), pode("ler", timeDaQuery)] },
    async (req, reply) => {
      const { timeId } = req.query as { timeId?: string };
      if (!timeId) return reply.code(400).send({ erro: "timeId é obrigatório" });
      return db
        .select()
        .from(retrospectivas)
        .where(eq(retrospectivas.timeId, timeId))
        .orderBy(desc(retrospectivas.criadoEm));
    }
  );

  app.post(
    "/retrospectivas",
    { preHandler: [exigirTime(timeDoCorpo), pode("editar", timeDoCorpo)] },
    async (req, reply) => {
      const corpo = corpoRetrospectiva.safeParse(req.body);
      if (!corpo.success) return reply.code(400).send({ erro: corpo.error.flatten() });

      const [salva] = await db.insert(retrospectivas).values(corpo.data).returning();
      registrarAuditoria(db, { email: req.usuario!.email, acao: "criar", recurso: "retrospectivas", recursoId: salva.id });
      return reply.code(201).send(salva);
    }
  );

  app.delete(
    "/retrospectivas/:id",
    { preHandler: [exigirTime(timeDaRetro), pode("editar", timeDaRetro)] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const [excluida] = await db.delete(retrospectivas).where(eq(retrospectivas.id, id)).returning();
      if (!excluida) return reply.code(404).send({ erro: "retrospectiva não encontrada" });
      registrarAuditoria(db, { email: req.usuario!.email, acao: "excluir", recurso: "retrospectivas", recursoId: id });
      return reply.code(204).send();
    }
  );
}
