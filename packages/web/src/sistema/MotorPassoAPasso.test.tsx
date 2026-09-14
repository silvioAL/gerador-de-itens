import { describe, expect, it, vi, afterEach } from "vitest";
import { act, render, screen } from "@testing-library/react";
import type { MedicaoDeExemplo } from "@gerador/engine";
import { MotorPassoAPasso } from "./MotorPassoAPasso";

const EXEMPLO: MedicaoDeExemplo = {
  tech: "Backend",
  contextos: ["chamadas http"],
  texto: "timeout curto em chamada externa",
  porque: "veio do incidente de cobrança dupla",
  checagem: { campo: "timeoutMs", operador: "lte", valor: 500, unidade: "ms" },
};

afterEach(() => vi.useRealTimers());

/**
 * §268 — a cadeia do motor, explicada com a conta acontecendo.
 */
describe("MotorPassoAPasso", () => {
  it("mostra os quatro elos, na ordem que é a explicação inteira", () => {
    render(<MotorPassoAPasso exemplo={EXEMPLO} intervaloMs={0} />);

    expect(screen.getByTestId("motor-passo-1").textContent).toContain("timeoutMs = 1000ms");
    expect(screen.getByTestId("motor-passo-2").textContent).toContain("timeoutMs ≤ 500ms");
    expect(screen.getByTestId("motor-passo-3").textContent).toContain("não é ≤ 500ms");
    expect(screen.getByTestId("motor-passo-4").textContent).toContain("trazer timeoutMs para ≤ 500ms");
  });

  it("diz que não usa IA nem rede — é a leitura errada que a palavra 'motor' provoca", () => {
    render(<MotorPassoAPasso exemplo={EXEMPLO} intervaloMs={0} />);

    expect(screen.getByTestId("motor-passo-3").textContent).toContain("Sem IA, sem rede");
  });

  it("o porquê do time viaja junto do item — régua sem lei publicada é multa", () => {
    render(<MotorPassoAPasso exemplo={EXEMPLO} intervaloMs={0} />);

    expect(screen.getByTestId("motor-passo-4").textContent).toContain("incidente de cobrança dupla");
  });

  it("o foco ANDA de um elo para o outro", () => {
    // É o que separa "mecanismo" de "lista de conceitos". Sem isto o componente
    // é um parágrafo com bordas.
    vi.useFakeTimers();
    render(<MotorPassoAPasso exemplo={EXEMPLO} intervaloMs={1000} />);

    expect(screen.getByTestId("motor-passo-1")).toHaveAttribute("data-ativo", "true");
    act(() => void vi.advanceTimersByTime(1000));
    expect(screen.getByTestId("motor-passo-2")).toHaveAttribute("data-ativo", "true");
    expect(screen.getByTestId("motor-passo-1")).toHaveAttribute("data-ativo", "false");

    // E dá a volta: quem chega no meio da animação vê o começo depois.
    act(() => void vi.advanceTimersByTime(3000));
    expect(screen.getByTestId("motor-passo-1")).toHaveAttribute("data-ativo", "true");
  });

  it("sem régua conferível, NÃO inventa uma conta", () => {
    // Explicar a régua de um time que não a tem ensina algo falso sobre o
    // próprio ambiente de quem está olhando.
    const onConfigurarRegras = vi.fn();
    render(<MotorPassoAPasso onConfigurarRegras={onConfigurarRegras} />);

    expect(screen.queryByTestId("motor-passo-1")).toBeNull();
    expect(screen.getByTestId("motor-passo-a-passo").textContent).toContain("nenhuma régua");
    expect(screen.getByTestId("motor-configurar-regras")).toBeTruthy();
  });
});

/**
 * §268 — a régua `preenchido` e a marca de demonstração.
 */
describe("MotorPassoAPasso — os dois casos que a primeira versão errou", () => {
  it("`preenchido` mostra 'em branco', e não uma conta quebrada", () => {
    // A régua mais simples de todas ficou de fora da primeira versão: eu exigi
    // um literal, e ela não tem nenhum. Formatada como as outras, sairia
    // "≥ undefined" no meio da explicação de como as contas fecham.
    render(
      <MotorPassoAPasso
        intervaloMs={0}
        exemplo={{
          tech: "Backend",
          contextos: [],
          texto: "declarar a chave de sharding",
          checagem: { campo: "chaveDeSharding", operador: "preenchido" },
        }}
      />
    );

    expect(screen.getByTestId("motor-passo-1").textContent).toContain("em branco");
    expect(screen.getByTestId("motor-passo-2").textContent).toContain("chaveDeSharding preenchido");
    expect(screen.getByTestId("motor-passo-a-passo").textContent).not.toContain("undefined");
  });

  it("exemplo de demonstração leva a marca — senão o tour ensina uma régua que não existe ali", () => {
    render(<MotorPassoAPasso exemplo={EXEMPLO} demonstracao intervaloMs={0} />);

    expect(screen.getByTestId("marca-demonstracao")).toBeTruthy();
  });
});
