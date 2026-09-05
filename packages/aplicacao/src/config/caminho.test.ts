import { describe, expect, it } from "vitest";
import { analisarCaminho, lerCaminho } from "./caminho.js";

describe("analisarCaminho (SPEC-105 §9.4 — o subconjunto declarado)", () => {
  it("aceita campo, aninhamento e índice", () => {
    expect(analisarCaminho("$")).toEqual([]);
    expect(analisarCaminho("$.dados")).toEqual(["dados"]);
    expect(analisarCaminho("$.dados.rps")).toEqual(["dados", "rps"]);
    expect(analisarCaminho("$.adrs[0].titulo")).toEqual(["adrs", 0, "titulo"]);
    expect(analisarCaminho("$[2]")).toEqual([2]);
  });

  it("tolera espaço nas pontas — colar da documentação não pode quebrar", () => {
    expect(analisarCaminho("  $.a  ")).toEqual(["a"]);
  });

  // O que fica FORA fica fora por decisão, não por preguiça: wildcard, filtro
  // e expressão são exatamente o que a pessoa não consegue depurar na tela.
  it.each(["", "a.b", "$.", "$..a", "$.a[*]", "$[?(@.x)]", "$.a[-1]", "$.a b", "dados.rps"])(
    "recusa o que não é do subconjunto: %j",
    (caminho) => {
      expect(analisarCaminho(caminho)).toBeUndefined();
    }
  );
});

describe("lerCaminho", () => {
  const resposta = { dados: { rps: 120, series: [{ pico: 340 }] }, adrs: [] };

  it("segue o caminho até o valor", () => {
    expect(lerCaminho(resposta, "$.dados.rps")).toBe(120);
    expect(lerCaminho(resposta, "$.dados.series[0].pico")).toBe(340);
    expect(lerCaminho(resposta, "$")).toBe(resposta);
    expect(lerCaminho(resposta, "$.adrs")).toEqual([]);
  });

  it("passo inexistente devolve undefined — a ausência é do chamador (§9.3)", () => {
    expect(lerCaminho(resposta, "$.dados.usuarios")).toBeUndefined();
    expect(lerCaminho(resposta, "$.dados.series[5]")).toBeUndefined();
    // Índice em quem não é lista e campo em quem não é objeto: mesma resposta.
    expect(lerCaminho(resposta, "$.dados.rps[0]")).toBeUndefined();
    expect(lerCaminho(resposta, "$.dados.series[0].pico.x")).toBeUndefined();
  });

  it("caminho fora do subconjunto devolve undefined, nunca lança", () => {
    expect(lerCaminho(resposta, "$..rps")).toBeUndefined();
  });
});
