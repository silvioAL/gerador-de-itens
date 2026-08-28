import { afterEach, describe, expect, it, vi, beforeEach } from "vitest";
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
    anexosContexto: [{ nome: "ata-refinamento.md", conteudo: "conteúdo do anexo" }],
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
    // SPEC-71 fatia A — os três campos que a fixture não citava, e que por isso
    // o laço abaixo nunca conferia. O teste dizia "TODO campo que o servidor
    // devolveu" e media só o que a fixture lembrava: uma prova que envelhece
    // junto com quem a escreveu. Estes três somem no `abrirPorId` hoje.
    volumetria: { quantidade: 2000000, por: "dia" as const },
    cenariosDeLentidao: [
      {
        id: "cen-bureau",
        nome: "Bureau lento no pico",
        origem: "manual" as const,
        estado: "aceito" as const,
        fatorDeVolume: 10,
        debito: { motivo: "vale a pena até o próximo trimestre", autor: "ana", em: "2026-08-15T10:00:00.000Z" },
        ajustes: [{ tipo: "no" as const, id: "n1", fator: 3, tentativas: 2, disjuntor: true, taxaRps: 50 }],
      },
    ],
    leiturasDispensadas: [{ noId: "n1", tipo: "fan-out", autor: "ana", em: "2026-08-15T10:00:00.000Z" }],
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
    // SPEC-71 — `anexosContexto` SAIU da lista de ignorados: ele estava aqui
    // porque a leitura convertia `string[]` em `{ nome, conteudo }[]`, e essa
    // conversão só existia de um lado — a escrita mandava objeto, e a borda
    // respondia 400. Com as duas pontas falando a mesma forma, não há o que
    // ignorar, e o campo passa a ser conferido pelo mesmo laço que os outros.
    const ignorados = new Set(["id", "criadoEm", "atualizadoEm", "especificacaoGeradaEm"]);
    for (const [chave, valor] of Object.entries(salva)) {
      if (ignorados.has(chave)) continue;
      expect({ campo: chave, valor: (aberta as unknown as Record<string, unknown>)[chave] }).toEqual({ campo: chave, valor });
    }
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

/**
 * SPEC-72 fatia B — o que está pendente quando a aba fecha.
 *
 * O debounce de 2 s cancela o salvamento a cada tecla, que é o objetivo. Mas
 * fechar a aba com o timer armado perdia os últimos 2 s de trabalho, **sem
 * aviso** — e o campo mais afetado é justamente o que o pedido citou: o
 * contexto da demanda, digitado em prosa longa.
 *
 * Antes desta rodada, `beforeunload`, `visibilitychange` e `pagehide` tinham
 * ZERO ocorrências em todo o `packages/web`.
 */
describe("usePersistencia — o flush ao sair (SPEC-72 fatia B)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(apiQuebras.listar).mockResolvedValue([]);
    vi.mocked(apiQuebras.atualizar).mockResolvedValue({ id: "q1" } as never);
    vi.mocked(apiQuebras.buscar).mockResolvedValue({
      id: "q1",
      titulo: "Catálogo",
      diagrama: { nodes: [], edges: [] },
      criadoEm: "2026-08-15T10:00:00.000Z",
      atualizadoEm: "2026-08-15T10:00:00.000Z",
    } as never);
  });
  afterEach(() => vi.useRealTimers());

  /** Abre uma quebra (para haver `quebraId`) e a edita, deixando o timer armado. */
  async function comEdicaoPendente() {
    const aoAbrir = vi.fn();
    const { result, rerender } = renderHook(({ q }: { q: Quebra }) => usePersistencia(q, aoAbrir), {
      initialProps: { q: VAZIA },
    });
    await act(async () => {
      await result.current.abrirPorId("q1");
    });
    vi.mocked(apiQuebras.atualizar).mockClear();

    // Uma edição: o efeito arma o relógio de 2 s e NÃO salva ainda.
    rerender({ q: { ...VAZIA, titulo: "Catálogo", demandInfo: "prosa longa em andamento" } });
    expect(apiQuebras.atualizar).not.toHaveBeenCalled();
    return result;
  }

  it("fechar a aba grava o que o debounce ainda segurava", async () => {
    await comEdicaoPendente();

    window.dispatchEvent(new Event("beforeunload"));

    expect(apiQuebras.atualizar).toHaveBeenCalledTimes(1);
    expect(vi.mocked(apiQuebras.atualizar).mock.calls[0][1].demandInfo).toBe("prosa longa em andamento");
  });

  it("a aba ficar oculta também grava — `beforeunload` não é confiável em móvel", async () => {
    await comEdicaoPendente();

    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));

    expect(apiQuebras.atualizar).toHaveBeenCalledTimes(1);
  });

  it("mas VOLTAR para a aba não grava — trocar de janela não é escrever", async () => {
    // Sem esta guarda, cada alt-tab viraria um PUT, que é exatamente a
    // frequência que o debounce existe para evitar.
    await comEdicaoPendente();

    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));

    expect(apiQuebras.atualizar).not.toHaveBeenCalled();
  });

  it("sem nada pendente, sair não dispara escrita nenhuma", async () => {
    const aoAbrir = vi.fn();
    const { result } = renderHook(() => usePersistencia(VAZIA, aoAbrir));
    await act(async () => {
      await result.current.abrirPorId("q1");
    });
    vi.mocked(apiQuebras.atualizar).mockClear();

    window.dispatchEvent(new Event("beforeunload"));

    expect(apiQuebras.atualizar).not.toHaveBeenCalled();
  });
});
