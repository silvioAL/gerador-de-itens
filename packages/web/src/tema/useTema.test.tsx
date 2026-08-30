import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SeletorDeTema } from "./SeletorDeTema";
import { CHAVE_TEMA, resolverTema } from "./useTema";

/**
 * SPEC-93 fatia C — **quem decide é a pessoa**, e o que se guarda é a decisão.
 */

function sistemaClaro(claro: boolean) {
  vi.stubGlobal("matchMedia", (q: string) => ({
    matches: q.includes("light") ? claro : !claro,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
}

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute("data-tema");
  sistemaClaro(false);
});

describe("a preferência de tema (SPEC-93)", () => {
  it("o padrão é SEGUIR O SISTEMA — não impor o nosso", () => {
    // Quem nunca pensou no assunto recebe o que já usa em todo lugar.
    render(<SeletorDeTema />);

    expect(screen.getByTestId("tema-sistema")).toHaveAttribute("aria-pressed", "true");
  });

  it("guarda a PREFERÊNCIA, não o tema resolvido", () => {
    /**
     * O defeito clássico deste controle: guardar `escuro` porque o sistema
     * estava escuro congela a pessoa no escuro para sempre, mesmo depois de ela
     * trocar o sistema. O que se guarda é "siga o sistema".
     */
    render(<SeletorDeTema />);

    expect(localStorage.getItem(CHAVE_TEMA)).toBe("sistema");
  });

  it("escolher claro aplica no `<html>` e persiste", () => {
    render(<SeletorDeTema />);

    fireEvent.click(screen.getByTestId("tema-claro"));

    expect(document.documentElement.getAttribute("data-tema")).toBe("claro");
    expect(localStorage.getItem(CHAVE_TEMA)).toBe("claro");
    expect(screen.getByTestId("tema-claro")).toHaveAttribute("aria-pressed", "true");
  });

  it("em `sistema`, o sistema manda — e a escolha explícita vence o sistema", () => {
    sistemaClaro(true);

    expect(resolverTema("sistema")).toBe("claro");
    expect(resolverTema("escuro"), "escolha explícita não pode ser sobrescrita").toBe("escuro");
  });

  it("o estado ativo é marcado com `aria-pressed`, não só com cor", () => {
    // A mesma disciplina que o resto do produto aplica a status: quem não
    // distingue as cores tem que conseguir ler qual está ativo.
    render(<SeletorDeTema />);
    fireEvent.click(screen.getByTestId("tema-escuro"));

    expect(screen.getByTestId("tema-escuro")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("tema-claro")).toHaveAttribute("aria-pressed", "false");
  });

  it("`localStorage` indisponível não impede a aplicação de abrir", () => {
    // Navegação privada, cookies bloqueados. Tema não é motivo para tela branca.
    const original = Storage.prototype.getItem;
    Storage.prototype.getItem = () => {
      throw new Error("bloqueado");
    };
    try {
      expect(() => render(<SeletorDeTema />)).not.toThrow();
    } finally {
      Storage.prototype.getItem = original;
    }
  });
});
