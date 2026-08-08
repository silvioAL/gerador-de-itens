import { mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ModeloRegistrado } from "./modelos.js";

/**
 * Diretório local onde os modelos ficam cacheados — por padrão
 * `~/.gerador/models` (equivalente Windows: `%USERPROFILE%\.gerador\models`,
 * resolvido por `os.homedir()`, que já trata isso certo nas 3 plataformas).
 * Fora de `node_modules`/do pacote npm de propósito: os modelos são grandes
 * (GB) e não fazem sentido versionados/reinstalados a cada `npm install`.
 *
 * Aceita um `baseDir` opcional (mesmo padrão de `dirProjeto` em
 * `openApiLocal.ts`) — só pra testes apontarem pra um diretório temporário
 * em vez do home real; em produção nunca é passado.
 */
export function diretorioDeModelos(baseDir?: string): string {
  return join(baseDir ?? homedir(), ".gerador", "models");
}

export function caminhoDoModelo(modelo: ModeloRegistrado, baseDir?: string): string {
  return join(diretorioDeModelos(baseDir), modelo.nomeArquivo);
}

export async function garantirDiretorioDeModelos(baseDir?: string): Promise<string> {
  const dir = diretorioDeModelos(baseDir);
  await mkdir(dir, { recursive: true });
  return dir;
}
