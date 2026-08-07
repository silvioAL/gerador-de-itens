import { eq, or } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { OpcoesApp } from "../app.js";
import { exigirTime } from "../auth/middleware.js";
import { registrarAuditoria } from "../auditoria.js";
import { CAMPO_GLOBAL, camposNo } from "../db/schema.js";

const tipoCampo = z.enum(["text", "textarea", "number", "boolean", "select"]);

const corpoCampoNo = z.object({
  timeId: z.string().min(1).default(CAMPO_GLOBAL),
  tipoNo: z.string().min(1),
  key: z.string().min(1),
  label: z.string().min(1),
  type: tipoCampo,
  required: z.boolean().default(false),
  valorPadrao: z.string().optional(),
  opcoes: z.array(z.string()).optional(),
  ajuda: z.string().optional(),
  permiteNA: z.boolean().default(false),
  ordem: z.number().int().default(0),
});

const corpoAtualizarCampoNo = corpoCampoNo.partial().omit({ timeId: true, tipoNo: true, key: true });

/** `timeId` do recurso pro middleware `exigirTime` — `__global__` não exige time nenhum. */
function comoTimeParaAutorizacao(timeId: string): string | null {
  return timeId === CAMPO_GLOBAL ? null : timeId;
}

async function buscarPorId(db: OpcoesApp["db"], id: string) {
  const [linha] = await db.select().from(camposNo).where(eq(camposNo.id, id));
  return linha;
}

export async function registrarRotasCamposNo(app: FastifyInstance, { db }: OpcoesApp) {
  // Leitura é aberta (sem sessão) — mesma régua de perfis-time: times
  // se beneficiam de ver a config uns dos outros, só a escrita é restrita.
  app.get("/campos-no", async (req) => {
    const { timeId } = req.query as { timeId?: string };
    const linhas = timeId
      ? await db
          .select()
          .from(camposNo)
          .where(or(eq(camposNo.timeId, CAMPO_GLOBAL), eq(camposNo.timeId, timeId)))
      : await db.select().from(camposNo).where(eq(camposNo.timeId, CAMPO_GLOBAL));

    // Efetivo: campo do time sobrescreve o global de mesma (tipoNo, key) — mesma
    // regra de override já usada em perfis_time.
    const porChave = new Map<string, (typeof linhas)[number]>();
    for (const linha of linhas.sort((a, b) => (a.timeId === CAMPO_GLOBAL ? -1 : 1))) {
      porChave.set(`${linha.tipoNo}::${linha.key}`, linha);
    }
    return [...porChave.values()].sort((a, b) => a.ordem - b.ordem);
  });

  app.post(
    "/campos-no",
    { preHandler: exigirTime((req) => comoTimeParaAutorizacao((req.body as { timeId?: string }).timeId ?? CAMPO_GLOBAL)) },
    async (req, reply) => {
      const corpo = corpoCampoNo.safeParse(req.body);
      if (!corpo.success) return reply.code(400).send({ erro: corpo.error.flatten() });

      const [criado] = await db.insert(camposNo).values(corpo.data).returning();
      registrarAuditoria(db, { email: req.usuario!.email, acao: "criar", recurso: "campos_no", recursoId: criado.id });
      return reply.code(201).send(criado);
    }
  );

  app.put(
    "/campos-no/:id",
    {
      preHandler: exigirTime(async (req) => {
        const { id } = req.params as { id: string };
        const linha = await buscarPorId(db, id);
        return comoTimeParaAutorizacao(linha?.timeId ?? CAMPO_GLOBAL);
      }),
    },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const corpo = corpoAtualizarCampoNo.safeParse(req.body);
      if (!corpo.success) return reply.code(400).send({ erro: corpo.error.flatten() });

      const [atualizado] = await db
        .update(camposNo)
        .set({ ...corpo.data, atualizadoEm: new Date() })
        .where(eq(camposNo.id, id))
        .returning();
      if (!atualizado) return reply.code(404).send({ erro: "campo não encontrado" });
      registrarAuditoria(db, { email: req.usuario!.email, acao: "atualizar", recurso: "campos_no", recursoId: id });
      return atualizado;
    }
  );

  app.delete(
    "/campos-no/:id",
    {
      preHandler: exigirTime(async (req) => {
        const { id } = req.params as { id: string };
        const linha = await buscarPorId(db, id);
        return comoTimeParaAutorizacao(linha?.timeId ?? CAMPO_GLOBAL);
      }),
    },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const [excluido] = await db.delete(camposNo).where(eq(camposNo.id, id)).returning();
      if (!excluido) return reply.code(404).send({ erro: "campo não encontrado" });
      registrarAuditoria(db, { email: req.usuario!.email, acao: "excluir", recurso: "campos_no", recursoId: id });
      return reply.code(204).send();
    }
  );
}
