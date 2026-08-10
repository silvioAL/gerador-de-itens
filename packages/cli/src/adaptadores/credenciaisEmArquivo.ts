import { lerCredenciais, salvarCredencial, type CredencialProvedor } from "@gerador/llm/gateway";
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
      // Conversão de fronteira, explícita: a porta (`CredencialIa`) declara
      // `formatoJson` como `string` porque `packages/aplicacao` não conhece —
      // nem deve conhecer — o union `FormatoJson` do `packages/llm`. O
      // estreitamento é responsabilidade deste adaptador, que é justamente
      // quem atravessa as duas camadas.
      //
      // Antes isto passava por acaso (sem typecheck no build do CLI), e junto
      // passava a PERDA de `baseUrlTranscricao` — ver #286.
      await salvarCredencial(
        provedorId,
        { ...credencial, formatoJson: credencial.formatoJson as CredencialProvedor["formatoJson"] },
        baseDir
      );
    },

    async resumir(provedorId) {
      return resumirCredencialIa((await lerCredenciais(baseDir))[provedorId] as CredencialIa | undefined);
    },
  };
}
