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

    for (const [i, op] of [["1", "documento"], ["2", "adr"], ["3", "documentoExterno"]] as const) {
      fireEvent.click(screen.getByTestId("adicionar-destino"));
      fireEvent.change(screen.getByLabelText(`Operação do destino ${i}`), { target: { value: op } });
      fireEvent.change(screen.getByLabelText(`Endereço do destino ${i}`), { target: { value: `https://gw/${op}` } });
    }
    fireEvent.click(screen.getByTestId("salvar-exportacao"));

    await waitFor(() => expect(apiExportador.salvar).toHaveBeenCalled());
    const destinos = vi.mocked(apiExportador.salvar).mock.calls[0][0].destinos ?? [];
    expect(destinos.map((d) => d.operacao)).toEqual(["documento", "adr", "documentoExterno"]);
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

  /**
   * SPEC-115 fatia D — **o modo de demonstração, marcado como o que é.**
   *
   * A recusa central da SPEC-115 §2 é "apresentar o mock de 20s como o
   * comportamento real". A tela de configuração é onde isso se cumpre ou se
   * quebra: é aqui que alguém liga o dublê, e é aqui que ele precisa se
   * anunciar.
   */
  describe("o destino em modo de demonstração (SPEC-115 fatia D)", () => {
    it("marcar a caixa salva a FLAG no destino, e não um endereço de mentira", async () => {
      render(<ExportacaoTab />);
      await waitFor(() => expect(screen.getByTestId("destinos-do-gateway")).toBeInTheDocument());

      fireEvent.click(screen.getByTestId("adicionar-destino"));
      fireEvent.change(screen.getByLabelText("Operação do destino 1"), { target: { value: "specDoItem" } });
      fireEvent.click(screen.getByLabelText("Modo de demonstração do destino 1"));
      fireEvent.change(screen.getByLabelText("Rótulo do destino 1"), { target: { value: "Agente falso" } });
      fireEvent.click(screen.getByTestId("salvar-exportacao"));

      await waitFor(() => expect(apiExportador.salvar).toHaveBeenCalled());
      const destinos = vi.mocked(apiExportador.salvar).mock.calls[0][0].destinos ?? [];
      expect(destinos[0]).toMatchObject({ operacao: "specDoItem", demonstracao: true, endpoint: "" });
    });

    it("a tela DIZ o que a caixa faz — e que nada sai daqui", async () => {
      render(<ExportacaoTab />);
      await waitFor(() => expect(screen.getByTestId("destinos-do-gateway")).toBeInTheDocument());

      fireEvent.click(screen.getByTestId("adicionar-destino"));
      expect(screen.queryByTestId("destino-demonstracao-0")).toBeNull();

      fireEvent.click(screen.getByLabelText("Modo de demonstração do destino 1"));

      // A caixa se nomeia; o parágrafo abaixo explica a consequência.
      expect(screen.getByText(/não chama ninguém/)).toBeInTheDocument();
      const aviso = screen.getByTestId("destino-demonstracao-0");
      expect(aviso).toHaveTextContent("~20 segundos por item");
      expect(aviso).toHaveTextContent("sem mandar nada para lugar nenhum");
      expect(aviso).toHaveTextContent("demonstracao.invalid");
    });

    it("com a caixa marcada, o campo de endereço fica desabilitado — não há o que preencher", async () => {
      // Um campo editável que ninguém lê é o tipo de coisa que faz a pessoa
      // duvidar se entendeu a tela. Desabilitado, ele responde a pergunta.
      render(<ExportacaoTab />);
      await waitFor(() => expect(screen.getByTestId("destinos-do-gateway")).toBeInTheDocument());

      fireEvent.click(screen.getByTestId("adicionar-destino"));
      expect(screen.getByLabelText("Endereço do destino 1")).not.toBeDisabled();

      fireEvent.click(screen.getByLabelText("Modo de demonstração do destino 1"));
      expect(screen.getByLabelText("Endereço do destino 1")).toBeDisabled();
    });
  });

  it("em demonstração não edita nem grava (§235)", async () => {
    // Semear via API faria o tour ESCREVER na configuração de quem só quis ver.
    render(<ExportacaoTab demonstracao={{ ...VAZIO, endpoint: "https://exemplo/itens", rotulo: "Jira (exemplo)" }} />);

    expect(screen.getByTestId("adicionar-destino")).toBeDisabled();
    expect(apiExportador.obter).not.toHaveBeenCalled();
  });
});

/**
 * SPEC-120 fatias A e D — o tamanho do lote, e o contrato de cada operação.
 */
describe("o lote e o contrato na tela (SPEC-120)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(apiExportador.obter).mockResolvedValue(VAZIO);
    vi.mocked(apiExportador.salvar).mockResolvedValue(VAZIO as never);
  });

  it("fatia A — o campo do lote existe, vazio, mostrando o padrão de fábrica", async () => {
    render(<ExportacaoTab />);
    await waitFor(() => expect(screen.getByTestId("tamanho-do-lote")).toBeInTheDocument());

    // Vazio com placeholder, e não 5 digitado: a diferença entre "não escolhi"
    // e "escolhi o que por acaso é o padrão" precisa sobreviver à tela.
    const campo = screen.getByLabelText("Itens por chamada");
    expect(campo).toHaveValue(null);
    expect(campo).toHaveAttribute("placeholder", "5");
  });

  it("fatia A — o número digitado é o que vai para o servidor", async () => {
    render(<ExportacaoTab />);
    await waitFor(() => expect(screen.getByTestId("tamanho-do-lote")).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText("Itens por chamada"), { target: { value: "3" } });
    fireEvent.click(screen.getByTestId("salvar-exportacao"));

    await waitFor(() =>
      expect(vi.mocked(apiExportador.salvar).mock.calls[0][0]).toMatchObject({ lote: { itens: 3 } })
    );
  });

  it("fatia A — apagar o número é “use o padrão”, e não “lotes de zero itens”", async () => {
    render(<ExportacaoTab />);
    await waitFor(() => expect(screen.getByTestId("tamanho-do-lote")).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText("Itens por chamada"), { target: { value: "3" } });
    fireEvent.change(screen.getByLabelText("Itens por chamada"), { target: { value: "" } });
    fireEvent.click(screen.getByTestId("salvar-exportacao"));

    await waitFor(() => expect(vi.mocked(apiExportador.salvar).mock.calls[0][0].lote).toBeUndefined());
  });

  it("fatia A — os DOIS tetos aparecem: só a contagem mentiria sobre estar protegido", async () => {
    /**
     * §1.1 — o que estoura contexto é a spec, não a contagem. Mostrar só
     * "5 por vez" faria a pessoa achar que está protegida no caso exato em que
     * ela não está: cinco specs longas.
     */
    render(<ExportacaoTab />);
    await waitFor(() => expect(screen.getByTestId("tamanho-do-lote")).toBeInTheDocument());

    expect(screen.getByLabelText("Caracteres por chamada")).toBeInTheDocument();
    expect(screen.getByTestId("tamanho-do-lote")).toHaveTextContent("qualquer um dos dois");
  });

  it("fatia D — o contrato do ANEXO é declarado, com o formato e quem converte", async () => {
    /**
     * *"markdown é o melhor possível, mas precisamos certificar que funciona"*.
     * A decisão (§2.2) é a régua da SPEC-49 por analogia: o produto manda
     * markdown, o gateway converte. O que faltava era **declarar**, para quem
     * escreve o agente do outro lado saber o que recebe.
     */
    render(<ExportacaoTab />);
    await waitFor(() => expect(screen.getByTestId("destinos-do-gateway")).toBeInTheDocument());

    fireEvent.click(screen.getByTestId("adicionar-destino"));
    fireEvent.change(screen.getByLabelText("Operação do destino 1"), { target: { value: "specDoItem" } });

    const contrato = screen.getByTestId("contrato-0");
    expect(contrato).toHaveTextContent("{ itens: [{ chaveExterna, conteudo }] }");
    expect(contrato).toHaveTextContent("markdown, UTF-8, com blocos de código");
    expect(contrato).toHaveTextContent("quem converte");
  });

  it("fatia D — trocar a operação troca o contrato: ele descreve a chamada, não o destino", async () => {
    render(<ExportacaoTab />);
    await waitFor(() => expect(screen.getByTestId("destinos-do-gateway")).toBeInTheDocument());

    fireEvent.click(screen.getByTestId("adicionar-destino"));
    fireEvent.change(screen.getByLabelText("Operação do destino 1"), { target: { value: "adr" } });

    expect(screen.getByTestId("contrato-0")).toHaveTextContent("{ adrs:");
  });
});
