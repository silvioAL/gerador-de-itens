import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { criarCasosDeUsoDePerfisTime } from "@gerador/aplicacao";
import type { OpcoesApp } from "../app.js";
import { criarRepositorioDePerfisTimeEmPostgres } from "../adaptadores/perfisTimeEmPostgres.js";
import { exigirTime } from "../auth/middleware.js";
import { registrarAuditoria } from "../auditoria.js";

const corpoAtualizarPerfil = z.object({
  tipoNo: z.string().min(1),
  valores: z.record(z.string()),
});

export async function registrarRotasPerfisTime(app: FastifyInstance, { db }: OpcoesApp) {
  // Borda fina sobre o mesmo caso de uso do modo local (SPEC-31 Fase 2). A
  // tradução de linhas para a forma aninhada que a web consome é do adaptador.
  const casos = criarCasosDeUsoDePerfisTime(criarRepositorioDePerfisTimeEmPostgres(db));

  app.get("/perfis-time", () => casos.listarTodos());

  app.get("/perfis-time/:timeId", (req) => {
    const { timeId } = req.params as { timeId: string };
    return casos.obter(timeId);
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

      const perfil = await casos.definir(timeId, corpo.data.tipoNo, corpo.data.valores);
      registrarAuditoria(db, { email: req.usuario!.email, acao: "atualizar", recurso: "perfis_time", recursoId: timeId });
      return perfil;
    }
  );
}
