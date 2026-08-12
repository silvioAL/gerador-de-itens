import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const listarMembros = vi.fn();
const alterarNivel = vi.fn();
const criarConvite = vi.fn();
const adicionarMembro = vi.fn();
const removerMembro = vi.fn();
vi.mock("../api/client", () => ({
  NIVEIS_TIME: ["visualizar", "operar", "owner"],
  apiTimes: {
    listarMembros: (...a: unknown[]) => listarMembros(...a),
    alterarNivel: (...a: unknown[]) => alterarNivel(...a),
    criarConvite: (...a: unknown[]) => criarConvite(...a),
    adicionarMembro: (...a: unknown[]) => adicionarMembro(...a),
    removerMembro: (...a: unknown[]) => removerMembro(...a),
  },
}));

const { MembrosTab } = await import("./MembrosTab");

beforeEach(() => {
  vi.clearAllMocks();
  listarMembros.mockResolvedValue([
    { email: "dev@gerador.local", nivel: "owner" },
    { email: "colega@gerador.local", nivel: "visualizar" },
  ]);
});

describe("MembrosTab — níveis de participação (SPEC-38 Fase 1)", () => {
  it("lista cada membro com o SEU nível, editável no select", async () => {
    render(<MembrosTab timeAtivo="time-pagamentos" />);

    await waitFor(() => expect(screen.getByText("dev@gerador.local")).toBeInTheDocument());
    expect(screen.getByLabelText("Nível de dev@gerador.local")).toHaveValue("owner");
    expect(screen.getByLabelText("Nível de colega@gerador.local")).toHaveValue("visualizar");
  });

  it("mudar o select chama alterarNivel com time, e-mail e nível novo", async () => {
    alterarNivel.mockResolvedValue({});
    const user = userEvent.setup();
    render(<MembrosTab timeAtivo="time-pagamentos" />);

    await waitFor(() => expect(screen.getByText("colega@gerador.local")).toBeInTheDocument());
    await user.selectOptions(screen.getByLabelText("Nível de colega@gerador.local"), "operar");

    expect(alterarNivel).toHaveBeenCalledWith("time-pagamentos", "colega@gerador.local", "operar");
  });

  it("o convite carrega o nível selecionado — é o teto que o servidor confere", async () => {
    criarConvite.mockResolvedValue({ url: "http://x/?convite=t" });
    const user = userEvent.setup();
    render(<MembrosTab timeAtivo="time-pagamentos" />);

    await user.selectOptions(screen.getByLabelText("Nível do novo membro"), "visualizar");
    await user.click(screen.getByRole("button", { name: "Gerar link de convite" }));

    expect(criarConvite).toHaveBeenCalledWith("time-pagamentos", "visualizar");
  });

  it("servidor negando (403 de quem não é owner) vira erro VISÍVEL, não silêncio", async () => {
    alterarNivel.mockRejectedValue(new Error("esta ação exige nível owner"));
    const user = userEvent.setup();
    render(<MembrosTab timeAtivo="time-pagamentos" />);

    await waitFor(() => expect(screen.getByText("colega@gerador.local")).toBeInTheDocument());
    await user.selectOptions(screen.getByLabelText("Nível de colega@gerador.local"), "owner");

    expect(await screen.findByText(/exige nível owner/)).toBeInTheDocument();
  });
});
