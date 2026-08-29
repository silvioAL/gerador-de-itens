import type { ChecagemDePercurso, DiagramaConfig, RegrasConfig } from "../config/types.js";
import type { Aresta, Diagrama, No, Percurso } from "../model/types.js";
import { percursosQueContam } from "./percursos.js";

/**
 * SPEC-57 fatia E — a régua aplicada ao CAMINHO.
 *
 * A fatia B mede nó a nó. Esta mede o que só existe entre eles: a soma dos
 * timeouts do percurso, o elo mais lento, o número de saltos. É a classe de
 * defeito que passa por toda medição por elemento — cinco nós dentro do padrão
 * e um caminho fora dele.
 *
 * Função pura, sem I/O, como o resto do engine.
 */

export interface ViolacaoDePercurso {
  percursoId: string;
  /** O caminho como a pessoa o reconhece — o id sozinho não diz nada. */
  rotulo: string;
  texto: string;
  campo?: string;
  esperado: string;
  /** O valor apurado, já com unidade. */
  atual: string;
  porque?: string;
}

/**
 * SPEC-64 fatia A — o que o caminho ATRAVESSA.
 *
 * Um caminho não é uma fila de nós: é nó, conexão, nó, conexão, nó. A apuração
 * media só os nós, e por isso a régua que soma `timeoutMs` devolvia **zero** num
 * caminho ligado por HTTP — o campo é declarado em `edgeTypes.http`, e quem
 * media olhava `nodeTypes`. O cabeçalho deste arquivo prometia "a soma dos
 * timeouts do percurso" desde sempre.
 */
export interface ElementoDoCaminho {
  tipo: "no" | "aresta";
  id: string;
  /** O rótulo que a pessoa reconhece — o id sozinho não diz nada. */
  rotulo: string;
}

/**
 * §248 — o percurso que **não dá para medir**, e por que isso é resultado e não
 * omissão.
 *
 * Se um elemento do caminho declara o campo no seu tipo e não o preencheu, a
 * soma está incompleta. Somar o que existe e comparar com o teto produziria um
 * número menor que a verdade — ou seja, **um verde falso**, que é o pior
 * resultado possível de uma medição. Ficar em silêncio total seria quase tão
 * ruim: a pessoa nunca saberia que a régua não conseguiu rodar.
 *
 * Então a apuração tem três respostas, não duas: dentro do padrão, fora do
 * padrão, e *"faltam estes elementos para eu conseguir dizer"*.
 */
export interface PercursoNaoMedido {
  percursoId: string;
  rotulo: string;
  texto: string;
  campo: string;
  /**
   * SPEC-64 — era `nosSemValor: string[]`. Passou a carregar CONEXÃO também, e
   * um campo chamado "nós" carregando aresta é a mentira por nome que o §280
   * corrigiu noutro lugar. Vazio quando o motivo não é valor faltando (ver
   * `motivo`).
   */
  elementosSemValor: ElementoDoCaminho[];
  /**
   * Por que não deu para medir, quando não é simplesmente "faltou preencher" —
   * hoje, o par de nós ligado por mais de uma conexão que declara o campo.
   */
  motivo?: string;
}

export interface ResultadoDePercursos {
  violacoes: ViolacaoDePercurso[];
  naoMedidos: PercursoNaoMedido[];
}

function numeroDe(valor: unknown): number | undefined {
  if (valor === undefined || valor === null || valor === "") return undefined;
  const n = typeof valor === "number" ? valor : Number(valor);
  return Number.isFinite(n) ? n : undefined;
}

/** O tipo deste nó declara este campo? É o que separa "não se aplica" de
 * "aplica-se e está vazio" — e essa diferença é a fatia inteira. */
function declaraCampo(no: No, config: DiagramaConfig, campo: string): boolean {
  return (config.nodeTypes[no.type]?.spec ?? []).some((c) => c.key === campo);
}

/** SPEC-64 — o mesmo, para a CONEXÃO. `timeoutMs` de uma chamada síncrona mora
 * aqui, não no nó. */
function arestaDeclaraCampo(aresta: Aresta, config: DiagramaConfig, campo: string): boolean {
  return (config.edgeTypes[aresta.type]?.spec ?? []).some((c) => c.key === campo);
}

function rotuloDoNo(no: No | undefined, id: string): string {
  return no?.label?.trim() || id;
}

interface Contribuinte {
  elemento: ElementoDoCaminho;
  valor: number | undefined;
}

/**
 * SPEC-64 fatia A — os elementos atravessados que DECLARAM o campo, na ordem.
 *
 * A resolução é **por campo**, e não uma lista fixa de elementos do caminho: um
 * par de nós ligado por duas conexões só é ambíguo para a régua se as duas
 * declararem o campo que ela mede. Resolver antes do campo produziria
 * "não medido" em régua que nem olha para conexão.
 */
function contribuintesDoCampo(
  percurso: Percurso,
  diagrama: Diagrama,
  config: DiagramaConfig,
  campo: string
): { lista: Contribuinte[] } | { ambiguo: string } {
  const porId = new Map(diagrama.nodes.map((n) => [n.id, n]));
  const lista: Contribuinte[] = [];

  for (let i = 0; i < percurso.nos.length; i++) {
    const id = percurso.nos[i];
    const no = porId.get(id);
    if (no && declaraCampo(no, config, campo)) {
      lista.push({
        elemento: { tipo: "no", id, rotulo: rotuloDoNo(no, id) },
        valor: numeroDe(no.spec[campo]?.valor),
      });
    }

    // A conexão que leva ao PRÓXIMO nó. `source → target` é a direção lógica em
    // todo o engine; `reversed` é só como o canvas desenha a seta.
    const proximo = percurso.nos[i + 1];
    if (proximo === undefined) continue;
    const candidatas = diagrama.edges.filter(
      (e) => e.source === id && e.target === proximo && arestaDeclaraCampo(e, config, campo)
    );
    if (candidatas.length > 1) {
      // §248, terceira resposta, num caso novo: escolher uma seria inventar, e
      // somar todas inflaria o caminho. O desenho é que não diz por onde passa.
      return {
        ambiguo: `há mais de uma conexão de "${rotuloDoNo(porId.get(id), id)}" para "${rotuloDoNo(
          porId.get(proximo),
          proximo
        )}" que declara ${campo} — o desenho não diz por qual o caminho passa`,
      };
    }
    const aresta = candidatas[0];
    if (aresta) {
      lista.push({
        elemento: {
          tipo: "aresta",
          id: aresta.id,
          rotulo: `${rotuloDoNo(porId.get(id), id)} → ${rotuloDoNo(porId.get(proximo), proximo)}`,
        },
        valor: numeroDe(aresta.spec?.[campo]?.valor),
      });
    }
  }

  return { lista };
}

/** "3 nós e 2 conexões" — dizer só "5 elementos" esconderia justamente o que
 * mudou nesta fatia. */
function contarElementos(lista: Contribuinte[]): string {
  const nos = lista.filter((c) => c.elemento.tipo === "no").length;
  const arestas = lista.length - nos;
  const partes: string[] = [];
  if (nos > 0) partes.push(`${nos} ${nos === 1 ? "nó" : "nós"}`);
  if (arestas > 0) partes.push(`${arestas} ${arestas === 1 ? "conexão" : "conexões"}`);
  return partes.join(" e ");
}

function descreverEsperado(c: ChecagemDePercurso): string {
  const alvo = `${c.valor ?? ""}${c.unidade ?? ""}`;
  switch (c.operador) {
    case "lte":
      return `≤ ${alvo}`;
    case "lt":
      return `< ${alvo}`;
    case "gte":
      return `≥ ${alvo}`;
    case "gt":
      return `> ${alvo}`;
    case "eq":
      return `= ${alvo}`;
    case "ne":
      return `≠ ${alvo}`;
    case "preenchido":
      // Não faz sentido sobre um agregado, e a validação de config recusa.
      return "preenchido";
    /**
     * SPEC-79 fatia C — os dois operadores do design system não se aplicam a
     * PERCURSO, e a razão é a mesma do `preenchido` acima: um percurso é uma
     * soma sobre um caminho, e nem contraste nem pertencimento a token são
     * agregáveis. "A soma das cores do caminho" não quer dizer nada.
     *
     * Chegar aqui é config incorreta, não desenho errado — e por isso a frase
     * descreve o operador em vez de acusar quem desenhou.
     */
    case "contraste-gte":
    case "pertence-aos-tokens":
      return c.operador;
  }
}

function satisfaz(operador: ChecagemDePercurso["operador"], valor: number, alvo: number): boolean {
  switch (operador) {
    case "lte":
      return valor <= alvo;
    case "lt":
      return valor < alvo;
    case "gte":
      return valor >= alvo;
    case "gt":
      return valor > alvo;
    case "eq":
      return valor === alvo;
    case "ne":
      return valor !== alvo;
    default:
      return true;
  }
}

const ROTULO_AGREGACAO: Record<string, string> = {
  soma: "soma",
  maximo: "maior",
  saltos: "saltos",
};

export function avaliarPercursos(
  diagrama: Diagrama,
  config: DiagramaConfig,
  percursos: Percurso[] = [],
  regras?: RegrasConfig
): ResultadoDePercursos {
  const requisitos = regras?.percursos ?? [];
  if (requisitos.length === 0) return { violacoes: [], naoMedidos: [] };

  const porId = new Map(diagrama.nodes.map((n) => [n.id, n]));
  const violacoes: ViolacaoDePercurso[] = [];
  const naoMedidos: PercursoNaoMedido[] = [];

  // Só os confirmados: medir caminho que ninguém olhou produziria cobrança
  // sobre uma leitura do grafo que talvez esteja errada (regra 2).
  for (const percurso of percursosQueContam(percursos)) {
    // Nó apagado depois da confirmação: o caminho perdeu um pedaço, e medir o
    // resto seria inventar. Vira "não medido", com o nó ausente à mostra.
    const nos = percurso.nos.map((id) => porId.get(id));
    const ausentes = percurso.nos.filter((id) => !porId.has(id));

    for (const requisito of requisitos) {
      const c = requisito.checagem;
      const alvo = numeroDe(c.valor);

      if (c.agregacao === "saltos") {
        if (alvo === undefined) continue;
        // Salto é ARESTA percorrida, não nó visitado: `a → b` é um salto, não
        // dois. Contar nós e chamar de salto daria um número off-by-one num
        // rótulo que a pessoa lê — e ela ajustaria a régua para compensar um
        // erro nosso.
        const saltos = Math.max(0, percurso.nos.length - 1);
        if (!satisfaz(c.operador, saltos, alvo)) {
          violacoes.push({
            percursoId: percurso.id,
            rotulo: percurso.rotulo,
            texto: requisito.texto,
            esperado: descreverEsperado(c),
            atual: `${saltos} salto(s)`,
            porque: requisito.porque,
          });
        }
        continue;
      }

      const campo = c.campo;
      if (!campo || alvo === undefined) continue;

      if (ausentes.length > 0) {
        naoMedidos.push({
          percursoId: percurso.id,
          rotulo: percurso.rotulo,
          texto: requisito.texto,
          campo,
          elementosSemValor: ausentes.map((id) => ({ tipo: "no" as const, id, rotulo: id })),
        });
        continue;
      }

      const resolvido = contribuintesDoCampo(percurso, diagrama, config, campo);
      if ("ambiguo" in resolvido) {
        naoMedidos.push({
          percursoId: percurso.id,
          rotulo: percurso.rotulo,
          texto: requisito.texto,
          campo,
          elementosSemValor: [],
          motivo: resolvido.ambiguo,
        });
        continue;
      }

      // Nenhum elemento do caminho tem esse campo no tipo: a régua não se aplica
      // aqui, e isso é silêncio legítimo — não é medida faltando. Depois da
      // SPEC-64 este silêncio é raro e honesto: antes ele engolia todo caminho
      // cujos timeouts moravam nas conexões.
      if (resolvido.lista.length === 0) continue;

      const semValor = resolvido.lista.filter((c) => c.valor === undefined);
      if (semValor.length > 0) {
        naoMedidos.push({
          percursoId: percurso.id,
          rotulo: percurso.rotulo,
          texto: requisito.texto,
          campo,
          elementosSemValor: semValor.map((c) => c.elemento),
        });
        continue;
      }

      const valores = resolvido.lista.map((c) => c.valor as number);
      const apurado = c.agregacao === "soma" ? valores.reduce((a, b) => a + b, 0) : Math.max(...valores);

      if (!satisfaz(c.operador, apurado, alvo)) {
        violacoes.push({
          percursoId: percurso.id,
          rotulo: percurso.rotulo,
          texto: requisito.texto,
          campo,
          esperado: descreverEsperado(c),
          // A conta aparece: sem ela a pessoa sabe que está fora e não sabe de
          // quanto nem por causa de quem.
          atual: `${ROTULO_AGREGACAO[c.agregacao]} de ${campo} = ${apurado}${c.unidade ?? ""} em ${contarElementos(resolvido.lista)}`,
          porque: requisito.porque,
        });
      }
    }
  }

  return { violacoes, naoMedidos };
}
