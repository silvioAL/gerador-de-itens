import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Delta } from "./Delta";

/**
 * §263 — o que a caixa do delta garante, independente de quem a usa.
 */
describe("Delta", () => {
  it("mostra cada linha como de → para", () => {
    render(<Delta titulo="Se aceitar" remedicao={{ linhas: [{ rotulo: "lacunas", antes: 0, depois: 2 }] }} />);

    expect(screen.getByTestId("delta").textContent).toContain("lacunas 0 → 2");
  });

  it("sem linha nenhuma não renderiza caixa vazia", () => {
    // Uma caixa vazia dizendo "se aceitar" e nada dentro é pior que ausência:
    // sugere que a medição rodou e não achou nada a dizer.
    const { container } = render(<Delta titulo="Se aceitar" remedicao={{ linhas: [] }} />);

    expect(container.firstChild).toBeNull();
  });

  it("o alerta só aparece quando o motor manda um", () => {
    const semAlerta = render(<Delta titulo="x" remedicao={{ linhas: [{ rotulo: "a", antes: 1, depois: 0 }] }} />);
    expect(semAlerta.queryByTestId("delta-alerta")).toBeNull();

    semAlerta.unmount();
    render(<Delta titulo="x" remedicao={{ linhas: [{ rotulo: "a", antes: 0, depois: 1 }], alerta: "cria trabalho" }} />);
    expect(screen.getByTestId("delta-alerta").textContent).toBe("cria trabalho");
  });

  /**
   * §284 — RELATO REAL, com print da caixa "Se confirmar este caminho"
   * mostrando `itens no backlog 4 → 4`: *"o que me estranha aqui é 4 → 4, acho
   * que ninguém entende instintivamente o que é 4 → 4"*.
   */
  it("§284 — quando nada muda, diz isso em português; a seta some", () => {
    // A caixa promete uma consequência no título. Entregar uma equação para a
    // pessoa resolver ("são iguais, então não muda") é cobrar o trabalho que a
    // caixa existe para fazer.
    render(<Delta titulo="Se confirmar este caminho" remedicao={{ linhas: [{ rotulo: "itens no backlog", antes: 4, depois: 4 }] }} />);

    const caixa = screen.getByTestId("delta");
    expect(screen.getByTestId("delta-sem-efeito").textContent).toContain("itens no backlog continua em 4");
    expect(caixa.textContent).not.toContain("→");
  });

  it("§284 — linha parada no meio de linhas que andaram fica, mas sem seta", () => {
    // Sumir com ela esconderia uma medida; mantê-la com seta prometeria uma
    // travessia que não houve.
    render(
      <Delta
        titulo="Se aceitar"
        remedicao={{
          linhas: [
            { rotulo: "lacunas", antes: 0, depois: 2 },
            { rotulo: "itens no backlog", antes: 4, depois: 4 },
          ],
        }}
      />
    );

    expect(screen.getByTestId("delta-linha-lacunas").textContent).toContain("lacunas 0 → 2");
    expect(screen.getByTestId("delta-linha-itens-no-backlog").textContent).toContain("itens no backlog: 4 (não muda)");
    expect(screen.queryByTestId("delta-sem-efeito")).toBeNull();
  });

  it("o botão que executa a ação vive dentro da caixa", () => {
    // Ler o efeito num canto e agir noutro é o que separa "reconhecer" de
    // "clicar sem ler".
    render(
      <Delta titulo="x" remedicao={{ linhas: [{ rotulo: "a", antes: 0, depois: 1 }] }}>
        <button>Confirmar</button>
      </Delta>
    );

    expect(screen.getByTestId("delta").querySelector("button")?.textContent).toBe("Confirmar");
  });
});
