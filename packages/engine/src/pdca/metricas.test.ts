import { describe, expect, it } from "vitest";
import {
  DIAS_PARA_SINAL_MORRER,
  metricasDoCiclo,
  type FeedbackParaMetrica,
  type SolicitacaoParaMetrica,
} from "./metricas.js";

/**
 * SPEC-94 fatia Z — as métricas do ciclo de configuração.
 *
 * A data é FIXA nesta suíte, e isso é o ponto: `agora` é parâmetro da função,
 * então nenhum caso aqui precisa de mock de relógio nem passa a falhar sozinho
 * daqui a um mês. Foi por isso que o cálculo não usa `Date.now()`.
 */

const AGORA = new Date("2026-03-01T12:00:00Z");
const dias = (n: number) => new Date(AGORA.getTime() - n * 24 * 3600_000);

function pedido(p: Partial<SolicitacaoParaMetrica> = {}): SolicitacaoParaMetrica {
  return { recurso: "regras", estado: "pendente", criadoEm: dias(1), ...p };
}
function feedback(f: Partial<FeedbackParaMetrica> = {}): FeedbackParaMetrica {
  return { estado: "novo", criadoEm: dias(1), ...f };
}

describe("o ciclo de configuração, medido (SPEC-94 fatia Z)", () => {
  it("com nada gravado, devolve nulos — e não zeros", () => {
    /**
     * A diferença importa na tela: `0%` de invalidação é uma afirmação sobre um
     * conjunto vazio, e ela lê como "está tudo ótimo". `null` deixa a tela dizer
     * **"ainda não há o que medir"**, que é a verdade — e é a mesma disciplina
     * que o produto aplica a lacuna contável.
     */
    const m = metricasDoCiclo([], [], AGORA);

    expect(m.solicitacoes).toBe(0);
    expect(m.horasAteDecisaoMediana).toBeNull();
    expect(m.taxaDeInvalidacao).toBeNull();
    expect(m.diasDaEsperaMaisVelha).toBeNull();
    expect(m.feedback.conversaoEmAjuste).toBeNull();
  });

  it("mede quanto tempo o pedido espera até a decisão, pela MEDIANA", () => {
    /**
     * Um pedido esquecido por meses puxa a MÉDIA para um número que não
     * descreve nenhum caso real. Aqui: três decisões rápidas e uma de 100 dias.
     * A média daria ~600h; a mediana diz o que costuma acontecer.
     */
    const m = metricasDoCiclo(
      [
        pedido({ estado: "aprovada", criadoEm: dias(10), decididoEm: dias(9) }), // 24h
        pedido({ estado: "aprovada", criadoEm: dias(10), decididoEm: dias(8) }), // 48h
        pedido({ estado: "rejeitada", criadoEm: dias(10), decididoEm: dias(7), motivoDaDecisao: "não cabe" }), // 72h
        pedido({ estado: "aplicada", criadoEm: dias(110), decididoEm: dias(10) }), // 2400h
      ],
      [],
      AGORA,
    );

    expect(m.horasAteDecisaoMediana).toBe(60); // (48 + 72) / 2
  });

  it("a espera mais velha tem métrica PRÓPRIA, para não contaminar a mediana", () => {
    const m = metricasDoCiclo([pedido({ criadoEm: dias(45) }), pedido({ criadoEm: dias(3) })], [], AGORA);

    expect(m.pendentes).toBe(2);
    expect(m.diasDaEsperaMaisVelha).toBe(45);
  });

  it("a taxa de invalidação conta sobre TODAS as decididas, inclusive as aplicadas", () => {
    /**
     * Se o denominador fosse só `aprovada`+`rejeitada`, a taxa **cresceria
     * sozinha** conforme os pedidos aprovados fossem aplicados — o número
     * pioraria sem nada piorar, que é o pior defeito que uma métrica pode ter.
     */
    const m = metricasDoCiclo(
      [
        pedido({ estado: "invalida", decididoEm: dias(1) }),
        pedido({ estado: "aprovada", decididoEm: dias(1) }),
        pedido({ estado: "aplicada", decididoEm: dias(1) }),
        pedido({ estado: "rejeitada", decididoEm: dias(1), motivoDaDecisao: "x" }),
        pedido({ estado: "pendente" }),
      ],
      [],
      AGORA,
    );

    expect(m.taxaDeInvalidacao).toBeCloseTo(0.25); // 1 de 4 decididas — a pendente fica fora
  });

  it("aponta o recurso que mais gera pedido — a regra que menos serve como está", () => {
    /**
     * É a primeira metade da promessa dos cinco times do `CONCEITO.md`, que a
     * SPEC-94 §2.3 mediu como ganho sem mecanismo.
     */
    const m = metricasDoCiclo(
      [
        pedido({ recurso: "regras" }),
        pedido({ recurso: "regras" }),
        pedido({ recurso: "regras" }),
        pedido({ recurso: "campos-no" }),
        pedido({ recurso: "pipeline-agentes" }),
      ],
      [],
      AGORA,
    );

    expect(m.concentracaoPorRecurso[0]).toEqual({ recurso: "regras", total: 3 });
    // Empate desempata por nome: sem isso a ordem varia entre execuções com o
    // mesmo dado, e uma tela que troca de ordem sozinha parece com defeito.
    expect(m.concentracaoPorRecurso.slice(1)).toEqual([
      { recurso: "campos-no", total: 1 },
      { recurso: "pipeline-agentes", total: 1 },
    ]);
  });

  it("conta recusa sem o porquê escrito — assunto para a análise, não violação", () => {
    // A SPEC-62 deixou o motivo opcional de propósito: exigir texto para dizer
    // "não" produz gente escrevendo "não" no campo.
    const m = metricasDoCiclo(
      [
        pedido({ estado: "rejeitada", decididoEm: dias(1) }),
        pedido({ estado: "rejeitada", decididoEm: dias(1), motivoDaDecisao: "   " }),
        pedido({ estado: "rejeitada", decididoEm: dias(1), motivoDaDecisao: "duplicado do #12" }),
      ],
      [],
      AGORA,
    );

    expect(m.rejeitadasSemMotivo).toBe(2);
  });

  it("**a métrica que vale contra nós**: o sinal coletado que ninguém leu", () => {
    /**
     * O produto interrompe a pessoa a cada N gerações para perguntar "o que
     * faltou ou sobrou?". Se a resposta fica em `novo` para sempre, estamos
     * gastando a atenção de quem trabalha para alimentar um arquivo.
     *
     * O que foi **descartado** não conta: descartar é decidir, e está registrado
     * (SPEC-45). O que conta é o que ninguém sequer olhou.
     */
    const m = metricasDoCiclo(
      [],
      [
        feedback({ estado: "novo", criadoEm: dias(DIAS_PARA_SINAL_MORRER + 5) }),
        feedback({ estado: "novo", criadoEm: dias(DIAS_PARA_SINAL_MORRER + 1) }),
        feedback({ estado: "novo", criadoEm: dias(2) }),
        feedback({ estado: "descartado", criadoEm: dias(300) }),
        feedback({ estado: "virou-ajuste", criadoEm: dias(300) }),
      ],
      AGORA,
    );

    expect(m.feedback.sinalQueMorre).toBe(2);
    expect(m.feedback.conversaoEmAjuste).toBeCloseTo(0.2);
    expect(m.feedback.porEstado).toEqual({ novo: 3, descartado: 1, "virou-ajuste": 1 });
  });

  it("o limiar do sinal que morre é parâmetro — é escolha, e escolha se discute", () => {
    const feedbacks = [feedback({ criadoEm: dias(10) }), feedback({ criadoEm: dias(40) })];

    expect(metricasDoCiclo([], feedbacks, AGORA, 30).feedback.sinalQueMorre).toBe(1);
    expect(metricasDoCiclo([], feedbacks, AGORA, 5).feedback.sinalQueMorre).toBe(2);
    expect(metricasDoCiclo([], feedbacks, AGORA, 90).feedback.sinalQueMorre).toBe(0);
  });

  it("não inventa número com data no futuro", () => {
    // Relógio de servidor pode andar para trás, e uma duração negativa viraria
    // uma mediana sem sentido. Descartar é melhor que exibir "-3h".
    const m = metricasDoCiclo(
      [pedido({ estado: "aprovada", criadoEm: dias(1), decididoEm: dias(3) })],
      [],
      AGORA,
    );

    expect(m.horasAteDecisaoMediana).toBeNull();
  });
});
