import { and, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { OpcoesApp } from "../app.js";
import { exigirTime } from "../auth/middleware.js";
import { registrarAuditoria } from "../auditoria.js";
import { perfisTime } from "../db/schema.js";

const corpoAtualizarPerfil = z.object({
  tipoNo: z.string().min(1),
  valores: z.record(z.string()),
});

/** Monta o mesmo formato aninhado de `PerfisConfig` do engine
 * (Record<timeId, Record<tipoNo, Record<campo, valor>>>) a partir das linhas
 * relacionais — packages/web consome exatamente essa forma hoje. */
function paraPerfisConfig(linhas: { timeId: string; tipoNo: string; campo: string; valor: string }[]) {
  const perfis: Record<string, Record<string, Record<string, string>>> = {};
  for (const linha of linhas) {
    perfis[linha.timeId] ??= {};
    perfis[linha.timeId][linha.tipoNo] ??= {};
    perfis[linha.timeId][linha.tipoNo][linha.campo] = linha.valor;
  }
  return perfis;
}

export async function registrarRotasPerfisTime(app: FastifyInstance, { db }: OpcoesApp) {
  app.get("/perfis-time", async () => {
    const linhas = await db.select().from(perfisTime);
    return paraPerfisConfig(linhas);
  });

  app.get("/perfis-time/:timeId", async (req) => {
    const { timeId } = req.params as { timeId: string };
    const linhas = await db.select().from(perfisTime).where(eq(perfisTime.timeId, timeId));
    return paraPerfisConfig(linhas)[timeId] ?? {};
  });

  // Mesma operação que o botão "salvar como padrão do time" (PropertiesPanel) e o
  // formulário "+ Adicionar ou corrigir um valor de stack" (PerfisTimeTab) disparam
  // hoje contra perfis-time.json local — aqui vira upsert por (time, tipo, campo).
  app.put(
    "/perfis-time/:timeId",
    { preHandler: exigirTime((req) => (req.params as { timeId: string }).timeId) },
    async (req, reply) => {
      const { timeId } = req.params as { timeId: string };
      const corpo = corpoAtualizarPerfil.safeParse(req.body);
      if (!corpo.success) return reply.code(400).send({ erro: corpo.error.flatten() });

      for (const [campo, valor] of Object.entries(corpo.data.valores)) {
        await db
          .insert(perfisTime)
          .values({ timeId, tipoNo: corpo.data.tipoNo, campo, valor })
          .onConflictDoUpdate({
            target: [perfisTime.timeId, perfisTime.tipoNo, perfisTime.campo],
            set: { valor, atualizadoEm: new Date() },
          });
      }

      registrarAuditoria(db, { email: req.usuario!.email, acao: "atualizar", recurso: "perfis_time", recursoId: timeId });

      const linhas = await db
        .select()
        .from(perfisTime)
        .where(and(eq(perfisTime.timeId, timeId), eq(perfisTime.tipoNo, corpo.data.tipoNo)));
      return paraPerfisConfig(linhas)[timeId]?.[corpo.data.tipoNo] ?? {};
    }
  );
}
