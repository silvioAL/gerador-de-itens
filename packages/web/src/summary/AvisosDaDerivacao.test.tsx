import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { AvisoDaDerivacao } from "@gerador/engine";
import { AvisosDaDerivacao } from "./AvisosDaDerivacao";

function montar(avisos: AvisoDaDerivacao[]) {
  const onDerivar = vi.fn();
  const onVoltar = vi.fn();
  render(<AvisosDaDerivacao avisos={avisos} onDerivar={onDerivar} onVoltar={onVoltar} />);
  return { onDerivar, onVoltar };
}

const LACUNA: AvisoDaDerivacao = { dimensao: "proposito", texto: "1 necessidade(s) sem componente" };

/**
 * §261 — o reconhecimento do que se ignora ao derivar.
 *
 * O que estes testes guardam não é a existência do diálogo: é que ele NÃO
 * vire portão. Se seguir custar mais que um clique, a pessoa aprende a odiar
 * a medição em vez de usá-la — que é o oposto do que a régua do §230 pede.
 */
describe("AvisosDaDerivacao", () => {
  it("seguir é UM clique, e é a ação primária", () => {
    const { onDerivar } = montar([LACUNA]);

    fireEvent.click(screen.getByTestId("derivar-mesmo-assim"));
    expect(onDerivar).toHaveBeenCalledTimes(1);
  });

  it("diz que não impede nada — informação, não permissão", () => {
    montar([LACUNA]);

    expect(screen.getByText(/Nada aqui impede a derivação/)).toBeTruthy();
  });

  it("cada dimensão aparece com o ícone que a pessoa já conhece do placar", () => {
    montar([
      LACUNA,
      { dimensao: "caminho", texto: "1 caminho sem medir" },
      { dimensao: "decisao", texto: "1 proposta esperando" },
    ]);

    for (const d of ["proposito", "caminho", "decisao"]) {
      expect(screen.getByTestId(`aviso-${d}`)).toBeTruthy();
    }
    expect(screen.getByTestId("aviso-caminho").textContent).toContain("🛣");
  });

  it("voltar não deriva", () => {
    const { onDerivar, onVoltar } = montar([LACUNA]);

    fireEvent.click(screen.getByTestId("voltar-e-resolver"));
    expect(onVoltar).toHaveBeenCalled();
    expect(onDerivar).not.toHaveBeenCalled();
  });

  it("clicar fora fecha sem derivar — desistir é tão barato quanto seguir", () => {
    const { onDerivar, onVoltar } = montar([LACUNA]);

    fireEvent.click(screen.getByTestId("avisos-da-derivacao").parentElement!);
    expect(onVoltar).toHaveBeenCalled();
    expect(onDerivar).not.toHaveBeenCalled();
  });

  it("clicar DENTRO da caixa não fecha — é o erro clássico do overlay", () => {
    const { onVoltar } = montar([LACUNA]);

    fireEvent.click(screen.getByTestId("avisos-da-derivacao"));
    expect(onVoltar).not.toHaveBeenCalled();
  });
});
