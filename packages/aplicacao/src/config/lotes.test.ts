import { describe, expect, it } from "vitest";
import {
  CARACTERES_POR_LOTE_PADRAO,
  ITENS_POR_LOTE_PADRAO,
  LOTE_PADRAO,
  fatiarEmLotes,
  pareceLoteGrandeDemais,
} from "./lotes.js";

/**
 * SPEC-120 fatias A, B e C — o lote, os dois tetos, e a recusa que é sinal.
 */
describe("fatiarEmLotes (SPEC-120 fatia A)", () => {
  const semTamanho = () => 0;

  it("trinta itens com o padrão de fábrica produzem seis chamadas", () => {
    // A prova literal da fatia A. Hoje ia tudo num POST só, e o modo de falhar
    // era o pior possível: estoura, e estoura inteiro (§0.1).
    const itens = Array.from({ length: 30 }, (_, i) => i);

    const lotes = fatiarEmLotes(itens, semTamanho, LOTE_PADRAO);

    expect(lotes).toHaveLength(6);
    expect(lotes.every((l) => l.length === 5)).toBe(true);
    // E nenhum item se perdeu nem se repetiu na emenda das chamadas.
    expect(lotes.flat()).toEqual(itens);
  });

  it("o padrão de fábrica é 5, respondendo a pergunta que a SPEC-98 §4.2 deixou aberta", () => {
    expect(ITENS_POR_LOTE_PADRAO).toBe(5);
    expect(LOTE_PADRAO.itens).toBe(5);
    expect(LOTE_PADRAO.caracteres).toBe(CARACTERES_POR_LOTE_PADRAO);
  });

  it("lista vazia não produz chamada nenhuma", () => {
    expect(fatiarEmLotes([], semTamanho, LOTE_PADRAO)).toEqual([]);
  });

  it("o último lote é o que sobrou, e não um lote cheio de nada", () => {
    const lotes = fatiarEmLotes([1, 2, 3, 4, 5, 6, 7], semTamanho, LOTE_PADRAO);

    expect(lotes.map((l) => l.length)).toEqual([5, 2]);
  });

  it("fatia B — cinco specs grandes fecham o lote ANTES dos cinco itens", () => {
    /**
     * §1.1 — cinco itens não são cinco tamanhos. O que estoura contexto é a
     * spec, e um limite só em contagem falha justamente no caso que ele existe
     * para evitar.
     */
    const grandes = Array.from({ length: 5 }, (_, i) => ({ id: i, texto: "x".repeat(400) }));

    const lotes = fatiarEmLotes(grandes, (i) => i.texto.length, { itens: 5, caracteres: 1000 });

    expect(lotes.map((l) => l.length)).toEqual([2, 2, 1]);
  });

  it("qualquer um dos dois tetos fecha o lote — o de contagem também continua valendo", () => {
    const pequenos = Array.from({ length: 6 }, (_, i) => ({ id: i, texto: "x" }));

    const lotes = fatiarEmLotes(pequenos, (i) => i.texto.length, { itens: 2, caracteres: 100_000 });

    expect(lotes.map((l) => l.length)).toEqual([2, 2, 2]);
  });

  it("item MAIOR que o teto vai sozinho e INTEIRO — meio item é truncagem com outro nome", () => {
    /**
     * A garantia que não se negocia (SPEC-98 §4.1). Cortar produziria uma spec
     * que sobe e parece completa — pior que uma chamada que falha, porque o
     * defeito viaja até o dev que for implementar.
     */
    const itens = [{ texto: "a" }, { texto: "b".repeat(5000) }, { texto: "c" }];

    const lotes = fatiarEmLotes(itens, (i) => i.texto.length, { itens: 5, caracteres: 100 });

    expect(lotes).toHaveLength(3);
    expect(lotes[1]).toEqual([{ texto: "b".repeat(5000) }]);
    // Inteiro: o conteúdo que entrou é byte a byte o que saiu.
    expect(lotes[1][0].texto).toHaveLength(5000);
  });

  it("limite zero ou negativo degrada para 1, e não para um laço infinito", () => {
    // Configuração ruim degrada para a chamada mais lenta possível. Um lote de
    // zero itens nunca consumiria a lista, e o produto travaria no envio.
    const lotes = fatiarEmLotes([1, 2, 3], () => 0, { itens: 0, caracteres: -5 });

    expect(lotes).toEqual([[1], [2], [3]]);
  });
});

describe("pareceLoteGrandeDemais (SPEC-120 fatia C)", () => {
  it("413 é o sinal limpo", () => {
    expect(pareceLoteGrandeDemais(413, "")).toBe(true);
  });

  it.each([
    "Payload Too Large",
    "This model's maximum context length is 8192 tokens",
    "erro: context_length_exceeded",
    "o corpo é muito grande para este agente",
  ])("a reclamação no corpo também é sinal: %s", (motivo) => {
    // Wrappers de MCP costumam devolver 400 ou 500 com a reclamação no corpo —
    // esperar só pelo 413 deixaria o caso comum de fora.
    expect(pareceLoteGrandeDemais(400, motivo)).toBe(true);
  });

  it("erro genérico NÃO vira redução — sem sinal de tamanho, não se adivinha", () => {
    /**
     * A régua que separa reduzir de chutar: um 500 "internal error" pode ser
     * qualquer coisa, e retentar em cima dele seria o produto insistindo numa
     * falha que não tem nada a ver com tamanho.
     */
    expect(pareceLoteGrandeDemais(500, "internal server error")).toBe(false);
    expect(pareceLoteGrandeDemais(401, "credencial inválida")).toBe(false);
    expect(pareceLoteGrandeDemais(404, "not found")).toBe(false);
  });
});
