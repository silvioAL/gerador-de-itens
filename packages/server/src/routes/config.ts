import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { FastifyInstance } from "fastify";
import { CAMPO_GLOBAL, criarCasosDeUsoDeConfig, ehChaveConfig, type ChaveConfig } from "@gerador/aplicacao";
import type { OpcoesApp } from "../app.js";
import { criarRepositorioDeConfigEmPostgres } from "../adaptadores/configEmPostgres.js";
import { exigirSessao } from "../auth/middleware.js";
import { registrarAuditoria } from "../auditoria.js";

/**
 * SPEC-31 Fase 3 — configuração no modo hospedado.
 *
 * Estas rotas **não existiam**. `regras`, `pipeline-agentes` e `prompt-unico`
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
  "prompt-unico": { conteudo: "" },
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
