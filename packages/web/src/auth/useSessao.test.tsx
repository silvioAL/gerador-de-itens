import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { aoPerderSessao } from "../api/client";
import { useSessao } from "./useSessao";

/**
 * §267 — a sessão que morre com a aba aberta.
 *
 * O cookie dura 12h e só era conferido no boot. Passado o prazo, o app
 * continuava se achando logado — cabeçalho com o time ativo, menu funcionando —
 * e cada chamada virava um "sessão inválida ou ausente" vermelho na tela onde
 * calhasse. Um problema do app inteiro dito uma vez por tela, e em nenhuma
 * delas onde se resolve.
 */
function respostaFalsa(corpo: unknown, status = 200): Response {
  return {
    ok: status < 400,
    status,
    json: async () => corpo,
  } as unknown as Response;
}

const SESSAO = { email: "silvio@exemplo", timeIds: ["time-silvio"] };

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});
afterEach(() => {
  vi.unstubAllGlobals();
  aoPerderSessao(null);
});

describe("useSessao — a sessão perdida no meio do caminho", () => {
  it("401 DEPOIS de ter sessão devolve ao login, dizendo o que houve", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(respostaFalsa(SESSAO));
    const { result } = renderHook(() => useSessao());
    await waitFor(() => expect(result.current.sessao).toEqual(SESSAO));

    // O que acontece de verdade quando o cookie expira: a próxima chamada
    // qualquer volta 401, e o cliente avisa.
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      respostaFalsa({ erro: "sessão inválida ou ausente" }, 401)
    );
    await act(async () => {
      await import("../api/client").then(({ apiProdutos }) => apiProdutos.listar().catch(() => []));
    });

    expect(result.current.sessao).toBeNull();
    expect(result.current.expirou).toBe(true);
    expect(result.current.erro).toContain("expirou");
  });

  it("401 SEM sessão não vira 'expirou' — seria mentir para quem nunca entrou", async () => {
    // O caso real: uma chamada atrasada respondendo 401 quando não há sessão —
    // depois de sair, ou de qualquer resquício em voo. Sem o guarda, quem está
    // na landing é arrancado dela com "sua sessão expirou", que é falso.
    //
    // (O 401 do boot não chega aqui por outro motivo: `apiAuth.me` não passa
    // pelo `requisitar` — devolve `null` direto. Este teste não depende disso.)
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      respostaFalsa({ erro: "sessão inválida ou ausente" }, 401)
    );
    const { result } = renderHook(() => useSessao());
    await waitFor(() => expect(result.current.sessao).toBeNull());

    await act(async () => {
      await import("../api/client").then(({ apiProdutos }) => apiProdutos.listar().catch(() => []));
    });

    expect(result.current.expirou).toBe(false);
    // `?? ""` porque sem sessão o erro é `null`, e `toContain` sobre `null` é
    // erro de teste, não do produto.
    expect(result.current.erro ?? "").not.toContain("expirou");
  });

  it("entrar de novo limpa a marca — senão a landing fica inalcançável para sempre", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(respostaFalsa(SESSAO));
    const { result } = renderHook(() => useSessao());
    await waitFor(() => expect(result.current.sessao).toEqual(SESSAO));

    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      respostaFalsa({ erro: "sessão inválida ou ausente" }, 401)
    );
    await act(async () => {
      await import("../api/client").then(({ apiProdutos }) => apiProdutos.listar().catch(() => []));
    });
    expect(result.current.expirou).toBe(true);

    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(respostaFalsa(SESSAO));
    await act(async () => {
      await result.current.entrar("silvio@exemplo");
    });

    expect(result.current.expirou).toBe(false);
    expect(result.current.sessao).toEqual(SESSAO);
  });
});
