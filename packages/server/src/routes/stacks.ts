import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { criarCasosDeUsoDeStacks } from "@gerador/aplicacao";
import type { OpcoesApp } from "../app.js";
import { criarRepositorioDeStacksEmPostgres } from "../adaptadores/stacksEmPostgres.js";
import { exigirEdicaoCurada, organizacaoPadraoDe } from "../auth/permissoes.js";
import { registrarAuditoria } from "../auditoria.js";

const corpoCriar = z.object({ tipoNo: z.string().min(1), nome: z.string().trim().min(1).max(80) });
const corpoValores = z.object({ valores: z.record(z.string()) });
const corpoCapturar = z.object({ tipoNo: z.string().min(1), valores: z.record(z.string()) });

/**
 * SPEC-43 — stacks conhecidas: catálogo global por componente, sem vínculo
 * por time. Leitura aberta (sugestão serve a todo mundo); escrita segue o
 * MESMO RBAC da SPEC-38 (`exigirEdicaoCurada` sobre `perfis-stack` —
 * recurso mantém o nome pra permissões concedidas continuarem valendo).
 * As rotas `/perfis-time/*` e o ponteiro do time morreram junto com o
 * modelo (migração 0026).
 */
export async function registrarRotasStacks(app: FastifyInstance, { db }: OpcoesApp) {
  const casos = criarCasosDeUsoDeStacks(criarRepositorioDeStacksEmPostgres(db));
  const organizacaoId = organizacaoPadraoDe(db);

  async function orgObrigatoria(): Promise<string> {
    const orgId = await organizacaoId();
    if (!orgId) throw new Error("instalação sem organização");
    return orgId;
  }

  app.get("/stacks", async () => ({ stacks: await casos.catalogo() }));

  /** O agregado dos chips: `tipoNo → campo → valores conhecidos`. */
  app.get("/stacks/sugestoes", () => casos.sugestoes());

  app.post("/stacks", { preHandler: exigirEdicaoCurada(db, organizacaoId, "perfis-stack") }, async (req, reply) => {
    const corpo = corpoCriar.safeParse(req.body);
    if (!corpo.success) return reply.code(400).send({ erro: corpo.error.flatten() });

    const stack = await casos.criar(await orgObrigatoria(), corpo.data.tipoNo, corpo.data.nome, req.usuario!.email);
    registrarAuditoria(db, { email: req.usuario!.email, acao: "criar", recurso: "stacks", recursoId: stack.id });
    return reply.code(201).send(stack);
  });

  app.put(
    "/stacks/:id/valores",
    { preHandler: exigirEdicaoCurada(db, organizacaoId, "perfis-stack") },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const corpo = corpoValores.safeParse(req.body);
      if (!corpo.success) return reply.code(400).send({ erro: corpo.error.flatten() });

      const valores = await casos.definirValores(id, corpo.data.valores);
      registrarAuditoria(db, { email: req.usuario!.email, acao: "atualizar", recurso: "stacks", recursoId: id });
      return valores;
    }
  );

  /** A captura do painel: "salvar estes valores como stack conhecida". */
  app.post(
    "/stacks/capturar",
    { preHandler: exigirEdicaoCurada(db, organizacaoId, "perfis-stack") },
    async (req, reply) => {
      const corpo = corpoCapturar.safeParse(req.body);
      if (!corpo.success) return reply.code(400).send({ erro: corpo.error.flatten() });

      const stack = await casos.capturar(
        await orgObrigatoria(),
        corpo.data.tipoNo,
        corpo.data.valores,
        req.usuario!.email
      );
      registrarAuditoria(db, { email: req.usuario!.email, acao: "capturar", recurso: "stacks", recursoId: stack.id });
      return stack;
    }
  );
}
