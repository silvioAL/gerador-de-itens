/**
 * SPEC-94 fatia Z (§343) — **as métricas do ciclo de baixo.**
 *
 * ## Por que esta fatia vem primeiro
 *
 * O usuário: *"quando falo de PDCA, precisamos pensar mais alto nível: as
 * melhorias, e o set de métricas — o da configuração faz parte, precisamos de
 * métricas dele."*
 *
 * A SPEC-94 §3 mediu que o ciclo de melhoria do produto é `sentir → texto →
 * aprovar → aplicar`, com gatilho de uso individual: **Plan, Do e Act, sem a
 * etapa de análise**. Uma análise crítica precisa de entradas, e das três que a
 * §4.4 lista, esta é a única **calculável hoje, sem canal externo nenhum** — o
 * dado já está em `solicitacoes_ajuste` e `pdca_feedback`.
 *
 * ## O que estas métricas fazem que a contagem não faz
 *
 * O produto já sabe contar usos. Contar uso mede que alguém usou; **estas medem
 * se o ciclo está andando** — e uma delas mede contra nós (ver `sinalQueMorre`).
 *
 * ## Funções puras, e o relógio entra por parâmetro
 *
 * O engine não vai à rede, não lê disco e não guarda estado — e `Date.now()`
 * escondido dentro de um cálculo é estado igual: faz o mesmo dado produzir
 * números diferentes conforme o dia, e um teste que precisa disso vira teste com
 * mock de relógio. `agora` é argumento, e por isso a suíte prova a régua com uma
 * data fixa.
 */

/** O mínimo que este módulo precisa de uma solicitação. Deliberadamente menor
 *  que a linha do banco: o engine não conhece o schema do servidor. */
export interface SolicitacaoParaMetrica {
  recurso: string;
  /** `pendente | aprovada | rejeitada | invalida | aplicada`. */
  estado: string;
  criadoEm: Date;
  decididoEm?: Date | null;
  motivoDaDecisao?: string | null;
}

export interface FeedbackParaMetrica {
  /** `novo | virou-ajuste | descartado`. */
  estado: string;
  criadoEm: Date;
}

export interface ContagemDeRecurso {
  recurso: string;
  total: number;
}

export interface MetricasDoCiclo {
  /** Quantas solicitações entraram, no período todo que se está olhando. */
  solicitacoes: number;
  porEstado: Record<string, number>;
  /**
   * Mediana de `decididoEm − criadoEm`, em horas, entre as decididas.
   * `null` quando ninguém decidiu nada — e `null` é diferente de zero.
   */
  horasAteDecisaoMediana: number | null;
  /** Quantas esperam decisão, e há quanto tempo espera a mais velha. */
  pendentes: number;
  diasDaEsperaMaisVelha: number | null;
  /**
   * `invalida ÷ decididas`. É o sinal mais interessante do conjunto: quando
   * sobe, **a configuração está mudando mais rápido do que se decide** — e o
   * problema não é o solicitante, é o intervalo entre pedido e decisão.
   */
  taxaDeInvalidacao: number | null;
  /**
   * Recusa sem o porquê escrito. A SPEC-62 deixou o campo opcional de
   * propósito (exigir texto para dizer "não" produz gente escrevendo "não" no
   * campo), então isto **não é violação — é assunto para a análise**.
   */
  rejeitadasSemMotivo: number;
  /**
   * Os recursos que mais geram pedido, do maior para o menor.
   *
   * **É a promessa dos cinco times, computável.** O `CONCEITO.md` afirma que
   * *"se cinco times violam o mesmo padrão, o padrão está errado, não os
   * times"* — e a SPEC-94 §2.3 mediu que não existia código que computasse
   * isso. Esta lista é a primeira metade dele: a regra que mais gera pedido de
   * ajuste é a regra que menos serve como está.
   */
  concentracaoPorRecurso: ContagemDeRecurso[];
  feedback: {
    total: number;
    porEstado: Record<string, number>;
    /** `virou-ajuste ÷ total`. Quanto do que se coleta vira alguma coisa. */
    conversaoEmAjuste: number | null;
    /**
     * **A métrica que vale contra nós.**
     *
     * O produto interrompe a pessoa a cada N gerações para perguntar *"o que
     * faltou ou sobrou?"*. Se o que ela responde fica em `novo` para sempre,
     * estamos gastando a atenção de quem trabalha para alimentar um arquivo —
     * e a régua desta casa é que medida que ninguém contesta vira ruído.
     *
     * Quando este número for alto, há duas saídas honestas: **passar a
     * responder, ou parar de perguntar.** Deixar como está não é uma delas.
     */
    sinalQueMorre: number;
  };
}

/** Acima disto, um feedback em `novo` deixou de estar "esperando" e passou a
 *  estar esquecido. 30 dias é escolha, não medição — e é o tipo de número que a
 *  primeira análise crítica de verdade vai querer discutir. */
export const DIAS_PARA_SINAL_MORRER = 30;

const HORA = 3600_000;
const DIA = 24 * HORA;

export function metricasDoCiclo(
  solicitacoes: SolicitacaoParaMetrica[],
  feedbacks: FeedbackParaMetrica[],
  agora: Date,
  diasParaMorrer = DIAS_PARA_SINAL_MORRER,
): MetricasDoCiclo {
  const porEstado = contarPor(solicitacoes, (s) => s.estado);

  /**
   * "Decidida" é todo estado que saiu de `pendente` — inclusive `aplicada`, que
   * é o passo DEPOIS de aprovada, e inclusive `invalida`, que é uma decisão do
   * sistema. Contar só `aprovada`/`rejeitada` faria a taxa de invalidação
   * crescer sozinha conforme os pedidos fossem aplicados.
   */
  const decididas = solicitacoes.filter((s) => s.estado !== "pendente");

  const horas = solicitacoes
    .filter((s) => s.decididoEm)
    .map((s) => (s.decididoEm!.getTime() - s.criadoEm.getTime()) / HORA)
    .filter((h) => Number.isFinite(h) && h >= 0);

  const pendentes = solicitacoes.filter((s) => s.estado === "pendente");
  const maisVelha = pendentes.reduce<number | null>((pior, s) => {
    const dias = (agora.getTime() - s.criadoEm.getTime()) / DIA;
    return pior === null || dias > pior ? dias : pior;
  }, null);

  const feedbackPorEstado = contarPor(feedbacks, (f) => f.estado);
  const novos = feedbacks.filter((f) => f.estado === "novo");

  return {
    solicitacoes: solicitacoes.length,
    porEstado,
    horasAteDecisaoMediana: mediana(horas),
    pendentes: pendentes.length,
    diasDaEsperaMaisVelha: maisVelha === null ? null : Math.floor(maisVelha),
    // `null` e não `0` quando nada foi decidido: zero por cento de invalidação
    // é uma afirmação sobre um conjunto vazio, e a tela precisa poder dizer
    // "ainda não há o que medir" em vez de "está tudo ótimo".
    taxaDeInvalidacao: decididas.length === 0 ? null : (porEstado.invalida ?? 0) / decididas.length,
    rejeitadasSemMotivo: solicitacoes.filter((s) => s.estado === "rejeitada" && !s.motivoDaDecisao?.trim()).length,
    concentracaoPorRecurso: Object.entries(contarPor(solicitacoes, (s) => s.recurso))
      .map(([recurso, total]) => ({ recurso, total }))
      // Empate desempata por nome: sem isso a ordem varia entre execuções com o
      // mesmo dado, e uma tela que troca de ordem sozinha parece com defeito.
      .sort((a, b) => b.total - a.total || a.recurso.localeCompare(b.recurso)),
    feedback: {
      total: feedbacks.length,
      porEstado: feedbackPorEstado,
      conversaoEmAjuste: feedbacks.length === 0 ? null : (feedbackPorEstado["virou-ajuste"] ?? 0) / feedbacks.length,
      sinalQueMorre: novos.filter((f) => (agora.getTime() - f.criadoEm.getTime()) / DIA > diasParaMorrer).length,
    },
  };
}

function contarPor<T>(itens: T[], chave: (item: T) => string): Record<string, number> {
  const conta: Record<string, number> = {};
  for (const item of itens) {
    const k = chave(item);
    conta[k] = (conta[k] ?? 0) + 1;
  }
  return conta;
}

/**
 * Mediana, e não média.
 *
 * Uma solicitação esquecida por seis meses puxa a média para um número que não
 * descreve nenhum pedido real. A mediana responde *"quanto costuma demorar"*,
 * que é a pergunta que a análise crítica faz — e a espera extrema tem métrica
 * própria (`diasDaEsperaMaisVelha`), em vez de contaminar esta.
 */
function mediana(valores: number[]): number | null {
  if (valores.length === 0) return null;
  const ordenados = [...valores].sort((a, b) => a - b);
  const meio = Math.floor(ordenados.length / 2);
  const bruta = ordenados.length % 2 === 0 ? (ordenados[meio - 1] + ordenados[meio]) / 2 : ordenados[meio];
  // Uma casa decimal: "1,5 h" é informação; "1,4732 h" é ruído com aparência de
  // precisão, e o dado de origem tem granularidade de segundo.
  return Math.round(bruta * 10) / 10;
}
