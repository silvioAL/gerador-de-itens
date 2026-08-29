import { describe, expect, it } from "vitest";
import { contraste, contrasteArredondado, rgbDe } from "./contraste.js";

/**
 * SPEC-79 fatia C — os valores de referência são da própria WCAG, e é isso que
 * torna estes testes úteis: eles não conferem a implementação contra ela mesma,
 * conferem contra números que existem fora deste repositório.
 */
describe("a razão de contraste é aritmética, não opinião (SPEC-79 fatia C)", () => {
  it("preto no branco é 21 — o teto da escala", () => {
    expect(contrasteArredondado("#000000", "#ffffff")).toBe(21);
  });

  it("cor com ela mesma é 1 — o piso", () => {
    expect(contrasteArredondado("#4f46e5", "#4f46e5")).toBe(1);
  });

  it("é simétrica: trocar texto e fundo dá o mesmo número", () => {
    // A WCAG define a razão com a mais clara no numerador. Exigir que o time
    // acerte a ordem na regra seria transformar um detalhe da fórmula em
    // pegadinha de configuração.
    expect(contraste("#000000", "#ffffff")).toBe(contraste("#ffffff", "#000000"));
  });

  it("o indigo do produto sobre branco passa em AA (≥ 4.5) e não em AAA (≥ 7)", () => {
    // `#4f46e5` é a cor de "escrito por gente" deste produto. O número real é
    // ~7.0 para texto grande e fica na fronteira — exatamente o tipo de caso
    // que uma régua computável resolve e um olho não.
    const r = contrasteArredondado("#4f46e5", "#ffffff")!;

    expect(r).toBeGreaterThanOrEqual(4.5);
    expect(r).toBeLessThan(21);
  });

  it("aceita #rgb, #rrggbb e sem o #", () => {
    expect(contrasteArredondado("#fff", "#000")).toBe(21);
    expect(contrasteArredondado("ffffff", "000000")).toBe(21);
  });

  it("descarta o alfa de #rrggbbaa — contraste sobre transparência depende do que está ATRÁS", () => {
    /**
     * Fingir que o motor sabe o que está atrás daria um número com aparência de
     * medição. Descartar o alfa é dizer "medi as duas cores que você me deu", e
     * é honesto — a alternativa seria inventar um fundo.
     */
    expect(contrasteArredondado("#000000ff", "#ffffff")).toBe(21);
    expect(contrasteArredondado("#00000000", "#ffffff")).toBe(21);
  });

  it("o que não dá para ler como cor devolve `undefined` — a checagem se CALA", () => {
    /**
     * A mesma disciplina de `numeroDe` em `conformidade.ts`. Acusar aqui
     * produziria violação em cima de `var(--painel)`, que é cor perfeitamente
     * válida cujo valor o motor não tem — e o produto passaria a reclamar de
     * desenho certo.
     */
    expect(contraste("var(--painel)", "#ffffff")).toBeUndefined();
    expect(contraste("#ffffff", "azul")).toBeUndefined();
    expect(contraste("", "#ffffff")).toBeUndefined();
    expect(contraste("#12345", "#ffffff")).toBeUndefined();
  });

  it("rgbDe expande a forma curta", () => {
    expect(rgbDe("#fff")).toEqual([255, 255, 255]);
    expect(rgbDe("#f00")).toEqual([255, 0, 0]);
    expect(rgbDe("#4f46e5")).toEqual([79, 70, 229]);
  });

  it("e o par que a paleta padrão do produto usa em modo escuro passa", () => {
    // Controle de realidade: se a régua reprovasse o próprio produto, ela seria
    // rigorosa demais para ser adotada, e o time a desligaria no primeiro dia.
    const r = contrasteArredondado("#e5e7eb", "#0f172a")!;

    expect(r).toBeGreaterThanOrEqual(7);
  });
});
