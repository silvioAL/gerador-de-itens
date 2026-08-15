import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import type { Quebra } from "@gerador/engine";
import { usePersistencia } from "./usePersistencia";
import { apiQuebras } from "../api/client";

vi.mock("../api/client", () => ({
  apiQuebras: { listar: vi.fn(), buscar: vi.fn(), criar: vi.fn(), atualizar: vi.fn() },
}));

const VAZIA: Quebra = { diagrama: { nodes: [], edges: [] } };

/**
 * §250 — o teste que existe por causa de um defeito que voltou TRÊS vezes.
 *
 * `abrirPorId` reconstrói a quebra campo a campo. O §184 já tinha corrigido
 * isso uma vez ("antes só vinham título/time/diagrama"), e desde então cada
 * campo novo — produto (SPEC-53), necessidades (fatia A), decisões (C),
 * exceções, percursos (E), documento (SPEC-58) — foi esquecido de novo.
 * Reabrir a demanda apagava tudo isso em silêncio, e o autosave seguinte
 * gravava o vazio por cima do que estava salvo.
 *
 * A régua deste arquivo: **não conferir campo escolhido a dedo**. Conferir a
 * quebra INTEIRA contra o que o servidor devolveu — assim, campo novo que
 * alguém esquecer aqui quebra o teste no mesmo commit em que nasce.
 */
describe("usePersistencia.abrirPorId — reabrir não pode perder campo (§250)", () => {
  beforeEach(() => {
    vi.mocked(apiQuebras.listar).mockResolvedValue([]);
  });

  const salva = {
    id: "q1",
    titulo: "Catálogo",
    time: "time-pagamentos",
    diagrama: { nodes: [], edges: [] },
    respostasItens: { "n1::criacao": {} },
    demandInfo: "Reduzir a latência.",
    anexosContexto: ["conteúdo do anexo"],
    produtoId: "produto-1",
    necessidades: [{ id: "r1", texto: "não cobrar duas vezes", origem: "manual" as const, atendidaPor: ["n1"] }],
    decisoes: [
      {
        id: "d1",
        titulo: "Fila em vez de síncrono",
        alternativas: [{ titulo: "Fila" }, { titulo: "Síncrono" }],
        escolhida: "Fila",
        porque: "desacopla",
        status: "aceita" as const,
        origem: "manual" as const,
        autor: "ana",
        em: "2026-08-15T10:00:00.000Z",
      },
    ],
    excecoes: [{ noId: "n1", campo: "timeoutMs", motivo: "parceiro lento", autor: "ana", em: "2026-08-15T10:00:00.000Z" }],
    percursos: [{ id: "pc::n1>n2", rotulo: "a → b", nos: ["n1", "n2"], origem: "inferido" as const, confirmado: true }],
    especificacao: "# doc",
    documentoEscrito: { tradeOffs: "aceitamos latência", riscos: "o parceiro muda o contrato" },
    documentoStatus: "aprovado" as const,
    criadoEm: "2026-08-15T10:00:00.000Z",
    atualizadoEm: "2026-08-15T10:00:00.000Z",
  };

  it("traz TODO campo que o servidor devolveu — nenhum fica para trás", async () => {
    vi.mocked(apiQuebras.buscar).mockResolvedValue(salva as never);
    const aoAbrir = vi.fn();
    const { result } = renderHook(() => usePersistencia(VAZIA, aoAbrir));

    await act(async () => {
      await result.current.abrirPorId("q1");
    });

    await waitFor(() => expect(aoAbrir).toHaveBeenCalled());
    const aberta = aoAbrir.mock.calls[0][0] as Quebra;

    // A conferência é do CONJUNTO, não de campos escolhidos: é isso que faz o
    // teste pegar o campo que ainda nem existe hoje.
    const ignorados = new Set(["id", "criadoEm", "atualizadoEm", "anexosContexto", "especificacaoGeradaEm"]);
    for (const [chave, valor] of Object.entries(salva)) {
      if (ignorados.has(chave)) continue;
      expect({ campo: chave, valor: (aberta as unknown as Record<string, unknown>)[chave] }).toEqual({ campo: chave, valor });
    }

    // Anexos têm forma própria (o servidor guarda só o conteúdo; a tela quer
    // nome + conteúdo), então são conferidos à parte em vez de ignorados.
    expect(aberta.anexosContexto).toEqual([{ nome: "anexo-1.txt", conteudo: "conteúdo do anexo" }]);
  });

  it("campo ausente no servidor não vira string vazia nem objeto fantasma", async () => {
    // Quebra antiga, criada antes destes campos existirem: reabrir não pode
    // inventar valor — `undefined` é a afirmação correta ("nada se sabe").
    vi.mocked(apiQuebras.buscar).mockResolvedValue({
      id: "q2",
      titulo: "Antiga",
      time: null,
      diagrama: { nodes: [], edges: [] },
      criadoEm: "2026-01-01T00:00:00.000Z",
      atualizadoEm: "2026-01-01T00:00:00.000Z",
    } as never);
    const aoAbrir = vi.fn();
    const { result } = renderHook(() => usePersistencia(VAZIA, aoAbrir));

    await act(async () => {
      await result.current.abrirPorId("q2");
    });

    const aberta = aoAbrir.mock.calls[0][0] as Quebra;
    expect(aberta.documentoStatus).toBeUndefined();
    expect(aberta.decisoes).toBeUndefined();
    expect(aberta.time).toBeUndefined();
  });
});
