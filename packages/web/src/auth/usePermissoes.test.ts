import { describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

const minhas = vi.fn();
vi.mock("../api/client", () => ({ apiAcessos: { minhas: (...a: unknown[]) => minhas(...a) } }));

const { usePermissoes } = await import("./usePermissoes");

/**
 * SPEC-28 Fase 2 — o hook que decide o que a tela esconde.
 *
 * As três primeiras asserções são sobre FALHAR ABERTO, e é a parte que parece
 * descuido e não é: esconder é conveniência, a negação real está em cada rota
 * (Fase 1b). Falhar fechado por causa de um soluço de rede esconderia
 * funcionalidade de quem TEM permissão — pior que o pior caso de falhar
 * aberto, que é ver um botão devolvendo 403.
 */
describe("usePermissoes — o que a tela pode esconder", () => {
  it("modo local não consulta nada e libera tudo", async () => {
    const { result } = renderHook(() => usePermissoes({ hospedado: false }));

    await waitFor(() => expect(result.current.carregando).toBe(false));
    expect(minhas).not.toHaveBeenCalled();
    expect(result.current.pode("campos-no")).toBe(true);
    expect(result.current.rbacAtivo).toBe(false);
  });

  it("endpoint fora do ar libera tudo — falha ABERTA", async () => {
    minhas.mockRejectedValueOnce(new Error("rede caiu"));
    const { result } = renderHook(() => usePermissoes({ hospedado: true }));

    await waitFor(() => expect(result.current.carregando).toBe(false));
    expect(result.current.pode("acessos")).toBe(true);
  });

  it("organização sem papel nenhum (modo aberto) libera tudo", async () => {
    minhas.mockResolvedValueOnce({ rbacAtivo: false, porRecurso: {} });
    const { result } = renderHook(() => usePermissoes({ hospedado: true }));

    await waitFor(() => expect(result.current.carregando).toBe(false));
    expect(result.current.pode("campos-no")).toBe(true);
    expect(result.current.pode("acessos")).toBe(true);
  });

  it("com RBAC ligado, só o que foi concedido — e a AÇÃO importa", async () => {
    minhas.mockResolvedValueOnce({
      rbacAtivo: true,
      porRecurso: { "regras.checklistProcesso": ["editar"], quebras: ["ler"] },
    });
    const { result } = renderHook(() => usePermissoes({ hospedado: true }));

    await waitFor(() => expect(result.current.carregando).toBe(false));
    expect(result.current.pode("regras.checklistProcesso")).toBe(true);
    expect(result.current.pode("regras.checklistTecnico")).toBe(false);
    expect(result.current.pode("campos-no")).toBe(false);
    // `editar` é o padrão: `ler` concedido não vira permissão de editar.
    expect(result.current.pode("quebras")).toBe(false);
    expect(result.current.pode("quebras", "ler")).toBe(true);
  });

  it("SPEC-38: o nível do time vem junto; sem resposta, `null` — que NÃO esconde nada", async () => {
    minhas.mockResolvedValueOnce({ rbacAtivo: false, porRecurso: {}, nivel: "visualizar" });
    const { result } = renderHook(() => usePermissoes({ hospedado: true, timeId: "time-x" }));
    await waitFor(() => expect(result.current.carregando).toBe(false));
    expect(result.current.nivel).toBe("visualizar");

    // Falha aberta: rede fora → nivel null → a UI trata como "ainda não sei".
    minhas.mockRejectedValueOnce(new Error("rede caiu"));
    const { result: semRede } = renderHook(() => usePermissoes({ hospedado: true, timeId: "time-x" }));
    await waitFor(() => expect(semRede.current.carregando).toBe(false));
    expect(semRede.current.nivel).toBeNull();
  });

  it("o time entra na consulta — papel com escopo de time depende disso", async () => {
    minhas.mockResolvedValueOnce({ rbacAtivo: true, porRecurso: {} });
    renderHook(() => usePermissoes({ hospedado: true, timeId: "time-pagamentos" }));

    await waitFor(() => expect(minhas).toHaveBeenCalledWith("time-pagamentos"));
  });
});
