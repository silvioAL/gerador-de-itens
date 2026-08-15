import type { ChecagemDePercurso, DiagramaConfig, RegrasConfig } from "../config/types.js";
import type { Diagrama, No, Percurso } from "../model/types.js";
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
 * §248 — o percurso que **não dá para medir**, e por que isso é resultado e não
 * omissão.
 *
 * Se um nó do caminho declara o campo no seu tipo e não o preencheu, a soma
 * está incompleta. Somar o que existe e comparar com o teto produziria um
 * número menor que a verdade — ou seja, **um verde falso**, que é o pior
 * resultado possível de uma medição. Ficar em silêncio total seria quase tão
 * ruim: a pessoa nunca saberia que a régua não conseguiu rodar.
 *
 * Então a apuração tem três respostas, não duas: dentro do padrão, fora do
 * padrão, e *"faltam estes campos para eu conseguir dizer"*.
 */
export interface PercursoNaoMedido {
  percursoId: string;
  rotulo: string;
  texto: string;
  campo: string;
  /** Ids dos nós que declaram o campo e não o preencheram. */
  nosSemValor: string[];
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
        naoMedidos.push({ percursoId: percurso.id, rotulo: percurso.rotulo, texto: requisito.texto, campo, nosSemValor: ausentes });
        continue;
      }

      const relevantes = nos.filter((n): n is No => !!n && declaraCampo(n, config, campo));
      // Nenhum nó do caminho tem esse campo no tipo: a régua não se aplica
      // aqui, e isso é silêncio legítimo — não é medida faltando.
      if (relevantes.length === 0) continue;

      const semValor = relevantes.filter((n) => numeroDe(n.spec[campo]?.valor) === undefined);
      if (semValor.length > 0) {
        naoMedidos.push({
          percursoId: percurso.id,
          rotulo: percurso.rotulo,
          texto: requisito.texto,
          campo,
          nosSemValor: semValor.map((n) => n.id),
        });
        continue;
      }

      const valores = relevantes.map((n) => numeroDe(n.spec[campo]?.valor) as number);
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
          atual: `${ROTULO_AGREGACAO[c.agregacao]} de ${campo} = ${apurado}${c.unidade ?? ""} em ${relevantes.length} nós`,
          porque: requisito.porque,
        });
      }
    }
  }

  return { violacoes, naoMedidos };
}
