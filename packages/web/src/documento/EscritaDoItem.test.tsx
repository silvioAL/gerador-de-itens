import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { EscritaDoItem } from "./EscritaDoItem";

/**
 * SPEC-47 — o markdown do item é LIDO como texto, não exibido como código.
 *
 * O teste morava na `ItensScreen.test`; com a fusão da SPEC-61 a tela morreu e
 * o renderizador ganhou arquivo próprio. A cobertura vem junto — capacidade que
 * perde teste na mudança de casa é capacidade que ninguém percebe quebrar.
 */
describe("EscritaDoItem", () => {
  it("título vira título, lista vira lista, negrito vira negrito", () => {
    render(
      <div data-testid="corpo">
        <EscritaDoItem
          markdown={[
            "### 1. Item — descrição",
            "",
            "**Tipo:** Task · **Tamanho:** P",
            "",
            "#### Entrega final",
            "",
            "- Serviço publicando na fila",
            "- Painel com o volume do dia",
          ].join("\n")}
        />
      </div>
    );

    const corpo = screen.getByTestId("corpo");
    // O texto está legível, sem os símbolos do markdown à mostra.
    expect(corpo.textContent).toContain("Entrega final");
    expect(corpo.textContent).not.toContain("####");
    expect(corpo.textContent).not.toContain("**Tipo:**");
    expect(corpo.querySelectorAll("li")).toHaveLength(2);
    expect(corpo.querySelector("strong")?.textContent).toBe("Tipo:");
  });

  it("bloco de código continua monoespaçado, e não vira parágrafo", () => {
    render(
      <div data-testid="corpo">
        <EscritaDoItem markdown={["texto antes", "", "```", "GET /pedidos/{id}", "```"].join("\n")} />
      </div>
    );

    const pre = screen.getByTestId("corpo").querySelector("pre");
    expect(pre?.textContent).toBe("GET /pedidos/{id}");
  });
});
