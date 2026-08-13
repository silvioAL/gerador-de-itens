import { describe, expect, it, vi, beforeEach, type Mock } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

vi.mock("../api/client", () => ({
  apiProdutos: {
    listar: vi.fn(),
    criar: vi.fn(),
    atualizar: vi.fn(),
    definirTimes: vi.fn(),
    salvarTermo: vi.fn(),
    excluirTermo: vi.fn(),
  },
}));

import { apiProdutos, type Produto } from "../api/client";
import { ProdutosTab } from "./ProdutosTab";

const produto: Produto = {
  id: "p1",
  nome: "Portabilidade",
  objetivo: "Levar a conta para outro banco.",
  quemUsa: "",
  regrasDeNegocio: "",
  sistemas: "",
  restricoes: "",
  glossario: [{ id: "t1", termo: "Portabilidade", definicao: "Troca de banco mantendo débitos", ordem: 0 }],
  timeIds: [],
  criadoPor: "dev@empresa.com",
  atualizadoEm: new Date("2026-08-13T10:00:00Z").toISOString(),
};

beforeEach(() => {
  vi.clearAllMocks();
  (apiProdutos.listar as Mock).mockResolvedValue([produto]);
});

function montar() {
  render(<ProdutosTab timeIds={["time-pagamentos", "time-checkout"]} />);
}

describe("ProdutosTab (SPEC-53 Fase 1)", () => {
  it("mostra as seis seções do contexto e o glossário do produto escolhido", async () => {
    montar();
    expect(await screen.findByTestId("editor-do-produto")).toBeInTheDocument();

    for (const rotulo of ["O que é", "Quem usa", "Regras de negócio que valem sempre", "Sistemas e integrações", "Restrições"]) {
      expect(screen.getByLabelText(rotulo)).toBeInTheDocument();
    }
    expect(screen.getByLabelText("O que é")).toHaveValue("Levar a conta para outro banco.");
    expect(screen.getByTestId("termo-do-glossario").textContent).toContain("Troca de banco mantendo débitos");
  });

  it("salvar manda as seções, e a tela confirma — sem confirmação ninguém sabe se pegou", async () => {
    (apiProdutos.atualizar as Mock).mockResolvedValue(produto);
    montar();
    await screen.findByTestId("editor-do-produto");

    fireEvent.change(screen.getByLabelText("Restrições"), { target: { value: "Resolução 4.753 do BACEN." } });
    fireEvent.click(screen.getByTestId("salvar-produto"));

    await waitFor(() =>
      expect(apiProdutos.atualizar).toHaveBeenCalledWith("p1", expect.objectContaining({ restricoes: "Resolução 4.753 do BACEN." }))
    );
    expect(await screen.findByTestId("produto-salvo")).toBeInTheDocument();
  });

  it("sem produto nenhum, diz que tudo continua funcionando — instalação nova não pode parecer quebrada", async () => {
    (apiProdutos.listar as Mock).mockResolvedValue([]);
    montar();
    expect(await screen.findByTestId("sem-produtos")).toHaveTextContent("continua funcionando como antes");
  });

  it("marcar um time RESTRINGE, e a tela diz isso — o contrário do que 'marcar' costuma sugerir", async () => {
    (apiProdutos.definirTimes as Mock).mockResolvedValue({ ...produto, timeIds: ["time-pagamentos"] });
    montar();
    await screen.findByTestId("editor-do-produto");

    expect(screen.getByText(/o produto aparece para todos/)).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText(/time-pagamentos/));
    await waitFor(() => expect(apiProdutos.definirTimes).toHaveBeenCalledWith("p1", ["time-pagamentos"]));
  });

  it("adicionar termo limpa os campos — senão o próximo termo nasce em cima do anterior", async () => {
    (apiProdutos.salvarTermo as Mock).mockResolvedValue({ id: "t2", termo: "Fatura", definicao: "x", ordem: 1 });
    montar();
    await screen.findByTestId("editor-do-produto");

    fireEvent.change(screen.getByLabelText("Termo"), { target: { value: "Fatura" } });
    fireEvent.change(screen.getByLabelText("Definição"), { target: { value: "O que venceu e não foi pago" } });
    fireEvent.click(screen.getByTestId("salvar-termo"));

    await waitFor(() => expect(apiProdutos.salvarTermo).toHaveBeenCalledWith("p1", "Fatura", "O que venceu e não foi pago"));
    await waitFor(() => expect(screen.getByLabelText("Termo")).toHaveValue(""));
  });
});
