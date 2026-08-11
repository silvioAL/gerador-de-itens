import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { CAMPO_GLOBAL, criarCasosDeUsoDeCamposAresta } from "@gerador/aplicacao";
import type { OpcoesApp } from "../app.js";
import { criarRepositorioDeCamposArestaEmPostgres } from "../adaptadores/camposArestaEmPostgres.js";
import { exigirTime } from "../auth/middleware.js";
import { exigirPermissao, organizacaoPadraoDe } from "../auth/permissoes.js";
import { registrarAuditoria } from "../auditoria.js";

/**
 * SPEC-31 (paridade) / #303 — campos por tipo de conexão.
 *
 * A rota virou borda, como `camposNo`: autentica, autoriza, audita — e delega
 * ao caso de uso. O SQL que morava aqui foi para o adaptador
 * (`camposArestaEmPostgres`), e a cópia inline da regra de sobreposição, que a
 * §153 apontou como "quarta cópia sem dono", morreu com ele: quem resolve o
 * merge global × time é `camposArestaEfetivos`, na porta.
 *
 * Mesma régua de `campos-no`: leitura aberta, escrita exige o time, e o campo
 * do time vence o global de mesma (`tipoAresta`, `key`).
 */
const corpoCampoAresta = z.object({
  timeId: z.string().min(1).default(CAMPO_GLOBAL),
  tipoAresta: z.string().min(1),
  key: z.string().min(1),
  label: z.string().min(1),
  type: z.enum(["text", "textarea", "number", "boolean", "select"]),
  required: z.boolean().default(false),
  valorPadrao: z.string().optional(),
  opcoes: z.array(z.string()).optional(),
  ajuda: z.string().optional(),
  ordem: z.number().int().default(0),
});

const corpoAtualizar = corpoCampoAresta.partial().omit({ timeId: true, tipoAresta: true, key: true });

function comoTimeParaAutorizacao(timeId: string): string | null {
  return timeId === CAMPO_GLOBAL ? null : timeId;
}

export async function registrarRotasCamposAresta(app: FastifyInstance, { db }: OpcoesApp) {
  const casos = criarCasosDeUsoDeCamposAresta(criarRepositorioDeCamposArestaEmPostgres(db));

  /** SPEC-28 Fase 1b — camada de cima de `exigirTime`, igual a campos-no. O
   * time precisa chegar até a checagem, senão papel com escopo de time é
   * negado no próprio time (a lição que custou um teste vermelho lá). */
  const podeEditarArestas = (resolverTimeId: Parameters<typeof exigirPermissao>[4]) =>
    exigirPermissao(db, organizacaoPadraoDe(db), "campos-aresta", "editar", resolverTimeId);

  /** O time de um campo existente — o `:id` não diz de que time é. */
  const timeDoCampo = async (req: FastifyRequest) => {
    const { id } = req.params as { id: string };
    const campo = await casos.obter(id);
    return comoTimeParaAutorizacao(campo?.timeId ?? CAMPO_GLOBAL);
  };

  app.get("/campos-aresta", async (req) => {
    const { timeId } = req.query as { timeId?: string };
    return casos.listarEfetivos(timeId);
  });

  app.post(
    "/campos-aresta",
    {
      preHandler: [
        exigirTime((req) => comoTimeParaAutorizacao((req.body as { timeId?: string })?.timeId ?? CAMPO_GLOBAL)),
        podeEditarArestas((req) => comoTimeParaAutorizacao((req.body as { timeId?: string })?.timeId ?? CAMPO_GLOBAL)),
      ],
    },
    async (req, reply) => {
      const corpo = corpoCampoAresta.safeParse(req.body);
      if (!corpo.success) return reply.code(400).send({ erro: corpo.error.flatten() });

      const salvo = await casos.salvar(corpo.data);
      registrarAuditoria(db, { email: req.usuario!.email, acao: "criar", recurso: "campos_aresta", recursoId: salvo.id });
      return reply.code(201).send(salvo);
    }
  );

  app.put(
    "/campos-aresta/:id",
    {
      preHandler: [
        exigirTime(timeDoCampo),
        podeEditarArestas(timeDoCampo),
      ],
    },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const corpo = corpoAtualizar.safeParse(req.body);
      if (!corpo.success) return reply.code(400).send({ erro: corpo.error.flatten() });

      const atualizado = await casos.atualizar(id, corpo.data);
      if (!atualizado) return reply.code(404).send({ erro: "campo não encontrado" });
      registrarAuditoria(db, { email: req.usuario!.email, acao: "atualizar", recurso: "campos_aresta", recursoId: id });
      return atualizado;
    }
  );

  app.delete(
    "/campos-aresta/:id",
    {
      preHandler: [
        exigirTime(timeDoCampo),
        podeEditarArestas(timeDoCampo),
      ],
    },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      if (!(await casos.excluir(id))) return reply.code(404).send({ erro: "campo não encontrado" });
      registrarAuditoria(db, { email: req.usuario!.email, acao: "excluir", recurso: "campos_aresta", recursoId: id });
      return reply.code(204).send();
    }
  );
}
