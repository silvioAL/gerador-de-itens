import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ErrorBoundary } from "./ErrorBoundary";

function ComponenteQueQuebra(): never {
  throw new Error("falha de teste: propriedade inesperada");
}

describe("ErrorBoundary — achado real: exceção de render derrubava o app inteiro pra tela em branco, sem aviso", () => {
  it("captura o erro e mostra uma tela de fallback em vez de ficar em branco", () => {
    const consoleErro = vi.spyOn(console, "error").mockImplementation(() => {});

    render(
      <ErrorBoundary>
        <ComponenteQueQuebra />
      </ErrorBoundary>
    );

    expect(screen.getByText("Algo deu errado")).toBeInTheDocument();
    expect(screen.getByText(/falha de teste: propriedade inesperada/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Recarregar" })).toBeInTheDocument();

    consoleErro.mockRestore();
  });

  it("sem erro nenhum, renderiza os filhos normalmente", () => {
    render(
      <ErrorBoundary>
        <p>conteúdo normal</p>
      </ErrorBoundary>
    );

    expect(screen.getByText("conteúdo normal")).toBeInTheDocument();
    expect(screen.queryByText("Algo deu errado")).not.toBeInTheDocument();
  });
});
