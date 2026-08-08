import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useGeracaoAoVivo, type ItemFilaGeracao } from "./useGeracaoAoVivo";

const apiIaSugerirItemMock = vi.hoisted(() => vi.fn());
vi.mock("../api/client", () => ({ apiIa: { sugerirItem: apiIaSugerirItemMock } }));

beforeEach(() => {
  apiIaSugerirItemMock.mockReset();
});

function item(n: number): ItemFilaGeracao {
  return {
    atividadeChave: `a${n}`,
    atividadeRotulo: `Atividade ${n}`,
    contextoNo: "",
    placeholders: [
      { chave: "_historiaUsuario", tech: "", rotulo: "História de usuário" },
      { chave: `Backend::req${n}`, tech: "Backend", rotulo: `Requisito ${n}` },
    ],
  };
}

describe("useGeracaoAoVivo (Fase 1d-ii, SPEC-23 — orquestração por item via /ia/sugerir-item)", () => {
  it("processa a fila em sequência, chamando onResponderItem (sugerido, não confirmado) uma vez por placeholder devolvido", async () => {
    apiIaSugerirItemMock.mockImplementation(async (pedido: { atividadeRotulo: string; placeholders: { chave: string }[] }) =>
      Object.fromEntries(pedido.placeholders.map((p) => [p.chave, `resposta pra ${pedido.atividadeRotulo}/${p.chave}`]))
    );
    const onResponderItem = vi.fn();
    const { result } = renderHook(() => useGeracaoAoVivo({ onResponderItem }));

    act(() => result.current.iniciar([item(1), item(2)]));

    await waitFor(() => expect(result.current.rodando).toBe(false));

    expect(apiIaSugerirItemMock).toHaveBeenCalledTimes(2);
    expect(onResponderItem).toHaveBeenCalledWith("a1", "_historiaUsuario", {
      valor: "resposta pra Atividade 1/_historiaUsuario",
      origem: "sugerido",
      confirmado: false,
    });
    expect(onResponderItem).toHaveBeenCalledWith("a1", "Backend::req1", {
      valor: "resposta pra Atividade 1/Backend::req1",
      origem: "sugerido",
      confirmado: false,
    });
    expect(onResponderItem).toHaveBeenCalledWith("a2", "_historiaUsuario", {
      valor: "resposta pra Atividade 2/_historiaUsuario",
      origem: "sugerido",
      confirmado: false,
    });
    expect(onResponderItem).toHaveBeenCalledTimes(4); // 2 placeholders x 2 itens
    expect(result.current.progresso).toEqual({ feito: 2, total: 2 });
  });

  it("nunca chama duas sugestões em paralelo — a segunda só começa depois da primeira resolver", async () => {
    let resolvidas = 0;
    let emVooSimultaneo = 0;
    let maxSimultaneo = 0;
    apiIaSugerirItemMock.mockImplementation(async () => {
      emVooSimultaneo++;
      maxSimultaneo = Math.max(maxSimultaneo, emVooSimultaneo);
      await new Promise((r) => setTimeout(r, 10));
      emVooSimultaneo--;
      resolvidas++;
      return {};
    });
    const { result } = renderHook(() => useGeracaoAoVivo({}));
    act(() => result.current.iniciar([item(1), item(2), item(3)]));

    await waitFor(() => expect(resolvidas).toBe(3));
    expect(maxSimultaneo).toBe(1);
  });

  it("atual reflete o item (atividade) em processamento", async () => {
    let liberar!: () => void;
    apiIaSugerirItemMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          liberar = () => resolve({});
        })
    );
    const { result } = renderHook(() => useGeracaoAoVivo({}));
    act(() => result.current.iniciar([item(1)]));

    await waitFor(() => expect(result.current.atual?.atividadeChave).toBe("a1"));

    act(() => liberar());
    await waitFor(() => expect(result.current.rodando).toBe(false));
  });

  it("falha isolada num item não trava a fila — segue pro próximo", async () => {
    apiIaSugerirItemMock
      .mockRejectedValueOnce(new Error("modelo travou"))
      .mockResolvedValueOnce({ _historiaUsuario: "ok no segundo" });
    const onResponderItem = vi.fn();
    const { result } = renderHook(() => useGeracaoAoVivo({ onResponderItem }));

    act(() => result.current.iniciar([item(1), item(2)]));
    await waitFor(() => expect(result.current.rodando).toBe(false));

    expect(apiIaSugerirItemMock).toHaveBeenCalledTimes(2);
    expect(onResponderItem).toHaveBeenCalledTimes(1);
    expect(onResponderItem).toHaveBeenCalledWith("a2", "_historiaUsuario", {
      valor: "ok no segundo",
      origem: "sugerido",
      confirmado: false,
    });
  });

  it("pausar interrompe antes da próxima chamada de rede — não corta uma em andamento", async () => {
    let liberarPrimeira!: () => void;
    apiIaSugerirItemMock
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            liberarPrimeira = () => resolve({});
          })
      )
      .mockResolvedValueOnce({});
    const { result } = renderHook(() => useGeracaoAoVivo({}));

    act(() => result.current.iniciar([item(1), item(2)]));
    act(() => result.current.pausar());
    expect(result.current.pausado).toBe(true);

    act(() => liberarPrimeira());
    // Mesmo depois da primeira resolver, a segunda não dispara enquanto pausado.
    await new Promise((r) => setTimeout(r, 250));
    expect(apiIaSugerirItemMock).toHaveBeenCalledTimes(1);

    act(() => result.current.continuar());
    await waitFor(() => expect(apiIaSugerirItemMock).toHaveBeenCalledTimes(2));
  });

  it("iniciar de novo (Gerar de novo) reinicia do zero, mesmo com uma execução anterior ainda em voo", async () => {
    let liberarAntiga!: () => void;
    apiIaSugerirItemMock
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            liberarAntiga = () => resolve({ _historiaUsuario: "antiga, deveria ser ignorada" });
          })
      )
      .mockResolvedValue({ _historiaUsuario: "nova" });
    const onResponderItem = vi.fn();
    const { result } = renderHook(() => useGeracaoAoVivo({ onResponderItem }));

    act(() => result.current.iniciar([item(1)]));
    act(() => result.current.iniciar([item(2)])); // reinicia antes da primeira terminar

    liberarAntiga();
    await waitFor(() => expect(result.current.rodando).toBe(false));

    // Só a resposta da fila NOVA conta — a antiga (token invalidado) nunca chama onResponderItem.
    expect(onResponderItem).toHaveBeenCalledTimes(1);
    expect(onResponderItem).toHaveBeenCalledWith("a2", "_historiaUsuario", { valor: "nova", origem: "sugerido", confirmado: false });
  });
});
