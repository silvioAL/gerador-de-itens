import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { criarCasosDeUsoDePerfisStack } from "@gerador/aplicacao";
import type { OpcoesApp } from "../app.js";
import { criarRepositorioDePerfisStackEmPostgres } from "../adaptadores/perfisStackEmPostgres.js";
import { exigirTime } from "../auth/middleware.js";
import { exigirNivel } from "../auth/niveis.js";
import { exigirEdicaoCurada, organizacaoPadraoDe } from "../auth/permissoes.js";
import { registrarAuditoria } from "../auditoria.js";

const corpoCaptura = z.object({
  tipoNo: z.string().min(1),
  valores: z.record(z.string()),
});
const corpoCriarPerfil = z.object({ nome: z.string().trim().min(1).max(80) });
const corpoValores = z.object({ tipoNo: z.string().min(1), valores: z.record(z.string()) });
const corpoApontar = z.object({ perfilStackId: z.string().uuid().nullable() });

/**
 * SPEC-38 Fase 2 — perfis de STACK. As rotas `/perfis-time` sobrevivem com o
 * MESMO contrato de leitura (a projeção que as sugestões consomem) e a mesma
 * escrita de captura ("salvar como padrão do time") — o que mudou é onde o
 * dado mora: no perfil apontado pelo time, não no time. O catálogo e o
 * ponteiro são as rotas novas `/perfis-stack` e `/times/:timeId/perfil-stack`.
 *
 * Autorização (D1): criar/editar perfil passa pela CURADORIA
 * (`exigirEdicaoCurada`) — aberto a owners até existir um papel com
 * `perfis-stack`; apontar o ponteiro do próprio time é ato de owner DO TIME,
 * sempre, curadoria ligada ou não.
 */
export async function registrarRotasPerfisStack(app: FastifyInstance, { db }: OpcoesApp) {
  const casos = criarCasosDeUsoDePerfisStack(criarRepositorioDePerfisStackEmPostgres(db));
  const organizacaoId = organizacaoPadraoDe(db);

  async function orgObrigatoria(): Promise<string> {
    const orgId = await organizacaoId();
    if (!orgId) throw new Error("instalação sem organização");
    return orgId;
  }

  // ── A projeção (o contrato antigo, intacto para o client) ──
  app.get("/perfis-time", () => casos.projecaoPorTime());
  app.get("/perfis-time/:timeId", (req) => {
    const { timeId } = req.params as { timeId: string };
    return casos.perfilDoTime(timeId);
  });

  // A captura: grava no perfil apontado (cria "stack de {time}" se não houver).
  app.put(
    "/perfis-time/:timeId",
    {
      preHandler: [
        exigirTime((req) => (req.params as { timeId: string }).timeId),
        exigirEdicaoCurada(db, organizacaoId, "perfis-stack", (req) => (req.params as { timeId: string }).timeId),
      ],
    },
    async (req, reply) => {
      const { timeId } = req.params as { timeId: string };
      const corpo = corpoCaptura.safeParse(req.body);
      if (!corpo.success) return reply.code(400).send({ erro: corpo.error.flatten() });

      const valores = await casos.capturar(
        await orgObrigatoria(),
        timeId,
        corpo.data.tipoNo,
        corpo.data.valores,
        req.usuario!.email
      );
      registrarAuditoria(db, { email: req.usuario!.email, acao: "capturar", recurso: "perfis_stack", recursoId: timeId });
      return valores;
    }
  );

  // ── O catálogo ──
  app.get("/perfis-stack", async () => ({
    perfis: await casos.catalogo(),
    ponteiros: await casos.ponteiros(),
  }));

  app.post(
    "/perfis-stack",
    { preHandler: exigirEdicaoCurada(db, organizacaoId, "perfis-stack") },
    async (req, reply) => {
      const corpo = corpoCriarPerfil.safeParse(req.body);
      if (!corpo.success) return reply.code(400).send({ erro: corpo.error.flatten() });

      const perfil = await casos.criar(await orgObrigatoria(), corpo.data.nome, req.usuario!.email);
      registrarAuditoria(db, { email: req.usuario!.email, acao: "criar", recurso: "perfis_stack", recursoId: perfil.id });
      return reply.code(201).send(perfil);
    }
  );

  app.put(
    "/perfis-stack/:id/valores",
    { preHandler: exigirEdicaoCurada(db, organizacaoId, "perfis-stack") },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const corpo = corpoValores.safeParse(req.body);
      if (!corpo.success) return reply.code(400).send({ erro: corpo.error.flatten() });

      const valores = await casos.definirValores(id, corpo.data.tipoNo, corpo.data.valores);
      registrarAuditoria(db, { email: req.usuario!.email, acao: "atualizar", recurso: "perfis_stack", recursoId: id });
      return valores;
    }
  );

  // ── O ponteiro do time ──
  app.put(
    "/times/:timeId/perfil-stack",
    {
      preHandler: [
        exigirTime((req) => (req.params as { timeId: string }).timeId),
        exigirNivel(db, "owner", (req) => (req.params as { timeId: string }).timeId),
      ],
    },
    async (req, reply) => {
      const { timeId } = req.params as { timeId: string };
      const corpo = corpoApontar.safeParse(req.body);
      if (!corpo.success) return reply.code(400).send({ erro: corpo.error.flatten() });

      await casos.apontar(timeId, corpo.data.perfilStackId);
      registrarAuditoria(db, {
        email: req.usuario!.email,
        acao: "apontar",
        recurso: "perfis_stack",
        recursoId: `${timeId}:${corpo.data.perfilStackId ?? "nenhum"}`,
      });
      return { timeId, perfilStackId: corpo.data.perfilStackId };
    }
  );
}
