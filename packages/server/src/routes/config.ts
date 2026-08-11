import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { CAMPO_GLOBAL, criarCasosDeUsoDeConfig, ehChaveConfig, type ChaveConfig } from "@gerador/aplicacao";
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
const DEFAULTS_COMPILADOS: Record<ChaveConfig, unknown> = {
  regras: { tipos: [], tamanhos: [], porTech: {} },
  "pipeline-agentes": { confirmacaoObrigatoria: true, papeis: [] },
};

export async function registrarRotasConfig(app: FastifyInstance, { db, diretorioConfig }: OpcoesApp) {
  const casos = criarCasosDeUsoDeConfig(criarRepositorioDeConfigEmPostgres(db));
  const versaoAtual = process.env.npm_package_version ?? null;

  /** O template de fábrica desta versão — o que a imagem traz em `config/`. */
  async function templateDaVersao(chave: ChaveConfig): Promise<unknown> {
    for (const nome of [`${chave}.json`, `${chave}.example.json`]) {
      try {
        return JSON.parse(await readFile(resolve(diretorioConfig, nome), "utf-8"));
      } catch {
        // tenta o próximo candidato
      }
    }
    return DEFAULTS_COMPILADOS[chave];
  }

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

    const salvo = await casos.salvar(chave, corpo.documento, versaoAtual, corpo.timeId ?? CAMPO_GLOBAL);
    registrarAuditoria(db, {
      email: req.usuario!.email,
      acao: "atualizar",
      recurso: "config_documentos",
      recursoId: `${chave}:${salvo.timeId}`,
    });
    return salvo;
  });
}
