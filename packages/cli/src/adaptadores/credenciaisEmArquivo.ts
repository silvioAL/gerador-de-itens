import { lerCredenciais, salvarCredencial } from "@gerador/llm/gateway";
import {
  resumirCredencialIa,
  type CredencialIa,
  type RepositorioDeCredenciais,
} from "@gerador/aplicacao";

/**
 * SPEC-31 Fase 4 — adaptador de arquivo da porta de Credenciais.
 *
 * Continua sendo `~/.gerador/credenciais.json`, FORA do projeto: é a chave da
 * pessoa, na máquina dela, e `config/` é versionado. Importa de
 * `@gerador/llm/gateway` — o caminho sem binário nativo — porque credencial
 * não tem nada a ver com carregar modelo local.
 */
export function criarRepositorioDeCredenciaisEmArquivo(baseDir?: string): RepositorioDeCredenciais {
  return {
    async obter(provedorId) {
      return ((await lerCredenciais(baseDir))[provedorId] as CredencialIa | undefined) ?? null;
    },

    async salvar(provedorId, credencial) {
      await salvarCredencial(provedorId, credencial, baseDir);
    },

    async resumir(provedorId) {
      return resumirCredencialIa((await lerCredenciais(baseDir))[provedorId] as CredencialIa | undefined);
    },
  };
}
