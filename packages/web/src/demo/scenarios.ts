import type { Quebra } from "@gerador/engine";

export type CategoriaCenario = "demo" | "padrao-arquitetural" | "aprendido-do-time";

export interface Cenario {
  id: string;
  titulo: string;
  descricao: string;
  tipos: string[];
  destaque?: boolean;
  /** "demo": os exemplos originais deste repo. "padrao-arquitetural": referência
   * curada (hexagonal, DDD...) pra começar um projeto novo. "aprendido-do-time":
   * capturado de uso real, via entrevista assistida por agente. */
  categoria: CategoriaCenario;
  designPatterns: string[];
  quebra: Quebra;
}

async function buscarJson<T>(caminho: string): Promise<T> {
  const resposta = await fetch(caminho);
  if (!resposta.ok) {
    throw new Error(`Não foi possível carregar "${caminho}" (HTTP ${resposta.status}).`);
  }
  return (await resposta.json()) as T;
}

/**
 * Cenários carregam em runtime de config/cenarios/ (fetch, nunca import
 * estático) — mesmo motivo do config em si (loadConfig.ts): adicionar um
 * cenário novo (ex.: um exemplo de arquitetura hexagonal, ou um padrão
 * aprendido de uma entrevista real) deveria ser só soltar um arquivo no
 * projeto e listá-lo em config/cenarios/index.json, nunca mudar código do
 * app e rebuildar.
 *
 * Índice ausente (404) degrada pra lista vazia — uma instalação recém-criada
 * pode não ter config/cenarios/ ainda, e isso não é um erro, é só
 * "sem cenários por enquanto". Qualquer outra falha (HTTP 500, JSON inválido,
 * um arquivo listado que não existe) continua falhando alto — index.json
 * existir e apontar pra algo quebrado é config incorreta de verdade.
 */
export async function carregarCenarios(): Promise<Cenario[]> {
  const resposta = await fetch("/config/cenarios/index.json");
  if (resposta.status === 404) return [];
  if (!resposta.ok) {
    throw new Error(`Não foi possível carregar "/config/cenarios/index.json" (HTTP ${resposta.status}).`);
  }
  const nomes = (await resposta.json()) as string[];
  return Promise.all(nomes.map((nome) => buscarJson<Cenario>(`/config/cenarios/${nome}`)));
}
