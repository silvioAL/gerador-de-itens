import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MenuLateral } from "./MenuLateral";

function montar(extras: Partial<Parameters<typeof MenuLateral>[0]> = {}) {
  const props = {
    aberto: true,
    onFechar: vi.fn(),
    timeAtivo: "time-pagamentos",
    timeIds: ["time-pagamentos", "time-portabilidade"],
    email: "dev@gerador.local",
    onTrocarTime: vi.fn(),
    onNavegar: vi.fn(),
    onNovaQuebra: vi.fn(),
    onAbrirQuebras: vi.fn(),
  onItens: vi.fn(),
    onCenarios: vi.fn(),
    onSair: vi.fn(),
    ...extras,
  };
  render(<MenuLateral {...props} />);
  return props;
}

describe("MenuLateral (SPEC-40 F1 — gestão no menu, frequência no header)", () => {
  it("agrupa por intenção: Demanda, Padrões do time, Pessoas & acesso, IA — e o rodapé de sessão", () => {
    montar();
    for (const grupo of ["Demanda", "Padrões do time", "Pessoas & acesso", "IA"]) {
      expect(screen.getByText(grupo)).toBeInTheDocument();
    }
    expect(screen.getByText("dev@gerador.local")).toBeInTheDocument();
    expect(screen.getByLabelText("Time (stack conhecida)")).toHaveValue("time-pagamentos");
  });

  it("clicar num item navega pra ÁREA certa e fecha o menu", () => {
    const props = montar();
    fireEvent.click(screen.getByRole("button", { name: "Membros" }));
    expect(props.onNavegar).toHaveBeenCalledWith("membros");
    expect(props.onFechar).toHaveBeenCalled();

    montar().onNavegar; // segunda instância pra outro item
    const props2 = montar();
    fireEvent.click(screen.getAllByRole("button", { name: "Modelo de IA" }).at(-1)!);
    expect(props2.onNavegar).toHaveBeenCalledWith("modeloIa");
  });

  it("fechado, não existe no DOM (overlay some de verdade)", () => {
    montar({ aberto: false });
    expect(screen.queryByTestId("menu-lateral")).not.toBeInTheDocument();
  });
});
