import { and, eq, inArray } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { OpcoesApp } from "../app.js";
import { registrarAuditoria } from "../auditoria.js";
import { exigirSessao } from "../auth/middleware.js";
import { ACOES, RECURSOS, exigirPermissao, resolverPermissoes } from "../auth/permissoes.js";
import { organizacoes, papeisAcesso, papelPermissao, usuarioPapel } from "../db/schema.js";

/**
 * SPEC-28 Fase 1 — a API de acessos. A UI é a Fase 2; aqui o que existe é o
 * suficiente para configurar e para os testes provarem o cenário do usuário
 * (Agilidade × Arquitetura, e o mesmo papel por time).
 */

const corpoPapel = z.object({
  nome: z.string().min(1),
  // `z.enum` sobre as listas fechadas: recurso/ação inventados são 400 aqui,
  // não uma linha morta no banco que nenhuma rota jamais checaria.
  permissoes: z
    .array(z.object({ recurso: z.enum(RECURSOS), acao: z.enum(ACOES) }))
    .default([]),
});

const corpoAtribuicao = z.object({
  email: z.string().min(1),
  /** Ausente = papel vale na organização inteira. */
  escopoTimeId: z.string().min(1).optional(),
});

/** O papel que nasce junto com o primeiro papel da organização, para que ligar
 * o RBAC não tranque quem o ligou. Nome fixo porque a UI o mostra como qualquer
 * outro — ele é editável e removível depois, não é mágico. */
export const NOME_PAPEL_ADMINISTRADOR = "Administrador";

export async function registrarRotasAcessos(app: FastifyInstance, { db }: OpcoesApp) {
  async function organizacaoPadrao(): Promise<string | null> {
    const [org] = await db.select({ id: organizacoes.id }).from(organizacoes).limit(1);
    return org?.id ?? null;
  }

  const exigeAdministrarAcessos = exigirPermissao(db, organizacaoPadrao, "acessos", "editar");

  /**
   * O que EU posso — é isto que a UI usa para esconder o que seria negado.
   * Esconder é conveniência; a negação real acontece em cada rota.
   */
  app.get("/permissoes/minhas", { preHandler: exigirSessao }, async (req) => {
    const orgId = await organizacaoPadrao();
    const { timeId } = req.query as { timeId?: string };
    if (!orgId) return { rbacAtivo: false, porRecurso: {} };
    return resolverPermissoes(db, orgId, req.usuario!.email, timeId ?? null);
  });

  /** Catálogo — a UI monta a matriz recurso×ação a partir daqui, nunca de uma
   * lista copiada no front (que envelheceria em silêncio). */
  app.get("/acessos/catalogo", { preHandler: exigirSessao }, async () => ({
    recursos: RECURSOS,
    acoes: ACOES,
  }));

  app.get("/acessos/papeis", { preHandler: exigirSessao }, async () => {
    const orgId = await organizacaoPadrao();
    if (!orgId) return [];
    const papeis = await db
      .select()
      .from(papeisAcesso)
      .where(eq(papeisAcesso.organizacaoId, orgId));
    if (papeis.length === 0) return [];

    const ids = papeis.map((p) => p.id);
    const permissoes = await db.select().from(papelPermissao).where(inArray(papelPermissao.papelId, ids));
    const membros = await db.select().from(usuarioPapel).where(inArray(usuarioPapel.papelId, ids));

    return papeis.map((p) => ({
      id: p.id,
      nome: p.nome,
      permissoes: permissoes.filter((x) => x.papelId === p.id).map(({ recurso, acao }) => ({ recurso, acao })),
      membros: membros
        .filter((m) => m.papelId === p.id)
        .map(({ email, escopoTimeId }) => ({ email, escopoTimeId })),
    }));
  });

  app.post("/acessos/papeis", { preHandler: exigeAdministrarAcessos }, async (req, reply) => {
    const orgId = await organizacaoPadrao();
    if (!orgId) return reply.code(409).send({ erro: "nenhuma organização configurada" });

    const parseado = corpoPapel.safeParse(req.body);
    if (!parseado.success) return reply.code(400).send({ erro: parseado.error.flatten() });
    const corpo = parseado.data;

    /**
     * TRANCA DO PRIMEIRO PAPEL — medido contra o Postgres antes de existir esta
     * correção: `POST /acessos/papeis` devolvia 201 e o
     * `POST /acessos/papeis/:id/membros` seguinte devolvia 403, deixando a
     * organização sem ninguém capaz de administrar acessos. Saída só pelo banco.
     *
     * A causa é uma assimetria de tempo: o RBAC liga quando **existe** papel na
     * organização (`resolverPermissoes`), não quando alguém **tem** papel. A
     * primeira criação passa pelo modo aberto e, ao terminar, fecha a porta
     * atrás de si — inclusive para quem acabou de criá-la.
     *
     * Auto-atribuir o papel recém-criado a quem o criou NÃO resolve: um primeiro
     * papel "Agilidade", sem `acessos`, tranca igual. O que resolve é garantir
     * que quem liga o controle de acesso continue podendo administrá-lo — que é
     * também a regra mais defensável do ponto de vista de produto, já que a
     * delegação a setores pressupõe alguém que delega.
     */
    const jaExistiaPapel = await db
      .select({ id: papeisAcesso.id })
      .from(papeisAcesso)
      .where(eq(papeisAcesso.organizacaoId, orgId))
      .limit(1);

    const [papel] = await db
      .insert(papeisAcesso)
      .values({ organizacaoId: orgId, nome: corpo.nome })
      .returning();
    if (corpo.permissoes.length > 0) {
      await db.insert(papelPermissao).values(corpo.permissoes.map((p) => ({ papelId: papel.id, ...p })));
    }

    if (jaExistiaPapel.length === 0) {
      const [administrador] = await db
        .insert(papeisAcesso)
        .values({ organizacaoId: orgId, nome: NOME_PAPEL_ADMINISTRADOR })
        .returning();
      await db.insert(papelPermissao).values({ papelId: administrador.id, recurso: "acessos", acao: "editar" });
      await db.insert(usuarioPapel).values({ papelId: administrador.id, email: req.usuario!.email, escopoTimeId: null });
    }
    registrarAuditoria(db, { email: req.usuario!.email, acao: "criar", recurso: "papeis_acesso", recursoId: papel.id });
    return reply.code(201).send({ id: papel.id, nome: papel.nome, permissoes: corpo.permissoes });
  });

  /** Substitui a matriz inteira do papel — mais simples de raciocinar (e de
   * testar) que somar/remover permissão a permissão, e é como a UI edita. */
  app.put("/acessos/papeis/:id", { preHandler: exigeAdministrarAcessos }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const parseado = corpoPapel.safeParse(req.body);
    if (!parseado.success) return reply.code(400).send({ erro: parseado.error.flatten() });
    const corpo = parseado.data;
    const [papel] = await db.select().from(papeisAcesso).where(eq(papeisAcesso.id, id));
    if (!papel) return reply.code(404).send({ erro: "papel não encontrado" });

    await db.update(papeisAcesso).set({ nome: corpo.nome }).where(eq(papeisAcesso.id, id));
    await db.delete(papelPermissao).where(eq(papelPermissao.papelId, id));
    if (corpo.permissoes.length > 0) {
      await db.insert(papelPermissao).values(corpo.permissoes.map((p) => ({ papelId: id, ...p })));
    }
    registrarAuditoria(db, { email: req.usuario!.email, acao: "atualizar", recurso: "papeis_acesso", recursoId: id });
    return { id, nome: corpo.nome, permissoes: corpo.permissoes };
  });

  app.delete("/acessos/papeis/:id", { preHandler: exigeAdministrarAcessos }, async (req, reply) => {
    const { id } = req.params as { id: string };
    // `onDelete: cascade` leva permissões e atribuições junto: papel apagado
    // não pode deixar permissão órfã autorizando nada.
    const apagados = await db.delete(papeisAcesso).where(eq(papeisAcesso.id, id)).returning();
    if (apagados.length === 0) return reply.code(404).send({ erro: "papel não encontrado" });
    registrarAuditoria(db, { email: req.usuario!.email, acao: "excluir", recurso: "papeis_acesso", recursoId: id });
    return reply.code(204).send();
  });

  app.post("/acessos/papeis/:id/membros", { preHandler: exigeAdministrarAcessos }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const parseado = corpoAtribuicao.safeParse(req.body);
    if (!parseado.success) return reply.code(400).send({ erro: parseado.error.flatten() });
    const corpo = parseado.data;
    const [papel] = await db.select().from(papeisAcesso).where(eq(papeisAcesso.id, id));
    if (!papel) return reply.code(404).send({ erro: "papel não encontrado" });

    await db
      .insert(usuarioPapel)
      .values({ email: corpo.email, papelId: id, escopoTimeId: corpo.escopoTimeId ?? null })
      .onConflictDoNothing();
    registrarAuditoria(db, { email: req.usuario!.email, acao: "criar", recurso: "usuario_papel", recursoId: `${id}:${corpo.email}` });
    return reply.code(201).send({ email: corpo.email, escopoTimeId: corpo.escopoTimeId ?? null });
  });

  app.delete("/acessos/papeis/:id/membros/:email", { preHandler: exigeAdministrarAcessos }, async (req, reply) => {
    const { id, email } = req.params as { id: string; email: string };
    await db
      .delete(usuarioPapel)
      .where(and(eq(usuarioPapel.papelId, id), eq(usuarioPapel.email, decodeURIComponent(email))));
    registrarAuditoria(db, { email: req.usuario!.email, acao: "excluir", recurso: "usuario_papel", recursoId: `${id}:${email}` });
    return reply.code(204).send();
  });
}
