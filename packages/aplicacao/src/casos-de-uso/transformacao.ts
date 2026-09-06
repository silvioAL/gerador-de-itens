import { analisarCaminho, lerCaminho } from "../config/caminho.js";
import { EntradaDaFuncaoInvalida } from "./funcoes.js";

/**
 * SPEC-107 fatia E — **a transformação PURA: o Set do n8n (§5.2).**
 *
 * No modelo input/output ela é consequência, não reserva: um nó que só
 * re-mapeia, extrai e concatena o que chegou — sem IA, sem rede, sem estado.
 * Cada campo de saída é DADO no nó (`parametros.campos`):
 *
 * - `modelo` — concatenar/re-mapear: um template com `{chave}` interpolando
 *   as entradas ("RPS {rps} — pico {pico}").
 * - `caminho` — extrair: o MESMO subconjunto `$.a.b[0]` dos conectores
 *   (`lerCaminho`, §9.4), aplicado sobre o objeto das entradas
 *   ("$.desenho.diagrama.nodes[0].label").
 *
 * §9.3 vale aqui como em todo lugar: placeholder sem entrada e caminho que
 * não resolve BARRAM com o nome do que faltou — uma transformação que
 * inventasse `""` seria a porta de entrada da invenção no meio da fiação.
 */

export interface CampoDaTransformacao {
  chave: string;
  modelo?: string;
  caminho?: string;
}

export function sanearCamposDaTransformacao(bruto: unknown): CampoDaTransformacao[] {
  if (!Array.isArray(bruto)) return [];
  const campos: CampoDaTransformacao[] = [];
  for (const cru of bruto as Partial<CampoDaTransformacao>[]) {
    const chave = typeof cru?.chave === "string" ? cru.chave.trim() : "";
    if (!chave || campos.some((c) => c.chave === chave)) continue;
    const modelo = typeof cru.modelo === "string" ? cru.modelo : undefined;
    const caminho = typeof cru.caminho === "string" && cru.caminho.trim() ? cru.caminho.trim() : undefined;
    campos.push({ chave, ...(modelo !== undefined ? { modelo } : {}), ...(caminho ? { caminho } : {}) });
  }
  return campos;
}

/** A validação da ESCRITA (SPEC-35): campo pela metade não entra no fluxo. */
export function validarCamposDaTransformacao(campos: CampoDaTransformacao[], nomeDoNo: string): string | null {
  if (campos.length === 0) {
    return `o nó "${nomeDoNo}" não declara nenhum campo de saída — uma transformação sem campos não transforma nada`;
  }
  for (const campo of campos) {
    if (campo.modelo === undefined && !campo.caminho) {
      return `no nó "${nomeDoNo}", o campo "${campo.chave}" precisa de um "modelo" (concatenar) ou um "caminho" (extrair)`;
    }
    if (campo.caminho && !analisarCaminho(campo.caminho)) {
      return `no nó "${nomeDoNo}", o campo "${campo.chave}" tem um caminho fora do subconjunto aceito — use a forma "$.a.b[0]"`;
    }
  }
  return null;
}

export function transformarEntradas(
  campos: CampoDaTransformacao[],
  entradas: Record<string, unknown>
): Record<string, unknown> {
  const saida: Record<string, unknown> = {};
  for (const campo of campos) {
    if (campo.caminho) {
      const valor = lerCaminho(entradas, campo.caminho);
      if (valor === undefined) {
        throw new EntradaDaFuncaoInvalida(
          `o campo "${campo.chave}" extrai de "${campo.caminho}", que não chegou — entrada ausente não vira default`
        );
      }
      saida[campo.chave] = valor;
      continue;
    }
    saida[campo.chave] = (campo.modelo ?? "").replace(/\{([^{}]+)\}/g, (_tudo, chave: string) => {
      const valor = entradas[chave.trim()];
      if (valor === undefined || valor === null) {
        throw new EntradaDaFuncaoInvalida(
          `o campo "${campo.chave}" usa "{${chave.trim()}}", que não chegou — entrada ausente não vira default`
        );
      }
      return typeof valor === "string" ? valor : JSON.stringify(valor);
    });
  }
  return saida;
}
