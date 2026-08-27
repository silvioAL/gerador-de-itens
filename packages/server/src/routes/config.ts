import type { FastifyInstance, FastifyRequest } from "fastify";
import { CAMPO_GLOBAL, ConfigInvalida, criarCasosDeUsoDeConfig, ehChaveConfig, type ChaveConfig } from "@gerador/aplicacao";
import type { OpcoesApp } from "../app.js";
import { criarRepositorioDeConfigEmPostgres } from "../adaptadores/configEmPostgres.js";
import { exigirSessao } from "../auth/middleware.js";
import {
  exigirPermissao,
  organizacaoPadraoDe,
  primeiroRecursoNegado,
  secoesDeRegrasAlteradas,
  type Recurso,
} from "../auth/permissoes.js";
import { registrarAuditoria } from "../auditoria.js";
import { templateDaVersao as templateDeConfig } from "../config/templateDaVersao.js";

/**
 * SPEC-31 Fase 3 — configuração no modo hospedado.
 *
 * Estas rotas **não existiam**. `regras` e `pipeline-agentes`
 * só eram editáveis no modo local, como arquivo; quem subia o Docker ficava com
 * o default compilado e sem tela para mudar. Agora as duas metades falam com o
 * mesmo caso de uso.
 *
 * O `GET` devolve, junto do documento, o **diagnóstico** contra o template
 * desta versão (JOURNEY §108): se a sua config não tem nenhuma entrada de uma
 * seção que o padrão preenche, isso aparece — em vez de o agente que depende
 * dela simplesmente não escrever nada.
 */
export async function registrarRotasConfig(app: FastifyInstance, { db, diretorioConfig }: OpcoesApp) {
  const casos = criarCasosDeUsoDeConfig(criarRepositorioDeConfigEmPostgres(db));
  const versaoAtual = process.env.npm_package_version ?? null;

  /** §303 — mora num módulo próprio agora: a rota de PDCA precisa do MESMO
   * template para aplicar um ajuste sobre uma organização que ainda não salvou
   * config nenhuma. Ver `config/templateDaVersao.ts`. */
  const templateDaVersao = (chave: ChaveConfig) => templateDeConfig(chave, diretorioConfig);

  const organizacaoPadrao = organizacaoPadraoDe(db);

  /**
   * SPEC-28 Fase 1b — a checagem que não cabe num `preHandler`.
   *
   * `PUT /config/:chave` serve três recursos diferentes, e um deles (`regras`)
   * é um documento só que carrega QUATRO recursos dentro: checklist técnico,
   * checklist de processo, testes e volumetria. Isso não é acidente de
   * implementação, é o pedido — "Agilidade cuida do processo, Arquitetura do
   * técnico" só existe se as seções puderem ter donos diferentes.
   *
   * Um `preHandler` decide antes de ler o corpo, então não consegue distinguir
   * "mexeu no processo" de "mexeu no técnico". Aqui a permissão é conferida por
   * **diferença** contra o que está gravado: quem só pode processo pode mandar o
   * documento inteiro de volta, desde que as outras seções voltem iguais — que é
   * exatamente o que a UI faz ao salvar uma aba.
   */
  async function recursoNegadoPara(
    req: FastifyRequest,
    chave: ChaveConfig,
    documento: unknown,
    timeId?: string
  ): Promise<Recurso | undefined> {
    const orgId = await organizacaoPadrao();
    const email = req.usuario!.email;

    if (chave !== "regras") {
      return primeiroRecursoNegado(db, orgId, email, ["pipeline-agentes"], "editar", timeId ?? null);
    }

    const atual = await casos.obter("regras", await templateDaVersao("regras"), timeId);
    const alteradas = secoesDeRegrasAlteradas(atual.documento, documento);
    return primeiroRecursoNegado(db, orgId, email, alteradas, "editar", timeId ?? null);
  }

  /** SPEC-31 (paridade): o modo local expõe `/versao` para a UI saber com o
   * que está falando. Não havia razão para o hospedado não expor. */
  app.get("/versao", async () => ({ versao: versaoAtual, modo: "hospedado" }));

  // Leitura aberta (sem sessão) — mesma régua de campos-no/perfis-time.
  app.get("/config/:chave", async (req, reply) => {
    const { chave } = req.params as { chave: string };
    if (!ehChaveConfig(chave)) return reply.code(404).send({ erro: `configuração desconhecida: ${chave}` });

    const { timeId } = req.query as { timeId?: string };
    return casos.obter(chave, await templateDaVersao(chave), timeId);
  });

  app.put("/config/:chave", { preHandler: exigirSessao }, async (req, reply) => {
    const { chave } = req.params as { chave: string };
    if (!ehChaveConfig(chave)) return reply.code(404).send({ erro: `configuração desconhecida: ${chave}` });

    const corpo = req.body as { documento?: unknown; timeId?: string } | null;
    if (!corpo || corpo.documento === undefined) {
      return reply.code(400).send({ erro: "corpo precisa ter `documento`" });
    }

    const negado = await recursoNegadoPara(req, chave, corpo.documento, corpo.timeId);
    if (negado) {
      return reply.code(403).send({
        erro: `sem permissão para "editar" em "${negado}"`,
        recurso: negado,
        acao: "editar",
      });
    }

    // SPEC-35 — validação de escrita vira 400 com o motivo. Antes disto,
    // `ConfigInvalida` (ex.: regras sem `porTech`) estourava como 500 aqui:
    // a rota nunca a capturava, e o motivo escrito morria no log.
    let salvo;
    try {
      salvo = await casos.salvar(chave, corpo.documento, versaoAtual, corpo.timeId ?? CAMPO_GLOBAL);
    } catch (erro) {
      if (erro instanceof ConfigInvalida) return reply.code(400).send({ erro: erro.message });
      throw erro;
    }
    registrarAuditoria(db, {
      email: req.usuario!.email,
      acao: "atualizar",
      recurso: "config_documentos",
      recursoId: `${chave}:${salvo.timeId}`,
    });
    return salvo;
  });
}
