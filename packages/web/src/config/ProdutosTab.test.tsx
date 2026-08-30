import { describe, expect, it, vi, beforeEach, type Mock } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";

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
  /**
   * SPEC-86 fatia C — a aba passou a renderizar `ChecklistDoProduto`, que
   * consulta as regras em vigor ao montar.
   *
   * Sem isto no mock, `apiRegrasDoProduto` chega `undefined` e a aba inteira
   * estoura — foram doze specs vermelhas que não têm nada a ver com checklist.
   * Completar o mock é o certo: **mock incompleto é uma mentira sobre o
   * contrato**, e a resposta vazia mantém estas specs no cenário que elas
   * descrevem (produto sem regra própria declarada).
   */
  apiRegrasDoProduto: {
    obter: async () => ({ documento: { tipos: [], tamanhos: [], porTech: {} }, origemDe: {}, doProduto: 0, declaradoNoProduto: null }),
    salvar: vi.fn(),
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
 * §274 — o caminho para escrever o contexto é o ASSISTENTE.
 *
 * O §271 tinha posto aqui uma caixinha de instrução única ("descreva e eu
 * preencho"). Ela só serve a quem já sabe dizer o produto inteiro numa frase —
 * e esse é o caso raro. Escrever o que um produto É se faz por partes, e isso
 * é conversa.
 */
describe("ProdutosTab — o botão que leva ao assistente", () => {
  it("leva ao assistente, e não preenche nada sozinho", async () => {
    const onConversarComAssistente = vi.fn();
    render(<ProdutosTab timeIds={["time-a"]} onConversarComAssistente={onConversarComAssistente} />);
    await screen.findByTestId("editor-do-produto");

    fireEvent.click(screen.getByTestId("conversar-sobre-o-produto"));

    expect(onConversarComAssistente).toHaveBeenCalled();
    expect(apiProdutos.atualizar).not.toHaveBeenCalled();
  });

  it("sem o caminho ligado, o botão não aparece", async () => {
    montar();
    await screen.findByTestId("editor-do-produto");

    expect(screen.queryByTestId("conversar-sobre-o-produto")).toBeNull();
  });
});

/**
 * §303 — a listagem lenta que engolia o produto recém-criado.
 *
 * Encontrado por uma falha do `produto-contexto.spec.ts`: depois de criar um
 * produto, o editor mostrava OUTRO — o primeiro da lista — e ficava lá.
 *
 * A causa é uma corrida entre duas chamadas de `recarregar`: a do `useEffect`
 * de montagem (sem alvo) e a do `criar` (com o id do novo). Quando a primeira
 * demora mais que a segunda, ela responde por último e escolhe
 * `lista.find(selecionadoId) ?? lista[0]` com um `selecionadoId` que a closure
 * capturou ainda em `null` — ou seja, o primeiro produto da lista.
 *
 * O estrago não é de teste: quem criou o produto passa a digitar no editor de
 * outro, com "salvo" verde na tela. É a mesma família do §262, que tratou o
 * sintoma no spec; aqui está a causa.
 */
describe("ProdutosTab — a resposta que chega atrasada", () => {
  it("a releitura lenta de uma ação anterior não rouba a seleção do produto recém-criado", async () => {
    const concorrente: Produto = { ...produto, id: "p0", nome: "Aaa concorrente" };
    const novo: Produto = { ...produto, id: "p2", nome: "Portabilidade nova", glossario: [] };

    // 1ª: a montagem, que responde na hora. 2ª: a do salvar-termo, que trava.
    // 3ª: a do criar, que responde rápido — e por isso chega ANTES da 2ª.
    let liberarLenta: (v: Produto[]) => void = () => {};
    const lenta = new Promise<Produto[]>((r) => (liberarLenta = r));
    (apiProdutos.listar as Mock)
      .mockResolvedValueOnce([concorrente])
      .mockImplementationOnce(() => lenta)
      .mockResolvedValue([concorrente, novo]);
    (apiProdutos.salvarTermo as Mock).mockResolvedValue(undefined);
    (apiProdutos.criar as Mock).mockResolvedValue(novo);

    render(<ProdutosTab timeIds={["time-pagamentos"]} />);
    await screen.findByTestId("editor-do-produto");

    // A ação lenta sai primeiro e fica pendurada.
    fireEvent.change(screen.getByLabelText("Termo", { selector: "input" }), { target: { value: "Fatura" } });
    fireEvent.change(screen.getByLabelText("Definição"), { target: { value: "A que venceu" } });
    fireEvent.click(screen.getByTestId("salvar-termo"));

    // E o criar acontece por cima dela.
    fireEvent.change(screen.getByLabelText("Nome do produto novo"), { target: { value: "Portabilidade nova" } });
    fireEvent.click(screen.getByTestId("criar-produto"));
    await waitFor(() =>
      expect((screen.getByLabelText("Nome do produto") as HTMLInputElement).value).toBe("Portabilidade nova")
    );

    // Agora a lenta responde, com a lista de antes e sem alvo: sem guarda ela
    // escolhe `lista[0]` e o produto recém-criado some do editor.
    //
    // §250 — a espera precisa ser PELA resposta atrasada. Um `waitFor` sobre o
    // nome passaria de imediato, porque a condição já era verdadeira antes de
    // ela chegar: o teste ficaria verde com e sem a guarda.
    await act(async () => {
      liberarLenta([concorrente]);
      await lenta;
    });

    // O estrago que isso causava não é visual — o `reconciliar` preserva o
    // texto digitado. É o ALVO: a tela passava a estar editando o produto
    // errado, e o Salvar ia para ele com "salvo" verde na tela (§262).
    fireEvent.click(screen.getByTestId("salvar-produto"));
    await waitFor(() => expect(apiProdutos.atualizar as Mock).toHaveBeenCalled());
    expect((apiProdutos.atualizar as Mock).mock.calls[0][0]).toBe("p2");
  });
});
