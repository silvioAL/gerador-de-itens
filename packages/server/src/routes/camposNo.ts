import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { CAMPO_GLOBAL, criarCasosDeUsoDeCamposNo } from "@gerador/aplicacao";
import type { OpcoesApp } from "../app.js";
import { criarRepositorioDeCamposNoEmPostgres } from "../adaptadores/camposNoEmPostgres.js";
import { exigirTime } from "../auth/middleware.js";
import { exigirPermissao } from "../auth/permissoes.js";
import { registrarAuditoria } from "../auditoria.js";
import { organizacoes } from "../db/schema.js";

const tipoCampo = z.enum(["text", "textarea", "number", "boolean", "select", "lista"]);
/** Sub-campo dentro de um `type: "lista"` — sem "lista" aninhada. */
const tipoItemSpec = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  type: z.enum(["text", "textarea", "number", "boolean", "select"]),
  options: z.array(z.string()).optional(),
});

const corpoCampoNo = z.object({
  timeId: z.string().min(1).default(CAMPO_GLOBAL),
  tipoNo: z.string().min(1),
  key: z.string().min(1),
  label: z.string().min(1),
  type: tipoCampo,
  required: z.boolean().default(false),
  valorPadrao: z.string().optional(),
  opcoes: z.array(z.string()).optional(),
  ajuda: z.string().optional(),
  permiteNA: z.boolean().default(false),
  ordem: z.number().int().default(0),
  itemSpec: z.array(tipoItemSpec).optional(),
});

const corpoAtualizarCampoNo = corpoCampoNo.partial().omit({ timeId: true, tipoNo: true, key: true });

/** `timeId` do recurso pro middleware `exigirTime` — `__global__` não exige time nenhum. */
function comoTimeParaAutorizacao(timeId: string): string | null {
  return timeId === CAMPO_GLOBAL ? null : timeId;
}

export async function registrarRotasCamposNo(app: FastifyInstance, { db }: OpcoesApp) {
  // A rota virou borda: autentica, autoriza, audita — e delega o resto ao
  // mesmo caso de uso que o modo local usa (SPEC-31 Fase 2).
  const casos = criarCasosDeUsoDeCamposNo(criarRepositorioDeCamposNoEmPostgres(db));

  async function organizacaoPadrao(): Promise<string | null> {
    const [org] = await db.select({ id: organizacoes.id }).from(organizacoes).limit(1);
    return org?.id ?? null;
  }
  /**
   * SPEC-28: a permissão é camada de CIMA de `exigirTime` — pertencer ao time
   * continua necessário; sem papel nenhum na organização, nada muda (§4.3).
   *
   * O `resolverTimeId` NÃO é opcional aqui, e isso custou um teste vermelho:
   * sem ele, `resolverPermissoes` só considera papéis de escopo
   * organizacional, e quem tem "Agilidade no time-pagamentos" era negado até
   * no próprio time. O terceiro eixo da SPEC-28 só existe se o contexto do
   * time chegar até a checagem.
   */
  const podeEditarCampos = (resolverTimeId: (req: FastifyRequest) => string | null | Promise<string | null>) =>
    exigirPermissao(db, organizacaoPadrao, "campos-no", "editar", resolverTimeId);

  // Leitura é aberta (sem sessão) — mesma régua de perfis-time: times
  // se beneficiam de ver a config uns dos outros, só a escrita é restrita.
  app.get("/campos-no", async (req) => {
    const { timeId } = req.query as { timeId?: string };
    return casos.listarEfetivos(timeId);
  });

  app.post(
    "/campos-no",
    {
      preHandler: [
        exigirTime((req) => comoTimeParaAutorizacao((req.body as { timeId?: string }).timeId ?? CAMPO_GLOBAL)),
        podeEditarCampos((req) => comoTimeParaAutorizacao((req.body as { timeId?: string }).timeId ?? CAMPO_GLOBAL)),
      ],
    },
    async (req, reply) => {
      const corpo = corpoCampoNo.safeParse(req.body);
      if (!corpo.success) return reply.code(400).send({ erro: corpo.error.flatten() });

      const criado = await casos.salvar(corpo.data);
      registrarAuditoria(db, { email: req.usuario!.email, acao: "criar", recurso: "campos_no", recursoId: criado.id });
      return reply.code(201).send(criado);
    }
  );

  app.put(
    "/campos-no/:id",
    {
      preHandler: [
        exigirTime(async (req) => {
          const { id } = req.params as { id: string };
          const campo = await casos.obter(id);
          return comoTimeParaAutorizacao(campo?.timeId ?? CAMPO_GLOBAL);
        }),
        podeEditarCampos(async (req) => {
          const { id } = req.params as { id: string };
          const campo = await casos.obter(id);
          return comoTimeParaAutorizacao(campo?.timeId ?? CAMPO_GLOBAL);
        }),
      ],
    },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const corpo = corpoAtualizarCampoNo.safeParse(req.body);
      if (!corpo.success) return reply.code(400).send({ erro: corpo.error.flatten() });

      const atualizado = await casos.atualizar(id, corpo.data);
      if (!atualizado) return reply.code(404).send({ erro: "campo não encontrado" });
      registrarAuditoria(db, { email: req.usuario!.email, acao: "atualizar", recurso: "campos_no", recursoId: id });
      return atualizado;
    }
  );

  app.delete(
    "/campos-no/:id",
    {
      preHandler: [
        exigirTime(async (req) => {
          const { id } = req.params as { id: string };
          const campo = await casos.obter(id);
          return comoTimeParaAutorizacao(campo?.timeId ?? CAMPO_GLOBAL);
        }),
        podeEditarCampos(async (req) => {
          const { id } = req.params as { id: string };
          const campo = await casos.obter(id);
          return comoTimeParaAutorizacao(campo?.timeId ?? CAMPO_GLOBAL);
        }),
      ],
    },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      if (!(await casos.excluir(id))) return reply.code(404).send({ erro: "campo não encontrado" });
      registrarAuditoria(db, { email: req.usuario!.email, acao: "excluir", recurso: "campos_no", recursoId: id });
      return reply.code(204).send();
    }
  );
}
