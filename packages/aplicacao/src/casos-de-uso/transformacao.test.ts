import { describe, expect, it } from "vitest";
import { sanearCamposDaTransformacao, transformarEntradas, validarCamposDaTransformacao } from "./transformacao.js";

describe("a transformação pura (SPEC-107 fatia E — o Set do n8n)", () => {
  it("concatena pelo modelo e extrai pelo caminho, na mesma passada", () => {
    const saida = transformarEntradas(
      [
        { chave: "resumo", modelo: "RPS {rps} — pico {pico}" },
        { chave: "primeiroNo", caminho: "$.desenho.diagrama.nodes[0].label" },
      ],
      { rps: 120, pico: 340, desenho: { diagrama: { nodes: [{ label: "Aprovação" }] } } }
    );
    expect(saida).toEqual({ resumo: "RPS 120 — pico 340", primeiroNo: "Aprovação" });
  });

  it("§9.3 — placeholder sem entrada barra com o nome, nunca vira \"\"", () => {
    expect(() => transformarEntradas([{ chave: "resumo", modelo: "RPS {rps}" }], {})).toThrow(/"\{rps\}", que não chegou/);
  });

  it("§9.3 — caminho que não resolve barra com o caminho, nunca vira undefined em silêncio", () => {
    expect(() => transformarEntradas([{ chave: "x", caminho: "$.nada.aqui" }], { outra: 1 })).toThrow(/\$\.nada\.aqui/);
  });

  it("valor não-textual entra no modelo como JSON — dado estruturado não vira [object Object]", () => {
    const saida = transformarEntradas([{ chave: "corpo", modelo: "itens: {itens}" }], { itens: [{ chave: "a" }] });
    expect(saida.corpo).toBe('itens: [{"chave":"a"}]');
  });

  it("a escrita recusa campo pela metade e transformação vazia, com o nome (SPEC-35)", () => {
    expect(validarCamposDaTransformacao([], "t1")).toContain("não declara nenhum campo");
    expect(validarCamposDaTransformacao([{ chave: "x" }], "t1")).toContain('"modelo" (concatenar) ou um "caminho"');
    expect(validarCamposDaTransformacao([{ chave: "x", caminho: "$[*]" }], "t1")).toContain("fora do subconjunto");
    expect(validarCamposDaTransformacao([{ chave: "x", modelo: "" }], "t1")).toBeNull();
  });

  it("sanear descarta chave vazia e repetida — a segunda leria por cima da primeira", () => {
    expect(
      sanearCamposDaTransformacao([{ chave: "a", modelo: "1" }, { chave: "a", modelo: "2" }, { chave: " " }, "lixo"])
    ).toEqual([{ chave: "a", modelo: "1" }]);
  });
});
