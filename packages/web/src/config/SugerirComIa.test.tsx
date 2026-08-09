import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { SugerirComIa } from "./SugerirComIa";

const sugerirConfigMock = vi.hoisted(() => vi.fn());
vi.mock("../api/client", async (importActual) => ({
  ...(await importActual<typeof import("../api/client")>()),
  apiIa: { sugerirConfig: sugerirConfigMock },
}));

beforeEach(() => {
  sugerirConfigMock.mockReset();
});

describe("SugerirComIa (SPEC-23 Fluxo 2 — configurar com apoio de IA)", () => {
  it("manda alvo, instrução e contexto, e entrega o objeto pronto pra quem chamou", async () => {
    sugerirConfigMock.mockResolvedValue({ key: "retencao", label: "Retenção" });
    const onSugestao = vi.fn();
    render(
      <SugerirComIa alvo="campo-no" contexto="Tipo de nó: Fila Rabbit." exemplo="ex.: campo de retenção" onSugestao={onSugestao} />
    );

    fireEvent.change(screen.getByLabelText("Descreva o que a IA deve propor"), {
      target: { value: "quero registrar por quantos dias a mensagem fica na fila" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Sugerir/ }));

    await waitFor(() => expect(onSugestao).toHaveBeenCalledWith({ key: "retencao", label: "Retenção" }));
    expect(sugerirConfigMock).toHaveBeenCalledWith(
      {
        alvo: "campo-no",
        instrucao: "quero registrar por quantos dias a mensagem fica na fila",
        contexto: "Tipo de nó: Fila Rabbit.",
      },
      expect.any(Function)
    );
  });

  it("mostra o que o modelo está escrevendo enquanto gera — a espera de minutos não pode parecer travamento", async () => {
    let emitir!: (parcial: string) => void;
    sugerirConfigMock.mockImplementation(
      (_pedido: unknown, onTexto: (t: string) => void) =>
        new Promise(() => {
          emitir = onTexto;
        })
    );
    render(<SugerirComIa alvo="papel" exemplo="ex.: agente de segurança" onSugestao={vi.fn()} />);

    fireEvent.change(screen.getByLabelText("Descreva o que a IA deve propor"), { target: { value: "agente de segurança" } });
    fireEvent.click(screen.getByRole("button", { name: /Sugerir/ }));

    await waitFor(() => expect(screen.getByRole("button", { name: /pensando/ })).toBeTruthy());
    emitir('{"id": "seguran');
    await waitFor(() => expect(screen.getByTestId("sugerir-ia-parcial").textContent).toBe('{"id": "seguran'));
  });

  it("falha do modelo aparece na tela e não derruba o formulário", async () => {
    sugerirConfigMock.mockRejectedValue(new Error("modelos de IA não instalados"));
    const onSugestao = vi.fn();
    render(<SugerirComIa alvo="campo-no" exemplo="ex.: campo novo" onSugestao={onSugestao} />);

    fireEvent.change(screen.getByLabelText("Descreva o que a IA deve propor"), { target: { value: "qualquer coisa" } });
    fireEvent.click(screen.getByRole("button", { name: /Sugerir/ }));

    await waitFor(() => expect(screen.getByText("modelos de IA não instalados")).toBeTruthy());
    expect(onSugestao).not.toHaveBeenCalled();
  });

  it("instrução vazia não chama o modelo — botão desabilitado", () => {
    render(<SugerirComIa alvo="campo-no" exemplo="ex.: campo novo" onSugestao={vi.fn()} />);
    const botao = screen.getByRole("button", { name: /Sugerir/ }) as HTMLButtonElement;
    expect(botao.disabled).toBe(true);
    fireEvent.click(botao);
    expect(sugerirConfigMock).not.toHaveBeenCalled();
  });
});
