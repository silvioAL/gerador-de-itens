import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";

/**
 * SPEC-25 §4.4 — credenciais NUNCA vão para `config/`.
 *
 * `config/` é versionável: é pasta do projeto, entra em git, é o lugar onde o
 * usuário guarda tipos de nó e regras do time. Chave de API ali é vazamento
 * esperando acontecer. Ficam em `~/.gerador/credenciais.json`, o MESMO
 * diretório-base do cache de modelos — fora de qualquer repositório.
 */
import type { FormatoJson } from "./modelos.js";

export interface CredencialProvedor {
  /** SPEC-30 Fase 2 — marcado à mão: este modelo enxerga imagem. */
  visao?: boolean;
  /** Base URL do gateway (`.../v1`), sem `/chat/completions`. */
  baseUrl?: string;
  chave?: string;
  /** Nome do modelo no gateway (ex.: "deepseek-chat", "gpt-4o"). */
  modelo?: string;
  /** Cabeçalhos extras que alguns wrappers corporativos exigem. */
  cabecalhos?: Record<string, string>;
  /** Dialeto de JSON aceito pelo destino (ver `FormatoJson`). Ausente = o
   * padrão `json_object`, que é o que os gateways já salvos usavam. */
  formatoJson?: FormatoJson;
}

export type Credenciais = Record<string, CredencialProvedor>;

export function caminhoCredenciais(baseDir?: string): string {
  return resolve(baseDir ?? homedir(), ".gerador", "credenciais.json");
}

export async function lerCredenciais(baseDir?: string): Promise<Credenciais> {
  try {
    return JSON.parse(await readFile(caminhoCredenciais(baseDir), "utf-8")) as Credenciais;
  } catch {
    // Sem arquivo é o estado normal de quem só usa o modelo local.
    return {};
  }
}

export async function salvarCredencial(
  provedorId: string,
  credencial: CredencialProvedor,
  baseDir?: string
): Promise<void> {
  const caminho = caminhoCredenciais(baseDir);
  const atuais = await lerCredenciais(baseDir);
  await mkdir(dirname(caminho), { recursive: true });
  await writeFile(caminho, JSON.stringify({ ...atuais, [provedorId]: credencial }, null, 2), {
    encoding: "utf-8",
    // Só o dono lê. Não é defesa contra tudo, mas evita o caso bobo de outro
    // usuário da máquina ler a chave. Ignorado no Windows, sem prejuízo.
    mode: 0o600,
  });
}

/** O que dá pra mostrar na tela sem expor a chave. */
export function resumirCredencial(c: CredencialProvedor | undefined): {
  configurado: boolean;
  baseUrl?: string;
  modelo?: string;
  chaveMascarada?: string;
  /** SPEC-30 Fase 2 — marcação manual de "este modelo enxerga imagem". Não é
   * segredo: dizer que o modelo vê imagem não expõe nada. */
  visao?: boolean;
} {
  if (!c?.baseUrl || !c?.chave) {
    return { configurado: false, baseUrl: c?.baseUrl, modelo: c?.modelo, visao: c?.visao };
  }
  return {
    configurado: true,
    baseUrl: c.baseUrl,
    modelo: c.modelo,
    visao: c.visao,
    // Nunca a chave inteira, nem em log, nem em tela.
    chaveMascarada: `${c.chave.slice(0, 3)}…${c.chave.slice(-4)}`,
  };
}
