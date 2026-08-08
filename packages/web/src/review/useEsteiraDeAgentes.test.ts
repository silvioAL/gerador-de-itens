import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { TAM_LOTE_ESTEIRA, extrairRespostasParciaisAninhadas, useEsteiraDeAgentes, type ItemFilaEsteira } from "./useEsteiraDeAgentes";

const apiIaSugerirPipelineMock = vi.hoisted(() => vi.fn());
vi.mock("../api/client", () => ({ apiIa: { sugerirPipeline: apiIaSugerirPipelineMock } }));

interface PedidoLote {
  contextoEpico?: string;
  itens: { chave: string; rotulo: string; contextoNo: string; placeholders: { chave: string }[] }[];
}

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

/** Resposta aninhada item→chave→valor no formato que a rota de lote devolve. */
function respostaDoLote(papel: string, pedido: PedidoLote) {
  return Object.fromEntries(
    pedido.itens.map((i) => [i.chave, Object.fromEntries(i.placeholders.map((p) => [p.chave, `resposta ${papel}/${i.chave}/${p.chave}`]))])
  );
}

describe("extrairRespostasParciaisAninhadas (SPEC-24 Fase E — o que o modelo escreve, por item e por chave)", () => {
  it("JSON aninhado completo: extrai todos os itens e pares", () => {
    expect(
      extrairRespostasParciaisAninhadas('{"a1": {"_historiaUsuario": "Como analista, quero X", "_criteriosAceite": "1. Y"}, "a2": {"_historiaUsuario": "Como gestor, quero Z"}}')
    ).toEqual({
      a1: { _historiaUsuario: "Como analista, quero X", _criteriosAceite: "1. Y" },
      a2: { _historiaUsuario: "Como gestor, quero Z" },
    });
  });

  it("JSON INCOMPLETO (o modelo ainda escrevendo): o último valor vem até onde chegou", () => {
    expect(extrairRespostasParciaisAninhadas('{"a1": {"_historiaUsuario": "Como analista, quero rec')).toEqual({
      a1: { _historiaUsuario: "Como analista, quero rec" },
    });
  });

  it("escapes de aspas e quebras de linha viram texto de verdade", () => {
    expect(extrairRespostasParciaisAninhadas('{"a1": {"chave": "linha 1\\nlinha \\"dois\\""}}')).toEqual({
      a1: { chave: 'linha 1\nlinha "dois"' },
    });
  });
});

describe("useEsteiraDeAgentes (SPEC-24 — orquestração por papel × lotes de itens)", () => {
  it("processa papel por papel, o LOTE inteiro numa chamada só, antes de passar pro próximo (handoff)", async () => {
    const chamadas: string[] = [];
    apiIaSugerirPipelineMock.mockImplementation(async (papel: string, pedido: PedidoLote) => {
      chamadas.push(`${papel}:${pedido.itens.map((i) => i.rotulo).join("+")}`);
      return {};
    });
    const { result } = renderHook(() => useEsteiraDeAgentes({}));

    act(() => result.current.iniciar([item(1), item(2)]));
    await waitFor(() => expect(result.current.rodando).toBe(false));

    // Uma chamada por papel com os 2 itens juntos — não mais uma por item.
    expect(chamadas).toEqual([
      "po:Atividade 1+Atividade 2",
      "arquiteto:Atividade 1+Atividade 2",
      "especialista:Atividade 1+Atividade 2",
      "qa:Atividade 1+Atividade 2",
    ]);
  });

  it(`mais itens que o lote: quebra em grupos de ${TAM_LOTE_ESTEIRA}, cada grupo com o contexto completo de novo`, async () => {
    const chamadas: { papel: string; chaves: string[]; contextoEpico?: string }[] = [];
    apiIaSugerirPipelineMock.mockImplementation(async (papel: string, pedido: PedidoLote) => {
      chamadas.push({ papel, chaves: pedido.itens.map((i) => i.chave), contextoEpico: pedido.contextoEpico });
      return {};
    });
    const fila = Array.from({ length: TAM_LOTE_ESTEIRA + 2 }, (_, n) => item(n + 1));
    const { result } = renderHook(() => useEsteiraDeAgentes({ contextoEpico: "épico de crédito" }));

    act(() => result.current.iniciar(fila));
    await waitFor(() => expect(result.current.rodando).toBe(false));

    const doPo = chamadas.filter((c) => c.papel === "po");
    expect(doPo).toHaveLength(2);
    expect(doPo[0].chaves).toHaveLength(TAM_LOTE_ESTEIRA);
    expect(doPo[1].chaves).toEqual([`a${TAM_LOTE_ESTEIRA + 1}`, `a${TAM_LOTE_ESTEIRA + 2}`]);
    // "Recuperação do contexto": o segundo lote recebe o contexto do épico de novo.
    expect(doPo[1].contextoEpico).toBe("épico de crédito");
  });

  it("distribui a resposta aninhada de cada papel via onResponderItem, sugerido/não confirmado", async () => {
    apiIaSugerirPipelineMock.mockImplementation(async (papel: string, pedido: PedidoLote) => respostaDoLote(papel, pedido));
    const onResponderItem = vi.fn();
    const { result } = renderHook(() => useEsteiraDeAgentes({ onResponderItem }));

    act(() => result.current.iniciar([item(1), item(2)]));
    await waitFor(() => expect(result.current.rodando).toBe(false));

    expect(onResponderItem).toHaveBeenCalledWith("a1", "_historiaUsuario", {
      valor: "resposta po/a1/_historiaUsuario", origem: "sugerido", confirmado: false,
    });
    expect(onResponderItem).toHaveBeenCalledWith("a2", "_historiaUsuario", {
      valor: "resposta po/a2/_historiaUsuario", origem: "sugerido", confirmado: false,
    });
    expect(onResponderItem).toHaveBeenCalledWith("a1", "Backend::req1", {
      valor: "resposta especialista/a1/Backend::req1", origem: "sugerido", confirmado: false,
    });
    expect(onResponderItem).toHaveBeenCalledWith("a1", "_regrasTeste", {
      valor: "resposta qa/a1/_regrasTeste", origem: "sugerido", confirmado: false,
    });
  });

  it("respostasAoVivoPorItem reflete o streaming aninhado DURANTE a chamada, e limpa ao terminar; atual segue o item escrito", async () => {
    let emitir!: (acumulado: string) => void;
    let liberar!: () => void;
    apiIaSugerirPipelineMock.mockImplementationOnce(
      (_papel: string, _pedido: unknown, onTexto: (acumulado: string) => void) =>
        new Promise((resolve) => {
          emitir = onTexto;
          liberar = () => resolve({ a1: { _historiaUsuario: "final" } });
        })
    );
    const { result } = renderHook(() => useEsteiraDeAgentes({}));
    act(() => result.current.iniciar([item(1), item(2)]));

    // Antes do primeiro token: o lote inteiro está "escrevendo", e `atual`
    // cai no primeiro item do lote.
    await waitFor(() => expect(result.current.escrevendoChaves).toEqual(["a1", "a2"]));
    expect(result.current.atual?.atividadeChave).toBe("a1");

    act(() => emitir('{"a1": {"_historiaUsuario": "Como um analista de cré'));
    await waitFor(() =>
      expect(result.current.respostasAoVivoPorItem.a1?._historiaUsuario).toBe("Como um analista de cré")
    );

    // O modelo passou pro segundo item do lote — `atual` acompanha.
    act(() => emitir('{"a1": {"_historiaUsuario": "Como um analista"}, "a2": {"_historiaUsuario": "Como um gestor'));
    await waitFor(() => expect(result.current.atual?.atividadeChave).toBe("a2"));

    act(() => liberar());
    await waitFor(() => expect(result.current.respostasAoVivoPorItem).toEqual({}));
  });

  it("confirmacaoObrigatoria: false aplica direto (confirmado: true), sem pausa — SPEC-24 Fase E, achado real do usuário", async () => {
    apiIaSugerirPipelineMock.mockImplementation(async (papel: string, pedido: PedidoLote) => respostaDoLote(papel, pedido));
    const onResponderItem = vi.fn();
    const { result } = renderHook(() => useEsteiraDeAgentes({ confirmacaoObrigatoria: false, onResponderItem }));

    act(() => result.current.iniciar([item(1)]));
    await waitFor(() => expect(result.current.rodando).toBe(false));

    expect(onResponderItem).toHaveBeenCalledWith("a1", "_historiaUsuario", {
      valor: "resposta po/a1/_historiaUsuario", origem: "sugerido", confirmado: true,
    });
  });

  it("item sem nada pra um papel fica fora do lote desse papel, sem quebrar a esteira", async () => {
    const chamadas: { papel: string; chaves: string[] }[] = [];
    apiIaSugerirPipelineMock.mockImplementation(async (papel: string, pedido: PedidoLote) => {
      chamadas.push({ papel, chaves: pedido.itens.map((i) => i.chave) });
      return {};
    });
    const itemSemEspecialista: ItemFilaEsteira = { ...item(2), placeholdersPorPapel: { ...item(2).placeholdersPorPapel, especialista: [] } };

    const { result } = renderHook(() => useEsteiraDeAgentes({}));
    act(() => result.current.iniciar([item(1), itemSemEspecialista]));
    await waitFor(() => expect(result.current.rodando).toBe(false));

    expect(chamadas.find((c) => c.papel === "especialista")?.chaves).toEqual(["a1"]);
    expect(chamadas.find((c) => c.papel === "qa")?.chaves).toEqual(["a1", "a2"]);
  });

  it("nunca chama dois lotes em paralelo", async () => {
    let emVoo = 0;
    let maxSimultaneo = 0;
    apiIaSugerirPipelineMock.mockImplementation(async () => {
      emVoo++;
      maxSimultaneo = Math.max(maxSimultaneo, emVoo);
      await new Promise((r) => setTimeout(r, 5));
      emVoo--;
      return {};
    });
    const fila = Array.from({ length: TAM_LOTE_ESTEIRA + 2 }, (_, n) => item(n + 1));
    const { result } = renderHook(() => useEsteiraDeAgentes({}));
    act(() => result.current.iniciar(fila));
    await waitFor(() => expect(result.current.rodando).toBe(false));

    expect(maxSimultaneo).toBe(1);
  });

  it("papelAtual reflete o handoff em andamento", async () => {
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

  it("pausar interrompe antes do próximo lote; continuar retoma", async () => {
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
      .mockImplementationOnce(() => new Promise((resolve) => { liberarAntiga = () => resolve({ a1: { _historiaUsuario: "antiga" } }); }))
      .mockResolvedValue({});
    const onResponderItem = vi.fn();
    const { result } = renderHook(() => useEsteiraDeAgentes({ onResponderItem }));

    act(() => result.current.iniciar([item(1)]));
    act(() => result.current.iniciar([item(2)]));

    liberarAntiga();
    await waitFor(() => expect(result.current.rodando).toBe(false));

    expect(onResponderItem).not.toHaveBeenCalledWith("a1", expect.anything(), expect.anything());
  });
});
