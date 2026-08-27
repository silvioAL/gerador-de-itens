import type { DiagramaConfig } from "../config/types.js";
import type { Aresta, Diagrama, ExcecaoDePadrao, No, ValorSpec, VolumetriaDaDemanda } from "../model/types.js";
import { arestaEspera } from "./lerDesenho.js";
import { distribuirVolumetria, formatarRps } from "./volumetria.js";

/**
 * SPEC-68 — os padrões de resiliência como CONTA, não como checklist.
 *
 * ## O que esta família responde, e o que ela recusa responder
 *
 * A tentação era inflar o pior caso: com `tentativas` declarado, `timeout ×
 * tentativas`. Números maiores, mais alarme. A própria SPEC-56 §12.1.1 já tinha
 * nomeado por que isso é ruim:
 *
 * > *"A aritmética de pior caso tem um defeito que eu não nomeei: **ela grita
 * > lobo**… um alerta que aparece em todo caminho com mais de três nós é um
 * > alerta que as pessoas aprendem a ignorar."*
 *
 * Multiplicar o pior caso por tentativas piora exatamente esse defeito.
 *
 * > **A conta que importa não é "quanto demora". É: o sistema desiste antes ou
 * > depois de quem chamou?**
 *
 * Uma api que insiste por 1,5 s numa requisição que o cliente abandonou em 1 s
 * joga meio segundo de trabalho fora — garantidamente, e justo quando o sistema
 * já está em dificuldade, que é quando o retry dispara. Isso não é pior caso
 * improvável: é uma **contradição entre dois números que alguém declarou**.
 *
 * Ela ou existe no desenho ou não existe, e quando existe está sempre errada.
 * É o oposto de gritar lobo.
 *
 * Funções puras, sem I/O, como o resto do engine.
 */

/** Os nomes são CONVENÇÃO da config padrão, não hardcode: quem chama passa os
 * seus, como o `campoDeTempo` da SPEC-65. */
export const CAMPOS_DE_RESILIENCIA = {
  tempo: "timeoutMs",
  tentativas: "tentativas",
  espera: "esperaEntreMs",
  disjuntor: "disjuntor",
  pool: "chamadasSimultaneas",
  taxa: "taxaEsperadaRps",
} as const;

export type CamposDeResiliencia = typeof CAMPOS_DE_RESILIENCIA;

function numeroDe(v: ValorSpec | undefined): number | undefined {
  const bruto = v?.valor;
  if (bruto === undefined || bruto === null || bruto === "") return undefined;
  const n = typeof bruto === "number" ? bruto : Number(bruto);
  return Number.isFinite(n) ? n : undefined;
}

function boolDe(v: ValorSpec | undefined): boolean | undefined {
  return typeof v?.valor === "boolean" ? v.valor : undefined;
}

function rotuloDoNo(no: No | undefined, id: string): string {
  return no?.label?.trim() || id;
}

export interface Insistencia {
  /** Por quanto tempo o sistema insiste nesta conexão antes de desistir. */
  ms: number;
  tentativas: number;
  /** `true` quando há mais de uma tentativa — é o que torna a conta diferente
   * do timeout, e o que a régua da §3.2 compara. */
  insiste: boolean;
  temDisjuntor?: boolean;
}

/**
 * Quanto tempo esta conexão insiste antes de desistir.
 *
 * `timeout × tentativas + espera × (tentativas − 1)` — determinística, e sobre
 * números que a própria pessoa escreveu.
 *
 * `undefined` quando o timeout não foi declarado: sem ele não há o que
 * multiplicar, e inventar um valor daria uma conta com cara de medida (§248).
 * `tentativas` ausente vale **1** — não declarar retry é declarar que não há.
 */
export function insistenciaDe(
  aresta: Aresta,
  campos: CamposDeResiliencia = CAMPOS_DE_RESILIENCIA
): Insistencia | undefined {
  const timeout = numeroDe(aresta.spec?.[campos.tempo]);
  if (timeout === undefined) return undefined;

  const declaradas = numeroDe(aresta.spec?.[campos.tentativas]);
  // Zero ou negativo é dado sujo: uma chamada acontece pelo menos uma vez, e
  // tratar `0` como "nenhuma tentativa" produziria insistência zero num
  // desenho que claramente chama alguém.
  const tentativas = declaradas !== undefined && declaradas >= 1 ? Math.floor(declaradas) : 1;
  const espera = numeroDe(aresta.spec?.[campos.espera]) ?? 0;

  return {
    ms: timeout * tentativas + espera * Math.max(0, tentativas - 1),
    tentativas,
    insiste: tentativas > 1,
    temDisjuntor: boolDe(aresta.spec?.[campos.disjuntor]),
  };
}

export interface ContradicaoDeResiliencia {
  /** `insistencia` | `saturacao` — para a tela agrupar sem depender do texto. */
  tipo: "insistencia" | "saturacao";
  /** O elemento a acusar: a CONEXÃO que insiste demais, ou o NÓ que satura. */
  noId?: string;
  arestaId?: string;
  rotulo: string;
  /** A frase do que o desenho promete, e a do que ele faz. */
  esperado: string;
  atual: string;
  porque: string;
  /**
   * §307 — a exceção que a tirou do placar, quando alguém a aceitou de
   * propósito.
   *
   * Presente = some do vermelho, **não do histórico** (§242). É a mesma forma
   * que `Violacao` carrega desde o §239, e de propósito: a válvula tem que ser
   * a mesma em toda cobrança, senão a pessoa aprende que umas se aceitam e
   * outras se ignoram.
   */
  excecao?: ExcecaoDePadrao;
}

/** As que ainda cobram alguém — é este número que vai ao placar. */
export function contradicoesEmAberto(lista: ContradicaoDeResiliencia[]): ContradicaoDeResiliencia[] {
  return lista.filter((c) => !c.excecao);
}

/** As aceitas de propósito. Continuam existindo, noutro lugar e com outra cor. */
export function contradicoesAceitas(lista: ContradicaoDeResiliencia[]): ContradicaoDeResiliencia[] {
  return lista.filter((c) => c.excecao);
}

/** A chave de uma contradição: o par elemento + tipo. Um dono só, porque quem
 * marca e quem grava a exceção precisam concordar (§263). */
export function chaveDaContradicao(c: {
  tipo: ContradicaoDeResiliencia["tipo"];
  noId?: string;
  arestaId?: string;
}): string {
  return `${c.tipo}::${c.noId ?? c.arestaId ?? ""}`;
}

/**
 * §3.2 — o sistema desiste depois de quem chamou.
 *
 * Compara a insistência do que SAI de um nó com a paciência de quem ENTRA nele
 * (o timeout da conexão de entrada). Passar disso é trabalho garantidamente
 * desperdiçado.
 *
 * **Só acusa com os dois lados declarados.** Sem um deles há silêncio — e não é
 * "não deu para medir": é que a pergunta não foi feita. Comparar um número com
 * uma suposição é como se produz o alarme que ninguém respeita.
 */
function contradicoesDeInsistencia(
  diagrama: Diagrama,
  config: DiagramaConfig,
  campos: CamposDeResiliencia
): ContradicaoDeResiliencia[] {
  const porId = new Map(diagrama.nodes.map((n) => [n.id, n]));
  const achados: ContradicaoDeResiliencia[] = [];

  for (const no of diagrama.nodes) {
    // A paciência de quem chama: a MENOR entre as entradas que esperam. A menor
    // porque basta um chamador impaciente para o trabalho extra ser jogado fora
    // — usar a média ou a maior esconderia justamente o caso que dói.
    const paciencias = diagrama.edges
      .filter((e) => e.target === no.id && e.source !== e.target && arestaEspera(e, config) === true)
      .map((e) => numeroDe(e.spec?.[campos.tempo]))
      .filter((ms): ms is number => ms !== undefined);
    if (paciencias.length === 0) continue;
    const paciencia = Math.min(...paciencias);

    for (const saida of diagrama.edges) {
      if (saida.source !== no.id || saida.target === no.id) continue;
      if (arestaEspera(saida, config) !== true) continue;
      const ins = insistenciaDe(saida, campos);
      // Sem retry declarado não há contradição a apontar: um timeout maior que
      // a paciência de quem chama é escolha de desenho, e a régua de percurso
      // (SPEC-57) já sabe cobrar soma de tempo. Aqui a queixa é sobre INSISTIR.
      if (!ins || !ins.insiste || ins.ms <= paciencia) continue;

      achados.push({
        tipo: "insistencia",
        arestaId: saida.id,
        rotulo: `${rotuloDoNo(no, no.id)} → ${rotuloDoNo(porId.get(saida.target), saida.target)}`,
        esperado: `desistir em até ${paciencia} ms (a paciência de quem chama ${rotuloDoNo(no, no.id)})`,
        atual: `insiste por até ${ins.ms} ms (${ins.tentativas} tentativas)`,
        porque:
          "Quem chamou já desistiu, e o trabalho continua — justamente quando o sistema está em dificuldade, que é quando o retry dispara." +
          (ins.temDisjuntor === true
            ? " O disjuntor ajuda quando o destino já falhou várias vezes, mas não encurta a primeira rajada."
            : " Sem disjuntor, a insistência ainda vira fila de espera na origem."),
      });
    }
  }

  return achados;
}

/**
 * §3.3 — a Lei de Little, e o único "Controle" que é aritmética.
 *
 * `concorrência = taxa × tempo de resposta`. Com a taxa esperada e o limite de
 * chamadas simultâneas declarados, a conta é exata e a saturação é garantida —
 * não é projeção, é o que aqueles dois números significam juntos.
 *
 * Duração, ramp-up e taxa de falha ficam de fora: só produzem número através de
 * amostragem, e a SPEC-56 §0.3/§12.1 já os recusou.
 */
function contradicoesDeSaturacao(
  diagrama: Diagrama,
  config: DiagramaConfig,
  campos: CamposDeResiliencia,
  /**
   * SPEC-70 §4 — a taxa DERIVADA do volume da demanda, por nó.
   *
   * Preenche o silêncio: quem não declarou taxa passa a ter a que o grafo
   * carregou da porta da frente. Vazio = o comportamento de antes desta SPEC.
   */
  taxaDerivada: Map<string, number> = new Map()
): ContradicaoDeResiliencia[] {
  const achados: ContradicaoDeResiliencia[] = [];

  for (const no of diagrama.nodes) {
    /**
     * §4 — DECLARADO vence DERIVADO.
     *
     * Quem mediu um componente sabe mais que quem propagou a partir da porta da
     * frente — um serviço que também recebe tráfego de fora do desenho é o caso
     * óbvio, e o número dele não é o da demanda.
     */
    const declarada = numeroDe(no.spec?.[campos.taxa]);
    const taxa = declarada ?? taxaDerivada.get(no.id);
    const pool = numeroDe(no.spec?.[campos.pool]);
    if (taxa === undefined || pool === undefined || taxa <= 0 || pool <= 0) continue;

    // O tempo que ESTE nó segura uma requisição: o que ele espera das chamadas
    // que faz. Sem nenhuma, não há o que somar e a conta não se faz.
    const saidas = diagrama.edges.filter(
      (e) => e.source === no.id && e.target !== no.id && arestaEspera(e, config) === true
    );
    const tempos = saidas.map((e) => numeroDe(e.spec?.[campos.tempo])).filter((n): n is number => n !== undefined);
    if (tempos.length === 0) continue;
    // Soma, e não máximo: as chamadas do fan-out entram na conta como o §291 já
    // as trata — quem espera as três segura a requisição pelas três.
    const seguraMs = tempos.reduce((a, b) => a + b, 0);

    const necessaria = (taxa * seguraMs) / 1000;
    if (necessaria <= pool) continue;

    achados.push({
      tipo: "saturacao",
      noId: no.id,
      rotulo: rotuloDoNo(no, no.id),
      esperado: `${pool} chamadas simultâneas`,
      // A frase diz DE ONDE veio a taxa: um número derivado apresentado como
      // declarado seria a ferramenta se atribuindo uma medição que ninguém fez.
      atual: `${Math.ceil(necessaria)} necessárias (${formatarRps(taxa)}${
        declarada === undefined ? ", vindo do volume da demanda" : ""
      } × ${seguraMs} ms)`,
      porque:
        "Concorrência é taxa vezes tempo de resposta (Lei de Little). Com esses dois números declarados, a fila na entrada não é risco: é consequência.",
    });
  }

  return achados;
}

/**
 * As contradições de resiliência do desenho.
 *
 * Elas **não** são leitura (SPEC-65): leitura é fato, e isto é defeito — dois
 * números declarados que não podem estar os dois certos. Por isso vão para o
 * placar ⚖, com o porquê e a válvula da exceção, como toda violação desde o
 * §239.
 */
export function avaliarResiliencia(
  diagrama: Diagrama,
  config: DiagramaConfig,
  campos: CamposDeResiliencia = CAMPOS_DE_RESILIENCIA,
  /**
   * SPEC-70 — o volume da demanda, para a saturação não depender de alguém
   * digitar a taxa nó a nó. Ausente = o comportamento de antes: só acusa onde
   * alguém declarou.
   */
  volumetria?: {
    volume?: VolumetriaDaDemanda;
    fator?: number;
    /**
     * §307 — as contradições aceitas de propósito nesta quebra.
     *
     * Marcadas aqui, e não filtradas: some do vermelho, não do histórico. É a
     * mesma disciplina do `avaliarConformidade` desde o §239, e a razão é a
     * mesma — quem lê o documento depois precisa saber que houve uma decisão,
     * não encontrar um silêncio.
     */
    excecoes?: ExcecaoDePadrao[];
  }
): ContradicaoDeResiliencia[] {
  const aceitas = new Map(
    (volumetria?.excecoes ?? [])
      .filter((e) => e.contradicao)
      .map((e) => [`${e.contradicao}::${e.noId}`, e])
  );
  return [
    ...contradicoesDeInsistencia(diagrama, config, campos),
    ...contradicoesDeSaturacao(
      diagrama,
      config,
      campos,
      distribuirVolumetria(diagrama, config, volumetria?.volume, volumetria?.fator ?? 1)
    ),
  ].map((c) => {
    const excecao = aceitas.get(chaveDaContradicao(c));
    return excecao ? { ...c, excecao } : c;
  });
}
