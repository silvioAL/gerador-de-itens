import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ExportacaoTab } from "./ExportacaoTab";
import { apiExportador } from "../api/client";

vi.mock("../api/client", () => ({
  apiExportador: { obter: vi.fn(), salvar: vi.fn() },
}));

const VAZIO = { endpoint: "", rotulo: "", cabecalhos: {} };

/**
 * SPEC-81 fatia A, do lado da tela — **configurar os destinos do gateway.**
 *
 * O que existia até agora era porta e adaptador: dava para ler ADR e publicar
 * documento por código, e não havia por onde dizer o endereço. É a mesma dívida
 * que a SPEC-79 teve entre a régua e a aba, e ela se paga aqui.
 */
describe("os destinos do gateway na tela (SPEC-81 fatia A)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(apiExportador.obter).mockResolvedValue(VAZIO);
    vi.mocked(apiExportador.salvar).mockResolvedValue(VAZIO as never);
  });

  it("o endereço de ITENS continua onde estava — quem configurou antes não reconfigura", async () => {
    /**
     * A garantia que mais importa nesta fatia. Puxar o endereço de cima para
     * dentro da lista obrigaria uma migração de dado para não ganhar nada, e
     * mexeria na configuração de quem já usa exportação.
     */
    vi.mocked(apiExportador.obter).mockResolvedValue({
      endpoint: "https://agente.casa/itens",
      rotulo: "Jira",
      cabecalhos: { Authorization: "Bearer x" },
    });

    render(<ExportacaoTab />);

    await waitFor(() => expect(screen.getByLabelText("Endereço do agente")).toHaveValue("https://agente.casa/itens"));
    expect(screen.getByTestId("destinos-do-gateway")).toBeInTheDocument();
  });

  it("acrescentar um destino e salvar manda a lista junto", async () => {
    render(<ExportacaoTab />);
    await waitFor(() => expect(screen.getByTestId("destinos-do-gateway")).toBeInTheDocument());

    fireEvent.click(screen.getByTestId("adicionar-destino"));
    fireEvent.change(screen.getByLabelText("Endereço do destino 1"), {
      target: { value: "https://gw.casa/confluence" },
    });
    fireEvent.change(screen.getByLabelText("Rótulo do destino 1"), { target: { value: "Confluence" } });
    fireEvent.click(screen.getByTestId("salvar-exportacao"));

    await waitFor(() => expect(apiExportador.salvar).toHaveBeenCalled());
    const enviado = vi.mocked(apiExportador.salvar).mock.calls[0][0];
    expect(enviado.destinos).toHaveLength(1);
    expect(enviado.destinos?.[0]).toMatchObject({
      operacao: "documento",
      endpoint: "https://gw.casa/confluence",
      rotulo: "Confluence",
    });
    // O id nasce na tela e é estável: é por ele que se lembra qual destino foi
    // escolhido quando há mais de um da mesma operação.
    expect(enviado.destinos?.[0].id).toBeTruthy();
  });

  it("três MCPs diferentes convivem — é o caso que a SPEC descreve", async () => {
    render(<ExportacaoTab />);
    await waitFor(() => expect(screen.getByTestId("destinos-do-gateway")).toBeInTheDocument());

    for (const [i, op] of [["1", "documento"], ["2", "adr"], ["3", "arquiteturaDeNegocio"]] as const) {
      fireEvent.click(screen.getByTestId("adicionar-destino"));
      fireEvent.change(screen.getByLabelText(`Operação do destino ${i}`), { target: { value: op } });
      fireEvent.change(screen.getByLabelText(`Endereço do destino ${i}`), { target: { value: `https://gw/${op}` } });
    }
    fireEvent.click(screen.getByTestId("salvar-exportacao"));

    await waitFor(() => expect(apiExportador.salvar).toHaveBeenCalled());
    const destinos = vi.mocked(apiExportador.salvar).mock.calls[0][0].destinos ?? [];
    expect(destinos.map((d) => d.operacao)).toEqual(["documento", "adr", "arquiteturaDeNegocio"]);
  });

  it("dois destinos da MESMA operação são legítimos", async () => {
    // Dois espaços de documentação por unidade de negócio, dois trackers numa
    // migração. É por isso que a forma é lista, e não três campos fixos.
    render(<ExportacaoTab />);
    await waitFor(() => expect(screen.getByTestId("destinos-do-gateway")).toBeInTheDocument());

    fireEvent.click(screen.getByTestId("adicionar-destino"));
    fireEvent.change(screen.getByLabelText("Endereço do destino 1"), { target: { value: "https://gw/eng" } });
    fireEvent.click(screen.getByTestId("adicionar-destino"));
    fireEvent.change(screen.getByLabelText("Endereço do destino 2"), { target: { value: "https://gw/prod" } });
    fireEvent.click(screen.getByTestId("salvar-exportacao"));

    await waitFor(() => expect(apiExportador.salvar).toHaveBeenCalled());
    const destinos = vi.mocked(apiExportador.salvar).mock.calls[0][0].destinos ?? [];
    expect(destinos).toHaveLength(2);
    expect(destinos[0].id).not.toBe(destinos[1].id);
  });

  it("remover tira só o destino apontado", async () => {
    render(<ExportacaoTab />);
    await waitFor(() => expect(screen.getByTestId("destinos-do-gateway")).toBeInTheDocument());

    fireEvent.click(screen.getByTestId("adicionar-destino"));
    fireEvent.change(screen.getByLabelText("Endereço do destino 1"), { target: { value: "https://gw/a" } });
    fireEvent.click(screen.getByTestId("adicionar-destino"));
    fireEvent.change(screen.getByLabelText("Endereço do destino 2"), { target: { value: "https://gw/b" } });

    fireEvent.click(screen.getByLabelText("Remover destino 1"));
    fireEvent.click(screen.getByTestId("salvar-exportacao"));

    await waitFor(() => expect(apiExportador.salvar).toHaveBeenCalled());
    const destinos = vi.mocked(apiExportador.salvar).mock.calls[0][0].destinos ?? [];
    expect(destinos.map((d) => d.endpoint)).toEqual(["https://gw/b"]);
  });

  it("em demonstração não edita nem grava (§235)", async () => {
    // Semear via API faria o tour ESCREVER na configuração de quem só quis ver.
    render(<ExportacaoTab demonstracao={{ ...VAZIO, endpoint: "https://exemplo/itens", rotulo: "Jira (exemplo)" }} />);

    expect(screen.getByTestId("adicionar-destino")).toBeDisabled();
    expect(apiExportador.obter).not.toHaveBeenCalled();
  });
});
