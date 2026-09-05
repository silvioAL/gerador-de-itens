import { lerCaminho } from "../config/caminho.js";
import type { Conector } from "../config/conectores.js";

/**
 * SPEC-105 fatia B — a metade PURA do executor de um passo.
 *
 * Montar a chamada e ler a resposta são decisões de contrato, não de
 * transporte — então moram aqui, testáveis sem rede. Quem segura o `fetch` é
 * o adaptador (`server/src/adaptadores/executorDeConector.ts`), pela mesma
 * fronteira que separa `postar` de `destinosDaOperacao`.
 */

export class EntradaDoConectorInvalida extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = "EntradaDoConectorInvalida";
  }
}

export interface ChamadaDoConector {
  endpoint: string;
  metodo: string;
  cabecalhos: Record<string, string>;
  corpo: string;
}

/**
 * §9.3 — **entrada ausente NUNCA vira default.** Campo obrigatório sem valor
 * não sai como `""` nem como algo plausível: a chamada não acontece, com os
 * nomes do que faltou. Substituir por vazio é como a invenção entra — a mesma
 * régua do §349 §6, que o §356 provou com o §248.
 */
export function montarChamadaDoConector(conector: Conector, parametros: Record<string, unknown>): ChamadaDoConector {
  const faltando = conector.entrada
    .filter((campo) => campo.obrigatorio && (parametros[campo.chave] === undefined || parametros[campo.chave] === null))
    .map((campo) => campo.chave);
  if (faltando.length > 0) {
    throw new EntradaDoConectorInvalida(
      `o conector "${conector.nome}" precisa de ${faltando.map((c) => `"${c}"`).join(", ")} — entrada ausente não vira default`
    );
  }

  // Só o que o conector DECLAROU viaja: parâmetro fora da forma seria o
  // produto mandando o que nem sabe nomear.
  const corpo: Record<string, unknown> = {};
  for (const campo of conector.entrada) {
    if (parametros[campo.chave] !== undefined) corpo[campo.chave] = parametros[campo.chave];
  }

  // `envelope: ""` = corpo na raiz — teste de string vazia, não de valor
  // falso, pela mesma razão do `postar` do gateway.
  const payload = conector.envelope === "" ? corpo : { [conector.envelope]: corpo };

  return {
    endpoint: conector.endpoint,
    metodo: conector.metodo,
    cabecalhos: { "Content-Type": "application/json", ...conector.cabecalhos },
    corpo: JSON.stringify(payload),
  };
}

export interface SaidaDoConector {
  /** Cada campo de `saida` lido pelo seu `caminho` (ausente = `$.{chave}`). */
  saida: Record<string, unknown>;
  /** Os obrigatórios que a resposta não trouxe — visíveis, nunca inventados. */
  ausentes: string[];
}

export function mapearSaidaDoConector(conector: Conector, resposta: unknown): SaidaDoConector {
  const saida: Record<string, unknown> = {};
  const ausentes: string[] = [];
  for (const campo of conector.saida) {
    const valor = lerCaminho(resposta, campo.caminho ?? `$.${campo.chave}`);
    if (valor === undefined) {
      if (campo.obrigatorio) ausentes.push(campo.chave);
      continue;
    }
    saida[campo.chave] = valor;
  }
  return { saida, ausentes };
}
