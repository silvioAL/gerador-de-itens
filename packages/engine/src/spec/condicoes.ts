import type { Aresta, No } from "../model/types.js";
import type { Condicao } from "../config/types.js";

function valorDoCampo(no: No, campo: string): unknown {
  return no.spec[campo]?.valor;
}

function isPreenchido(valor: unknown): boolean {
  return valor !== undefined && valor !== null && valor !== "";
}

/**
 * `hasIncomingEdge` considera apenas arestas cujo `target` é o nó — aresta saindo não conta.
 * `field/equals` compara o valor, ignorando origem.
 */
export function avaliarCondicao(
  condicao: Condicao,
  no: No,
  arestasDoDiagrama: Aresta[]
): boolean {
  if ("field" in condicao && "equals" in condicao) {
    return valorDoCampo(no, condicao.field) === condicao.equals;
  }
  if ("field" in condicao && "notEquals" in condicao) {
    // Campo ainda sem valor não satisfaz "notEquals": a pergunta anterior
    // da cadeia condicional não foi respondida, então esta permanece oculta.
    const valor = valorDoCampo(no, condicao.field);
    return isPreenchido(valor) && valor !== condicao.notEquals;
  }
  if ("field" in condicao && "preenchido" in condicao) {
    return isPreenchido(valorDoCampo(no, condicao.field)) === condicao.preenchido;
  }
  if ("hasIncomingEdge" in condicao) {
    return arestasDoDiagrama.some(
      (a) => a.target === no.id && condicao.hasIncomingEdge.includes(a.type)
    );
  }
  if ("hasOutgoingEdge" in condicao) {
    return arestasDoDiagrama.some(
      (a) => a.source === no.id && condicao.hasOutgoingEdge.includes(a.type)
    );
  }
  if ("nodeStatus" in condicao) {
    return no.status === condicao.nodeStatus;
  }
  if ("nodeType" in condicao) {
    return condicao.nodeType.includes(no.type);
  }
  if ("listaContem" in condicao) {
    // Campo `type: "lista"` (SPEC-18): satisfaz se ALGUM item tiver o
    // sub-campo com o valor pedido — ex.: "algum endpoint é novo".
    const { field, sub, equals } = condicao.listaContem;
    const valor = valorDoCampo(no, field);
    return Array.isArray(valor) && valor.some((item) => (item as Record<string, unknown>)?.[sub] === equals);
  }
  if ("allOf" in condicao) {
    return condicao.allOf.every((c) => avaliarCondicao(c, no, arestasDoDiagrama));
  }
  if ("anyOf" in condicao) {
    return condicao.anyOf.some((c) => avaliarCondicao(c, no, arestasDoDiagrama));
  }
  if ("not" in condicao) {
    return !avaliarCondicao(condicao.not, no, arestasDoDiagrama);
  }
  throw new Error(`Operador de condição desconhecido: ${JSON.stringify(condicao)}`);
}
