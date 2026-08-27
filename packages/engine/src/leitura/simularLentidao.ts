import type { DiagramaConfig } from "../config/types.js";
import type { Diagrama, ValorSpec } from "../model/types.js";
import {
  CAMPO_DE_TEMPO_PADRAO,
  arestaEspera,
  formatarDuracao,
  lerDesenho,
  type ElementoDaLeitura,
  type LeituraDoDesenho,
} from "./lerDesenho.js";
import { avaliarResiliencia, insistenciaDe, type ContradicaoDeResiliencia } from "./resiliencia.js";

/**
 * SPEC-66 fatia A — a mesa como bancada de ensaio.
 *
 * ## O cálculo não é da IA
 *
 * "Se o bureau responder em 8 s em vez de 3 s, quanto passa a demorar a
 * resposta?" é **aritmética sobre o grafo**: trocar um número e recorrer
 * `lerDesenho`. Determinístico, instantâneo, e **o mesmo resultado toda vez**.
 * Um modelo trocaria uma resposta exata por uma plausível, e ninguém deveria
 * decidir arquitetura com número que muda entre execuções.
 *
 * O que a IA propõe é a **pauta** — quais cenários merecem ensaio —, nunca o
 * resultado. Ver SPEC-66 §1.
 *
 * ## O cenário nunca escreve no desenho
 *
 * Ele é uma lente sobre uma **cópia**. Um "e se" que altera o diagrama de
 * verdade transformaria ensaio em mudança, e a pessoa perderia o original no
 * primeiro clique.
 *
 * Função pura, sem I/O, como o resto do engine.
 */

export interface AjusteDeCenario {
  /** O mesmo par que `ElementoDaLeitura` usa: a leitura e o ajuste falam a
   * mesma língua, e o realce de um serve ao outro. */
  tipo: "no" | "aresta";
  id: string;
  /** `3` = "três vezes mais lento". Ignorado quando `ms` está presente. */
  fator?: number;
  /** Valor absoluto em ms — a pergunta "e se o SLA fosse 500 ms?". */
  ms?: number;
  /**
   * SPEC-68 — as condições que NÃO são lentidão.
   *
   * A SPEC-66 acertou o mecanismo e errou o escopo pelo nome: retry não é
   * lentidão, pico de tráfego não é lentidão, disjuntor desligado não é
   * lentidão. São **condições**, e o tempo é só uma delas.
   */
  tentativas?: number;
  disjuntor?: boolean;
  /** req/s no nó — o λ da Lei de Little (SPEC-68 §3.3). */
  taxaRps?: number;
}

/**
 * SPEC-69 §4.0 — o estado do ensaio, e o que ele pede de quem olha.
 *
 * Três botões soltos numa linha não são um processo. O fluxo declarado é
 * *avaliar → revisar → aceitar ou modificar*, e cada estado diz o que se espera.
 *
 * **`por-avaliar` e `em-revisao` cobram igual.** O que tira do placar é
 * ACEITAR, não olhar — sair da cobrança por ter aberto a linha seria a fórmula
 * de fazer as pessoas abrirem tudo sem ler.
 */
export type EstadoDoEnsaio = "por-avaliar" | "em-revisao" | "aceito";

/**
 * SPEC-69 — o débito assumido, com quem e quando.
 *
 * Mesma forma da `ExcecaoDePadrao` (§242), e pelo mesmo motivo: sem o motivo
 * escrito, isto vira um botão de silenciar, e a próxima pessoa a abrir o
 * documento não saberá se aquilo foi decisão ou cansaço.
 */
export interface DebitoAssumido {
  motivo: string;
  autor?: string;
  em?: string;
}

export interface CenarioDeLentidao {
  id: string;
  nome: string;
  /**
   * De onde veio. `sugerido` chega para alguém avaliar: inferir é grátis e erra
   * (regra 2 da SPEC-57), e proposta de modelo não é exceção.
   */
  origem: "manual" | "sugerido";
  porque?: string;
  /**
   * SPEC-69 — ausente vale `por-avaliar`: ensaio de quebra antiga nasce
   * cobrando, que é o comportamento certo. O antigo `aceito?: boolean` migra
   * sozinho — ver `estadoDoEnsaio`.
   */
  estado?: EstadoDoEnsaio;
  /** Só existe em `estado: "aceito"`. */
  debito?: DebitoAssumido;
  /** @deprecated SPEC-69 — lido só para migrar quebra gravada antes do estado. */
  aceito?: boolean;
  ajustes: AjusteDeCenario[];
}

/**
 * O estado, tolerando a quebra gravada antes desta SPEC.
 *
 * `aceito: true` de antes vira `aceito` — quem já tinha marcado não perde o
 * gesto. E ausência total vira `por-avaliar`: um ensaio que ninguém olhou
 * cobra, que é a inversão que dá nome a esta SPEC.
 */
export function estadoDoEnsaio(c: CenarioDeLentidao): EstadoDoEnsaio {
  if (c.estado) return c.estado;
  return c.aceito === true ? "aceito" : "por-avaliar";
}

/** O que ainda cobra alguém — o que vai ao placar. */
export function ensaioCobra(c: CenarioDeLentidao): boolean {
  return estadoDoEnsaio(c) !== "aceito";
}

export interface ResultadoDoCenario {
  cenarioId: string;
  nome: string;
  /** A leitura inteira do desenho ajustado — o chamador escolhe o que mostrar. */
  leitura: LeituraDoDesenho;
  /** O pior trecho, que é o número da tabela. `undefined` = não há o que somar. */
  ms?: number;
  /** `false` = a soma é piso (§248). O `≥` sobrevive ao cenário: ele não
   * inventa número que o desenho não deu. */
  completo: boolean;
  /** Quem mais pesa. Empate devolve os dois. */
  dominantes: { elemento: ElementoDaLeitura; ms: number }[];
  /**
   * Contra o desenho de HOJE, nunca contra o cenário anterior: comparar em
   * cadeia faria a ordem das linhas mudar o significado dos números.
   * `undefined` quando um dos dois lados não tem número a comparar.
   */
  delta?: number;
  /** Ajustes que não encontraram elemento — o desenho mudou depois do cenário.
   * §57: um ensaio que ignorou parte do que lhe pediram tem que dizer. */
  ajustesSemAlvo: AjusteDeCenario[];
  /**
   * SPEC-68 — o que este ensaio faz o desenho passar a contradizer.
   *
   * É a coluna que transforma a tabela de placar em ferramenta: "com o pico de
   * 100 req/s, o pool de 10 satura" é uma consequência que ninguém enxerga
   * olhando dois campos em telas diferentes.
   */
  contradicoes: ContradicaoDeResiliencia[];
  /** Por quanto tempo o trecho mais demorado INSISTE antes de desistir. */
  insistenciaMs?: number;
}

export interface ElementoAjustavel {
  tipo: "no" | "aresta";
  id: string;
  rotulo: string;
  /** O tempo declarado hoje. Ausente = o campo existe e ninguém respondeu. */
  msAtual?: number;
  /** SPEC-66 — o que não é de vocês merece atenção especial no ensaio. */
  externo?: boolean;
}

/**
 * Os elementos que PODEM ficar lentos — os que declaram o campo de tempo.
 *
 * Só eles entram na lista de ajustáveis e no pedido à IA: oferecer um slider
 * para um elemento sem duração seria oferecer um controle que não controla
 * nada, e deixar o modelo escolher entre eles produziria ajuste que a conta
 * ignora em silêncio.
 */
export function elementosComTempo(
  diagrama: Diagrama,
  config: DiagramaConfig,
  campo: string = CAMPO_DE_TEMPO_PADRAO
): ElementoAjustavel[] {
  const rotulo = (id: string) => diagrama.nodes.find((n) => n.id === id)?.label?.trim() || id;

  const nos: ElementoAjustavel[] = diagrama.nodes
    .filter((n) => (config.nodeTypes[n.type]?.spec ?? []).some((c) => c.key === campo))
    .map((n) => ({
      tipo: "no",
      id: n.id,
      rotulo: rotulo(n.id),
      msAtual: valorNumerico(n.spec?.[campo]),
      externo: config.nodeTypes[n.type]?.derives === "external",
    }));

  const arestas: ElementoAjustavel[] = diagrama.edges
    .filter((e) => (config.edgeTypes[e.type]?.spec ?? []).some((c) => c.key === campo))
    .map((e) => ({
      tipo: "aresta",
      id: e.id,
      rotulo: `${rotulo(e.source)} → ${rotulo(e.target)}`,
      msAtual: valorNumerico(e.spec?.[campo]),
    }));

  return [...nos, ...arestas];
}

function valorNumerico(v: ValorSpec | undefined): number | undefined {
  const bruto = v?.valor;
  if (bruto === undefined || bruto === null || bruto === "") return undefined;
  const n = typeof bruto === "number" ? bruto : Number(bruto);
  return Number.isFinite(n) ? n : undefined;
}

/** O tempo depois do ajuste. `ms` manda sobre `fator`: valor absoluto é uma
 * afirmação, multiplicador é uma variação sobre o que existe. */
function aplicar(atual: number | undefined, ajuste: AjusteDeCenario): number | undefined {
  if (ajuste.ms !== undefined) return ajuste.ms;
  if (ajuste.fator !== undefined && atual !== undefined) return atual * ajuste.fator;
  // Multiplicar o que ninguém declarou daria um número inventado com cara de
  // medida. O elemento segue sem valor, e a soma segue sendo piso.
  return atual;
}

/**
 * SPEC-68 — os campos que o ensaio sobrescreve além do tempo.
 *
 * Só entram os que o ajuste DECLARA: um ensaio sobre taxa não deve zerar o
 * retry que a pessoa configurou no desenho, e omissão aqui significa "como
 * está", nunca "nenhum".
 */
function outrosCampos(ajuste: AjusteDeCenario): Record<string, ValorSpec> {
  const campos: Record<string, ValorSpec> = {};
  if (ajuste.tentativas !== undefined) campos.tentativas = { valor: ajuste.tentativas, origem: "manual" };
  if (ajuste.disjuntor !== undefined) campos.disjuntor = { valor: ajuste.disjuntor, origem: "manual" };
  if (ajuste.taxaRps !== undefined) campos.taxaEsperadaRps = { valor: ajuste.taxaRps, origem: "manual" };
  return campos;
}

/**
 * Roda o cenário e devolve o que a tabela mostra.
 *
 * `hoje` entra como parâmetro (e não é recalculado aqui) porque a tabela
 * inteira compara contra a MESMA âncora: recalculá-la por linha abriria a porta
 * para duas linhas compararem contra leituras diferentes do mesmo desenho.
 */
export function simularCenario(
  diagrama: Diagrama,
  config: DiagramaConfig,
  cenario: CenarioDeLentidao,
  hoje?: LeituraDoDesenho,
  campoDeTempo: string = CAMPO_DE_TEMPO_PADRAO
): ResultadoDoCenario {
  const nosPorId = new Map(diagrama.nodes.map((n) => [n.id, n]));
  const arestasPorId = new Map(diagrama.edges.map((e) => [e.id, e]));
  const ajustesSemAlvo: AjusteDeCenario[] = [];

  // A cópia é rasa nos elementos NÃO tocados e profunda só onde o ajuste mexe:
  // clonar o diagrama inteiro a cada arrastar de slider seria caro à toa.
  const nodes = diagrama.nodes.map((n) => n);
  const edges = diagrama.edges.map((e) => e);

  for (const ajuste of cenario.ajustes) {
    if (ajuste.tipo === "no") {
      const no = nosPorId.get(ajuste.id);
      if (!no) {
        ajustesSemAlvo.push(ajuste);
        continue;
      }
      const novo = aplicar(valorNumerico(no.spec?.[campoDeTempo]), ajuste);
      const extras = outrosCampos(ajuste);
      if (novo === undefined && Object.keys(extras).length === 0) continue;
      const i = nodes.findIndex((n) => n.id === ajuste.id);
      nodes[i] = {
        ...no,
        spec: {
          ...no.spec,
          ...(novo === undefined
            ? {}
            : { [campoDeTempo]: { ...no.spec?.[campoDeTempo], valor: novo, origem: "manual" } }),
          ...extras,
        },
      };
    } else {
      const aresta = arestasPorId.get(ajuste.id);
      if (!aresta) {
        ajustesSemAlvo.push(ajuste);
        continue;
      }
      const novo = aplicar(valorNumerico(aresta.spec?.[campoDeTempo]), ajuste);
      const extras = outrosCampos(ajuste);
      if (novo === undefined && Object.keys(extras).length === 0) continue;
      const i = edges.findIndex((e) => e.id === ajuste.id);
      edges[i] = {
        ...aresta,
        spec: {
          ...aresta.spec,
          ...(novo === undefined
            ? {}
            : { [campoDeTempo]: { ...aresta.spec?.[campoDeTempo], valor: novo, origem: "manual" } }),
          ...extras,
        },
      };
    }
  }

  const ensaiado = { ...diagrama, nodes, edges };
  const leitura = lerDesenho(ensaiado, config, { campoDeTempo });
  const t = leitura.tempoDoPiorTrecho;
  const base = hoje?.tempoDoPiorTrecho?.ms;

  // SPEC-68 — a insistência do trecho que responde, e o que este ensaio faz o
  // desenho passar a contradizer. É o que separa "ficou mais lento" de "agora
  // isto não pode dar certo".
  const insistencias = edges
    .filter((e) => arestaEspera(e, config) === true)
    .map((e) => insistenciaDe(e))
    .filter((i): i is NonNullable<typeof i> => i !== undefined && i.insiste);

  return {
    cenarioId: cenario.id,
    nome: cenario.nome,
    leitura,
    ms: t?.ms,
    completo: t?.completo ?? true,
    dominantes: t?.dominantes ?? [],
    delta: t?.ms !== undefined && base !== undefined ? t.ms - base : undefined,
    ajustesSemAlvo,
    contradicoes: avaliarResiliencia(ensaiado, config),
    insistenciaMs: insistencias.length > 0 ? Math.max(...insistencias.map((i) => i.ms)) : undefined,
  };
}

/**
 * SPEC-69 §3 — o prazo do negócio estourado.
 *
 * "24 s" sozinho não decide nada; "24 s contra os 5 s que o negócio pede"
 * decide. Sem `limiteMs` declarado não há confronto, e o silêncio é honesto:
 * ninguém prometeu nada.
 *
 * Com várias necessidades, vale **a mais apertada** — a mesma escolha que
 * `avaliarResiliencia` faz com a paciência de quem chama, e pelo mesmo motivo:
 * basta uma promessa curta para o prazo ser furado.
 */
export function prazoEstourado(
  ms: number | undefined,
  necessidades: { texto: string; limiteMs?: number }[] = []
): { limiteMs: number; texto: string } | undefined {
  if (ms === undefined) return undefined;
  const comPrazo = necessidades.filter((n) => typeof n.limiteMs === "number" && n.limiteMs > 0);
  if (comPrazo.length === 0) return undefined;
  const apertada = comPrazo.reduce((a, b) => (a.limiteMs! <= b.limiteMs! ? a : b));
  return ms > apertada.limiteMs! ? { limiteMs: apertada.limiteMs!, texto: apertada.texto } : undefined;
}

/**
 * SPEC-69 §4.0.1 — a conclusão escrita, para quem avalia não ter que montá-la.
 *
 * A linha entregava números crus (`≥ 24 s`, `+21 s`, `bureau (24 s)`) e pedia
 * que a pessoa cruzasse quatro colunas para chegar ao que o motor já sabia.
 *
 * Três regras:
 *
 * 1. **compara com o que o negócio pediu** quando há prazo; sem ele, compara
 *    com hoje e não inventa julgamento;
 * 2. **nomeia o dominante** — é o que transforma "está ruim" em "está ruim por
 *    causa disto";
 * 3. **é derivada, nunca escrita pela IA.** O texto do modelo é o *porquê do
 *    cenário* ("fins de semana concentram 40% das solicitações"), que é
 *    conhecimento de mundo. A conclusão sobre a conta é aritmética, e misturar
 *    as duas seria a IA opinando sobre o número.
 */
export function concluirEnsaio(
  r: ResultadoDoCenario,
  hojeMs: number | undefined,
  necessidades: { texto: string; limiteMs?: number }[] = []
): string | undefined {
  if (r.ms === undefined) return undefined;
  const dur = (n: number) => formatarDuracao(n);

  const partes: string[] = [];
  const prazo = prazoEstourado(r.ms, necessidades);
  if (prazo) {
    const vezes = r.ms / prazo.limiteMs;
    partes.push(
      `A resposta vai a ${dur(r.ms)} — ${
        vezes >= 2 ? `${vezes.toFixed(1).replace(".", ",")}× ` : ""
      }acima do prazo de ${dur(prazo.limiteMs)} que o negócio pede.`
    );
  } else if (hojeMs !== undefined && r.ms !== hojeMs) {
    partes.push(`A resposta vai de ${dur(hojeMs)} para ${dur(r.ms)}.`);
  } else {
    partes.push(`A resposta fica em ${dur(r.ms)}.`);
  }

  if (r.dominantes.length > 0) {
    const nomes = r.dominantes.map((d) => d.elemento.rotulo).join(" e ");
    partes.push(`${nomes} responde${r.dominantes.length > 1 ? "m" : ""} por ${dur(r.dominantes[0].ms)} disso.`);
  }

  if (r.contradicoes.length > 0) {
    partes.push(
      `E ${r.contradicoes.length === 1 ? "aparece uma contradição" : `aparecem ${r.contradicoes.length} contradições`} que não existe${r.contradicoes.length === 1 ? "" : "m"} hoje.`
    );
  }

  return partes.join(" ");
}

/**
 * A tabela inteira, com a âncora de hoje calculada uma vez.
 *
 * Devolve `hoje` junto porque a tela mostra a âncora como primeira linha: sem a
 * referência na mesma tabela, todo número vira solto.
 */
export function simularCenarios(
  diagrama: Diagrama,
  config: DiagramaConfig,
  cenarios: CenarioDeLentidao[],
  campoDeTempo: string = CAMPO_DE_TEMPO_PADRAO
): { hoje: LeituraDoDesenho; resultados: ResultadoDoCenario[] } {
  const hoje = lerDesenho(diagrama, config, { campoDeTempo });
  return {
    hoje,
    resultados: cenarios.map((c) => simularCenario(diagrama, config, c, hoje, campoDeTempo)),
  };
}
