import { describe, expect, it, vi, beforeEach, type Mock } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

vi.mock("../api/client", () => ({
  apiIa: { sugerirConfig: vi.fn() },
  apiProdutos: {
    listar: vi.fn(),
    criar: vi.fn(),
    atualizar: vi.fn(),
    definirTimes: vi.fn(),
    salvarTermo: vi.fn(),
    excluirTermo: vi.fn(),
  },
}));

import { apiIa, apiProdutos, type Produto } from "../api/client";
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

/**
 * §266 — a releitura não pode apagar o que a pessoa está digitando.
 *
 * O defeito foi achado no §262 e anotado lá em vez de consertado de carona: o
 * guarda óbvio (não substituir o rascunho quando o id é o mesmo) quebra o
 * glossário, que aparece justamente por causa da releitura. Estes dois testes
 * são os dois lados da régua, e precisam existir juntos — cada um sozinho
 * autoriza o conserto errado.
 */
describe("ProdutosTab — o que a releitura pode e não pode substituir", () => {
  it("texto digitado DEPOIS do Salvar sobrevive à resposta do servidor", async () => {
    // A gravação demora; a pessoa continua escrevendo. Antes, o que voltava do
    // servidor (sem as teclas novas) apagava tudo, com "salvo" na tela.
    let concluirSalvamento: (p: Produto) => void = () => {};
    (apiProdutos.atualizar as Mock).mockReturnValue(
      new Promise<Produto>((resolve) => {
        concluirSalvamento = resolve;
      })
    );
    montar();
    await screen.findByTestId("editor-do-produto");

    fireEvent.change(screen.getByLabelText("Restrições"), { target: { value: "Resolução 4.753." } });
    fireEvent.click(screen.getByTestId("salvar-produto"));

    // Enquanto o servidor não respondeu, a pessoa escreve mais.
    fireEvent.change(screen.getByLabelText("O que é"), { target: { value: "Texto novo, digitado durante o salvamento." } });
    concluirSalvamento(produto);

    await waitFor(() => expect(screen.getByTestId("produto-salvo")).toBeInTheDocument());
    expect(screen.getByLabelText("O que é")).toHaveValue("Texto novo, digitado durante o salvamento.");
  });

  it("o glossário CONTINUA vindo do servidor — é o que o conserto óbvio quebrava", async () => {
    (apiProdutos.salvarTermo as Mock).mockResolvedValue({ id: "t2", termo: "SPB", definicao: "Liquidação", ordem: 1 });
    (apiProdutos.listar as Mock)
      .mockResolvedValueOnce([produto])
      .mockResolvedValue([
        { ...produto, glossario: [...produto.glossario, { id: "t2", termo: "SPB", definicao: "Liquidação", ordem: 1 }] },
      ]);
    montar();
    await screen.findByTestId("editor-do-produto");

    fireEvent.change(screen.getByLabelText("Termo"), { target: { value: "SPB" } });
    fireEvent.change(screen.getByLabelText("Definição"), { target: { value: "Liquidação" } });
    fireEvent.click(screen.getByTestId("salvar-termo"));

    await waitFor(() => expect(screen.getAllByTestId("termo-do-glossario")).toHaveLength(2));
  });

  it("TROCAR de produto substitui tudo — aí a pessoa pediu por isso", async () => {
    const outro: Produto = { ...produto, id: "p2", nome: "Cobrança", objetivo: "Cobrar.", glossario: [] };
    (apiProdutos.listar as Mock).mockResolvedValue([produto, outro]);
    montar();
    await screen.findByTestId("editor-do-produto");

    fireEvent.change(screen.getByLabelText("O que é"), { target: { value: "rascunho do primeiro" } });
    fireEvent.click(screen.getByRole("button", { name: "Cobrança" }));

    expect(screen.getByLabelText("O que é")).toHaveValue("Cobrar.");
  });
});

/**
 * §271 — escrever o contexto com apoio do assistente.
 */
describe("ProdutosTab — o assistente preenche o rascunho, e só ele", () => {
  it("a sugestão cai nos campos SEM gravar — quem grava é o Salvar", async () => {
    // A fronteira da SPEC-23 Fluxo 2, que é o que impede a assistência de
    // virar um canal paralelo de escrita.
    (apiIa.sugerirConfig as Mock).mockResolvedValue({
      objetivo: "Levar a conta do cliente para outro banco.",
      quemUsa: "Cliente PF que troca de banco.",
      regrasDeNegocio: "",
      sistemas: "",
      restricoes: "Resolução 4.753 do BACEN.",
    });
    montar();
    await screen.findByTestId("editor-do-produto");

    fireEvent.change(screen.getByPlaceholderText(/portabilidade de conta salário/i), {
      target: { value: "portabilidade" },
    });
    fireEvent.click(screen.getByRole("button", { name: "✨ Sugerir" }));

    await waitFor(() =>
      expect(screen.getByLabelText("O que é")).toHaveValue("Levar a conta do cliente para outro banco.")
    );
    expect(screen.getByLabelText("Restrições")).toHaveValue("Resolução 4.753 do BACEN.");
    expect(apiProdutos.atualizar).not.toHaveBeenCalled();
  });

  it("campo vazio na resposta NÃO apaga o que já estava escrito", async () => {
    // A sugestão acrescenta; subtrair seria a pessoa perder texto por ter
    // pedido ajuda — o oposto de ajudar.
    (apiIa.sugerirConfig as Mock).mockResolvedValue({
      objetivo: "",
      quemUsa: "Cliente PF.",
      regrasDeNegocio: "",
      sistemas: "",
      restricoes: "",
    });
    montar();
    await screen.findByTestId("editor-do-produto");

    fireEvent.change(screen.getByPlaceholderText(/portabilidade de conta salário/i), { target: { value: "x" } });
    fireEvent.click(screen.getByRole("button", { name: "✨ Sugerir" }));

    await waitFor(() => expect(screen.getByLabelText("Quem usa")).toHaveValue("Cliente PF."));
    expect(screen.getByLabelText("O que é")).toHaveValue("Levar a conta para outro banco.");
  });
});
