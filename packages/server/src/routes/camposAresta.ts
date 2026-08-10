import { and, eq, or } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { CAMPO_GLOBAL } from "@gerador/aplicacao";
import type { OpcoesApp } from "../app.js";
import { exigirTime } from "../auth/middleware.js";
import { registrarAuditoria } from "../auditoria.js";
import { camposAresta } from "../db/schema.js";

/**
 * SPEC-31 (paridade) — campos por tipo de conexão no modo hospedado.
 *
 * A SPEC-21 criou isto como `config/campos-aresta.json` no modo local e nunca
 * chegou aqui: nem rota, nem tabela. A divergência ficou invisível até o teste
 * de paridade (`paridade.sanity.test.ts`) comparar as duas bordas e apontar.
 *
 * Mesma régua de `campos-no`: leitura aberta, escrita exige o time, e o campo
 * do time vence o global de mesma (`tipoAresta`, `key`). O upsert por chave
 * natural é o mesmo aprendizado da Fase 2 — regravar um campo é correção, não
 * violação de restrição única.
 */
const corpoCampoAresta = z.object({
  timeId: z.string().min(1).default(CAMPO_GLOBAL),
  tipoAresta: z.string().min(1),
  key: z.string().min(1),
  label: z.string().min(1),
  type: z.enum(["text", "textarea", "number", "boolean", "select"]),
  required: z.boolean().default(false),
  valorPadrao: z.string().optional(),
  opcoes: z.array(z.string()).optional(),
  ajuda: z.string().optional(),
  ordem: z.number().int().default(0),
});

const corpoAtualizar = corpoCampoAresta.partial().omit({ timeId: true, tipoAresta: true, key: true });

function comoTimeParaAutorizacao(timeId: string): string | null {
  return timeId === CAMPO_GLOBAL ? null : timeId;
}

export async function registrarRotasCamposAresta(app: FastifyInstance, { db }: OpcoesApp) {
  app.get("/campos-aresta", async (req) => {
    const { timeId } = req.query as { timeId?: string };
    const linhas = timeId
      ? await db
          .select()
          .from(camposAresta)
          .where(or(eq(camposAresta.timeId, CAMPO_GLOBAL), eq(camposAresta.timeId, timeId)))
      : await db.select().from(camposAresta).where(eq(camposAresta.timeId, CAMPO_GLOBAL));

    // Mesma regra de sobreposição de `camposEfetivos` (campos-no), aplicada à
    // chave desta tabela.
    const porChave = new Map<string, (typeof linhas)[number]>();
    for (const linha of [...linhas].sort((a, b) => (a.timeId === CAMPO_GLOBAL ? -1 : 1))) {
      porChave.set(`${linha.tipoAresta}::${linha.key}`, linha);
    }
    return [...porChave.values()].sort((a, b) => a.ordem - b.ordem);
  });

  app.post(
    "/campos-aresta",
    { preHandler: exigirTime((req) => comoTimeParaAutorizacao((req.body as { timeId?: string })?.timeId ?? CAMPO_GLOBAL)) },
    async (req, reply) => {
      const corpo = corpoCampoAresta.safeParse(req.body);
      if (!corpo.success) return reply.code(400).send({ erro: corpo.error.flatten() });

      const [salvo] = await db
        .insert(camposAresta)
        .values(corpo.data)
        .onConflictDoUpdate({
          target: [camposAresta.timeId, camposAresta.tipoAresta, camposAresta.key],
          set: { ...corpo.data, atualizadoEm: new Date() },
        })
        .returning();
      registrarAuditoria(db, { email: req.usuario!.email, acao: "criar", recurso: "campos_aresta", recursoId: salvo.id });
      return reply.code(201).send(salvo);
    }
  );

  app.put(
    "/campos-aresta/:id",
    {
      preHandler: exigirTime(async (req) => {
        const { id } = req.params as { id: string };
        const [linha] = await db.select().from(camposAresta).where(eq(camposAresta.id, id));
        return comoTimeParaAutorizacao(linha?.timeId ?? CAMPO_GLOBAL);
      }),
    },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const corpo = corpoAtualizar.safeParse(req.body);
      if (!corpo.success) return reply.code(400).send({ erro: corpo.error.flatten() });

      const [atualizado] = await db
        .update(camposAresta)
        .set({ ...corpo.data, atualizadoEm: new Date() })
        .where(eq(camposAresta.id, id))
        .returning();
      if (!atualizado) return reply.code(404).send({ erro: "campo não encontrado" });
      registrarAuditoria(db, { email: req.usuario!.email, acao: "atualizar", recurso: "campos_aresta", recursoId: id });
      return atualizado;
    }
  );

  app.delete(
    "/campos-aresta/:id",
    {
      preHandler: exigirTime(async (req) => {
        const { id } = req.params as { id: string };
        const [linha] = await db.select().from(camposAresta).where(eq(camposAresta.id, id));
        return comoTimeParaAutorizacao(linha?.timeId ?? CAMPO_GLOBAL);
      }),
    },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const [excluido] = await db.delete(camposAresta).where(and(eq(camposAresta.id, id))).returning();
      if (!excluido) return reply.code(404).send({ erro: "campo não encontrado" });
      registrarAuditoria(db, { email: req.usuario!.email, acao: "excluir", recurso: "campos_aresta", recursoId: id });
      return reply.code(204).send();
    }
  );
}
