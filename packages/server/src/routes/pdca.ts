import { and, desc, eq, isNotNull, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { OpcoesApp } from "../app.js";
import { registrarAuditoria } from "../auditoria.js";
import { exigirSessao } from "../auth/middleware.js";
import { exigirPermissao, organizacaoPadraoDe, SECOES_DE_REGRAS, type Recurso } from "../auth/permissoes.js";
import { configDocumentos, pdcaFeedback, pdcaUsos, quebras, solicitacoesAjuste } from "../db/schema.js";
import { aplicarOperacao, secaoDaOperacao, type OperacaoDeAjuste, type RegrasConfig } from "@gerador/engine";

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

  /**
   * SPEC-46 — quem decide é o dono da SEÇÃO, não o do checklist técnico.
   * Enquanto só existiam pedidos de checklist técnico, o recurso fixo passava
   * despercebido; com processo/testes/volumetria ele mandaria o pedido para a
   * pessoa errada — e barraria justamente quem cuida daquela seção.
   */
  function recursoDaSolicitacao(pedido: { recurso: string; operacao: unknown }): Recurso {
    if (pedido.recurso === "regras" && pedido.operacao) {
      return SECOES_DE_REGRAS[secaoDaOperacao(pedido.operacao as OperacaoDeAjuste)];
    }
    return RECURSO_DA_DECISAO[pedido.recurso as (typeof RECURSOS_SOLICITAVEIS)[number]] ?? "regras.checklistTecnico";
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

  /**
   * SPEC-45 — o feedback deixa de ser escrita-só. Sem este GET, o texto que
   * a pessoa escreveu no agente entrava no banco e ninguém via nunca (foi o
   * relato: "não vi nenhuma ação na aplicação"). Leitura aberta a qualquer
   * sessão: o ciclo de melhoria é do time, não de quem administra.
   */
  app.get("/pdca/feedback", { preHandler: exigirSessao }, async () => {
    return db.select().from(pdcaFeedback).orderBy(desc(pdcaFeedback.criadoEm));
  });

  /** Descartar também é decidir — o estado fica registrado, não some. */
  app.post("/pdca/feedback/:id/descartar", { preHandler: exigirSessao }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const [atualizado] = await db
      .update(pdcaFeedback)
      .set({ estado: "descartado" })
      .where(eq(pdcaFeedback.id, id))
      .returning();
    if (!atualizado) return reply.code(404).send({ erro: "feedback não encontrado" });
    registrarAuditoria(db, { email: req.usuario!.email, acao: "atualizar", recurso: "pdca_feedback", recursoId: id });
    return { id, estado: atualizado.estado };
  });

  // ── Solicitações de ajuste (o caminho de quem NÃO pode editar) ──
  app.post("/ajustes", { preHandler: exigirSessao }, async (req, reply) => {
    const corpo = z
      .object({
        recurso: z.enum(RECURSOS_SOLICITAVEIS).default("regras"),
        descricao: z.string().trim().min(1),
        timeId: z.string().optional(),
        // SPEC-45 — a mudança como dado: com ela, aprovar consegue APLICAR.
        operacao: z
          .discriminatedUnion("tipo", [
            // SPEC-46 — as quatro seções das regras de refinamento. `secao`
            // opcional: pedido gravado antes desta fase continua aplicável.
            z.object({
              tipo: z.literal("adicionar-checklist"),
              secao: z.enum(["checklistTecnico", "checklistProcesso"]).optional(),
              tech: z.string().min(1),
              contextos: z.array(z.string()).default([]),
              texto: z.string().trim().min(1),
            }),
            z.object({
              tipo: z.literal("remover-checklist"),
              secao: z.enum(["checklistTecnico", "checklistProcesso"]).optional(),
              tech: z.string().min(1),
              texto: z.string().trim().min(1),
            }),
            z.object({
              tipo: z.literal("adicionar-teste"),
              tech: z.string().min(1),
              contextos: z.array(z.string()).default([]),
              tipoTeste: z.string().trim().min(1),
              validacao: z.string().trim().min(1),
              dev: z.boolean().default(true),
              hlg: z.boolean().default(false),
            }),
            z.object({ tipo: z.literal("remover-teste"), tech: z.string().min(1), tipoTeste: z.string().trim().min(1) }),
            z.object({
              tipo: z.literal("definir-volumetria"),
              tech: z.string().min(1),
              contextos: z.array(z.string()).default([]),
            }),
            z.object({ tipo: z.literal("remover-volumetria"), tech: z.string().min(1) }),
          ])
          .optional(),
        /** De qual feedback este pedido nasceu — fecha a ponte que faltava. */
        feedbackId: z.string().uuid().optional(),
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
        operacao: corpo.data.operacao ?? null,
      })
      .returning();
    // A ponte feedback → solicitação: o card do feedback passa a mostrar que
    // já virou pedido, em vez de continuar pedindo tratamento pra sempre.
    if (corpo.data.feedbackId) {
      await db
        .update(pdcaFeedback)
        .set({ estado: "virou-ajuste", solicitacaoId: criada.id })
        .where(eq(pdcaFeedback.id, corpo.data.feedbackId));
    }
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
  /**
   * SPEC-45 — o *Act* do ciclo. Aprovar mudava só o estado: alguém tinha que
   * ir reescrever o documento à mão, sem link e sem rastro. Com a operação
   * gravada, aplicar é determinístico (a mesma função pura que a prévia usou
   * pra mostrar o efeito antes de decidir) e deixa quem/quando.
   *
   * Gate: a mesma permissão de DECIDIR o recurso. Só solicitação `aprovada`
   * aplica — e só uma vez.
   */
  app.post("/ajustes/:id/aplicar", { preHandler: exigirSessao }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const [pedido] = await db.select().from(solicitacoesAjuste).where(eq(solicitacoesAjuste.id, id)).limit(1);
    if (!pedido) return reply.code(404).send({ erro: "solicitação não encontrada" });
    if (pedido.estado !== "aprovada") {
      return reply.code(409).send({ erro: `só solicitação aprovada aplica — esta está "${pedido.estado}"` });
    }
    if (!pedido.operacao) {
      return reply.code(409).send({ erro: "este pedido é só texto (sem operação) — abra a configuração e edite à mão" });
    }
    if (pedido.recurso !== "regras") {
      return reply.code(409).send({ erro: `aplicar automático ainda só existe para "regras"` });
    }

    const gate = exigirPermissao(db, organizacaoId, recursoDaSolicitacao(pedido), "editar", () => pedido.timeId);
    await gate(req, reply);
    if (reply.sent) return;

    const [doc] = await db
      .select()
      .from(configDocumentos)
      .where(and(eq(configDocumentos.chave, "regras"), eq(configDocumentos.timeId, GLOBAL)))
      .limit(1);
    if (!doc) return reply.code(409).send({ erro: "documento de regras não encontrado" });

    const documentoNovo = aplicarOperacao(doc.documento as RegrasConfig, pedido.operacao as OperacaoDeAjuste);
    await db
      .update(configDocumentos)
      .set({ documento: documentoNovo, atualizadoEm: new Date() })
      .where(eq(configDocumentos.id, doc.id));
    const [aplicada] = await db
      .update(solicitacoesAjuste)
      .set({ estado: "aplicada", aplicadaEm: new Date(), aplicadaPor: req.usuario!.email })
      .where(eq(solicitacoesAjuste.id, id))
      .returning();

    registrarAuditoria(db, { email: req.usuario!.email, acao: "atualizar", recurso: "config_documentos", recursoId: "regras" });
    return { id, estado: aplicada.estado, aplicadaPor: aplicada.aplicadaPor };
  });

  app.post("/ajustes/:id/decidir", { preHandler: exigirSessao }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const corpo = z.object({ aprovar: z.boolean() }).safeParse(req.body);
    if (!corpo.success) return reply.code(400).send({ erro: corpo.error.flatten() });

    const [pedido] = await db.select().from(solicitacoesAjuste).where(eq(solicitacoesAjuste.id, id)).limit(1);
    if (!pedido) return reply.code(404).send({ erro: "solicitação não encontrada" });
    if (pedido.estado !== "pendente") return reply.code(409).send({ erro: `solicitação já está "${pedido.estado}"` });

    // Gate por recurso (pela SEÇÃO quando o pedido é estruturado), com o
    // escopo do time do pedido (quando houver).
    const gate = exigirPermissao(db, organizacaoId, recursoDaSolicitacao(pedido), "editar", () => pedido.timeId);
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
