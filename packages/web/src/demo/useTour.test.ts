import { describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import type { Quebra } from "@gerador/engine";
import { useTour } from "./useTour";
import type { Cenario } from "./scenarios";

const cenarioMongo: Cenario = {
  id: "mongo",
  titulo: "Dados não-relacionais",
  descricao: "Coleção Mongo nova.",
  tipos: ["service", "mongo"],
  categoria: "demo",
  designPatterns: [],
  quebra: { diagrama: { nodes: [], edges: [] } } as Quebra,
};

function montarOpts() {
  return {
    cenarios: [cenarioMongo],
    carregarCenario: vi.fn(),
    selecionarNo: vi.fn(),
    derivarQuebra: vi.fn(),
    fecharRevisao: vi.fn(),
    abrirConfigNaAba: vi.fn(),
    fecharJornada: vi.fn(),
    fecharConfig: vi.fn(),
  };
}

describe("useTour", () => {
  it("começa inativo", () => {
    const { result } = renderHook(() => useTour(montarOpts()));
    expect(result.current.ativo).toBe(false);
    expect(result.current.passoAtual).toBeNull();
  });

  it("iniciar() ativa o tour, carrega o cenário do tour (recebido por parâmetro, não importado) e limpa seleção/revisão", () => {
    const opts = montarOpts();
    const { result } = renderHook(() => useTour(opts));

    act(() => result.current.iniciar());

    expect(result.current.ativo).toBe(true);
    expect(result.current.indice).toBe(0);
    expect(opts.carregarCenario).toHaveBeenCalledWith(cenarioMongo.quebra);
    expect(opts.selecionarNo).toHaveBeenCalledWith(null);
    expect(opts.fecharRevisao).toHaveBeenCalled();
  });

  it("sem o cenário 'mongo' na lista recebida, iniciar() não quebra (só não carrega nada)", () => {
    const opts = { ...montarOpts(), cenarios: [] };
    const { result } = renderHook(() => useTour(opts));

    expect(() => act(() => result.current.iniciar())).not.toThrow();
    expect(opts.carregarCenario).not.toHaveBeenCalled();
  });

  it("avança até o passo que seleciona o nó do painel de propriedades", () => {
    const opts = montarOpts();
    const { result } = renderHook(() => useTour(opts));

    act(() => result.current.iniciar());
    act(() => result.current.proximo()); // -> passo 1 (diagrama)
    act(() => result.current.proximo()); // -> passo 2 (prontidão)
    act(() => result.current.proximo()); // -> passo 3 (proveniência): seleciona n2

    expect(opts.selecionarNo).toHaveBeenCalledWith("n2");
    expect(result.current.passoAtual?.selector).toBe("[data-tour=properties-panel]");
  });

  it("avança até o passo de revisão e chama derivarQuebra", () => {
    const opts = montarOpts();
    const { result } = renderHook(() => useTour(opts));

    act(() => result.current.iniciar());
    for (let i = 0; i < 5; i++) act(() => result.current.proximo());

    expect(opts.derivarQuebra).toHaveBeenCalled();
    expect(result.current.passoAtual?.selector).toBe("[data-tour=review-table]");
  });

  it("passa pela aba Perfis de time antes do fim, abrindo a tela de config na aba certa", () => {
    const opts = montarOpts();
    const { result } = renderHook(() => useTour(opts));

    act(() => result.current.iniciar());
    for (let i = 0; i < 7; i++) act(() => result.current.proximo()); // -> passo 7 (Perfis de time)

    expect(result.current.passoAtual?.titulo).toBe("Perfis de time");
    expect(result.current.passoAtual?.selector).toBe("[data-tour=config-screen-content]");
    expect(opts.abrirConfigNaAba).toHaveBeenCalledWith("perfis");
  });

  it("passa por Campos por tipo de nó e Modelo da especificação de solução, abrindo a aba certa em cada um", () => {
    const opts = montarOpts();
    const { result } = renderHook(() => useTour(opts));

    act(() => result.current.iniciar());
    for (let i = 0; i < 8; i++) act(() => result.current.proximo()); // -> passo 8 (Campos por tipo de nó)

    expect(result.current.passoAtual?.titulo).toBe("Campos por tipo de nó");
    expect(opts.abrirConfigNaAba).toHaveBeenCalledWith("campos");

    act(() => result.current.proximo()); // -> passo 9 (Modelo da especificação de solução)

    expect(result.current.passoAtual?.titulo).toBe("Modelo da especificação de solução");
    expect(opts.abrirConfigNaAba).toHaveBeenCalledWith("especificacao");
  });

  it("chegar ao último passo marca ultimo=true, fecha a tela de config, e avançar dele encerra o tour e fecha a revisão", () => {
    const opts = montarOpts();
    const { result } = renderHook(() => useTour(opts));

    act(() => result.current.iniciar());
    const total = result.current.total;
    for (let i = 0; i < total - 1; i++) act(() => result.current.proximo());

    expect(result.current.ultimo).toBe(true);
    expect(opts.fecharConfig).toHaveBeenCalled();
    opts.fecharRevisao.mockClear();

    act(() => result.current.proximo());

    expect(result.current.ativo).toBe(false);
    expect(opts.fecharRevisao).toHaveBeenCalled();
  });

  it("pular() encerra o tour em qualquer passo e fecha a modal da jornada, se estiver aberta", () => {
    const opts = montarOpts();
    const { result } = renderHook(() => useTour(opts));

    act(() => result.current.iniciar());
    act(() => result.current.proximo());
    act(() => result.current.pular());

    expect(result.current.ativo).toBe(false);
    expect(result.current.passoAtual).toBeNull();
    expect(opts.fecharJornada).toHaveBeenCalled();
  });
});
