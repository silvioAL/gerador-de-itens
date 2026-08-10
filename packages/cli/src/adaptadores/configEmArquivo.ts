import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  CAMPO_GLOBAL,
  type ChaveConfig,
  type DocumentoConfig,
  type RepositorioDeConfig,
} from "@gerador/aplicacao";

/**
 * SPEC-31 Fase 3 — adaptador de arquivo da porta de Configuração.
 *
 * O global mantém os caminhos de sempre (`config/regras.json`,
 * `config/pipeline-agentes.json`, `config/prompt-unico.json`), para que projeto
 * existente continue lendo o que já escreveu. O de um time ganha sufixo, como
 * no template da especificação: `regras.pagamentos.json`.
 *
 * A versão de quem gravou fica num arquivo irmão `.versao` em vez de dentro do
 * documento: o documento é o que o engine valida, e enfiar metadado nosso lá
 * dentro faria `validarConfig` reclamar de uma chave que não é dele.
 */
export function criarRepositorioDeConfigEmArquivo(dirProjeto: string): RepositorioDeConfig {
  const dirConfig = resolve(dirProjeto, "config");

  function caminho(chave: ChaveConfig, timeId: string): string {
    return timeId === CAMPO_GLOBAL
      ? resolve(dirConfig, `${chave}.json`)
      : resolve(dirConfig, `${chave}.${timeId}.json`);
  }

  const caminhoDaVersao = (chave: ChaveConfig, timeId: string) => `${caminho(chave, timeId)}.versao`;

  async function lerDe(chave: ChaveConfig, timeId: string): Promise<DocumentoConfig | null> {
    const arquivo = caminho(chave, timeId);
    try {
      const [bruto, info] = await Promise.all([readFile(arquivo, "utf-8"), stat(arquivo)]);
      const versaoTemplate = await readFile(caminhoDaVersao(chave, timeId), "utf-8").then(
        (v) => v.trim() || null,
        // Sem arquivo de versão: config anterior a esta fase. `null` é a
        // resposta honesta — e é exatamente o caso que o diagnóstico atende.
        () => null
      );
      return { chave, timeId, documento: JSON.parse(bruto), versaoTemplate, atualizadoEm: info.mtime.toISOString() };
    } catch {
      return null;
    }
  }

  return {
    async obter(chave, timeId) {
      if (timeId && timeId !== CAMPO_GLOBAL) {
        const doTime = await lerDe(chave, timeId);
        if (doTime) return doTime;
      }
      return lerDe(chave, CAMPO_GLOBAL);
    },

    async salvar(chave, timeId, documento, versaoTemplate) {
      await mkdir(dirConfig, { recursive: true });
      await writeFile(caminho(chave, timeId), JSON.stringify(documento, null, 2), "utf-8");
      if (versaoTemplate) {
        await writeFile(caminhoDaVersao(chave, timeId), versaoTemplate, "utf-8");
      } else {
        // Gravar sem versão precisa APAGAR a anterior: deixar o arquivo velho
        // faria a config nova herdar o carimbo da antiga.
        await rm(caminhoDaVersao(chave, timeId), { force: true });
      }

      return { chave, timeId, documento, versaoTemplate, atualizadoEm: new Date().toISOString() };
    },
  };
}
