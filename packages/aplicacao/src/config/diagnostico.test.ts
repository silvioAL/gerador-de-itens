import { describe, expect, it } from "vitest";
import { diagnosticarConfig, resumirConfig } from "./diagnostico.js";

/**
 * SPEC-31 Fase 3 — o diagnóstico contra o caso real do JOURNEY §108.
 *
 * O `config/regras.json` que fez o Especialista técnico parecer quebrado tinha
 * zero `checklistTecnico` e doze `testes`, porque `checklistTecnico` não existia
 * na versão que o gerou. Nada nele estava corrompido — só velho.
 */
const REGRAS_DE_OUTRA_ERA = {
  porTech: {
    java: { testes: [{ texto: "unitário" }, { texto: "integração" }], volumetria: [{ texto: "TPS" }] },
    go: { testes: [{ texto: "unitário" }] },
  },
};

const REGRAS_DESTA_VERSAO = {
  porTech: {
    java: {
      checklistTecnico: [{ texto: "timeout" }, { texto: "retry" }],
      checklistProcesso: [{ texto: "code review" }],
      testes: [{ texto: "unitário" }],
      volumetria: [{ texto: "TPS" }],
    },
    go: { checklistTecnico: [{ texto: "context" }], testes: [{ texto: "unitário" }] },
  },
};

describe("diagnóstico de config desatualizada (SPEC-31 Fase 3)", () => {
  it("resume regras contando entradas por seção, somando todas as techs", () => {
    expect(resumirConfig("regras", REGRAS_DESTA_VERSAO)).toEqual({
      techs: 2,
      checklistTecnico: 3,
      checklistProcesso: 1,
      testes: 2,
      volumetria: 1,
    });
  });

  it("acusa a seção que a config de outra era não tem — o caso do §108", () => {
    const diagnostico = diagnosticarConfig("regras", REGRAS_DE_OUTRA_ERA, REGRAS_DESTA_VERSAO);

    expect(diagnostico.possivelmenteDesatualizada).toBe(true);
    expect(diagnostico.secoesVazias).toEqual([
      { secao: "checklistTecnico", noTemplate: 3 },
      { secao: "checklistProcesso", noTemplate: 1 },
    ]);
    expect(diagnostico.mensagem).toContain("checklist técnico (3 no padrão desta versão)");
    expect(diagnostico.atual.testes).toBe(3);
  });

  it("config em dia não vira alerta", () => {
    const diagnostico = diagnosticarConfig("regras", REGRAS_DESTA_VERSAO, REGRAS_DESTA_VERSAO);

    expect(diagnostico.possivelmenteDesatualizada).toBe(false);
    expect(diagnostico.mensagem).toBeNull();
  });

  /**
   * A regra que evita o alerta que ninguém lê: config menor que o template é
   * escolha de time, não defeito. Só zero-contra-não-zero acusa.
   */
  it("config ENXUTA não vira alerta — só seção inteiramente vazia acusa", () => {
    const enxuta = { porTech: { java: { checklistTecnico: [{ texto: "timeout" }], checklistProcesso: [{ texto: "cr" }], testes: [{ texto: "u" }], volumetria: [{ texto: "t" }] } } };

    const diagnostico = diagnosticarConfig("regras", enxuta, REGRAS_DESTA_VERSAO);

    expect(diagnostico.possivelmenteDesatualizada).toBe(false);
    expect(diagnostico.atual.checklistTecnico).toBeLessThan(diagnostico.template.checklistTecnico);
  });

  it("config vazia acusa todas as seções que o template preenche", () => {
    const diagnostico = diagnosticarConfig("regras", { porTech: {} }, REGRAS_DESTA_VERSAO);

    expect(diagnostico.secoesVazias.map((s) => s.secao)).toEqual([
      "techs",
      "checklistTecnico",
      "checklistProcesso",
      "testes",
      "volumetria",
    ]);
  });

  it("serve para as outras chaves: esteira sem papel ativo e prompt vazio", () => {
    const semPapeis = diagnosticarConfig("pipeline-agentes", { papeis: [] }, { papeis: [{ id: "po", ativo: true }] });
    expect(semPapeis.secoesVazias.map((s) => s.secao)).toEqual(["papeis", "papeisAtivos"]);

    const promptVazio = diagnosticarConfig("prompt-unico", { conteudo: "" }, { conteudo: "modelo de prompt" });
    expect(promptVazio.possivelmenteDesatualizada).toBe(true);
  });

  it("documento ausente ou torto não derruba o diagnóstico", () => {
    expect(() => diagnosticarConfig("regras", null, REGRAS_DESTA_VERSAO)).not.toThrow();
    expect(() => diagnosticarConfig("regras", { porTech: "não é objeto" }, REGRAS_DESTA_VERSAO)).not.toThrow();
    expect(diagnosticarConfig("regras", undefined, REGRAS_DESTA_VERSAO).possivelmenteDesatualizada).toBe(true);
  });
});
