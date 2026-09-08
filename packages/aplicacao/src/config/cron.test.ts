import { describe, expect, it } from "vitest";
import { analisarCron, problemaNoCron, proximaOcorrencia, proximaOcorrenciaLegivel } from "./cron.js";

/**
 * SPEC-110 fatia E (D7) — **o relógio, travado por prova de próxima
 * ocorrência.** A SPEC mandou: "decidir na implementação e travar com testes
 * de próxima-ocorrência". É o único jeito de saber que um parser de cron está
 * certo — a expressão sozinha não diz nada; o instante que ela produz, sim.
 *
 * Tudo em UTC, sempre — um default silencioso (o fuso do servidor) faria "todo
 * dia às 9h" significar coisas diferentes conforme a máquina.
 */

const em = (iso: string) => new Date(iso);
const proxima = (expr: string, iso: string) => proximaOcorrencia(expr, em(iso))?.toISOString() ?? null;

describe("problemaNoCron", () => {
  it("aceita o que a notação promete: *, número, lista, intervalo e passo", () => {
    for (const expr of ["* * * * *", "0 9 * * 1-5", "*/15 * * * *", "0 0 1,15 * *", "30 8-18/2 * * *"]) {
      expect(problemaNoCron(expr), expr).toBeNull();
    }
  });

  it("recusa NOMEANDO o campo — quem escreve no painel precisa saber onde errou", () => {
    expect(problemaNoCron("")).toMatch(/vazia/);
    expect(problemaNoCron("* * * *")).toMatch(/5 campos/);
    expect(problemaNoCron("60 * * * *")).toMatch(/minuto/);
    expect(problemaNoCron("* 24 * * *")).toMatch(/hora/);
    expect(problemaNoCron("* * 0 * *")).toMatch(/dia do mês/);
    expect(problemaNoCron("* * * 13 *")).toMatch(/mês/);
    expect(problemaNoCron("* * * * 7")).toMatch(/dia da semana/);
    expect(problemaNoCron("abc * * * *")).toMatch(/não é um número/);
    expect(problemaNoCron("*/0 * * * *")).toMatch(/passo/);
    // Intervalo invertido é engano comum, e vira erro em vez de silêncio.
    expect(problemaNoCron("* 18-8 * * *")).toMatch(/fora da faixa/);
  });

  it("os atalhos que NÃO existem são recusados, não interpretados", () => {
    // Prometer `@daily` e não implementar seria pior que não oferecer.
    expect(problemaNoCron("@daily")).toMatch(/5 campos/);
    expect(problemaNoCron("0 9 * * MON")).toMatch(/não é um número/);
  });
});

describe("analisarCron", () => {
  it("`*/15` expande de 15 em 15, e a lista soma sem repetir", () => {
    expect([...analisarCron("*/15 * * * *")!.minutos]).toEqual([0, 15, 30, 45]);
    expect([...analisarCron("0,30,0 * * * *")!.minutos]).toEqual([0, 30]);
  });

  it("o intervalo com passo anda de N em N dentro dele", () => {
    expect([...analisarCron("0 8-18/2 * * *")!.horas]).toEqual([8, 10, 12, 14, 16, 18]);
  });
});

describe("proximaOcorrencia (a prova que vale)", () => {
  it("nunca devolve AGORA — um tick no minuto exato re-dispararia o mesmo", () => {
    // 09:00 em ponto, com expressão "todo dia 09:00": a próxima é amanhã.
    expect(proxima("0 9 * * *", "2026-03-10T09:00:00.000Z")).toBe("2026-03-11T09:00:00.000Z");
    // Um segundo depois das 09:00, idem — segundos não contam.
    expect(proxima("0 9 * * *", "2026-03-10T09:00:59.000Z")).toBe("2026-03-11T09:00:00.000Z");
  });

  it("no mesmo dia quando ainda cabe", () => {
    expect(proxima("0 9 * * *", "2026-03-10T08:59:00.000Z")).toBe("2026-03-10T09:00:00.000Z");
    expect(proxima("*/15 * * * *", "2026-03-10T08:01:00.000Z")).toBe("2026-03-10T08:15:00.000Z");
  });

  it("dias úteis pulam o fim de semana", () => {
    // 2026-03-13 é sexta; a próxima de "seg-sex 09:00" é segunda 16.
    expect(proxima("0 9 * * 1-5", "2026-03-13T10:00:00.000Z")).toBe("2026-03-16T09:00:00.000Z");
  });

  it("atravessa a virada do mês e do ano", () => {
    expect(proxima("0 0 1 * *", "2026-03-31T23:59:00.000Z")).toBe("2026-04-01T00:00:00.000Z");
    expect(proxima("0 0 1 1 *", "2026-12-31T12:00:00.000Z")).toBe("2027-01-01T00:00:00.000Z");
  });

  /**
   * Fevereiro é onde os parsers de cron guardam os bugs — por isso a varredura
   * é minuto a minuto, e por isso este caso é prova e não comentário.
   */
  it("29 de fevereiro só acontece em ano bissexto", () => {
    // De 2026 (não bissexto), o próximo 29/02 é em 2028.
    expect(proxima("0 0 29 2 *", "2026-03-01T00:00:00.000Z")).toBe("2028-02-29T00:00:00.000Z");
  });

  it("expressão impossível devolve null em vez de girar para sempre", () => {
    // 31 de fevereiro não existe — e o teto da varredura é o que garante que
    // isto RESPONDE, em vez de travar o tick do servidor.
    expect(proxima("0 0 31 2 *", "2026-01-01T00:00:00.000Z")).toBeNull();
  });

  it("expressão inválida não produz ocorrência nenhuma", () => {
    expect(proxima("nao é cron", "2026-01-01T00:00:00.000Z")).toBeNull();
  });
});

describe("proximaOcorrenciaLegivel (o painel diz o que vai acontecer)", () => {
  it("mostra a data em UTC, porque é nele que o runner pensa", () => {
    expect(proximaOcorrenciaLegivel("0 9 * * *", em("2026-03-10T08:00:00.000Z"))).toBe("2026-03-10 09:00 UTC");
  });

  it("erro de digitação vira a frase do problema, não uma data falsa", () => {
    expect(proximaOcorrenciaLegivel("60 * * * *", em("2026-03-10T08:00:00.000Z"))).toMatch(/minuto/);
    expect(proximaOcorrenciaLegivel("0 0 31 2 *", em("2026-03-10T08:00:00.000Z"))).toMatch(/nunca acontece/);
  });
});
