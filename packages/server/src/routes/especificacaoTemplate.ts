import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { CAMPO_GLOBAL, criarCasosDeUsoDeTemplateEspecificacao, TemplateInvalido } from "@gerador/aplicacao";
import type { OpcoesApp } from "../app.js";
import { criarRepositorioDeTemplateEspecificacaoEmPostgres } from "../adaptadores/templateEspecificacaoEmPostgres.js";
import { exigirTime } from "../auth/middleware.js";
import { exigirPermissao, organizacaoPadraoDe } from "../auth/permissoes.js";
import { registrarAuditoria } from "../auditoria.js";

const corpoTemplate = z.object({
  timeId: z.string().min(1).default(CAMPO_GLOBAL),
  conteudo: z.string().min(1),
  /** SPEC-47 — `item` é o template do corpo de cada item; default, o documento. */
  tipo: z.enum(["documento", "item"]).default("documento"),
});

/** `timeId` do recurso pro middleware `exigirTime` — `__global__` não exige time nenhum. */
function comoTimeParaAutorizacao(timeId: string): string | null {
  return timeId === CAMPO_GLOBAL ? null : timeId;
}

/**
 * Template da especificação de entrega (SPEC-14) — 1 documento por quebra,
 * então 1 template por `timeId`. Leitura aberta (sem sessão) — mesma régua de
 * campos-no/perfis-time.
 *
 * A validação das variáveis saiu daqui e foi para o caso de uso (SPEC-31
 * Fase 2): estava só neste lado, e o modo local aceitava `{{tipoErrado}}` sem
 * reclamar.
 */
export async function registrarRotasEspecificacaoTemplate(app: FastifyInstance, { db }: OpcoesApp) {
  const casos = criarCasosDeUsoDeTemplateEspecificacao(criarRepositorioDeTemplateEspecificacaoEmPostgres(db));

  app.get("/especificacao-template", async (req) => {
    // SPEC-47 — `tipo=item` devolve o template do CORPO de cada item; sem
    // parâmetro, o do documento (o comportamento de sempre).
    const { timeId, tipo } = req.query as { timeId?: string; tipo?: string };
    return casos.obter(timeId, tipo === "item" ? "item" : "documento");
  });

  // Upsert por chave natural (timeId) — não expõe id sintético pro cliente
  // ter que buscar antes de editar.
  app.put(
    "/especificacao-template",
    {
      preHandler: [
        exigirTime((req) => comoTimeParaAutorizacao((req.body as { timeId?: string })?.timeId ?? CAMPO_GLOBAL)),
        exigirPermissao(db, organizacaoPadraoDe(db), "especificacao-template", "editar", (req) =>
          comoTimeParaAutorizacao((req.body as { timeId?: string })?.timeId ?? CAMPO_GLOBAL)
        ),
      ],
    },
    async (req, reply) => {
      const corpo = corpoTemplate.safeParse(req.body);
      if (!corpo.success) return reply.code(400).send({ erro: corpo.error.flatten() });

      try {
        const salvo = await casos.salvar(corpo.data.timeId, corpo.data.conteudo, corpo.data.tipo);
        registrarAuditoria(db, {
          email: req.usuario!.email,
          acao: "atualizar",
          recurso: "especificacao_templates",
          recursoId: salvo.id,
        });
        return salvo;
      } catch (erro) {
        if (erro instanceof TemplateInvalido) return reply.code(400).send({ erro: erro.message });
        throw erro;
      }
    }
  );
}
