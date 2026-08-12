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

  it("dentro de Configurações o mesmo botão abre direto na conversa de configuração", async () => {
    const onMudarAba = vi.fn();
    const user = userEvent.setup();

    render(<AssistenteFlutuante aba={null} onMudarAba={onMudarAba} abaPrimaria="configurar" sobreposto />);

    await user.click(screen.getByTestId("assistente-flutuante"));
    expect(onMudarAba).toHaveBeenCalledWith("configurar");
  });

  it("o balão do momento (SPEC-37): fala + chip que executa + dispensar — e o pulso só quando chamando", async () => {
    const onExecutar = vi.fn();
    const onDispensar = vi.fn();
    const user = userEvent.setup();

    render(
      <AssistenteFlutuante
        aba={null}
        onMudarAba={vi.fn()}
        chamando
        balao={{ texto: "Tudo verde — pronta para derivar.", acao: { rotulo: "Derivar Quebra", onExecutar }, onDispensar }}
      />
    );

    expect(screen.getByTestId("assistente-balao")).toHaveTextContent("Tudo verde");
    expect(screen.getByTestId("assistente-flutuante").className).toContain("assistente-fab--chamando");

    // O chip executa a MESMA ação do botão correspondente — não um atalho novo.
    await user.click(screen.getByTestId("assistente-balao-acao"));
    expect(onExecutar).toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Dispensar sugestão" }));
    expect(onDispensar).toHaveBeenCalled();
  });

  it("com o assistente ABERTO o balão some e o pulso para — quem fala é o chat", () => {
    render(
      <AssistenteFlutuante
        aba="conversa"
        onMudarAba={vi.fn()}
        chamando
        balao={{ texto: "não deveria aparecer", onDispensar: vi.fn() }}
      />
    );
    expect(screen.queryByTestId("assistente-balao")).not.toBeInTheDocument();
    expect(screen.getByTestId("assistente-flutuante").className).not.toContain("assistente-fab--chamando");
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
