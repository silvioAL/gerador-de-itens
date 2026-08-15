import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { CursorFantasma } from "./CursorFantasma";

function rect(p: Partial<DOMRect>): DOMRect {
  return { top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0, toJSON: () => ({}), ...p } as DOMRect;
}

/**
 * §254 — o ponteiro do tour. O que estes testes guardam é o que o separa de
 * teatro: ele aponta para onde a ação ACONTECEU, e não aparece quando não há
 * para onde apontar.
 */
describe("CursorFantasma", () => {
  it("passo sem alvo não desenha ponteiro — apontar para o nada é pior", () => {
    render(<CursorFantasma alvo={null} passo={0} />);

    expect(screen.queryByTestId("cursor-fantasma")).toBeNull();
  });

  it("pousa dentro do alvo, não no canto exato", () => {
    // O canto exato cobriria justamente a borda que o anel de destaque marca.
    render(<CursorFantasma alvo={rect({ left: 100, top: 200, width: 300, height: 40 })} passo={0} />);

    const estilo = screen.getByTestId("cursor-fantasma").getAttribute("style") ?? "";
    expect(estilo).toContain("translate(128px, 220px)");
  });

  it("alvo pequeno não faz o ponteiro sair dele", () => {
    // O deslocamento é proporcional: num alvo de 20px, 28px de folga jogaria o
    // ponteiro para fora do que ele deveria estar apontando.
    render(<CursorFantasma alvo={rect({ left: 0, top: 0, width: 20, height: 20 })} passo={0} />);

    const estilo = screen.getByTestId("cursor-fantasma").getAttribute("style") ?? "";
    expect(estilo).toContain("translate(6px, 10px)");
  });

  it("o pulso reinicia a cada passo — é o que marca que algo aconteceu", () => {
    const alvo = rect({ left: 10, top: 10, width: 100, height: 30 });
    const { rerender } = render(<CursorFantasma alvo={alvo} passo={3} />);
    const primeiro = screen.getByTestId("cursor-pulso");

    rerender(<CursorFantasma alvo={alvo} passo={4} />);

    // Elemento novo (a `key` mudou), e não o mesmo com a animação já gasta.
    expect(screen.getByTestId("cursor-pulso")).not.toBe(primeiro);
  });

  it("não intercepta clique — é enfeite, não obstáculo", () => {
    render(<CursorFantasma alvo={rect({ left: 10, top: 10, width: 100, height: 30 })} passo={0} />);

    expect(screen.getByTestId("cursor-fantasma").getAttribute("style")).toContain("pointer-events: none");
  });
});
