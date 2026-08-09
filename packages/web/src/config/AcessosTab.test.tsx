import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { PapelAcesso } from "../api/client";
import { AcessosTab } from "./AcessosTab";

const catalogoMock = vi.hoisted(() => vi.fn());
const papeisMock = vi.hoisted(() => vi.fn());
const minhasMock = vi.hoisted(() => vi.fn());
const criarPapelMock = vi.hoisted(() => vi.fn());
const salvarPapelMock = vi.hoisted(() => vi.fn());
const excluirPapelMock = vi.hoisted(() => vi.fn());
const adicionarMembroMock = vi.hoisted(() => vi.fn());

vi.mock("../api/client", async (importActual) => ({
  ...(await importActual<typeof import("../api/client")>()),
  apiAcessos: {
    catalogo: catalogoMock,
    papeis: papeisMock,
    minhas: minhasMock,
    criarPapel: criarPapelMock,
    salvarPapel: salvarPapelMock,
    excluirPapel: excluirPapelMock,
    adicionarMembro: adicionarMembroMock,
    removerMembro: vi.fn(),
  },
}));

const CATALOGO = {
  recursos: ["campos-no", "regras.checklistProcesso", "pipeline-agentes"],
  acoes: ["ler", "editar", "aprovar"],
};

function papel(over: Partial<PapelAcesso> = {}): PapelAcesso {
  return { id: "p1", nome: "Agilidade", permissoes: [], membros: [], ...over };
}

beforeEach(() => {
  catalogoMock.mockReset().mockResolvedValue(CATALOGO);
  papeisMock.mockReset().mockResolvedValue([]);
  minhasMock.mockReset().mockResolvedValue({ rbacAtivo: false, porRecurso: {} });
  criarPapelMock.mockReset().mockResolvedValue(papel());
  salvarPapelMock.mockReset().mockResolvedValue(papel());
  excluirPapelMock.mockReset().mockResolvedValue(undefined);
  adicionarMembroMock.mockReset().mockResolvedValue({ email: "x@y.z", escopoTimeId: null });
});

describe("AcessosTab (SPEC-28 Fase 2)", () => {
  it("sem papel nenhum, DIZ que todo mundo edita tudo — o estado vazio é informação", async () => {
    // Sem isso, a tela vazia sugeriria que ninguém pode nada, quando é o
    // oposto: o modo aberto da §4.3 está valendo.
    render(<AcessosTab timeAtivo="time-a" />);
    expect(await screen.findByTestId("acessos-modo-aberto")).toHaveTextContent("todo membro edita tudo");
  });

  it("monta a matriz a partir do CATÁLOGO do servidor, não de uma lista local", async () => {
    papeisMock.mockResolvedValue([papel()]);
    render(<AcessosTab timeAtivo="time-a" />);

    await waitFor(() => expect(screen.getByTestId("papel-Agilidade")).toBeInTheDocument());
    // Uma checkbox por recurso × ação — se o servidor ganhar um recurso novo,
    // ele aparece aqui sem tocar no front.
    for (const recurso of CATALOGO.recursos) {
      for (const acao of CATALOGO.acoes) {
        expect(screen.getByLabelText(`Agilidade: ${acao} ${recurso}`)).toBeInTheDocument();
      }
    }
  });

  it("marcar uma permissão salva a matriz inteira do papel", async () => {
    papeisMock.mockResolvedValue([papel()]);
    render(<AcessosTab timeAtivo="time-a" />);
    await waitFor(() => expect(screen.getByTestId("papel-Agilidade")).toBeInTheDocument());

    fireEvent.click(screen.getByLabelText("Agilidade: editar regras.checklistProcesso"));

    await waitFor(() => expect(salvarPapelMock).toHaveBeenCalled());
    expect(salvarPapelMock).toHaveBeenCalledWith("p1", {
      nome: "Agilidade",
      permissoes: [{ recurso: "regras.checklistProcesso", acao: "editar" }],
    });
  });

  it("desmarcar remove só aquela permissão, preservando as outras", async () => {
    papeisMock.mockResolvedValue([
      papel({
        permissoes: [
          { recurso: "regras.checklistProcesso", acao: "editar" },
          { recurso: "pipeline-agentes", acao: "editar" },
        ],
      }),
    ]);
    render(<AcessosTab timeAtivo="time-a" />);
    await waitFor(() => expect(screen.getByTestId("papel-Agilidade")).toBeInTheDocument());

    fireEvent.click(screen.getByLabelText("Agilidade: editar pipeline-agentes"));

    await waitFor(() => expect(salvarPapelMock).toHaveBeenCalled());
    expect(salvarPapelMock).toHaveBeenCalledWith("p1", {
      nome: "Agilidade",
      permissoes: [{ recurso: "regras.checklistProcesso", acao: "editar" }],
    });
  });

  it("adicionar pessoa com 'só no time' manda o escopo — é o terceiro eixo na tela", async () => {
    papeisMock.mockResolvedValue([papel()]);
    render(<AcessosTab timeAtivo="time-pagamentos" />);
    await waitFor(() => expect(screen.getByTestId("papel-Agilidade")).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText("Adicionar pessoa em Agilidade"), {
      target: { value: "ana@empresa.com" },
    });
    fireEvent.click(screen.getByLabelText(/só no time time-pagamentos/));
    fireEvent.click(screen.getByRole("button", { name: "Adicionar" }));

    await waitFor(() => expect(adicionarMembroMock).toHaveBeenCalled());
    expect(adicionarMembroMock).toHaveBeenCalledWith("p1", {
      email: "ana@empresa.com",
      escopoTimeId: "time-pagamentos",
    });
  });

  it("sem marcar 'só no time', a pessoa entra com escopo da organização inteira", async () => {
    papeisMock.mockResolvedValue([papel()]);
    render(<AcessosTab timeAtivo="time-pagamentos" />);
    await waitFor(() => expect(screen.getByTestId("papel-Agilidade")).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText("Adicionar pessoa em Agilidade"), { target: { value: "bia@empresa.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Adicionar" }));

    await waitFor(() => expect(adicionarMembroMock).toHaveBeenCalled());
    expect(adicionarMembroMock).toHaveBeenCalledWith("p1", { email: "bia@empresa.com", escopoTimeId: undefined });
  });

  it("mostra o escopo de cada pessoa — 'organização inteira' não pode ser indistinguível de um time", async () => {
    papeisMock.mockResolvedValue([
      papel({
        membros: [
          { email: "ana@empresa.com", escopoTimeId: "time-pagamentos" },
          { email: "bia@empresa.com", escopoTimeId: null },
        ],
      }),
    ]);
    render(<AcessosTab timeAtivo="time-a" />);

    // Com o travessão: o texto de introdução da aba também fala em
    // "organização inteira", e sem isso a asserção casaria com ele em vez de
    // com o escopo da pessoa — passaria pelo motivo errado.
    await waitFor(() => expect(screen.getByText("— só no time time-pagamentos")).toBeInTheDocument());
    expect(screen.getByText("— organização inteira")).toBeInTheDocument();
  });

  it("criar papel usa o nome digitado e recarrega a lista", async () => {
    render(<AcessosTab timeAtivo="time-a" />);
    await screen.findByTestId("acessos-modo-aberto");

    fireEvent.change(screen.getByLabelText("Nome do novo papel"), { target: { value: "Arquitetura" } });
    fireEvent.click(screen.getByRole("button", { name: "Criar papel" }));

    await waitFor(() => expect(criarPapelMock).toHaveBeenCalledWith({ nome: "Arquitetura", permissoes: [] }));
    expect(papeisMock).toHaveBeenCalledTimes(2); // carga inicial + recarga
  });

  it("erro do servidor aparece na tela, não some", async () => {
    papeisMock.mockResolvedValue([papel()]);
    salvarPapelMock.mockRejectedValue(new Error("sem permissão para \"editar\" em \"acessos\""));
    render(<AcessosTab timeAtivo="time-a" />);
    await waitFor(() => expect(screen.getByTestId("papel-Agilidade")).toBeInTheDocument());

    fireEvent.click(screen.getByLabelText("Agilidade: editar campos-no"));
    expect(await screen.findByText(/sem permissão/)).toBeInTheDocument();
  });
});
