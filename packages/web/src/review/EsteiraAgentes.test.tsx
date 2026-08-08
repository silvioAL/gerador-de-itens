import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { EsteiraAgentes } from "./EsteiraAgentes";

describe("EsteiraAgentes (SPEC-24 Fase E — faixa própria, fiel ao protótipo)", () => {
  it("sem esteira rodando, mostra os 4 papéis em repouso com a descrição do que cada um faz", () => {
    render(<EsteiraAgentes papelAtual={null} />);

    expect(screen.getByText("Escreve a história e os critérios de aceite")).toBeInTheDocument();
    expect(screen.getByText("Deriva as regras de teste e escreve os cenários")).toBeInTheDocument();
    // Ninguém ativo: nenhum papel marcado como passo atual.
    for (const papel of ["po", "arquiteto", "especialista", "qa"]) {
      expect(screen.getByTestId(`handoff-${papel}`)).not.toHaveAttribute("aria-current");
    }
  });

  it("papel ativo troca a descrição pelo que está sendo feito agora, e marca aria-current", () => {
    render(<EsteiraAgentes papelAtual="arquiteto" atividadeAtual="item 3 de 6 · 03" />);

    expect(screen.getByTestId("handoff-arquiteto")).toHaveAttribute("aria-current", "step");
    expect(screen.getByText("item 3 de 6 · 03")).toBeInTheDocument();
    // O papel ainda não alcançado mantém a descrição do que ele faz.
    expect(screen.getByText("Deriva as regras de teste e escreve os cenários")).toBeInTheDocument();
  });

  it("papéis anteriores ao ativo aparecem concluídos (✓); o ativo e os seguintes, não", () => {
    render(<EsteiraAgentes papelAtual="especialista" atividadeAtual="item 1 de 2 · 01" />);

    expect(screen.getByTestId("handoff-po")).toHaveTextContent("✓");
    expect(screen.getByTestId("handoff-arquiteto")).toHaveTextContent("✓");
    expect(screen.getByTestId("handoff-especialista")).not.toHaveTextContent("✓");
    expect(screen.getByTestId("handoff-qa")).not.toHaveTextContent("✓");
  });

  it("pausado: mostra o aviso no subtítulo e para o giro do tick", () => {
    const { container } = render(
      <EsteiraAgentes papelAtual="po" atividadeAtual="item 1 de 6 · 01" pausado />
    );

    expect(screen.getByText(/Pausado — item 1 de 6 · 01/)).toBeInTheDocument();
    expect(container.querySelector(".handoff-tick-ativo")).toBeNull();
  });
});
