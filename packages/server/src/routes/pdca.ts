import { and, desc, eq, isNotNull, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { OpcoesApp } from "../app.js";
import { registrarAuditoria } from "../auditoria.js";
import { exigirSessao } from "../auth/middleware.js";
import { exigirPermissao, organizacaoPadraoDe, SECOES_DE_REGRAS, type Recurso } from "../auth/permissoes.js";
import { ALVO_CONFLITO_CONFIG, configDocumentos, pdcaFeedback, pdcaUsos, quebras, solicitacoesAjuste, produtos } from "../db/schema.js";
import {
  aplicarOperacao,
  aplicarOperacaoNoPipeline,
  metricasDoCiclo,
  recursoAlvoDaOperacao,
  secaoDaOperacao,
  type OperacaoDeAjuste,
  type PipelineComPapeis,
  type RegrasConfig,
} from "@gerador/engine";
import { CAMPO_GLOBAL, criarCasosDeUsoDeCamposAresta, criarCasosDeUsoDeCamposNo } from "@gerador/aplicacao";
import { criarRepositorioDeCamposNoEmPostgres } from "../adaptadores/camposNoEmPostgres.js";
import { criarRepositorioDeCamposArestaEmPostgres } from "../adaptadores/camposArestaEmPostgres.js";
import { aplicarOperacaoDeCampo, type PortaDeFicha } from "../pdca/aplicarNosCampos.js";
import { templateDaVersao } from "../config/templateDaVersao.js";
import { volumeVencido } from "@gerador/engine";

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

/**
 * SPEC-52 — o campo que um pedido consegue propor. `lista` fica de fora: ela
 * carrega `itemSpec` (sub-campos), estrutura para editar na tela de campos e
 * não para nascer de uma frase de feedback. Recusar aqui é melhor que aceitar
 * e aplicar meia lista.
 */
const campoProposto = z.object({
  key: z
    .string()
    .trim()
    .min(1)
    .regex(/^[a-zA-Z0-9_-]+$/, "a chave do campo aceita letras, números, hífen e underscore"),
  label: z.string().trim().min(1),
  tipoCampo: z.enum(["text", "textarea", "number", "boolean", "select"]),
  obrigatorio: z.boolean().default(false),
  ajuda: z.string().trim().optional(),
  opcoes: z.array(z.string()).optional(),
});

/**
 * SPEC-77 fatia D — `mesesParaRevisarVolume` entra aqui, junto da cadência, e
 * é a resposta da pergunta em aberto §6.2 ("qual é o N?"): não há número de uso
 * real para escolher, então ele é **configurável**, na mesma tela onde a
 * cadência do PDCA já é. Seis meses é um começo, não uma régua.
 *
 * `0` desliga a pergunta — e desligar tinha que ser possível sem apagar o
 * número declarado.
 */
const CADENCIA_PADRAO = { cadenciaUsos: 5, cadenciaFeedback: 3, mesesParaRevisarVolume: 6 };
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

export async function registrarRotasPdca(app: FastifyInstance, { db, diretorioConfig }: OpcoesApp) {
  const organizacaoId = organizacaoPadraoDe(db);

  /**
   * SPEC-52 — as duas fichas que o *Act* alcança, cada uma delegando ao mesmo
   * caso de uso que a tela de campos usa. A rota do PDCA não fala SQL de
   * campo: se a regra de sobreposição mudar, muda num lugar só.
   */
  const casosDeCamposNo = criarCasosDeUsoDeCamposNo(criarRepositorioDeCamposNoEmPostgres(db));
  const casosDeCamposAresta = criarCasosDeUsoDeCamposAresta(criarRepositorioDeCamposArestaEmPostgres(db));

  const fichaDeNos: PortaDeFicha = {
    listar: async (tipoNo, timeId) =>
      (await casosDeCamposNo.listarEfetivos(timeId)).filter((c) => c.tipoNo === tipoNo),
    criar: ({ chaveDoComponente, timeId, campo, ordem }) =>
      casosDeCamposNo
        .salvar({
          timeId,
          tipoNo: chaveDoComponente,
          key: campo.key,
          label: campo.label,
          type: campo.tipoCampo,
          required: campo.obrigatorio,
          ajuda: campo.ajuda ?? null,
          opcoes: campo.opcoes ?? null,
          ordem,
        })
        .then(() => undefined),
    excluir: (id) => casosDeCamposNo.excluir(id),
  };

  const fichaDeArestas: PortaDeFicha = {
    listar: async (tipoAresta, timeId) =>
      (await casosDeCamposAresta.listarEfetivos(timeId)).filter((c) => c.tipoAresta === tipoAresta),
    criar: ({ chaveDoComponente, timeId, campo, ordem }) =>
      casosDeCamposAresta
        .salvar({
          timeId,
          tipoAresta: chaveDoComponente,
          key: campo.key,
          label: campo.label,
          // A ficha de conexão não tem `lista` — o tipo proposto já exclui.
          type: campo.tipoCampo,
          required: campo.obrigatorio,
          ajuda: campo.ajuda ?? null,
          opcoes: campo.opcoes ?? null,
          ordem,
        })
        .then(() => undefined),
    excluir: (id) => casosDeCamposAresta.excluir(id),
  };

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
    if (pedido.operacao) {
      const op = pedido.operacao as OperacaoDeAjuste;
      // SPEC-50 — quem manda é a OPERAÇÃO, não o rótulo do pedido: um ajuste
      // de papel é do dono do pipeline, mesmo que o pedido tenha nascido
      // marcado como "regras".
      const alvo = recursoAlvoDaOperacao(op);
      if (alvo === "pipeline-agentes") return "pipeline-agentes";
      // SPEC-52 — a ficha tem dono próprio (quem edita campos por componente
      // ou por conexão), e não é o dono de nenhuma seção das regras.
      if (alvo === "campos-no" || alvo === "campos-aresta") return alvo;
      return SECOES_DE_REGRAS[secaoDaOperacao(op)];
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
        .object({
          cadenciaUsos: z.number().int().min(1).max(100),
          cadenciaFeedback: z.number().int().min(1).max(100),
          /** `0` desliga a pergunta sobre a idade do volume. */
          mesesParaRevisarVolume: z.number().int().min(0).max(60).optional(),
        })
        .safeParse(req.body);
      if (!corpo.success) return reply.code(400).send({ erro: corpo.error.flatten() });

      await db
        .insert(configDocumentos)
        .values({ chave: CHAVE_CONFIG_PDCA, timeId: GLOBAL, documento: corpo.data })
        .onConflictDoUpdate({
          target: [...ALVO_CONFLITO_CONFIG],
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

    const { cadenciaUsos, cadenciaFeedback, mesesParaRevisarVolume } = await cadencia();
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

    /**
     * SPEC-77 fatia D — os produtos cujo volume envelheceu.
     *
     * Só no MOMENTO da entrevista, junto com a âncora de memória (§39): fora
     * dela isto seria um aviso permanente, e aviso permanente deixa de ser
     * lido. E é uma PERGUNTA, não uma cobrança — número velho não é violação,
     * é assunto. O ciclo é quem sabe transformar a resposta em ajuste.
     */
    let volumesParaRevisar: { produtoId: string; nome: string; declaradoEm: string }[] = [];
    if (momento) {
      const comVolume = await db
        .select({ id: produtos.id, nome: produtos.nome, declaradoEm: produtos.volumetriaDeclaradaEm })
        .from(produtos)
        .where(isNotNull(produtos.volumetriaDeclaradaEm));
      volumesParaRevisar = comVolume
        .filter((p) => volumeVencido(p.declaradoEm?.toISOString(), mesesParaRevisarVolume))
        .map((p) => ({ produtoId: p.id, nome: p.nome, declaradoEm: p.declaradoEm!.toISOString() }));
    }

    return { contagem: linha.contagem, momento, ultimosItens, volumesParaRevisar };
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

  /**
   * SPEC-62 §3 — descartar tinha volta em lugar nenhum.
   *
   * O feedback descartado ia para dentro do histórico fechado e sumia da tela
   * (medido). Descartar é decisão, e por isso fica gravado; mas decisão que não
   * pode ser revista é descarte, e descarte silencioso é o que ensina o time a
   * parar de responder.
   *
   * Só volta o que foi DESCARTADO: o que já virou solicitação tem estado
   * próprio, e devolvê-lo a "novo" criaria dois pedidos para a mesma frase.
   */
  app.post("/pdca/feedback/:id/reabrir", { preHandler: exigirSessao }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const [atual] = await db.select().from(pdcaFeedback).where(eq(pdcaFeedback.id, id)).limit(1);
    if (!atual) return reply.code(404).send({ erro: "feedback não encontrado" });
    if (atual.estado !== "descartado") {
      return reply.code(409).send({ erro: `só feedback descartado reabre — este está "${atual.estado}"` });
    }
    const [reaberto] = await db
      .update(pdcaFeedback)
      .set({ estado: "novo" })
      .where(eq(pdcaFeedback.id, id))
      .returning();
    registrarAuditoria(db, { email: req.usuario!.email, acao: "atualizar", recurso: "pdca_feedback", recursoId: id });
    return { id, estado: reaberto.estado };
  });

  /**
   * SPEC-94 fatia Z (§343) — **o ciclo de configuração, medido.**
   *
   * O usuário: *"o da configuração faz parte, precisamos de métricas dele."*
   *
   * Das três entradas que uma análise crítica precisa (SPEC-94 §4.4), esta é a
   * única calculável **hoje**: o dado já está gravado, e não depende da porta de
   * volta que a SPEC-96 pede.
   *
   * **Leitura aberta a qualquer sessão**, pelo mesmo motivo do `GET
   * /pdca/feedback`: o ciclo de melhoria é do time, não de quem administra. E
   * uma das métricas mede o próprio produto — esconder isso de quem responde ao
   * balão seria pedir sinal e sonegar o resultado.
   *
   * O cálculo é do engine, puro; aqui só se lê o banco e se passa o relógio.
   */
  app.get("/pdca/metricas", { preHandler: exigirSessao }, async (req) => {
    const { timeId } = req.query as { timeId?: string };
    const meus = req.usuario!.timeIds;
    const visiveis = timeId ? meus.filter((t) => t === timeId) : meus;

    const [todasSolicitacoes, todosFeedbacks] = await Promise.all([
      db.select().from(solicitacoesAjuste),
      db.select().from(pdcaFeedback),
    ]);

    // O mesmo recorte do `GET /ajustes` (§273): pedido sem time é da
    // organização e aparece para todo mundo; com time, só para quem é dele.
    // Duas listagens com regras de visibilidade diferentes fariam a métrica
    // contar o que a tela não mostra.
    const solicitacoes = todasSolicitacoes.filter((s) => s.timeId === null || visiveis.includes(s.timeId));
    const feedbacks = todosFeedbacks.filter((f) => f.timeId === null || visiveis.includes(f.timeId));

    return metricasDoCiclo(
      solicitacoes.map((s) => ({
        recurso: s.recurso,
        estado: s.estado,
        criadoEm: s.criadoEm,
        decididoEm: s.decididoEm,
        motivoDaDecisao: s.motivoDaDecisao,
      })),
      feedbacks.map((f) => ({ estado: f.estado, criadoEm: f.criadoEm })),
      new Date(),
    );
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
            // SPEC-63 — a régua sobre a FORMA do desenho. `id` é obrigatório e
            // vem do cliente porque é a chave estável a que as exceções se
            // prendem: gerá-lo aqui faria o mesmo pedido aplicado duas vezes
            // criar duas regras, e as exceções se dividiriam entre elas.
            z.object({
              tipo: z.literal("adicionar-topologia"),
              requisito: z.object({
                id: z.string().trim().min(1),
                texto: z.string().trim().min(1),
                porque: z.string().trim().optional(),
                checagem: z.discriminatedUnion("tipo", [
                  z.object({
                    tipo: z.literal("exige-conexao"),
                    tipoNo: z.string().min(1),
                    direcao: z.enum(["entra", "sai"]),
                    tipoAresta: z.string().min(1).optional(),
                    tipoNoOposto: z.string().min(1).optional(),
                  }),
                  z.object({
                    tipo: z.literal("proibe-conexao"),
                    deTipoNo: z.string().min(1),
                    paraTipoNo: z.string().min(1),
                    tipoAresta: z.string().min(1).optional(),
                  }),
                  // SPEC-67 — o padrão como quantidade. `int().nonnegative()`
                  // porque máximo fracionário ou negativo é régua que nenhum
                  // desenho satisfaz; zero é legítimo ("nenhuma chamada
                  // síncrona daqui").
                  z.object({
                    tipo: z.literal("limita-grau"),
                    tipoNo: z.string().min(1),
                    direcao: z.enum(["entra", "sai"]),
                    maximo: z.number().int().nonnegative(),
                    tipoAresta: z.string().min(1).optional(),
                    apenasQueEsperam: z.boolean().optional(),
                  }),
                ]),
              }),
            }),
            z.object({ tipo: z.literal("remover-topologia"), id: z.string().min(1), texto: z.string().optional() }),
            // SPEC-50 — papel da esteira: o outro documento que o feedback cita.
            z.object({ tipo: z.literal("ativar-papel"), papelId: z.string().min(1), papelNome: z.string().optional() }),
            z.object({ tipo: z.literal("desativar-papel"), papelId: z.string().min(1), papelNome: z.string().optional() }),
            // SPEC-52 — a ficha do componente e a da conexão.
            z.object({ tipo: z.literal("adicionar-campo-no"), tipoNo: z.string().min(1), campo: campoProposto }),
            z.object({
              tipo: z.literal("remover-campo-no"),
              tipoNo: z.string().min(1),
              key: z.string().min(1),
              label: z.string().optional(),
            }),
            z.object({ tipo: z.literal("adicionar-campo-aresta"), tipoAresta: z.string().min(1), campo: campoProposto }),
            z.object({
              tipo: z.literal("remover-campo-aresta"),
              tipoAresta: z.string().min(1),
              key: z.string().min(1),
              label: z.string().optional(),
            }),
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

  /**
   * §273 — a lista é dos SEUS times, e do time ATIVO quando ele é dito.
   *
   * ACHADO REAL (print do usuário): a tela do PDCA mostrava solicitações de
   * `time-pagamentos` para quem estava em `time-silvio`, e agir sobre uma
   * delas trazia um 403 citando um time que a pessoa nunca escolheu. O erro
   * estava certo; a lista é que não deveria tê-lo colocado ali.
   *
   * Dois filtros, e os dois importam: `timeId` é a tela dizendo em que time se
   * está; a interseção com os times da SESSÃO é a garantia que não depende da
   * tela mandar o parâmetro certo — pedido de time alheio não volta nem com
   * `?timeId=` forjado.
   *
   * Solicitação sem time (`null`) é da organização: aparece para todo mundo.
   */
  app.get("/ajustes", { preHandler: exigirSessao }, async (req) => {
    const { timeId } = req.query as { timeId?: string };
    const meus = req.usuario!.timeIds;
    const visiveis = timeId ? meus.filter((t) => t === timeId) : meus;

    const todas = await db.select().from(solicitacoesAjuste).orderBy(desc(solicitacoesAjuste.criadoEm));
    return todas.filter((s) => s.timeId === null || visiveis.includes(s.timeId));
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
    const operacao = pedido.operacao as OperacaoDeAjuste;
    const alvo = recursoAlvoDaOperacao(operacao);

    const gate = exigirPermissao(db, organizacaoId, recursoDaSolicitacao(pedido), "editar", () => pedido.timeId);
    await gate(req, reply);
    if (reply.sent) return;

    /**
     * SPEC-52 — a ficha não é documento: campos por componente e por conexão
     * são tabela, com escopo. Aplicar aqui grava linha, mas o QUE gravar sai
     * da mesma função pura que a tela usou pra mostrar a prévia.
     *
     * O escopo é o time do pedido — a permissão foi checada com ele. Pedido
     * sem time mexe no global.
     */
    if (alvo === "campos-no" || alvo === "campos-aresta") {
      const escopo = pedido.timeId ?? CAMPO_GLOBAL;
      const resultado = await aplicarOperacaoDeCampo(
        operacao,
        escopo,
        alvo === "campos-no" ? fichaDeNos : fichaDeArestas
      );
      if (!resultado.ok) return reply.code(409).send({ erro: resultado.motivo });

      const [aplicadaEmCampos] = await db
        .update(solicitacoesAjuste)
        .set({ estado: "aplicada", aplicadaEm: new Date(), aplicadaPor: req.usuario!.email })
        .where(eq(solicitacoesAjuste.id, id))
        .returning();
      registrarAuditoria(db, {
        email: req.usuario!.email,
        acao: "atualizar",
        recurso: alvo === "campos-no" ? "campos_no" : "campos_aresta",
        recursoId: escopo,
      });
      return {
        id,
        estado: aplicadaEmCampos.estado,
        aplicadaPor: aplicadaEmCampos.aplicadaPor,
        criados: resultado.criados,
        removidos: resultado.removidos,
      };
    }

    const [doc] = await db
      .select()
      .from(configDocumentos)
      .where(and(eq(configDocumentos.chave, alvo), eq(configDocumentos.timeId, GLOBAL)))
      .limit(1);

    /**
     * §303 — sem linha gravada, a base é o TEMPLATE, não um 409.
     *
     * Aqui morava `if (!doc) return 409 "documento de <alvo> não encontrado"`.
     * Mas "não encontrado" é o estado normal de toda organização que ainda não
     * salvou config nenhuma: o `GET /config/:chave` sempre respondeu com o
     * template nesse caso (`obter` resolve time → global → template), e só o
     * `aplicar` tratava a ausência como erro.
     *
     * O efeito era um ajuste APROVADO que não aplicava — e a tela nem dizia
     * por quê: o card ficava em "aprovada" e o botão parecia não ter feito
     * nada (§244). Numa instalação nova, o PDCA inteiro era inalcançável até
     * alguém salvar uma config à mão pela aba.
     *
     * Ficou invisível por muito tempo porque, na suíte E2E, algum spec vizinho
     * sempre gravava o documento global antes deste rodar. Quando os specs de
     * regras foram para times próprios, ninguém mais gravou o global — e a CI,
     * com banco novo, reproduziu a instalação nova de verdade.
     */
    const base = doc?.documento ?? (await templateDaVersao(alvo, diretorioConfig));

    const documentoNovo =
      alvo === "pipeline-agentes"
        ? aplicarOperacaoNoPipeline(base as PipelineComPapeis, operacao)
        : aplicarOperacao(base as RegrasConfig, operacao);

    if (doc) {
      await db
        .update(configDocumentos)
        .set({ documento: documentoNovo, atualizadoEm: new Date() })
        .where(eq(configDocumentos.id, doc.id));
    } else {
      // A primeira gravação da organização. `onConflictDoUpdate` porque duas
      // aplicações simultâneas nasceriam as duas sem linha, e a segunda
      // estouraria na chave única em vez de gravar.
      await db
        .insert(configDocumentos)
        .values({ chave: alvo, timeId: GLOBAL, documento: documentoNovo })
        .onConflictDoUpdate({
          target: [...ALVO_CONFLITO_CONFIG],
          set: { documento: documentoNovo, atualizadoEm: new Date() },
        });
    }
    const [aplicada] = await db
      .update(solicitacoesAjuste)
      .set({ estado: "aplicada", aplicadaEm: new Date(), aplicadaPor: req.usuario!.email })
      .where(eq(solicitacoesAjuste.id, id))
      .returning();

    registrarAuditoria(db, { email: req.usuario!.email, acao: "atualizar", recurso: "config_documentos", recursoId: alvo });
    return { id, estado: aplicada.estado, aplicadaPor: aplicada.aplicadaPor };
  });

  app.post("/ajustes/:id/decidir", { preHandler: exigirSessao }, async (req, reply) => {
    const { id } = req.params as { id: string };
    // SPEC-62 §3 — `motivo` é o POR QUÊ da recusa. Opcional e não obrigatório:
    // exigir texto para dizer "não" transformaria a recusa num formulário, e o
    // que acontece com formulário obrigatório é gente escrevendo "não" no campo.
    // A tela pede; a API aceita sem.
    const corpo = z.object({ aprovar: z.boolean(), motivo: z.string().trim().max(500).optional() }).safeParse(req.body);
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
      const versaoAtual = await versaoDoDocumento(
        pedido.operacao ? recursoAlvoDaOperacao(pedido.operacao as OperacaoDeAjuste) : pedido.recurso
      );
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
      .set({
        estado,
        decididoPor: req.usuario!.email,
        decididoEm: new Date(),
        // Aprovar limpa o motivo de uma recusa anterior: ele descrevia um "não"
        // que deixou de valer. Quem quer o rastro completo tem a auditoria.
        motivoDaDecisao: corpo.data.aprovar ? null : corpo.data.motivo ?? null,
      })
      .where(eq(solicitacoesAjuste.id, id));
    registrarAuditoria(db, { email: req.usuario!.email, acao: estado, recurso: "solicitacoes_ajuste", recursoId: id });
    return { id, estado, motivoDaDecisao: corpo.data.aprovar ? null : corpo.data.motivo ?? null };
  });

  /**
   * SPEC-62 §3 — o caminho de volta.
   *
   * Recusar devolvia 409 para qualquer nova decisão: o pedido morria ali, sem
   * volta nem pela API. E `invalida` era pior — a própria mensagem manda
   * *"reavalie sobre o estado atual"* e não havia como reavaliar.
   *
   * O "não" anterior **não se apaga**: `decididoPor`, `decididoEm` e
   * `motivoDaDecisao` continuam gravados quando o pedido volta a `pendente`.
   * Mesma disciplina de `substituidaPor` na decisão de arquitetura (SPEC-57) —
   * quem apaga a decisão revista faz o time repetir o ciclo que a produziu.
   *
   * Mesmo gate da decisão: quem pode dizer não é quem pode desdizer.
   */
  app.post("/ajustes/:id/reconsiderar", { preHandler: exigirSessao }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const [pedido] = await db.select().from(solicitacoesAjuste).where(eq(solicitacoesAjuste.id, id)).limit(1);
    if (!pedido) return reply.code(404).send({ erro: "solicitação não encontrada" });
    if (pedido.estado !== "rejeitada" && pedido.estado !== "invalida") {
      return reply.code(409).send({ erro: `só solicitação recusada ou invalidada reconsidera — esta está "${pedido.estado}"` });
    }

    const gate = exigirPermissao(db, organizacaoId, recursoDaSolicitacao(pedido), "editar", () => pedido.timeId);
    await gate(req, reply);
    if (reply.sent) return;

    /**
     * A versão-alvo é RETOMADA do estado de agora. Reconsiderar um pedido
     * `invalida` sem isso o deixaria invalidando de novo na primeira aprovação,
     * para sempre — o pedido voltaria a pendente só para morrer igual.
     */
    const [reaberta] = await db
      .update(solicitacoesAjuste)
      .set({
        estado: "pendente",
        versaoAlvo: await versaoDoDocumento(
          pedido.operacao ? recursoAlvoDaOperacao(pedido.operacao as OperacaoDeAjuste) : pedido.recurso
        ),
      })
      .where(eq(solicitacoesAjuste.id, id))
      .returning();
    registrarAuditoria(db, {
      email: req.usuario!.email,
      acao: "reconsiderar",
      recurso: "solicitacoes_ajuste",
      recursoId: id,
    });
    return { id, estado: reaberta.estado };
  });
}
