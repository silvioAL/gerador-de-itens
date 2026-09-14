import { describe, expect, it } from "vitest";
import { EXECUCOES_DO_TOUR } from "./dadosDoTour";

/**
 * SPEC-92 — **o tour não pode mostrar a credencial de quem está demonstrando
 * falhando.**
 *
 * O achado veio do usuário, com print: os quatro papéis em vermelho, cada um com
 * *"Your credit balance is too low to access the Anthropic API"*. Ele estava sem
 * crédito, e a ferramenta relatava isso com precisão — no meio de uma
 * demonstração, onde quem assiste conclui que o produto está quebrado.
 */
describe("as execuções do tour (SPEC-92)", () => {
  it("todas passam — a demonstração não mostra a casa de ninguém quebrada", () => {
    expect(EXECUCOES_DO_TOUR.every((e) => e.ok)).toBe(true);
  });

  it("nenhuma carrega erro — nem mesmo um inventado", () => {
    /**
     * Um erro de mentira ensinaria a ler o vermelho como parte da demonstração,
     * que é o oposto do que a marca de estado existe para fazer no resto do
     * produto.
     */
    expect(EXECUCOES_DO_TOUR.some((e) => "erro" in e)).toBe(false);
  });

  it("cobre os quatro papéis da esteira padrão, sem sobra", () => {
    // Um papel de fora apareceria no mapa sem lugar, e um faltando deixaria a
    // demonstração com um avatar mudo no meio da fila.
    expect(EXECUCOES_DO_TOUR.map((e) => e.papel)).toEqual(["po", "arquiteto", "especialista", "qa"]);
  });

  it("as durações são diferentes — quatro números iguais parecem inventados", () => {
    const duracoes = EXECUCOES_DO_TOUR.map((e) => e.duracaoMs);

    expect(new Set(duracoes).size).toBe(duracoes.length);
  });

  it("a data é FIXA — dado de tour não pode depender do relógio", () => {
    // "há 3 segundos" numa demonstração gravada em outro dia seria mentira
    // sobre quando aquilo aconteceu; uma data fixa é obviamente exemplo.
    for (const e of EXECUCOES_DO_TOUR) {
      expect(e.em).toMatch(/^2026-01-01T/);
    }
  });
});
