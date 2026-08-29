import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { OMotor } from "./OMotor";

/**
 * §255 — a explicação do motor, e SPEC-83: ela mudou de casa.
 *
 * Os quatro casos abaixo vieram de `Jornada.test.tsx` sem uma vírgula mudada:
 * o que mudou foi o dono. O `OMotor` morava dentro da `Jornada`, e a landing
 * renderizava as duas — o motor aparecia antes de cinco etapas que repetiam
 * estágios que o círculo já tinha mostrado.
 *
 * Testes ficam onde mora o que eles afirmam. Deixá-los na `Jornada` faria a
 * próxima pessoa procurar a explicação do motor no arquivo errado.
 */

describe("Jornada — a explicação do motor (§255)", () => {
  it("diz o que o motor FAZ, não só o que ele não é", () => {
    render(<OMotor />);
    const bloco = screen.getByTestId("explicacao-do-motor");

    expect(bloco.textContent).toContain("mede");
    expect(bloco.textContent).toContain("deriva");
    expect(bloco.textContent).toContain("monta");
  });

  it("diz de onde vem o que ele lê — desenho E configuração do time", () => {
    // "Como ele se conecta com o resto" era a parte que faltava inteira.
    render(<OMotor />);

    expect(screen.getByTestId("explicacao-do-motor").textContent).toMatch(/desenho e a configuração do time/i);
  });

  it("põe a divisão motor × IA em palavras, que é a tese do produto", () => {
    render(<OMotor />);
    const bloco = screen.getByTestId("explicacao-do-motor");

    expect(bloco.textContent).toMatch(/estrutura/);
    expect(bloco.textContent).toMatch(/A IA escreve o/);
    expect(bloco.textContent).toMatch(/antes de você confirmar/);
  });

  it("diz o que determinismo DÁ, não que ele existe", () => {
    // "Determinístico" sozinho é adjetivo de folheto. O que vale é a
    // consequência: comparar antes e depois, e poder discordar.
    render(<OMotor />);

    expect(screen.getByTestId("explicacao-do-motor").textContent).toMatch(/mesmos itens/);
    expect(screen.getByTestId("explicacao-do-motor").textContent).toMatch(/discordar/);
  });

});
