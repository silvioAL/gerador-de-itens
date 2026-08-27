import type { DiagramaConfig } from "../config/types.js";
import type { Diagrama, VolumetriaDaDemanda } from "../model/types.js";
import { arestaEspera } from "./lerDesenho.js";

/**
 * SPEC-70 — o volume da demanda, distribuído pelo próprio grafo.
 *
 * ## O que isto substitui
 *
 * A Lei de Little (SPEC-68 §3.3) precisa da taxa em cada nó, e ela era pedida
 * **nó a nó**. Num desenho de oito componentes a conta só fechava se alguém
 * digitasse oito números — e, quase sempre, **o mesmo número**: o volume que
 * entra pela porta da frente, propagado adiante pelo grafo.
 *
 * Pedir oito vezes o que se deduz uma vez é a definição de trabalho que a
 * ferramenta deveria estar fazendo.
 *
 * ## A regra, inteira
 *
 * 1. **entrada** — nó sem nenhuma conexão que espera chegando nele — recebe o
 *    volume da demanda;
 * 2. **cada conexão que espera** leva a taxa de quem chama para quem é chamado;
 * 3. **nó chamado por vários** soma o que chega.
 *
 * Não há heurística, amostragem nem distribuição estatística: é o mesmo passeio
 * que a `lerDesenho` faz, com outro número na mochila.
 *
 * ## O que NÃO se adivinha
 *
 * **Quantas vezes por requisição uma chamada acontece.** Um laço que consulta o
 * bureau uma vez por item de uma lista de 50 multiplica a taxa por 50, e isso
 * **não está no desenho**. Sem declaração o motor assume UMA — e a SPEC diz que
 * assumiu, para ninguém achar que ele deduziu.
 *
 * Inventar esse fator seria fabricar o número mais importante da conta, e a
 * saturação passaria a acusar ou a absolver por um palpite: o §248 na sua forma
 * mais cara, porque um número plausível é pior que nenhum.
 *
 * **Conexão assíncrona não propaga.** A Lei de Little conta quem SEGURA a
 * requisição, e quem publica numa fila não segura — a mesma régua do
 * `arestaEspera` que o §291 fixou.
 */
const SEGUNDOS_POR: Record<VolumetriaDaDemanda["por"], number> = {
  segundo: 1,
  minuto: 60,
  hora: 3600,
  dia: 86400,
};

/** O volume da demanda em req/s. `undefined` quando não dá para afirmar nada. */
export function emRequisicoesPorSegundo(v: VolumetriaDaDemanda | undefined): number | undefined {
  if (!v || !Number.isFinite(v.quantidade) || v.quantidade <= 0) return undefined;
  return v.quantidade / SEGUNDOS_POR[v.por];
}

/** A frase que a tela mostra — a unidade de quem escreveu, e o req/s da conta. */
export function descreverVolumetria(v: VolumetriaDaDemanda | undefined): string | undefined {
  const rps = emRequisicoesPorSegundo(v);
  if (rps === undefined || !v) return undefined;
  const porExtenso = { segundo: "segundo", minuto: "minuto", hora: "hora", dia: "dia" }[v.por];
  // O req/s aparece junto porque é o número que a Lei de Little usa: escondê-lo
  // faria a acusação de saturação citar um número que não está em lugar nenhum.
  return `${v.quantidade.toLocaleString("pt-BR")} por ${porExtenso} (${formatarRps(rps)})`;
}

/** Duas casas só quando precisa — "23 req/s" lê melhor que "23,00 req/s". */
export function formatarRps(rps: number): string {
  const arredondado = rps >= 10 ? Math.round(rps) : Math.round(rps * 100) / 100;
  return `${arredondado.toLocaleString("pt-BR")} req/s`;
}

/**
 * A taxa que chega em cada nó, em req/s.
 *
 * `fator` multiplica o volume da demanda inteiro — é o pico do ensaio (§5),
 * que por ser uma condição do MUNDO chega a todos os nós de uma vez, e não a
 * um componente escolhido a dedo.
 *
 * Devolve mapa vazio quando não há volume declarado: sem número não se afirma
 * nada, e um mapa de zeros seria uma medição inventada.
 */
export function distribuirVolumetria(
  diagrama: Diagrama,
  config: DiagramaConfig,
  volumetria: VolumetriaDaDemanda | undefined,
  fator = 1
): Map<string, number> {
  const base = emRequisicoesPorSegundo(volumetria);
  const porNo = new Map<string, number>();
  if (base === undefined) return porNo;

  const queEsperam = diagrama.edges.filter((e) => arestaEspera(e, config) === true && e.source !== e.target);
  const recebe = new Set(queEsperam.map((e) => e.target));
  const chama = new Set(queEsperam.map((e) => e.source));

  // Entrada é quem COMEÇA uma corrente síncrona: ninguém síncrono o chama, e
  // ele chama alguém.
  //
  // A segunda condição não é detalhe. Sem ela, uma fila ligada só por conexão
  // assíncrona não tem entrada síncrona chegando — e seria tratada como porta
  // da frente, recebendo o volume inteiro da demanda. Nada no desenho diz que
  // ela recebe as requisições assim; o `publishes` diz o contrário.
  //
  // §9.1 — várias entradas recebem CADA UMA o volume inteiro, e isso é uma
  // escolha declarada, não uma dedução. Dividir entre elas inventaria uma
  // distribuição que ninguém disse.
  const entradas = diagrama.nodes.filter((n) => !recebe.has(n.id) && chama.has(n.id)).map((n) => n.id);
  const volume = base * (Number.isFinite(fator) && fator > 0 ? fator : 1);

  // Largura, com guarda de ciclo: um nó já resolvido não recebe de novo. Grafo
  // com ciclo síncrono é problema de desenho que outra régua acusa; aqui ele
  // não pode virar laço infinito.
  const fila: string[] = [...entradas];
  for (const id of entradas) porNo.set(id, volume);

  const visitados = new Set<string>();
  while (fila.length > 0) {
    const atual = fila.shift()!;
    if (visitados.has(atual)) continue;
    visitados.add(atual);

    for (const aresta of queEsperam.filter((e) => e.source === atual)) {
      // Soma: um nó chamado por dois caminhos recebe os dois. Uma requisição de
      // cada lado é uma requisição de cada lado.
      porNo.set(aresta.target, (porNo.get(aresta.target) ?? 0) + (porNo.get(atual) ?? 0));
      if (!visitados.has(aresta.target)) fila.push(aresta.target);
    }
  }

  return porNo;
}
