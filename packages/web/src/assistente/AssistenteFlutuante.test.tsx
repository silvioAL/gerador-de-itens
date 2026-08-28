import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AssistenteFlutuante } from "./AssistenteFlutuante";

beforeEach(() => localStorage.removeItem("gerador:fab-assistente"));

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

    await user.click(screen.getByRole("button", { name: "📎 Contexto da demanda" }));
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

  it("balão-pergunta: confirmar só com texto, e o valor digitado chega trimado", async () => {
    const onConfirmar = vi.fn();
    const onSecundaria = vi.fn();
    const user = userEvent.setup();

    render(
      <AssistenteFlutuante
        aba={null}
        onMudarAba={vi.fn()}
        balao={{
          texto: "Qual é o nome da demanda?",
          entrada: { placeholder: "ex.: Fatura mensal em lote", rotulo: "Derivar e salvar", onConfirmar },
          acaoSecundaria: { rotulo: "Derivar sem salvar", onExecutar: onSecundaria },
          onDispensar: vi.fn(),
        }}
      />
    );

    // Vazio: o chip principal não confirma — sem nome não há o que salvar.
    const confirmar = screen.getByTestId("assistente-balao-confirmar");
    expect(confirmar).toBeDisabled();

    await user.type(screen.getByLabelText("ex.: Fatura mensal em lote"), "  Fatura mensal  ");
    await user.click(confirmar);
    expect(onConfirmar).toHaveBeenCalledWith("Fatura mensal");

    // A saída sem compromisso continua a um clique.
    await user.click(screen.getByTestId("assistente-balao-secundaria"));
    expect(onSecundaria).toHaveBeenCalled();
  });

  it("balão-pergunta: Enter no input confirma — o teclado não obriga o mouse", async () => {
    const onConfirmar = vi.fn();
    const user = userEvent.setup();

    render(
      <AssistenteFlutuante
        aba={null}
        onMudarAba={vi.fn()}
        balao={{
          texto: "Qual é o nome da demanda?",
          entrada: { placeholder: "nome", rotulo: "Derivar e salvar", onConfirmar },
          onDispensar: vi.fn(),
        }}
      />
    );

    await user.type(screen.getByLabelText("nome"), "Cobrança{Enter}");
    expect(onConfirmar).toHaveBeenCalledWith("Cobrança");
  });

  it("arrastar o bubble move (e persiste), e o soltar NÃO conta como clique de abrir", () => {
    const onMudarAba = vi.fn();
    render(<AssistenteFlutuante aba={null} onMudarAba={onMudarAba} />);
    const fab = screen.getByTestId("assistente-flutuante");

    // jsdom não tem PointerEvent — MouseEvent com o tipo pointer* carrega o
    // clientX que o fallback do fireEvent perderia.
    const pointer = (tipo: string, x: number, y: number) =>
      fireEvent(fab, new MouseEvent(tipo, { bubbles: true, clientX: x, clientY: y }));
    pointer("pointerdown", 100, 100);
    pointer("pointermove", 160, 40);
    pointer("pointerup", 160, 40);
    fireEvent.click(fab);

    expect(onMudarAba).not.toHaveBeenCalled();
    expect(fab.style.left).not.toBe("");
    expect(localStorage.getItem("gerador:fab-assistente")).toBeTruthy();

    // O clique SEGUINTE, sem arrasto, volta a abrir normalmente.
    fireEvent.click(fab);
    expect(onMudarAba).toHaveBeenCalledWith("conversa");
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

/**
 * §308 — RELATO REAL, com captura: *"aqui cortou parte do texto da
 * configuração"* — a aba "⚙ Configurar" aparecia como "⚙ Configura".
 *
 * Medido contra a stack local: a fileira tem 418 px e as três abas mais o ×
 * precisam de 471. Com `nowrap` dentro de uma janela `overflow: hidden`, a
 * terceira sumia pela borda.
 *
 * ## Por que a régua é de LARGURA, e não de presença
 *
 * O botão continua no DOM e continua "visível" para o CSS — ele só está fora da
 * moldura. `toBeVisible()` passaria dos dois lados, como no §302. O que prova o
 * conserto é a fileira caber: `scrollWidth` não pode passar de `clientWidth`.
 *
 * jsdom não faz layout, então a medição de verdade é a do E2E. O que este teste
 * guarda é a ESTRUTURA que permite a quebra — e ela é fácil de desfazer sem
 * querer, porque "um `<div>` a mais" parece ruído para quem não conhece a
 * história.
 */
describe("AssistenteFlutuante — as abas não podem ser cortadas (§308)", () => {
  it("as abas ficam numa fileira que QUEBRA, e o × fora dela", () => {
    render(
      <AssistenteFlutuante aba="conversa" onMudarAba={vi.fn()}>
        <div>conteúdo</div>
      </AssistenteFlutuante>
    );

    const fechar = screen.getByLabelText("Fechar assistente");
    const fileira = screen.getByRole("button", { name: /Configurar/ }).parentElement!;

    expect(fileira.style.flexWrap).toBe("wrap");
    // Sem `minWidth: 0` um filho flex não encolhe abaixo do próprio conteúdo, e
    // a quebra nunca aconteceria.
    expect(fileira.style.minWidth).toBe("0");
    // O × mora FORA da fileira: dentro dela, ele quebraria junto com as abas.
    expect(fileira.contains(fechar)).toBe(false);
  });

  it("as três abas continuam lá — quebrar não é esconder", () => {
    render(
      <AssistenteFlutuante aba="conversa" onMudarAba={vi.fn()}>
        <div>conteúdo</div>
      </AssistenteFlutuante>
    );

    expect(screen.getByRole("button", { name: /Desenhar conversando/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Contexto da demanda/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Configurar/ })).toBeInTheDocument();
  });
});
