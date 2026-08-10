import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { criarProvedorCompativelOpenAI, type ProvedorIa } from "@gerador/llm/gateway";
import { resumirCredencialIa, type CredencialIa } from "@gerador/aplicacao";
import type { OpcoesApp } from "../app.js";
import { criarRepositorioDeCredenciaisEmPostgres } from "../adaptadores/credenciaisEmPostgres.js";
import { exigirSessao } from "../auth/middleware.js";
import { registrarAuditoria } from "../auditoria.js";
import { organizacoes } from "../db/schema.js";

/**
 * SPEC-31 Fase 4 — as rotas de IA no modo hospedado. **Não existiam** (§105):
 * o app web servido pelo container chamava `/ia/status` e recebia 404, então a
 * esteira de agentes simplesmente não rodava — e a tela não dizia por quê.
 *
 * Uma diferença deliberada em relação ao modo local: aqui **só existe o
 * gateway**. Modelo local dentro de container é 200 MB de binário que nunca
 * executa, e o import vem de `@gerador/llm/gateway`, o caminho que não alcança
 * `node-llama-cpp` (guardado por `gateway.fronteira.test.ts`).
 *
 * A credencial é da organização, não da pessoa. A chave entra por `PUT` e
 * nunca volta: toda leitura passa por `resumirCredencialIa`.
 */
const ID_PROVEDOR_GATEWAY = "gateway";

const corpoCredencial = z.object({
  baseUrl: z.string().url(),
  chave: z.string().min(1),
  modelo: z.string().min(1),
  cabecalhos: z.record(z.string()).optional(),
  formatoJson: z.enum(["json_object", "json_schema", "nenhum"]).optional(),
});

function comoProvedor(credencial: CredencialIa): ProvedorIa {
  return criarProvedorCompativelOpenAI({
    baseUrl: credencial.baseUrl!,
    chave: credencial.chave!,
    modelo: credencial.modelo!,
    cabecalhos: credencial.cabecalhos,
    formatoJson: credencial.formatoJson as never,
  });
}

export async function registrarRotasIa(app: FastifyInstance, { db }: OpcoesApp) {
  async function repositorio() {
    const [org] = await db.select({ id: organizacoes.id }).from(organizacoes).limit(1);
    if (!org) return null;
    return criarRepositorioDeCredenciaisEmPostgres(db, org.id);
  }

  /**
   * O que a tela precisa saber antes de tentar rodar a esteira. No local isso
   * responde "o modelo está baixado?"; aqui, "existe credencial de gateway?".
   * A mesma pergunta do ponto de vista de quem chama: dá pra usar IA agora?
   */
  app.get("/ia/status", async () => {
    const repo = await repositorio();
    const resumo = repo ? await repo.resumir(ID_PROVEDOR_GATEWAY) : { configurado: false };
    return {
      pronto: resumo.configurado,
      provedor: ID_PROVEDOR_GATEWAY,
      // Campos do modo local que não se aplicam aqui — a UI já os lê, e
      // omitir viraria `undefined` no lugar de uma resposta.
      chatInstalado: resumo.configurado,
      embeddingInstalado: false,
      modelosChat: [],
      credencial: resumo,
    };
  });

  app.get("/ia/credencial", async () => {
    const repo = await repositorio();
    return repo ? repo.resumir(ID_PROVEDOR_GATEWAY) : { configurado: false };
  });

  app.put("/ia/credencial", { preHandler: exigirSessao }, async (req, reply) => {
    const corpo = corpoCredencial.safeParse(req.body);
    if (!corpo.success) return reply.code(400).send({ erro: corpo.error.flatten() });

    const repo = await repositorio();
    if (!repo) return reply.code(503).send({ erro: "organização não inicializada" });

    await repo.salvar(ID_PROVEDOR_GATEWAY, corpo.data);
    registrarAuditoria(db, {
      email: req.usuario!.email,
      acao: "atualizar",
      recurso: "credenciais_ia",
      recursoId: ID_PROVEDOR_GATEWAY,
    });
    // Devolve o RESUMO, nunca a chave — nem para quem acabou de mandá-la.
    return resumirCredencialIa(corpo.data);
  });

  /** Uma chamada curta de verdade contra o destino: é a única forma de saber
   * se a credencial funciona, e o custo de descobrir na primeira quebra é
   * uma esteira inteira perdida. */
  app.post("/ia/credencial/testar", { preHandler: exigirSessao }, async (req, reply) => {
    const repo = await repositorio();
    const credencial = repo ? await repo.obter(ID_PROVEDOR_GATEWAY) : null;
    if (!credencial?.baseUrl || !credencial.chave) {
      return reply.code(400).send({ ok: false, erro: "nenhuma credencial configurada" });
    }

    const provedor = comoProvedor(credencial);
    try {
      const resposta = await provedor.completar("Responda apenas: ok");
      return { ok: true, resposta: resposta.slice(0, 200) };
    } catch (erro) {
      return reply.code(502).send({ ok: false, erro: erro instanceof Error ? erro.message : String(erro) });
    } finally {
      await provedor.descartar().catch(() => undefined);
    }
  });

  /**
   * A sugestão de texto para um placeholder — o mesmo contrato do modo local
   * (`text/plain` streamado), para que `packages/web` não precise saber em qual
   * modo está rodando.
   */
  app.post("/ia/sugerir", async (req, reply) => {
    const repo = await repositorio();
    const credencial = repo ? await repo.obter(ID_PROVEDOR_GATEWAY) : null;
    if (!credencial?.baseUrl || !credencial.chave) {
      return reply.code(503).send({ erro: "IA não configurada — cadastre a credencial do gateway" });
    }

    const { tech, rotulo, contextoNo, contextoEpico } = (req.body ?? {}) as {
      tech?: string;
      rotulo?: string;
      contextoNo?: string;
      contextoEpico?: string;
    };
    const prompt = [
      `Você ajuda a especificar um requisito técnico de refinamento de software.`,
      ...(contextoEpico ? [`Contexto geral da demanda/épico:`, contextoEpico, ``] : []),
      `Tecnologia: ${tech ?? "(não informada)"}`,
      `Requisito a especificar: "${rotulo ?? ""}"`,
      `Contexto do(s) nó(s) de arquitetura envolvidos:`,
      contextoNo || "(sem contexto adicional)",
      ``,
      `Responda de forma curta, específica e em português, com uma decisão concreta pra esse requisito nesse contexto. Não repita o requisito, só a resposta.`,
    ].join("\n");

    const provedor = comoProvedor(credencial);
    try {
      const texto = await provedor.completar(prompt);
      return reply.type("text/plain; charset=utf-8").send(texto);
    } catch (erro) {
      return reply.code(502).send({ erro: erro instanceof Error ? erro.message : String(erro) });
    } finally {
      await provedor.descartar().catch(() => undefined);
    }
  });
}
