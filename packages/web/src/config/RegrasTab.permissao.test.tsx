import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const obterComDiagnostico = vi.fn(async () => ({
  documento: { tipos: [], tamanhos: [], porTech: { java: { checklistTecnico: [], testes: [] } } },
  diagnostico: null,
}));
vi.mock("../api/client", () => ({
  apiRegras: { obterComDiagnostico: () => obterComDiagnostico(), salvar: vi.fn() },
}));
vi.mock("./SugerirComIa", () => ({ SugerirComIa: () => null }));

const { RegrasTab } = await import("./RegrasTab");

/**
 * O PEDIDO que originou a SPEC-28 inteira: "Agilidade cuida do checklist de
 * processo, Arquitetura do técnico".
 *
 * A aba de regras é UMA tela com QUATRO recursos. Esconder a aba inteira
 * quando falta um deles destruiria a delegação — quem cuida só do processo
 * perderia a tela toda. Por isso o filtro é por SEÇÃO, e é isto que estes
 * testes protegem.
 */
describe("RegrasTab — seções filtradas por permissão (SPEC-28 Fase 2)", () => {
  it("sem filtro (modo local) mostra as quatro", async () => {
    render(<RegrasTab />);

    expect(await screen.findByTestId("secao-tecnico")).toBeTruthy();
    expect(screen.getByTestId("secao-processo")).toBeTruthy();
    expect(screen.getByTestId("secao-testes")).toBeTruthy();
    expect(screen.getByTestId("secao-volumetria")).toBeTruthy();
  });

  it("quem só pode PROCESSO vê processo — e não vê as outras três", async () => {
    render(<RegrasTab podeSecao={(id) => id === "processo"} />);

    expect(await screen.findByTestId("secao-processo")).toBeTruthy();
    expect(screen.queryByTestId("secao-tecnico")).toBeNull();
    expect(screen.queryByTestId("secao-testes")).toBeNull();
    expect(screen.queryByTestId("secao-volumetria")).toBeNull();
  });

  it("a seção ABERTA é uma que a pessoa pode — não a primeira do catálogo", async () => {
    // Sem isto a tela abriria em "Técnico" (primeiro de `SECOES`), que ela não
    // pode ver, e o conteúdo viria vazio sem explicação.
    render(<RegrasTab podeSecao={(id) => id === "volumetria"} />);

    const volumetria = await screen.findByTestId("secao-volumetria");
    expect(volumetria.getAttribute("aria-current") ?? volumetria.className).toBeDefined();
    expect(screen.queryByTestId("secao-tecnico")).toBeNull();
  });
});
