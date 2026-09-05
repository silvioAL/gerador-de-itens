import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  criarCasosDeUsoDeConfig,
  criarCasosDeUsoDeProdutos,
  destinosDaOperacao,
  normalizarExportador,
} from "@gerador/aplicacao";
import type { OpcoesApp } from "../app.js";
import { criarRepositorioDeProdutosEmPostgres } from "../adaptadores/produtosEmPostgres.js";
import { criarRepositorioDeConfigEmPostgres } from "../adaptadores/configEmPostgres.js";
import { exigirSessao } from "../auth/middleware.js";
import { exigirPermissao, organizacaoPadraoDe } from "../auth/permissoes.js";
import { registrarAuditoria } from "../auditoria.js";

/**
 * SPEC-53 Fase 1 — as rotas do produto.
 *
 * Leitura exige SESSÃO (e não é aberta como campos-no e stacks): o que está
 * aqui é vocabulário e regra de negócio da empresa, não configuração técnica
 * que serve a todo mundo ver.
 *
 * Escrita exige o recurso `produtos` — dono próprio, porque quem responde pelo
 * vocabulário do domínio não é quem cuida de stack nem de pipeline.
 */
const corpoCriar = z.object({ nome: z.string().trim().min(1).max(120) });

const corpoAtualizar = z.object({
  nome: z.string().trim().min(1).max(120).optional(),
  objetivo: z.string().optional(),
  quemUsa: z.string().optional(),
  regrasDeNegocio: z.string().optional(),
  sistemas: z.string().optional(),
  restricoes: z.string().optional(),
  /**
   * SPEC-77 — o volume que o produto atende.
   *
   * `nullable` além de `optional`, e a diferença importa: **ausente** é "não
   * mexi nisto" (o formulário de outra seção), **null** é "apaguei o número".
   * Sem os dois, quem quisesse remover um volume declarado por engano não
   * teria como dizer isso.
   *
   * `picoDe` sem teto de propósito — "5×" é conhecimento de negócio, e um
   * limite inventado aqui seria o produto opinando sobre o pico de alguém.
   */
  volumetria: z
    .object({
      quantidade: z.number().int().positive(),
      por: z.enum(["segundo", "minuto", "hora", "dia"]),
      picoDe: z.number().positive().optional(),
    })
    .nullable()
    .optional(),
});

const corpoTimes = z.object({ timeIds: z.array(z.string().min(1)) });
const corpoTermo = z.object({ termo: z.string().trim().min(1).max(80), definicao: z.string().trim().min(1) });

export async function registrarRotasProdutos(app: FastifyInstance, { db }: OpcoesApp) {
  const casos = criarCasosDeUsoDeProdutos(criarRepositorioDeProdutosEmPostgres(db));
  const organizacaoId = organizacaoPadraoDe(db);
  const podeEditar = exigirPermissao(db, organizacaoId, "produtos", "editar");

  async function orgOuErro(reply: { code: (n: number) => { send: (o: unknown) => unknown } }): Promise<string | null> {
    const orgId = await organizacaoId();
    if (!orgId) {
      reply.code(409).send({ erro: "nenhuma organização configurada" });
      return null;
    }
    return orgId;
  }

  /** `?timeId=` filtra pelos que interessam ao time — produto sem time
   * nenhum aparece para todos (é o estado em que ele nasce). */
  app.get("/produtos", { preHandler: exigirSessao }, async (req, reply) => {
    const orgId = await organizacaoId();
    if (!orgId) return [];
    const { timeId } = req.query as { timeId?: string };
    return casos.listar(orgId, timeId);
  });

  app.get("/produtos/:id", { preHandler: exigirSessao }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const produto = await casos.obter(id);
    if (!produto) return reply.code(404).send({ erro: "produto não encontrado" });
    return produto;
  });

  app.post("/produtos", { preHandler: podeEditar }, async (req, reply) => {
    const corpo = corpoCriar.safeParse(req.body);
    if (!corpo.success) return reply.code(400).send({ erro: corpo.error.flatten() });
    const orgId = await orgOuErro(reply);
    if (!orgId) return;

    const produto = await casos.criar(orgId, corpo.data.nome, req.usuario!.email);
    registrarAuditoria(db, { email: req.usuario!.email, acao: "criar", recurso: "produtos", recursoId: produto.id });
    return reply.code(201).send(produto);
  });

  app.put("/produtos/:id", { preHandler: podeEditar }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const corpo = corpoAtualizar.safeParse(req.body);
    if (!corpo.success) return reply.code(400).send({ erro: corpo.error.flatten() });

    const produto = await casos.atualizar(id, corpo.data);
    if (!produto) return reply.code(404).send({ erro: "produto não encontrado" });
    registrarAuditoria(db, { email: req.usuario!.email, acao: "atualizar", recurso: "produtos", recursoId: id });
    return produto;
  });

  app.put("/produtos/:id/times", { preHandler: podeEditar }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const corpo = corpoTimes.safeParse(req.body);
    if (!corpo.success) return reply.code(400).send({ erro: corpo.error.flatten() });

    const produto = await casos.definirTimes(id, corpo.data.timeIds);
    if (!produto) return reply.code(404).send({ erro: "produto não encontrado" });
    registrarAuditoria(db, { email: req.usuario!.email, acao: "atualizar", recurso: "produtos", recursoId: id });
    return produto;
  });

  app.post("/produtos/:id/glossario", { preHandler: podeEditar }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const corpo = corpoTermo.safeParse(req.body);
    if (!corpo.success) return reply.code(400).send({ erro: corpo.error.flatten() });
    if (!(await casos.obter(id))) return reply.code(404).send({ erro: "produto não encontrado" });

    const termo = await casos.salvarTermo(id, corpo.data.termo, corpo.data.definicao);
    registrarAuditoria(db, { email: req.usuario!.email, acao: "atualizar", recurso: "produtos", recursoId: id });
    return reply.code(201).send(termo);
  });

  app.delete("/produtos/:id/glossario/:termoId", { preHandler: podeEditar }, async (req, reply) => {
    const { id, termoId } = req.params as { id: string; termoId: string };
    if (!(await casos.excluirTermo(termoId))) return reply.code(404).send({ erro: "termo não encontrado" });
    registrarAuditoria(db, { email: req.usuario!.email, acao: "atualizar", recurso: "produtos", recursoId: id });
    return reply.code(204).send();
  });

  app.delete("/produtos/:id", { preHandler: podeEditar }, async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!(await casos.excluir(id))) return reply.code(404).send({ erro: "produto não encontrado" });
    registrarAuditoria(db, { email: req.usuario!.email, acao: "excluir", recurso: "produtos", recursoId: id });
    return reply.code(204).send();
  });
}
