import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Delta } from "./Delta";

/**
 * §263 — o que a caixa do delta garante, independente de quem a usa.
 */
describe("Delta", () => {
  it("mostra cada linha como de → para", () => {
    render(<Delta titulo="Se aceitar" remedicao={{ linhas: [{ rotulo: "lacunas", antes: 0, depois: 2 }] }} />);

    expect(screen.getByTestId("delta").textContent).toContain("lacunas 0 → 2");
  });

  it("sem linha nenhuma não renderiza caixa vazia", () => {
    // Uma caixa vazia dizendo "se aceitar" e nada dentro é pior que ausência:
    // sugere que a medição rodou e não achou nada a dizer.
    const { container } = render(<Delta titulo="Se aceitar" remedicao={{ linhas: [] }} />);

    expect(container.firstChild).toBeNull();
  });

  it("o alerta só aparece quando o motor manda um", () => {
    const semAlerta = render(<Delta titulo="x" remedicao={{ linhas: [{ rotulo: "a", antes: 1, depois: 0 }] }} />);
    expect(semAlerta.queryByTestId("delta-alerta")).toBeNull();

    semAlerta.unmount();
    render(<Delta titulo="x" remedicao={{ linhas: [{ rotulo: "a", antes: 0, depois: 1 }], alerta: "cria trabalho" }} />);
    expect(screen.getByTestId("delta-alerta").textContent).toBe("cria trabalho");
  });

  it("o botão que executa a ação vive dentro da caixa", () => {
    // Ler o efeito num canto e agir noutro é o que separa "reconhecer" de
    // "clicar sem ler".
    render(
      <Delta titulo="x" remedicao={{ linhas: [{ rotulo: "a", antes: 0, depois: 1 }] }}>
        <button>Confirmar</button>
      </Delta>
    );

    expect(screen.getByTestId("delta").querySelector("button")?.textContent).toBe("Confirmar");
  });
});
