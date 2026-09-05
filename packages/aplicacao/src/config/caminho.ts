/**
 * SPEC-105 §9.4 — o `caminho` que lê a resposta de um conector.
 *
 * Subconjunto DECLARADO de JSONPath: `$`, `.campo` e `[indice]` — só. Sem
 * wildcard, sem filtro, sem expressão. JSONPath completo seria uma dependência
 * nova e uma superfície de erro que a pessoa não consegue depurar na tela;
 * uma limitação visível é melhor que um poder que falha em silêncio. Cresce
 * quando doer, com o caso na mão (§242).
 */

const FORMA_DO_CAMINHO = /^\$(?:\.[A-Za-z_][A-Za-z0-9_-]*|\[\d+\])*$/;

/**
 * `$.a.b[0]` → `["a", "b", 0]`; `$` sozinho → `[]` (a resposta inteira).
 * `undefined` quando a forma não é do subconjunto — quem valida a ESCRITA usa
 * isto para recusar o caminho na hora de salvar, não na hora de executar.
 */
export function analisarCaminho(caminho: string): (string | number)[] | undefined {
  const aparado = caminho.trim();
  if (!FORMA_DO_CAMINHO.test(aparado)) return undefined;

  const passos: (string | number)[] = [];
  // O regex de forma já garantiu que só existem `.campo` e `[n]` depois do `$`.
  for (const [, campo, indice] of aparado.matchAll(/\.([A-Za-z_][A-Za-z0-9_-]*)|\[(\d+)\]/g)) {
    passos.push(campo !== undefined ? campo : Number(indice));
  }
  return passos;
}

/**
 * Segue o caminho dentro do valor. `undefined` quando qualquer passo não
 * existe — e é o chamador (o executor, §9.3) que decide o que a ausência
 * significa: campo obrigatório ausente PARA o passo, nunca vira default.
 */
export function lerCaminho(valor: unknown, caminho: string): unknown {
  const passos = analisarCaminho(caminho);
  if (!passos) return undefined;

  let atual: unknown = valor;
  for (const passo of passos) {
    if (typeof passo === "number") {
      if (!Array.isArray(atual)) return undefined;
      atual = atual[passo];
    } else {
      if (!atual || typeof atual !== "object" || Array.isArray(atual)) return undefined;
      atual = (atual as Record<string, unknown>)[passo];
    }
  }
  return atual;
}
