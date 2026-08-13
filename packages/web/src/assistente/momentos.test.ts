import { describe, expect, it } from "vitest";
import { momentoDaConfig, momentoDaRevisao, momentoDoCanvas } from "./momentos";

describe("momentoDoCanvas (SPEC-37 F3 — M2/M3/M9 e a prioridade entre eles)", () => {
  const base = { nodes: 0, vermelhos: 0, temResultado: false, aplicouProposta: false, dispensados: [] as string[] };

  it("canvas vazio → M2; com resultado aberto, nada fala", () => {
    expect(momentoDoCanvas(base)).toBe("m2");
    expect(momentoDoCanvas({ ...base, temResultado: true })).toBeNull();
  });

  it("proposta aplicada com vermelhos → M3; tudo verde ROUBA a vez (M9 é a saída)", () => {
    expect(momentoDoCanvas({ ...base, nodes: 3, vermelhos: 2, aplicouProposta: true })).toBe("m3");
    expect(momentoDoCanvas({ ...base, nodes: 3, vermelhos: 0, aplicouProposta: true })).toBe("m9");
  });

  it("nós desenhados à mão com vermelhos (sem proposta): silêncio — M3 é da conversa", () => {
    expect(momentoDoCanvas({ ...base, nodes: 2, vermelhos: 1 })).toBeNull();
  });

  it("§184: demanda reaberta com especificação salva → M14 ganha até do M9 (o caminho é REVISITAR)", () => {
    expect(momentoDoCanvas({ ...base, nodes: 3, vermelhos: 0, temEspecificacaoSalva: true })).toBe("m14");
    // Dispensado, o M9 volta a valer — a demanda continua derivável.
    expect(momentoDoCanvas({ ...base, nodes: 3, vermelhos: 0, temEspecificacaoSalva: true, dispensados: ["m14"] })).toBe("m9");
  });

  it("dispensar silencia AQUELE momento, não os outros", () => {
    expect(momentoDoCanvas({ ...base, dispensados: ["m2"] })).toBeNull();
    expect(momentoDoCanvas({ ...base, nodes: 1, vermelhos: 0, dispensados: ["m9"] })).toBeNull();
  });
});

describe("momentoDaRevisao (M4/M5/M7)", () => {
  const base = {
    semModeloDeIa: false,
    demandInfoVazio: false,
    revisaoIntocada: true,
    tudoRefinado: false,
    esteiraRodando: false,
    conversaAberta: false,
    dispensados: [] as string[],
  };

  it("sem modelo de IA é o mais bloqueante: ganha do M5 e do M7", () => {
    expect(momentoDaRevisao({ ...base, semModeloDeIa: true, demandInfoVazio: true, tudoRefinado: true })).toBe("m4");
  });

  it("derivou sem contexto do épico → M5, mas só enquanto a revisão está intocada", () => {
    expect(momentoDaRevisao({ ...base, demandInfoVazio: true })).toBe("m5");
    // Com o trabalho começado (e nada refinado ainda), quem fala é o M12 —
    // a porta da especificação (SPEC-39), nunca mais o M5.
    expect(momentoDaRevisao({ ...base, demandInfoVazio: true, revisaoIntocada: false })).toBe("m12");
  });

  it("tudo refinado → M7 — e o M5 já não atrapalha, porque o trabalho começou", () => {
    expect(momentoDaRevisao({ ...base, demandInfoVazio: true, revisaoIntocada: false, tudoRefinado: true })).toBe("m7");
  });

  it("esteira rodando ou chat aberto silenciam qualquer balão — quem fala é o trabalho", () => {
    expect(momentoDaRevisao({ ...base, semModeloDeIa: true, esteiraRodando: true })).toBeNull();
    expect(momentoDaRevisao({ ...base, semModeloDeIa: true, conversaAberta: true })).toBeNull();
  });
});

describe("momentoDaConfig (M8)", () => {
  it("config aberta sem padrões do time → M8; com padrões (ou dispensado), silêncio", () => {
    const base = { configAberta: true, temPadroesDoTime: false, dispensados: [] as string[] };
    expect(momentoDaConfig(base)).toBe("m8");
    expect(momentoDaConfig({ ...base, temPadroesDoTime: true })).toBeNull();
    expect(momentoDaConfig({ ...base, dispensados: ["m8"] })).toBeNull();
    expect(momentoDaConfig({ ...base, configAberta: false })).toBeNull();
  });
});

describe("momentoDaConfig — M15 (SPEC-45: feedback do ciclo esperando)", () => {
  it("com feedback novo, o assistente chama pra tratar — mesmo que os padrões do time já existam", () => {
    expect(momentoDaConfig({ configAberta: true, temPadroesDoTime: true, feedbacksNovos: 3, dispensados: [] })).toBe("m15");
  });

  it("M15 tem prioridade sobre o M8: feedback parado é gente esperando resposta", () => {
    expect(momentoDaConfig({ configAberta: true, temPadroesDoTime: false, feedbacksNovos: 1, dispensados: [] })).toBe("m15");
  });

  it("sem feedback novo, nada muda no comportamento antigo", () => {
    expect(momentoDaConfig({ configAberta: true, temPadroesDoTime: false, feedbacksNovos: 0, dispensados: [] })).toBe("m8");
    expect(momentoDaConfig({ configAberta: true, temPadroesDoTime: true, feedbacksNovos: 0, dispensados: [] })).toBe(null);
  });

  it("dispensado não volta", () => {
    expect(momentoDaConfig({ configAberta: true, temPadroesDoTime: true, feedbacksNovos: 2, dispensados: ["m15"] })).toBe(null);
  });

  it("com a config fechada, o assistente não fala de configuração", () => {
    expect(momentoDaConfig({ configAberta: false, temPadroesDoTime: false, feedbacksNovos: 5, dispensados: [] })).toBe(null);
  });
});
