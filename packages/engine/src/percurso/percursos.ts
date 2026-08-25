import type { Diagrama, Percurso } from "../model/types.js";

/**
 * SPEC-57 fatia E — o PERCURSO: o caminho que uma requisição faz pelo desenho.
 *
 * Até aqui a mesa media **elementos**: este nó está completo, aquele viola o
 * padrão, esta necessidade não tem quem responda. Mas uma classe inteira de
 * defeito não mora em elemento nenhum — mora no caminho. Cinco saltos de 400ms
 * são cinco nós dentro do padrão e um percurso de 2 segundos, e nenhuma medida
 * por nó vê isso. É o caso do §6 da SPEC: *"com fila, R2 (2s) depende do
 * consumo — o pior caso do caminho passa de 2s"*.
 *
 * **Inferido, não declarado** — é a resposta à pergunta 4 do §5 da SPEC-57
 * (*"declarar dá precisão e custa trabalho; inferir do grafo é grátis e
 * erra"*). Inferir e pedir confirmação é o padrão de proveniência que a casa
 * já usa em todo o resto: o motor propõe como `inferido`, e nada conta até
 * alguém confirmar.
 *
 * Função pura, sem I/O, como o resto do engine.
 */

/** Teto de segurança. Um grafo denso tem caminhos em número exponencial, e uma
 * lista de 4000 percursos não é informação — é o mesmo que lista nenhuma, com
 * o navegador travado de brinde. Ao estourar, a inferência para e diz. */
export const MAX_PERCURSOS = 24;

/** Percursos longos demais quase sempre são artefato de grafo denso, não
 * caminho real que alguém reconhece. */
const MAX_SALTOS = 12;

export interface PercursosInferidos {
  percursos: Percurso[];
  /** `true` quando a busca parou no teto — a lista está incompleta, e dizer
   * isso importa mais do que devolver 24 caminhos fingindo que são todos. */
  truncado: boolean;
}

/**
 * Os caminhos de uma **entrada** (nó sem ninguém apontando para ele) até uma
 * **saída** (nó que não aponta para ninguém).
 *
 * `source → target` é a direção lógica em todo o engine; `Aresta.reversed` é
 * só como o canvas desenha a seta, e usá-lo aqui faria o percurso mudar quando
 * alguém arrastasse a alça.
 *
 * **Ciclo não vira percurso infinito nem erro**: o caminho simplesmente para
 * quando encontraria um nó que já visitou. Reclamar do ciclo é papel de
 * `resolverDependencias`, que já o faz — duplicar a queixa aqui daria dois
 * alarmes para o mesmo problema.
 */
export function inferirPercursos(diagrama: Diagrama): PercursosInferidos {
  const saindoDe = new Map<string, string[]>();
  const temEntrada = new Set<string>();
  for (const e of diagrama.edges) {
    if (e.source === e.target) continue; // auto-laço não é caminho
    const lista = saindoDe.get(e.source) ?? [];
    lista.push(e.target);
    saindoDe.set(e.source, lista);
    temEntrada.add(e.target);
  }

  const rotuloDe = new Map(diagrama.nodes.map((n) => [n.id, n.label?.trim() || n.id]));
  const entradas = diagrama.nodes.filter((n) => !temEntrada.has(n.id) && (saindoDe.get(n.id)?.length ?? 0) > 0);

  const percursos: Percurso[] = [];
  let truncado = false;

  function caminhar(atual: string, visitados: string[]) {
    if (percursos.length >= MAX_PERCURSOS) {
      truncado = true;
      return;
    }
    const proximos = saindoDe.get(atual) ?? [];
    const naoVisitados = proximos.filter((p) => !visitados.includes(p));

    // Saída de verdade, ou beco fechado por ciclo: os dois terminam o caminho.
    // O segundo caso é percurso legítimo — é o trecho que a requisição percorre
    // antes de voltar, e escondê-lo por causa do ciclo esconderia o desenho.
    if (naoVisitados.length === 0) {
      if (visitados.length >= 2) percursos.push(montar(visitados, rotuloDe));
      return;
    }
    if (visitados.length >= MAX_SALTOS) {
      truncado = true;
      percursos.push(montar(visitados, rotuloDe));
      return;
    }
    for (const proximo of naoVisitados) caminhar(proximo, [...visitados, proximo]);
  }

  for (const entrada of entradas) caminhar(entrada.id, [entrada.id]);

  return { percursos, truncado };
}

function montar(nos: string[], rotuloDe: Map<string, string>): Percurso {
  return {
    // Derivado do caminho, e por isso ESTÁVEL: reinferir o mesmo desenho
    // devolve o mesmo id, e é o que permite casar o inferido de agora com o
    // que já foi confirmado antes, sem duplicar a lista na cara da pessoa.
    id: `pc::${nos.join(">")}`,
    rotulo: nos.map((id) => rotuloDe.get(id) ?? id).join(" → "),
    nos: [...nos],
    origem: "inferido",
  };
}

/** Regra 2 da SPEC-57 aplicada ao percurso: inferido não conta até confirmar.
 * O declarado à MÃO conta sempre — quem o desenhou já disse que ele existe. */
export function percursoConta(p: Percurso): boolean {
  if (p.origem === "inferido" || p.origem === "sugerido") return p.confirmado === true;
  return true;
}

/**
 * SPEC-64 fatia B — o caminho declarado à mão.
 *
 * O id sai da MESMA fórmula do inferido, e isso dá duas coisas de graça: um
 * manual que coincide com um caminho que o desenho produz é o **mesmo**
 * caminho (não duplica a lista), e ele sobrevive a rederivar.
 */
export function percursoManual(nos: string[], diagrama: Diagrama): Percurso {
  const rotuloDe = new Map(diagrama.nodes.map((n) => [n.id, n.label?.trim() || n.id]));
  return {
    id: `pc::${nos.join(">")}`,
    rotulo: nos.map((id) => rotuloDe.get(id) ?? id).join(" → "),
    nos: [...nos],
    origem: "manual",
  };
}

/** Os que valem — é sobre estes que a régua de caminho é aplicada. */
export function percursosQueContam(percursos: Percurso[] = []): Percurso[] {
  return percursos.filter(percursoConta);
}

/**
 * Junta o que o motor acabou de inferir com o que já está guardado na quebra.
 *
 * As situações que isto resolve, e nenhuma delas é cosmética:
 *
 * - **inferido de novo, já confirmado antes** → mantém a confirmação. Sem isto,
 *   cada edição no desenho desconfirmaria todos os caminhos e a pessoa
 *   reconfirmaria a mesma coisa para sempre;
 * - **inferido guardado que o desenho não produz mais** → continua na lista,
 *   marcado como `obsoleto`. Mesma disciplina do vínculo quebrado (§230) e da
 *   decisão órfã (§246): o caminho que sumiu é o evento que precisa ser visto;
 * - **inferido novo** → entra como `inferido`, sem confirmação;
 * - **SPEC-64 — declarado à MÃO** → não depende do inferidor. Ele vale
 *   enquanto todos os seus nós existirem, e vira obsoleto quando um sumir.
 *
 * ## Por que o `diagrama` entra aqui
 *
 * Sem ele, um caminho manual cairia direto em `obsoletos`: a lista de vivos era
 * montada a partir dos INFERIDOS, e um manual nunca é inferido. Ele apareceria
 * para sempre como "sumiu do desenho", recém-criado. O diagrama responde as
 * duas perguntas que faltavam — os nós dele ainda existem? e como eles se
 * chamam agora?
 */
export function conciliarPercursos(
  inferidos: Percurso[],
  guardados: Percurso[] = [],
  diagrama?: Diagrama
): { percursos: Percurso[]; obsoletos: Percurso[] } {
  const porId = new Map(guardados.map((p) => [p.id, p]));
  const idsInferidos = new Set(inferidos.map((p) => p.id));
  const rotuloDe = new Map((diagrama?.nodes ?? []).map((n) => [n.id, n.label?.trim() || n.id]));
  const temTodosOsNos = (p: Percurso) => p.nos.every((id) => rotuloDe.has(id));

  const percursos = inferidos.map((novo) => {
    const antigo = porId.get(novo.id);
    if (!antigo) return novo;
    // O rótulo vem do inferido (nó renomeado precisa aparecer renomeado); a
    // confirmação e a origem vêm do guardado (é o que a pessoa decidiu).
    return { ...antigo, rotulo: novo.rotulo, nos: novo.nos };
  });

  /**
   * SPEC-64 — os manuais entram por fora do inferidor, com o rótulo refeito
   * pelos nomes de agora (pelo mesmo motivo do inferido: nó renomeado precisa
   * aparecer renomeado).
   *
   * Sem `diagrama` não dá para afirmar que os nós existem, e afirmar no escuro
   * seria pior: nesse caso o manual passa direto, sem virar obsoleto.
   */
  const manuaisVivos = guardados
    .filter((p) => p.origem === "manual" && !idsInferidos.has(p.id) && (!diagrama || temTodosOsNos(p)))
    .map((p) => (diagrama ? { ...p, rotulo: p.nos.map((id) => rotuloDe.get(id) ?? id).join(" → ") } : p));

  const idsVivos = new Set([...percursos, ...manuaisVivos].map((p) => p.id));

  // Só os que CONTAVAM: um inferido não confirmado que sumiu do desenho não
  // perdeu nada — nunca foi de ninguém. O manual conta sempre, então um manual
  // que perdeu um nó sempre aparece.
  const obsoletos = guardados.filter((p) => !idsVivos.has(p.id) && percursoConta(p));

  return { percursos: [...percursos, ...manuaisVivos], obsoletos };
}
