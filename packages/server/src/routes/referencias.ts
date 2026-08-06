import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { OpcoesApp } from "../app.js";
import { exigirTime } from "../auth/middleware.js";
import { registrarAuditoria } from "../auditoria.js";
import { referencias } from "../db/schema.js";

const corpoCriarReferencia = z.object({
  timeId: z.string().optional(),
  titulo: z.string().min(1),
  racional: z.string().min(1),
  designPatterns: z.array(z.string()).default([]),
  codigoRelacionado: z.array(z.string()).default([]),
});

const corpoAtualizarLink = z.object({
  linkExterno: z.string().url(),
});

export async function registrarRotasReferencias(app: FastifyInstance, { db }: OpcoesApp) {
  app.get("/referencias", async () => db.select().from(referencias));

  app.post(
    "/referencias",
    { preHandler: exigirTime((req) => (req.body as { timeId?: string }).timeId ?? null) },
    async (req, reply) => {
      const corpo = corpoCriarReferencia.safeParse(req.body);
      if (!corpo.success) return reply.code(400).send({ erro: corpo.error.flatten() });

      const [criada] = await db.insert(referencias).values(corpo.data).returning();
      registrarAuditoria(db, { email: req.usuario!.email, acao: "criar", recurso: "referencias", recursoId: criada.id });
      return reply.code(201).send(criada);
    }
  );

  // Fecha o ciclo de publicação (Confluence, ou uma nota Obsidian publicada
  // em algum lugar com URL, SPEC-16) — a referência nunca guarda o conteúdo
  // publicado, só o metadado + link. Obsidian local não tem URL (é arquivo),
  // então esse campo continua opcional mesmo com a referência já existindo
  // no vault via `gerador export-vault`.
  app.patch(
    "/referencias/:id",
    {
      preHandler: exigirTime(async (req) => {
        const { id } = req.params as { id: string };
        const [linha] = await db.select({ timeId: referencias.timeId }).from(referencias).where(eq(referencias.id, id));
        return linha?.timeId ?? null;
      }),
    },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const corpo = corpoAtualizarLink.safeParse(req.body);
      if (!corpo.success) return reply.code(400).send({ erro: corpo.error.flatten() });

      const [atualizada] = await db
        .update(referencias)
        .set({ linkExterno: corpo.data.linkExterno })
        .where(eq(referencias.id, id))
        .returning();
      if (!atualizada) return reply.code(404).send({ erro: "referência não encontrada" });
      registrarAuditoria(db, { email: req.usuario!.email, acao: "atualizar", recurso: "referencias", recursoId: id });
      return atualizada;
    }
  );
}
