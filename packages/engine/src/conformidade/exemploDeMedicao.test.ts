import { describe, expect, it } from "vitest";
import type { RegrasConfig } from "../config/types.js";
import { exemploDeMedicao, valorQueEstoura } from "./exemploDeMedicao.js";

function regras(checklistTecnico: RegrasConfig["porTech"][string]["checklistTecnico"]): RegrasConfig {
  return { tipos: [], tamanhos: [], porTech: { Backend: { checklistTecnico, testes: [] } }, percursos: [] };
}

describe("exemploDeMedicao — a cadeia do motor com um caso do PRÓPRIO time (§268)", () => {
  it("escolhe o primeiro requisito CONFERÍVEL, com a régua e o porquê", () => {
    const exemplo = exemploDeMedicao(
      regras([
        { texto: "documentar o endpoint", contextos: [] },
        {
          texto: "timeout curto em chamada http",
          contextos: ["Backend-chamadas http"],
          porque: "veio do incidente de cobrança dupla",
          checagem: { campo: "timeoutMs", operador: "lte", valor: 500, unidade: "ms" },
        },
      ])
    );

    expect(exemplo).toMatchObject({
      tech: "Backend",
      texto: "timeout curto em chamada http",
      porque: "veio do incidente de cobrança dupla",
      checagem: { campo: "timeoutMs", valor: 500 },
    });
  });

  it("sem nenhuma régua conferível devolve nada — a tela dirá isso em vez de inventar", () => {
    // Inventar um exemplo ensinaria uma régua que este time não tem, e a
    // explicação de "como o motor mede" viraria ficção.
    expect(exemploDeMedicao(regras([{ texto: "só texto", contextos: [] }]))).toBeUndefined();
    expect(exemploDeMedicao(undefined)).toBeUndefined();
  });

  it("aceita `preenchido` — é a régua mais simples de explicar, e a primeira que se entende", () => {
    // Exigir um literal deixava de fora exatamente a cadeia mais didática:
    // "este campo tem que estar preenchido; está em branco; sai um item".
    const exemplo = exemploDeMedicao(
      regras([{ texto: "declarar a chave de sharding", contextos: [], checagem: { campo: "chaveDeSharding", operador: "preenchido" } }])
    );

    expect(exemplo?.checagem.operador).toBe("preenchido");
    expect(valorQueEstoura({ campo: "x", operador: "preenchido" })).toBeUndefined();
  });

  it("pula a checagem entre dois campos — é a régua pior de explicar primeiro", () => {
    // `valorDe` (§241) compara dois campos do mesmo nó: interessante demais
    // para ser o primeiro exemplo de alguém que ainda não entendeu a cadeia.
    const exemplo = exemploDeMedicao(
      regras([
        { texto: "ttl cobre as tentativas", contextos: [], checagem: { campo: "ttl", operador: "gte", valorDe: "retries" } },
        { texto: "timeout curto", contextos: [], checagem: { campo: "timeoutMs", operador: "lte", valor: 500 } },
      ])
    );

    expect(exemplo?.texto).toBe("timeout curto");
  });
});

describe("valorQueEstoura — o valor que faz a conta não fechar", () => {
  it("depende do operador: acima para lte, abaixo para gte", () => {
    // Errar isto mostraria uma conta que não fecha no meio da explicação de
    // como as contas fecham.
    expect(valorQueEstoura({ campo: "t", operador: "lte", valor: 500 })).toBe(1000);
    expect(valorQueEstoura({ campo: "r", operador: "gte", valor: 4 })).toBe(2);
  });

  it("booleano vira o oposto", () => {
    expect(valorQueEstoura({ campo: "dlq", operador: "eq", valor: true })).toBe(false);
  });
});
