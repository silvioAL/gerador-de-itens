import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { CAMPO_GLOBAL, type RepositorioDeTemplateEspecificacao, type TemplateEspecificacao } from "@gerador/aplicacao";

/**
 * SPEC-31 Fase 2 — adaptador de arquivo do template da especificação.
 *
 * O global mora em `config/especificacao-template.md` — o mesmo caminho de
 * sempre, para que projeto existente continue lendo o que já escreveu. O de um
 * time ganha sufixo: `especificacao-template.<timeId>.md`. Sem o sufixo o
 * arquivo do time sobrescreveria o de todo mundo, e a sobreposição que o modo
 * hospedado tem desde sempre não existiria aqui.
 */
export function criarRepositorioDeTemplateEspecificacaoEmArquivo(
  dirProjeto: string
): RepositorioDeTemplateEspecificacao {
  const dirConfig = resolve(dirProjeto, "config");

  function caminho(timeId: string): string {
    return timeId === CAMPO_GLOBAL
      ? resolve(dirConfig, "especificacao-template.md")
      : resolve(dirConfig, `especificacao-template.${timeId}.md`);
  }

  async function lerDe(timeId: string): Promise<TemplateEspecificacao | null> {
    const arquivo = caminho(timeId);
    try {
      const [conteudo, info] = await Promise.all([readFile(arquivo, "utf-8"), stat(arquivo)]);
      return { id: timeId, timeId, conteudo, atualizadoEm: info.mtime.toISOString() };
    } catch {
      return null;
    }
  }

  return {
    async obter(timeId) {
      if (timeId && timeId !== CAMPO_GLOBAL) {
        const doTime = await lerDe(timeId);
        if (doTime) return doTime;
      }
      return lerDe(CAMPO_GLOBAL);
    },

    async salvar(timeId, conteudo) {
      await mkdir(dirConfig, { recursive: true });
      await writeFile(caminho(timeId), conteudo, "utf-8");
      return { id: timeId, timeId, conteudo, atualizadoEm: new Date().toISOString() };
    },
  };
}
