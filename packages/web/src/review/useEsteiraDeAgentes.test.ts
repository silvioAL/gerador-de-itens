import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useEsteiraDeAgentes, type ItemFilaEsteira } from "./useEsteiraDeAgentes";

const apiIaSugerirPipelineMock = vi.hoisted(() => vi.fn());
vi.mock("../api/client", () => ({ apiIa: { sugerirPipeline: apiIaSugerirPipelineMock } }));

beforeEach(() => {
  apiIaSugerirPipelineMock.mockReset();
  apiIaSugerirPipelineMock.mockResolvedValue({});
});

function item(n: number): ItemFilaEsteira {
  return {
    atividadeChave: `a${n}`,
    atividadeRotulo: `Atividade ${n}`,
    contextoNo: "",
    placeholdersPorPapel: {
      po: [{ chave: "_historiaUsuario", tech: "", rotulo: "História de usuário" }],
      arquiteto: [{ chave: "_contratoRequest", tech: "", rotulo: "Request" }],
      especialista: [{ chave: `Backend::req${n}`, tech: "Backend", rotulo: `Requisito ${n}` }],
      qa: [{ chave: "_regrasTeste", tech: "", rotulo: "Regras de teste" }],
    },
  };
}

describe("useEsteiraDeAgentes (SPEC-24 — orquestração por papel × todos os itens)", () => {
  it("processa papel por papel, cada um em todos os itens, antes de passar pro próximo (handoff)", async () => {
    const chamadas: string[] = [];
    apiIaSugerirPipelineMock.mockImplementation(async (papel: string, pedido: { atividadeRotulo: string }) => {
      chamadas.push(`${papel}:${pedido.atividadeRotulo}`);
      return {};
    });
    const { result } = renderHook(() => useEsteiraDeAgentes({}));

    act(() => result.current.iniciar([item(1), item(2)]));
    await waitFor(() => expect(result.current.rodando).toBe(false));

    // PO nos 2 itens, depois Arquiteto nos 2 itens, depois Especialista, depois QA — nessa ordem.
    expect(chamadas).toEqual([
      "po:Atividade 1",
      "po:Atividade 2",
      "arquiteto:Atividade 1",
      "arquiteto:Atividade 2",
      "especialista:Atividade 1",
      "especialista:Atividade 2",
      "qa:Atividade 1",
      "qa:Atividade 2",
    ]);
  });

  it("distribui a resposta de cada papel via onResponderItem, sugerido/não confirmado", async () => {
    apiIaSugerirPipelineMock.mockImplementation(async (papel: string, pedido: { placeholders: { chave: string }[] }) =>
      Object.fromEntries(pedido.placeholders.map((p) => [p.chave, `resposta ${papel}/${p.chave}`]))
    );
    const onResponderItem = vi.fn();
    const { result } = renderHook(() => useEsteiraDeAgentes({ onResponderItem }));

    act(() => result.current.iniciar([item(1)]));
    await waitFor(() => expect(result.current.rodando).toBe(false));

    expect(onResponderItem).toHaveBeenCalledWith("a1", "_historiaUsuario", {
      valor: "resposta po/_historiaUsuario", origem: "sugerido", confirmado: false,
    });
    expect(onResponderItem).toHaveBeenCalledWith("a1", "_contratoRequest", {
      valor: "resposta arquiteto/_contratoRequest", origem: "sugerido", confirmado: false,
    });
    expect(onResponderItem).toHaveBeenCalledWith("a1", "Backend::req1", {
      valor: "resposta especialista/Backend::req1", origem: "sugerido", confirmado: false,
    });
    expect(onResponderItem).toHaveBeenCalledWith("a1", "_regrasTeste", {
      valor: "resposta qa/_regrasTeste", origem: "sugerido", confirmado: false,
    });
  });

  it("item sem nada pra um papel é pulado nesse papel, sem quebrar a esteira", async () => {
    const chamadas: string[] = [];
    apiIaSugerirPipelineMock.mockImplementation(async (papel: string, pedido: { atividadeRotulo: string }) => {
      chamadas.push(`${papel}:${pedido.atividadeRotulo}`);
      return {};
    });
    const itemSemEspecialista: ItemFilaEsteira = { ...item(2), placeholdersPorPapel: { ...item(2).placeholdersPorPapel, especialista: [] } };

    const { result } = renderHook(() => useEsteiraDeAgentes({}));
    act(() => result.current.iniciar([item(1), itemSemEspecialista]));
    await waitFor(() => expect(result.current.rodando).toBe(false));

    expect(chamadas.filter((c) => c.startsWith("especialista:"))).toEqual(["especialista:Atividade 1"]);
  });

  it("nunca chama duas sugestões em paralelo", async () => {
    let emVoo = 0;
    let maxSimultaneo = 0;
    apiIaSugerirPipelineMock.mockImplementation(async () => {
      emVoo++;
      maxSimultaneo = Math.max(maxSimultaneo, emVoo);
      await new Promise((r) => setTimeout(r, 5));
      emVoo--;
      return {};
    });
    const { result } = renderHook(() => useEsteiraDeAgentes({}));
    act(() => result.current.iniciar([item(1), item(2), item(3)]));
    await waitFor(() => expect(result.current.rodando).toBe(false));

    expect(maxSimultaneo).toBe(1);
  });

  it("papelAtual e atual refletem o handoff em andamento", async () => {
    let liberarPo!: () => void;
    apiIaSugerirPipelineMock
      .mockImplementationOnce(() => new Promise((resolve) => { liberarPo = () => resolve({}); }))
      // Os demais papéis nunca resolvem nesse teste — só interessa provar que
      // o handoff PO→Arquiteto aconteceu, sem a esteira inteira correr sozinha
      // rápido demais pro `waitFor` observar o estado intermediário.
      .mockImplementation(() => new Promise(() => {}));
    const { result } = renderHook(() => useEsteiraDeAgentes({}));
    act(() => result.current.iniciar([item(1)]));

    await waitFor(() => expect(result.current.papelAtual).toBe("po"));
    expect(result.current.atual?.atividadeChave).toBe("a1");

    act(() => liberarPo());
    await waitFor(() => expect(result.current.papelAtual).toBe("arquiteto"));
  });

  it("pausar interrompe antes da próxima chamada; continuar retoma", async () => {
    let liberarPrimeira!: () => void;
    apiIaSugerirPipelineMock
      .mockImplementationOnce(() => new Promise((resolve) => { liberarPrimeira = () => resolve({}); }))
      .mockImplementation(() => new Promise(() => {}));
    const { result } = renderHook(() => useEsteiraDeAgentes({}));

    act(() => result.current.iniciar([item(1), item(2)]));
    act(() => result.current.pausar());
    expect(result.current.pausado).toBe(true);

    act(() => liberarPrimeira());
    await new Promise((r) => setTimeout(r, 250));
    expect(apiIaSugerirPipelineMock).toHaveBeenCalledTimes(1);

    act(() => result.current.continuar());
    await waitFor(() => expect(apiIaSugerirPipelineMock).toHaveBeenCalledTimes(2));
  });

  it("iniciar de novo reinicia do zero, mesmo com execução anterior em voo (token invalida a antiga)", async () => {
    let liberarAntiga!: () => void;
    apiIaSugerirPipelineMock
      .mockImplementationOnce(() => new Promise((resolve) => { liberarAntiga = () => resolve({ _historiaUsuario: "antiga" }); }))
      .mockResolvedValue({ _historiaUsuario: "nova" });
    const onResponderItem = vi.fn();
    const { result } = renderHook(() => useEsteiraDeAgentes({ onResponderItem }));

    act(() => result.current.iniciar([item(1)]));
    act(() => result.current.iniciar([item(2)]));

    liberarAntiga();
    await waitFor(() => expect(result.current.rodando).toBe(false));

    expect(onResponderItem).not.toHaveBeenCalledWith("a1", expect.anything(), expect.anything());
  });
});
