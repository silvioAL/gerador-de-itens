import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { ChaveConfig } from "@gerador/aplicacao";

/**
 * O template de fábrica de uma versão — o que a imagem traz em `config/`.
 *
 * ## §303 — por que isto saiu de dentro do `registrarRotasConfig`
 *
 * Era uma função interna da rota de config, e a de PDCA não a alcançava. O
 * resultado aparecia no `POST /ajustes/:id/aplicar`: ele lia a linha GLOBAL de
 * `config_documentos` direto e devolvia **409 "documento de regras não
 * encontrado"** quando ela não existia — que é o estado de toda organização que
 * ainda não salvou regras nenhuma.
 *
 * Isso vinha passando despercebido porque, na suíte E2E, algum spec vizinho
 * sempre gravava o documento global antes. Quando os specs de regras foram para
 * times próprios, ninguém mais gravava o global e o defeito apareceu — na CI,
 * com banco novo, que é exatamente a condição de uma instalação nova.
 *
 * Uma cópia aqui e outra lá divergiria na primeira mudança (§263), e a
 * divergência seria muda: as duas rotas passariam a partir de bases diferentes
 * para o MESMO documento.
 */
const DEFAULTS_COMPILADOS: Record<ChaveConfig, unknown> = {
  regras: { tipos: [], tamanhos: [], porTech: {} },
  "pipeline-agentes": { confirmacaoObrigatoria: true, papeis: [] },
  exportador: { endpoint: "", rotulo: "", cabecalhos: {} },
  /** SPEC-79 fatia A — time sem design system começa com a lista VAZIA, e a
   * régua se cala (ver `avaliarConformidade`). Semear tokens de exemplo faria
   * toda organização nascer cobrando pertencimento a cores que não são dela. */
  tokens: { tokens: [] },
  /**
   * SPEC-102 fatia D — nasce SEM sobreposição nenhuma, e isso é a afirmação.
   *
   * A base é o `edgeRules` do `config/diagrama.json`, que a imagem traz pronto.
   * Este documento guarda só o que a organização decidiu mudar — semear uma
   * cópia das regras de fábrica faria toda instalação nascer "personalizada" e
   * congelaria o catálogo: correção de default numa versão nova não chegaria a
   * ninguém, porque todos teriam uma cópia por cima.
   */
  conexoes: { regras: {} },
};

export async function templateDaVersao(chave: ChaveConfig, diretorioConfig: string): Promise<unknown> {
  for (const nome of [`${chave}.json`, `${chave}.example.json`]) {
    try {
      return JSON.parse(await readFile(resolve(diretorioConfig, nome), "utf-8"));
    } catch {
      // tenta o próximo candidato
    }
  }
  return DEFAULTS_COMPILADOS[chave];
}
