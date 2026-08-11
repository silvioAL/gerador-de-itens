import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AssistenteFlutuante } from "./AssistenteFlutuante";

describe("AssistenteFlutuante (#298 — um ponto de entrada pra conversar com a ferramenta)", () => {
  it("fechado: só o botão flutuante; abrir cai na conversa, que é a ação primária", async () => {
    const onMudarAba = vi.fn();
    const user = userEvent.setup();

    render(<AssistenteFlutuante aba={null} onMudarAba={onMudarAba} />);

    expect(screen.queryByTestId("assistente-janela")).not.toBeInTheDocument();
    await user.click(screen.getByTestId("assistente-flutuante"));
    expect(onMudarAba).toHaveBeenCalledWith("conversa");
  });

  it("aberto: mostra o conteúdo da aba ativa e as duas abas pra trocar", async () => {
    const onMudarAba = vi.fn();
    const user = userEvent.setup();

    render(
      <AssistenteFlutuante aba="conversa" onMudarAba={onMudarAba}>
        <p>conteúdo da aba</p>
      </AssistenteFlutuante>
    );

    expect(screen.getByTestId("assistente-janela")).toBeInTheDocument();
    expect(screen.getByText("conteúdo da aba")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "📎 Contexto do épico" }));
    expect(onMudarAba).toHaveBeenCalledWith("contexto");
  });

  it("fechar: tanto o × da janela quanto o próprio botão flutuante", async () => {
    const onMudarAba = vi.fn();
    const user = userEvent.setup();

    render(<AssistenteFlutuante aba="contexto" onMudarAba={onMudarAba} />);

    await user.click(screen.getByRole("button", { name: "Fechar assistente" }));
    expect(onMudarAba).toHaveBeenCalledWith(null);

    onMudarAba.mockClear();
    await user.click(screen.getByTestId("assistente-flutuante"));
    expect(onMudarAba).toHaveBeenCalledWith(null);
  });
});
