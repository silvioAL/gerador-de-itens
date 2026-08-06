import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TourOverlay } from "./TourOverlay";
import type { PassoTour } from "./useTour";

describe("TourOverlay", () => {
  it("passo sem selector mostra o texto e os botões Próximo/Pular", async () => {
    const user = userEvent.setup();
    const onProximo = vi.fn();
    const onPular = vi.fn();
    const passo: PassoTour = { selector: null, titulo: "Bem-vindo", texto: "Explicação do passo." };

    render(<TourOverlay passo={passo} indice={0} total={7} ultimo={false} onProximo={onProximo} onPular={onPular} />);

    expect(screen.getByText("Bem-vindo")).toBeInTheDocument();
    expect(screen.getByText("PASSO 1 DE 7")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Próximo" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Pular tour" }));
    expect(onPular).toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Próximo" }));
    expect(onProximo).toHaveBeenCalled();
  });

  it("último passo mostra o botão Concluir em vez de Próximo", () => {
    const passo: PassoTour = { selector: null, titulo: "Fim", texto: "Acabou." };
    render(<TourOverlay passo={passo} indice={6} total={7} ultimo onProximo={vi.fn()} onPular={vi.fn()} />);

    expect(screen.getByRole("button", { name: "Concluir" })).toBeInTheDocument();
  });

  it("passo com selector que existe no DOM não usa o overlay de tela cheia centrado", () => {
    const alvo = document.createElement("div");
    alvo.setAttribute("data-tour", "alvo-teste");
    document.body.appendChild(alvo);

    const passo: PassoTour = { selector: "[data-tour=alvo-teste]", titulo: "Aponta pro alvo", texto: "..." };
    render(<TourOverlay passo={passo} indice={1} total={3} ultimo={false} onProximo={vi.fn()} onPular={vi.fn()} />);

    expect(screen.getByText("Aponta pro alvo")).toBeInTheDocument();

    document.body.removeChild(alvo);
  });
});
