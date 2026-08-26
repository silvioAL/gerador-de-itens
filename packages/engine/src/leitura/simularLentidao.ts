import type { DiagramaConfig } from "../config/types.js";
import type { Diagrama, ValorSpec } from "../model/types.js";
import { CAMPO_DE_TEMPO_PADRAO, lerDesenho, type ElementoDaLeitura, type LeituraDoDesenho } from "./lerDesenho.js";

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
}

export interface CenarioDeLentidao {
  id: string;
  nome: string;
  /**
   * De onde veio. `sugerido` chega **desmarcado** para alguém aceitar: inferir
   * é grátis e erra (regra 2 da SPEC-57), e proposta de modelo não é exceção.
   */
  origem: "manual" | "sugerido";
  porque?: string;
  aceito?: boolean;
  ajustes: AjusteDeCenario[];
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
      if (novo === undefined) continue;
      const i = nodes.findIndex((n) => n.id === ajuste.id);
      nodes[i] = {
        ...no,
        spec: { ...no.spec, [campoDeTempo]: { ...no.spec?.[campoDeTempo], valor: novo, origem: "manual" } },
      };
    } else {
      const aresta = arestasPorId.get(ajuste.id);
      if (!aresta) {
        ajustesSemAlvo.push(ajuste);
        continue;
      }
      const novo = aplicar(valorNumerico(aresta.spec?.[campoDeTempo]), ajuste);
      if (novo === undefined) continue;
      const i = edges.findIndex((e) => e.id === ajuste.id);
      edges[i] = {
        ...aresta,
        spec: { ...aresta.spec, [campoDeTempo]: { ...aresta.spec?.[campoDeTempo], valor: novo, origem: "manual" } },
      };
    }
  }

  const leitura = lerDesenho({ ...diagrama, nodes, edges }, config, { campoDeTempo });
  const t = leitura.tempoDoPiorTrecho;
  const base = hoje?.tempoDoPiorTrecho?.ms;

  return {
    cenarioId: cenario.id,
    nome: cenario.nome,
    leitura,
    ms: t?.ms,
    completo: t?.completo ?? true,
    dominantes: t?.dominantes ?? [],
    delta: t?.ms !== undefined && base !== undefined ? t.ms - base : undefined,
    ajustesSemAlvo,
  };
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
