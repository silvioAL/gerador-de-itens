import { and, desc, eq, isNotNull, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { OpcoesApp } from "../app.js";
import { registrarAuditoria } from "../auditoria.js";
import { exigirSessao } from "../auth/middleware.js";
import { exigirPermissao, organizacaoPadraoDe, type Recurso } from "../auth/permissoes.js";
import { configDocumentos, pdcaFeedback, pdcaUsos, quebras, solicitacoesAjuste } from "../db/schema.js";

/**
 * SPEC-39 Fase 1 — o PDCA das configurações.
 *
 * O servidor guarda três coisas: o CONTADOR de usos por usuário (a cadência
 * da entrevista é por usuário, não por time), o feedback livre coletado pelo
 * agente, e as SOLICITAÇÕES de ajuste de quem não pode editar — com a
 * versão-alvo do documento, porque entre o pedido e a decisão a config pode
 * mudar, e aprovar um pedido sobre uma versão anterior pode não fazer
 * sentido (a validade é checada NA decisão, nunca antes).
 */

const CADENCIA_PADRAO = { cadenciaUsos: 5, cadenciaFeedback: 3 };
const CHAVE_CONFIG_PDCA = "pdca";
const GLOBAL = "__global__";

/** Recursos solicitáveis: os quatro DOCUMENTOS versionados + campos por tipo
 * (sem versão na Fase 1 — aprovação sempre válida; limite anotado na SPEC). */
const RECURSOS_SOLICITAVEIS = [
  "regras",
  "pipeline-agentes",
  "especificacao-template",
  "campos-no",
  "campos-aresta",
] as const;

/** O recurso RBAC que autoriza DECIDIR cada solicitação. */
const RECURSO_DA_DECISAO: Record<(typeof RECURSOS_SOLICITAVEIS)[number], Recurso> = {
  regras: "regras.checklistTecnico",
  "pipeline-agentes": "pipeline-agentes",
  "especificacao-template": "especificacao-template",
  "campos-no": "campos-no",
  "campos-aresta": "campos-aresta",
};

export async function registrarRotasPdca(app: FastifyInstance, { db }: OpcoesApp) {
  const organizacaoId = organizacaoPadraoDe(db);

  async function cadencia(): Promise<typeof CADENCIA_PADRAO> {
    const [doc] = await db
      .select()
      .from(configDocumentos)
      .where(and(eq(configDocumentos.chave, CHAVE_CONFIG_PDCA), eq(configDocumentos.timeId, GLOBAL)))
      .limit(1);
    return { ...CADENCIA_PADRAO, ...((doc?.documento as Partial<typeof CADENCIA_PADRAO>) ?? {}) };
  }

  async function versaoDoDocumento(recurso: string): Promise<Date | null> {
    const [doc] = await db
      .select({ atualizadoEm: configDocumentos.atualizadoEm })
      .from(configDocumentos)
      .where(and(eq(configDocumentos.chave, recurso), eq(configDocumentos.timeId, GLOBAL)))
      .limit(1);
    return doc?.atualizadoEm ?? null;
  }

  app.get("/pdca/config", { preHandler: exigirSessao }, () => cadencia());

  // "Configurável pelo admin" (D do pedido): quem administra o RBAC
  // administra a cadência — mesmo gate de `acessos`.
  app.put(
    "/pdca/config",
    { preHandler: exigirPermissao(db, organizacaoId, "acessos", "editar") },
    async (req, reply) => {
      const corpo = z
        .object({ cadenciaUsos: z.number().int().min(1).max(100), cadenciaFeedback: z.number().int().min(1).max(100) })
        .safeParse(req.body);
      if (!corpo.success) return reply.code(400).send({ erro: corpo.error.flatten() });

      await db
        .insert(configDocumentos)
        .values({ chave: CHAVE_CONFIG_PDCA, timeId: GLOBAL, documento: corpo.data })
        .onConflictDoUpdate({
          target: [configDocumentos.chave, configDocumentos.timeId],
          set: { documento: corpo.data, atualizadoEm: sql`now()` },
        });
      registrarAuditoria(db, { email: req.usuario!.email, acao: "atualizar", recurso: "pdca_config", recursoId: GLOBAL });
      return corpo.data;
    }
  );

  /**
   * Registra um uso e responde se É AGORA o momento da entrevista/feedback
   * (contagem múltipla da cadência). Pra `derivacao`, devolve também os
   * títulos das últimas quebras do time — a entrevista cita o trabalho
   * recente pra ancorar a memória de quem responde.
   */
  app.post("/pdca/uso", { preHandler: exigirSessao }, async (req, reply) => {
    const corpo = z
      .object({ tipo: z.enum(["derivacao", "especificacao"]), timeId: z.string().optional() })
      .safeParse(req.body);
    if (!corpo.success) return reply.code(400).send({ erro: corpo.error.flatten() });

    const email = req.usuario!.email;
    const [linha] = await db
      .insert(pdcaUsos)
      .values({ email, tipo: corpo.data.tipo, contagem: 1 })
      .onConflictDoUpdate({
        target: [pdcaUsos.email, pdcaUsos.tipo],
        set: { contagem: sql`${pdcaUsos.contagem} + 1` },
      })
      .returning();

    const { cadenciaUsos, cadenciaFeedback } = await cadencia();
    const passo = corpo.data.tipo === "derivacao" ? cadenciaUsos : cadenciaFeedback;
    const momento = linha.contagem % passo === 0;

    let ultimosItens: string[] = [];
    if (momento && corpo.data.tipo === "derivacao" && corpo.data.timeId) {
      const recentes = await db
        .select({ titulo: quebras.titulo })
        .from(quebras)
        .where(and(eq(quebras.time, corpo.data.timeId), isNotNull(quebras.titulo)))
        .orderBy(desc(quebras.atualizadoEm))
        .limit(5);
      ultimosItens = recentes.map((r) => r.titulo!).filter(Boolean);
    }

    return { contagem: linha.contagem, momento, ultimosItens };
  });

  app.post("/pdca/feedback", { preHandler: exigirSessao }, async (req, reply) => {
    const corpo = z.object({ texto: z.string().trim().min(1), timeId: z.string().optional() }).safeParse(req.body);
    if (!corpo.success) return reply.code(400).send({ erro: corpo.error.flatten() });

    const [gravado] = await db
      .insert(pdcaFeedback)
      .values({ email: req.usuario!.email, timeId: corpo.data.timeId ?? null, texto: corpo.data.texto })
      .returning();
    registrarAuditoria(db, { email: req.usuario!.email, acao: "criar", recurso: "pdca_feedback", recursoId: gravado.id });
    return reply.code(201).send({ id: gravado.id });
  });

  // ── Solicitações de ajuste (o caminho de quem NÃO pode editar) ──
  app.post("/ajustes", { preHandler: exigirSessao }, async (req, reply) => {
    const corpo = z
      .object({
        recurso: z.enum(RECURSOS_SOLICITAVEIS).default("regras"),
        descricao: z.string().trim().min(1),
        timeId: z.string().optional(),
      })
      .safeParse(req.body);
    if (!corpo.success) return reply.code(400).send({ erro: corpo.error.flatten() });

    const orgId = await organizacaoId();
    if (!orgId) return reply.code(409).send({ erro: "nenhuma organização configurada" });

    const [criada] = await db
      .insert(solicitacoesAjuste)
      .values({
        organizacaoId: orgId,
        timeId: corpo.data.timeId ?? null,
        solicitante: req.usuario!.email,
        recurso: corpo.data.recurso,
        descricao: corpo.data.descricao,
        // O snapshot da validade: a versão do documento ALVO no momento do
        // pedido. Recurso sem documento (campos-no) fica sem versão.
        versaoAlvo: await versaoDoDocumento(corpo.data.recurso),
      })
      .returning();
    registrarAuditoria(db, { email: req.usuario!.email, acao: "criar", recurso: "solicitacoes_ajuste", recursoId: criada.id });
    return reply.code(201).send(criada);
  });

  app.get("/ajustes", { preHandler: exigirSessao }, async () => {
    return db.select().from(solicitacoesAjuste).orderBy(desc(solicitacoesAjuste.criadoEm));
  });

  /**
   * A DECISÃO — o gate é a permissão de editar o recurso pedido (owner ou
   * grant, os dois eixos da SPEC-38). Aprovar checa a VALIDADE: documento
   * mudou desde o pedido → a solicitação vira `invalida` e a resposta é 409
   * com o motivo — quem decide reavalia sobre o estado novo, nunca aprova no
   * escuro por cima de uma config que já é outra.
   */
  app.post("/ajustes/:id/decidir", { preHandler: exigirSessao }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const corpo = z.object({ aprovar: z.boolean() }).safeParse(req.body);
    if (!corpo.success) return reply.code(400).send({ erro: corpo.error.flatten() });

    const [pedido] = await db.select().from(solicitacoesAjuste).where(eq(solicitacoesAjuste.id, id)).limit(1);
    if (!pedido) return reply.code(404).send({ erro: "solicitação não encontrada" });
    if (pedido.estado !== "pendente") return reply.code(409).send({ erro: `solicitação já está "${pedido.estado}"` });

    // Gate por recurso, com o escopo do time do pedido (quando houver).
    const recursoRbac = RECURSO_DA_DECISAO[pedido.recurso as (typeof RECURSOS_SOLICITAVEIS)[number]] ?? "regras.checklistTecnico";
    const gate = exigirPermissao(db, organizacaoId, recursoRbac, "editar", () => pedido.timeId);
    await gate(req, reply);
    if (reply.sent) return;

    if (corpo.data.aprovar) {
      const versaoAtual = await versaoDoDocumento(pedido.recurso);
      const alvo = pedido.versaoAlvo?.getTime() ?? null;
      const atual = versaoAtual?.getTime() ?? null;
      if (alvo !== atual) {
        await db
          .update(solicitacoesAjuste)
          .set({ estado: "invalida", decididoPor: req.usuario!.email, decididoEm: new Date() })
          .where(eq(solicitacoesAjuste.id, id));
        return reply.code(409).send({
          erro: "a configuração mudou desde o pedido — a solicitação foi invalidada; reavalie sobre o estado atual",
          estado: "invalida",
        });
      }
    }

    const estado = corpo.data.aprovar ? "aprovada" : "rejeitada";
    await db
      .update(solicitacoesAjuste)
      .set({ estado, decididoPor: req.usuario!.email, decididoEm: new Date() })
      .where(eq(solicitacoesAjuste.id, id));
    registrarAuditoria(db, { email: req.usuario!.email, acao: estado, recurso: "solicitacoes_ajuste", recursoId: id });
    return { id, estado };
  });
}
