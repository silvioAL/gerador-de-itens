import { describe, expect, it } from "vitest";
import type { No } from "../model/types.js";
import type { Condicao, RegrasConfig } from "../config/types.js";
import { avaliarCondicao } from "./condicoes.js";
import { gerarChecklistTecnico } from "../refinamento/gerarRefinamento.js";

/**
 * SPEC-87 (P5) — **o regime em que o desenho opera.**
 *
 * O passo que o §295 mediu como ausente e a SPEC-56 §7 descreveu: um perfil
 * nomeado da demanda que **muda as perguntas do checklist**. Sob "pico",
 * idempotência vira obrigatória; numa manutenção, ela não é perguntada.
 */

function no(p: Partial<No> = {}): No {
  return { id: "n1", type: "service", x: 0, y: 0, label: "srv", status: "novo", spec: {}, specNA: {}, ...p } as No;
}

const REGRAS: RegrasConfig = {
  tipos: ["História"],
  tamanhos: ["P"],
  porTech: {
    Backend: {
      checklistTecnico: [
        { texto: "Definir pontos de log", contextos: [] },
        { texto: "Definir chave de idempotência", contextos: [], when: { modo: ["pico"] } },
      ],
      checklistProcesso: [],
      testes: [],
    },
  },
};

describe("a condição de modo (SPEC-87 fatia A)", () => {
  it("bate quando o regime da demanda está na lista", () => {
    expect(avaliarCondicao({ modo: ["pico"] }, no(), [], { modo: "pico" })).toBe(true);
  });

  it("não bate em outro regime", () => {
    expect(avaliarCondicao({ modo: ["pico"] }, no(), [], { modo: "manutencao" })).toBe(false);
  });

  it("demanda SEM regime declarado não satisfaz — e é a escolha, não o acaso", () => {
    /**
     * A alternativa — "sem modo, vale tudo" — faria toda régua condicionada
     * aparecer em toda demanda antiga no dia do deploy, que é o oposto do que o
     * eixo existe para fazer.
     *
     * É a mesma escolha que `notEquals` já fazia para campo não preenchido:
     * pergunta não respondida não satisfaz.
     */
    expect(avaliarCondicao({ modo: ["pico"] }, no(), [], {})).toBe(false);
    expect(avaliarCondicao({ modo: ["pico"] }, no(), [], { modo: null })).toBe(false);
  });

  it("chamada sem contexto nenhum continua válida — nada de hoje quebra", () => {
    // O contexto é opcional inteiro: as quatro portas de `camposVisiveis` e as
    // quatro de `condicaoBate` continuam chamando como sempre chamaram.
    expect(avaliarCondicao({ nodeType: ["service"] }, no(), [])).toBe(true);
    expect(avaliarCondicao({ modo: ["pico"] }, no(), [])).toBe(false);
  });

  it("compõe com allOf/anyOf/not, e o contexto desce na recursão", () => {
    // Sem repassar o contexto na recursão, uma régua composta silenciosamente
    // deixaria de ver o modo — e o defeito só apareceria na régua mais
    // complexa, que é a que menos gente relê.
    const composta: Condicao = { allOf: [{ modo: ["pico"] }, { nodeType: ["service"] }] };

    expect(avaliarCondicao(composta, no(), [], { modo: "pico" })).toBe(true);
    expect(avaliarCondicao(composta, no(), [], { modo: "normal" })).toBe(false);
    expect(avaliarCondicao({ not: { modo: ["pico"] } }, no(), [], { modo: "normal" })).toBe(true);
  });
});

describe("o checklist muda com o regime (SPEC-87 §2)", () => {
  it("sob `pico`, a régua condicionada APARECE", () => {
    const texto = gerarChecklistTecnico(REGRAS, ["Backend"], [], [no()], [], undefined, { modo: "pico" });

    expect(texto).toContain("Definir chave de idempotência");
    expect(texto).toContain("Definir pontos de log");
  });

  it("sem regime, ela NÃO aparece — e a régua incondicional continua aparecendo", () => {
    /**
     * O valor inteiro da SPEC numa asserção: o time escreve UMA régua e ela
     * some do refinamento das demandas em que não se aplica. Sem o eixo, a
     * alternativa real é uma régua sempre visível que quase nunca vale — que é
     * como um checklist ensina a ser ignorado.
     */
    const texto = gerarChecklistTecnico(REGRAS, ["Backend"], [], [no()], []);

    expect(texto).not.toContain("Definir chave de idempotência");
    expect(texto).toContain("Definir pontos de log");
  });

  it("a saída sem regime é IDÊNTICA à de antes do eixo existir", () => {
    /**
     * A garantia que a fatia A deve: quem não usa o eixo não paga nada.
     * Comparação da string inteira, não por trecho — comparação por trecho
     * deixaria passar exatamente a mudança que isto arrisca introduzir.
     */
    const semEixo: RegrasConfig = {
      ...REGRAS,
      porTech: {
        Backend: { ...REGRAS.porTech.Backend, checklistTecnico: [{ texto: "Definir pontos de log", contextos: [] }] },
      },
    };

    expect(gerarChecklistTecnico(REGRAS, ["Backend"], [], [no()], [])).toBe(
      gerarChecklistTecnico(semEixo, ["Backend"], [], [no()], [])
    );
  });
});
