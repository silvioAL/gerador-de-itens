import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LoginScreen } from "./LoginScreen";

/**
 * ACHADO REAL do usuário, duas vezes: *"o login com conta google sumiu"* e
 * *"esqueci com qual credencial logar"*.
 *
 * Nenhuma das duas era um defeito de código — eram a tela não se explicando.
 * Em `AUTH_MODE=dev` (o padrão) qualquer e-mail entra sem senha, então não há
 * credencial para lembrar; e o botão do Google não sumiu, ele só existe em
 * `AUTH_MODE=oidc`. A tela pedia "E-mail" e ficava calada sobre as duas coisas.
 */
describe("LoginScreen", () => {
  const props = { onEntrar: vi.fn(), erro: null };

  it("no modo dev, diz que qualquer e-mail entra e como habilitar o Google", () => {
    render(<LoginScreen {...props} modo="dev" />);

    const aviso = screen.getByTestId("aviso-modo-dev");
    expect(aviso.textContent).toContain("Qualquer e-mail entra");
    expect(aviso.textContent).toContain("AUTH_MODE=oidc");
  });

  it("no modo oidc, mostra o botão do Google e NÃO mostra o aviso de dev", () => {
    render(<LoginScreen {...props} modo="oidc" />);

    expect(screen.getByText("Continuar com Google")).toBeTruthy();
    expect(screen.queryByTestId("aviso-modo-dev")).toBeNull();
  });

  it("no modo dev, não existe botão do Google — é o que o usuário leu como 'sumiu'", () => {
    render(<LoginScreen {...props} modo="dev" />);

    expect(screen.queryByText("Continuar com Google")).toBeNull();
  });

  /** Enquanto `GET /auth/modo` não respondeu, o card não pisca a UI errada. */
  it("sem modo resolvido, não mostra nenhuma das duas UIs", () => {
    render(<LoginScreen {...props} modo={undefined} />);

    expect(screen.queryByText("Continuar com Google")).toBeNull();
    expect(screen.queryByTestId("aviso-modo-dev")).toBeNull();
  });
});
