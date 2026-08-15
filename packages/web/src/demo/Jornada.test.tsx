import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Jornada } from "./Jornada";

/**
 * §255 — a explicação do MOTOR, pedida assim: *"sinto falta de uma explicação
 * melhor sobre o que é o motor, como ele funciona do ponto de vista do
 * usuário, como ele se conecta com o resto"*.
 *
 * O texto anterior dizia "um motor determinístico — não um LLM" e seguia. Isso
 * diz o que ele NÃO é. Estes testes guardam as três coisas que quem chega
 * precisa: o que ele faz, onde a IA entra, e o que a divisão entre os dois dá
 * na prática.
 *
 * Este componente serve DUAS telas — a aba "A jornada" e a landing pública —,
 * então o que estiver errado aqui está errado em dobro.
 */
describe("Jornada — a explicação do motor (§255)", () => {
  it("diz o que o motor FAZ, não só o que ele não é", () => {
    render(<Jornada />);
    const bloco = screen.getByTestId("explicacao-do-motor");

    expect(bloco.textContent).toContain("mede");
    expect(bloco.textContent).toContain("deriva");
    expect(bloco.textContent).toContain("monta");
  });

  it("diz de onde vem o que ele lê — desenho E configuração do time", () => {
    // "Como ele se conecta com o resto" era a parte que faltava inteira.
    render(<Jornada />);

    expect(screen.getByTestId("explicacao-do-motor").textContent).toMatch(/desenho e a configuração do time/i);
  });

  it("põe a divisão motor × IA em palavras, que é a tese do produto", () => {
    render(<Jornada />);
    const bloco = screen.getByTestId("explicacao-do-motor");

    expect(bloco.textContent).toMatch(/estrutura/);
    expect(bloco.textContent).toMatch(/A IA escreve o/);
    expect(bloco.textContent).toMatch(/antes de você confirmar/);
  });

  it("diz o que determinismo DÁ, não que ele existe", () => {
    // "Determinístico" sozinho é adjetivo de folheto. O que vale é a
    // consequência: comparar antes e depois, e poder discordar.
    render(<Jornada />);

    expect(screen.getByTestId("explicacao-do-motor").textContent).toMatch(/mesmos itens/);
    expect(screen.getByTestId("explicacao-do-motor").textContent).toMatch(/discordar/);
  });

  it("as etapas continuam ali — a explicação entra ANTES, não no lugar", () => {
    render(<Jornada />);

    for (const etapa of ["Diagrama", "Prontidão", "Derivar", "Revisão"]) {
      expect(screen.getByText(etapa)).toBeTruthy();
    }
  });
});
