import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useGeracaoAoVivo, type ItemFilaGeracao } from "./useGeracaoAoVivo";

const apiIaSugerirMock = vi.hoisted(() => vi.fn());
vi.mock("../api/client", () => ({ apiIa: { sugerir: apiIaSugerirMock } }));

beforeEach(() => {
  apiIaSugerirMock.mockReset();
});

function item(n: number): ItemFilaGeracao {
  return { atividadeChave: `a${n}`, chavePlaceholder: `p${n}`, tech: "Backend", rotulo: `Requisito ${n}`, contextoNo: "" };
}

describe("useGeracaoAoVivo (Fase 1d, SPEC-23 — orquestração real sobre o streaming de 1c)", () => {
  it("processa a fila em sequência, chamando onResponderItem (sugerido, não confirmado) a cada item", async () => {
    apiIaSugerirMock.mockImplementation(async (pedido: { rotulo: string }) => ({ valor: `resposta pra ${pedido.rotulo}` }));
    const onResponderItem = vi.fn();
    const { result } = renderHook(() => useGeracaoAoVivo({ onResponderItem }));

    act(() => result.current.iniciar([item(1), item(2)]));

    await waitFor(() => expect(result.current.rodando).toBe(false));

    expect(apiIaSugerirMock).toHaveBeenCalledTimes(2);
    expect(onResponderItem).toHaveBeenNthCalledWith(1, "a1", "p1", {
      valor: "resposta pra Requisito 1",
      origem: "sugerido",
      confirmado: false,
    });
    expect(onResponderItem).toHaveBeenNthCalledWith(2, "a2", "p2", {
      valor: "resposta pra Requisito 2",
      origem: "sugerido",
      confirmado: false,
    });
    expect(result.current.progresso).toEqual({ feito: 2, total: 2 });
  });

  it("nunca chama duas sugestões em paralelo — a segunda só começa depois da primeira resolver", async () => {
    let resolvidas = 0;
    let emVooSimultaneo = 0;
    let maxSimultaneo = 0;
    apiIaSugerirMock.mockImplementation(async () => {
      emVooSimultaneo++;
      maxSimultaneo = Math.max(maxSimultaneo, emVooSimultaneo);
      await new Promise((r) => setTimeout(r, 10));
      emVooSimultaneo--;
      resolvidas++;
      return { valor: "ok" };
    });
    const { result } = renderHook(() => useGeracaoAoVivo({}));
    act(() => result.current.iniciar([item(1), item(2), item(3)]));

    await waitFor(() => expect(resolvidas).toBe(3));
    expect(maxSimultaneo).toBe(1);
  });

  it("atual reflete o item em processamento, e o texto parcial cresce a cada pedaço do streaming", async () => {
    let liberar!: () => void;
    apiIaSugerirMock.mockImplementationOnce((_pedido: unknown, onPedaco?: (p: string) => void) => {
      onPedaco?.("resposta");
      return new Promise((resolve) => {
        liberar = () => resolve({ valor: "resposta completa" });
      });
    });
    const { result } = renderHook(() => useGeracaoAoVivo({}));
    act(() => result.current.iniciar([item(1)]));

    await waitFor(() => expect(result.current.atual?.atividadeChave).toBe("a1"));
    await waitFor(() => expect(result.current.textoParcial).toBe("resposta"));

    act(() => liberar());
    await waitFor(() => expect(result.current.rodando).toBe(false));
  });

  it("falha isolada num item não trava a fila — segue pro próximo", async () => {
    apiIaSugerirMock.mockRejectedValueOnce(new Error("modelo travou")).mockResolvedValueOnce({ valor: "ok no segundo" });
    const onResponderItem = vi.fn();
    const { result } = renderHook(() => useGeracaoAoVivo({ onResponderItem }));

    act(() => result.current.iniciar([item(1), item(2)]));
    await waitFor(() => expect(result.current.rodando).toBe(false));

    expect(apiIaSugerirMock).toHaveBeenCalledTimes(2);
    expect(onResponderItem).toHaveBeenCalledTimes(1);
    expect(onResponderItem).toHaveBeenCalledWith("a2", "p2", { valor: "ok no segundo", origem: "sugerido", confirmado: false });
  });

  it("pausar interrompe antes da próxima chamada de rede — não corta uma em andamento", async () => {
    let liberarPrimeira!: () => void;
    apiIaSugerirMock
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            liberarPrimeira = () => resolve({ valor: "primeira" });
          })
      )
      .mockResolvedValueOnce({ valor: "segunda" });
    const { result } = renderHook(() => useGeracaoAoVivo({}));

    act(() => result.current.iniciar([item(1), item(2)]));
    act(() => result.current.pausar());
    expect(result.current.pausado).toBe(true);

    act(() => liberarPrimeira());
    // Mesmo depois da primeira resolver, a segunda não dispara enquanto pausado.
    await new Promise((r) => setTimeout(r, 250));
    expect(apiIaSugerirMock).toHaveBeenCalledTimes(1);

    act(() => result.current.continuar());
    await waitFor(() => expect(apiIaSugerirMock).toHaveBeenCalledTimes(2));
  });

  it("iniciar de novo (Gerar de novo) reinicia do zero, mesmo com uma execução anterior ainda em voo", async () => {
    let liberarAntiga!: () => void;
    apiIaSugerirMock
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            liberarAntiga = () => resolve({ valor: "antiga, deveria ser ignorada" });
          })
      )
      .mockResolvedValue({ valor: "nova" });
    const onResponderItem = vi.fn();
    const { result } = renderHook(() => useGeracaoAoVivo({ onResponderItem }));

    act(() => result.current.iniciar([item(1)]));
    act(() => result.current.iniciar([item(2)])); // reinicia antes da primeira terminar

    liberarAntiga();
    await waitFor(() => expect(result.current.rodando).toBe(false));

    // Só a resposta da fila NOVA conta — a antiga (token invalidado) nunca chama onResponderItem.
    expect(onResponderItem).toHaveBeenCalledTimes(1);
    expect(onResponderItem).toHaveBeenCalledWith("a2", "p2", { valor: "nova", origem: "sugerido", confirmado: false });
  });
});
