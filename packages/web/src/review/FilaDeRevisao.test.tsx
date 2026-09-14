import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { FilaDeRevisao } from "./FilaDeRevisao";
import type { PendenteDeConfirmacao } from "./pendencias";

function pendente(chave: string, valor: string): PendenteDeConfirmacao {
  return {
    itemChave: "n1::service",
    itemRotulo: "srv-catalogo",
    chave,
    rotulo: `Rótulo de ${chave}`,
    tech: "Backend",
    resposta: { valor, origem: "sugerido", confirmado: false },
  };
}

function montar(pendentes: PendenteDeConfirmacao[]) {
  const onConfirmar = vi.fn();
  const onDescartar = vi.fn();
  const onFechar = vi.fn();
  render(<FilaDeRevisao pendentes={pendentes} onConfirmar={onConfirmar} onDescartar={onDescartar} onFechar={onFechar} />);
  return { onConfirmar, onDescartar, onFechar };
}

describe("FilaDeRevisao (SPEC-44 Fase 2)", () => {
  it("mostra uma sugestão por vez com progresso, e confirmar SEM editar assina mantendo a procedência", () => {
    const { onConfirmar, onFechar } = montar([pendente("a", "texto A"), pendente("b", "texto B")]);

    expect(screen.getByTestId("fila-progresso").textContent).toBe("1 de 2");
    expect(screen.getByTestId("fila-rotulo").textContent).toBe("Rótulo de a");

    fireEvent.click(screen.getByTestId("fila-confirmar"));
    expect(onConfirmar).toHaveBeenCalledWith("n1::service", "a", { valor: "texto A", origem: "sugerido", confirmado: true });

    // Avançou sozinha pro próximo pendente.
    expect(screen.getByTestId("fila-rotulo").textContent).toBe("Rótulo de b");
    expect(screen.getByTestId("fila-progresso").textContent).toBe("2 de 2");
    expect(onFechar).not.toHaveBeenCalled();
  });

  it("editar antes de confirmar grava como manual — foi edição humana", () => {
    const { onConfirmar } = montar([pendente("a", "texto A")]);
    fireEvent.change(screen.getByLabelText("Texto da sugestão"), { target: { value: "texto corrigido" } });
    fireEvent.click(screen.getByTestId("fila-confirmar"));
    expect(onConfirmar).toHaveBeenCalledWith("n1::service", "a", { valor: "texto corrigido", origem: "manual" });
  });

  it("Enter confirma; a última pendência fecha a fila", () => {
    const { onConfirmar, onFechar } = montar([pendente("a", "texto A")]);
    fireEvent.keyDown(screen.getByLabelText("Texto da sugestão"), { key: "Enter" });
    expect(onConfirmar).toHaveBeenCalled();
    expect(onFechar).toHaveBeenCalled();
  });

  it("Pular avança sem gravar nada; Descartar remove e avança", () => {
    const { onConfirmar, onDescartar } = montar([pendente("a", "A"), pendente("b", "B"), pendente("c", "C")]);

    fireEvent.click(screen.getByTestId("fila-pular"));
    expect(onConfirmar).not.toHaveBeenCalled();
    expect(screen.getByTestId("fila-rotulo").textContent).toBe("Rótulo de b");

    fireEvent.click(screen.getByTestId("fila-descartar"));
    expect(onDescartar).toHaveBeenCalledWith("n1::service", "b");
    expect(screen.getByTestId("fila-rotulo").textContent).toBe("Rótulo de c");
  });
});
