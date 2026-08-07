import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import type { Quebra } from "@gerador/engine";
import { ATRASO_MAXIMO_MS, useAutoDemo } from "./useAutoDemo";
import { DURACAO_TOTAL_TERMINAL_MS } from "./TerminalAnimado";
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

// Maior que ATRASO_MAXIMO_MS (13000ms) e que a duração mínima do passo "Linha
// de comando" (terminal animado digitando) — avança qualquer passo sem
// precisar calcular o tamanho exato do texto.
const ALEM_DE_QUALQUER_PASSO_MS = 16000;

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

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useAutoDemo", () => {
  it("começa inativo e parado", () => {
    const { result } = renderHook(() => useAutoDemo(montarOpts()));
    expect(result.current.ativo).toBe(false);
    expect(result.current.rodando).toBe(false);
  });

  it("play() ativa o tour e avança sozinho, chamando os mesmos onEnter dos passos", () => {
    const opts = montarOpts();
    const { result } = renderHook(() => useAutoDemo(opts));

    act(() => result.current.play());

    expect(result.current.ativo).toBe(true);
    expect(result.current.rodando).toBe(true);
    expect(result.current.indice).toBe(0);
    expect(opts.carregarCenario).toHaveBeenCalledWith(cenarioMongo.quebra);

    act(() => {
      vi.advanceTimersByTime(ALEM_DE_QUALQUER_PASSO_MS);
    });

    expect(result.current.indice).toBe(1);
  });

  it("pausar() para o avanço automático — o tempo passa e o passo não muda", () => {
    const { result } = renderHook(() => useAutoDemo(montarOpts()));

    act(() => result.current.play());
    act(() => result.current.pausar());

    expect(result.current.rodando).toBe(false);

    act(() => {
      vi.advanceTimersByTime(ALEM_DE_QUALQUER_PASSO_MS);
    });

    expect(result.current.indice).toBe(0);
  });

  it("play() depois de pausar() retoma o avanço automático", () => {
    const { result } = renderHook(() => useAutoDemo(montarOpts()));

    act(() => result.current.play());
    act(() => result.current.pausar());
    act(() => result.current.play());

    act(() => {
      vi.advanceTimersByTime(ALEM_DE_QUALQUER_PASSO_MS);
    });

    expect(result.current.indice).toBe(1);
  });

  it("pularPraFim() encerra a demo imediatamente, mesmo sem o timer disparar", () => {
    const opts = montarOpts();
    const { result } = renderHook(() => useAutoDemo(opts));

    act(() => result.current.play());
    act(() => result.current.pularPraFim());

    expect(result.current.ativo).toBe(false);
    expect(result.current.rodando).toBe(false);
    expect(opts.fecharJornada).toHaveBeenCalled();
  });

  it("passo 'Linha de comando' espera pelo menos o terminal animado terminar de digitar antes de avançar (achado real: cortava no meio)", () => {
    const { result } = renderHook(() => useAutoDemo(montarOpts()));
    // Maior dos dois pisos (teto por texto vs. duração do terminal) — o passo
    // nunca avança antes disso, seja qual for o que dominar.
    const esperaMinimaGarantida = Math.max(ATRASO_MAXIMO_MS, DURACAO_TOTAL_TERMINAL_MS);

    act(() => result.current.play());
    while (result.current.passoAtual?.titulo !== "Linha de comando") {
      act(() => {
        vi.advanceTimersByTime(ALEM_DE_QUALQUER_PASSO_MS);
      });
    }
    const indiceLinhaDeComando = result.current.indice;

    act(() => {
      vi.advanceTimersByTime(esperaMinimaGarantida - 500);
    });
    expect(result.current.indice).toBe(indiceLinhaDeComando);

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current.indice).toBe(indiceLinhaDeComando + 1);
  });

  it("deixado rodando sozinho, percorre todos os passos e encerra no final", () => {
    const { result } = renderHook(() => useAutoDemo(montarOpts()));

    act(() => result.current.play());
    const total = result.current.total;

    for (let i = 0; i < total && result.current.ativo; i++) {
      act(() => {
        vi.advanceTimersByTime(ALEM_DE_QUALQUER_PASSO_MS);
      });
    }

    expect(result.current.ativo).toBe(false);
  });
});
