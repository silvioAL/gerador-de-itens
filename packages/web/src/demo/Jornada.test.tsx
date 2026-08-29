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

describe("Jornada — o passo a passo de uso (SPEC-83)", () => {
  it("as etapas continuam ali, e a explicação do motor NÃO", () => {
    /**
     * Este caso dizia *"a explicação entra ANTES, não no lugar"* — e a
     * afirmação virou meia verdade na SPEC-83: as etapas continuam, e a
     * explicação saiu.
     *
     * O motor virou peça própria porque a landing renderizava as duas coisas,
     * e a `Jornada` volta a ser o que é: o passo a passo de USO, para quem já
     * entrou. Os quatro casos sobre o motor foram para `OMotor.test.tsx`, onde
     * mora o que eles afirmam.
     */
    render(<Jornada />);

    for (const etapa of ["Diagrama", "Prontidão", "Derivar", "Revisão"]) {
      expect(screen.getByText(etapa)).toBeTruthy();
    }
    expect(screen.queryByTestId("explicacao-do-motor")).toBeNull();
  });
});
