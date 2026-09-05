import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConectoresTab } from "./ConectoresTab";
import { apiCatalogoDeConectores, apiConectores, apiExportador } from "../api/client";
import { usePermissoes } from "../auth/usePermissoes";

vi.mock("../api/client", () => ({
  apiConectores: { obter: vi.fn(), salvar: vi.fn() },
  apiCatalogoDeConectores: { listar: vi.fn(), executar: vi.fn() },
  apiExportador: { obter: vi.fn(), salvar: vi.fn() },
}));

vi.mock("../auth/usePermissoes", () => ({
  usePermissoes: vi.fn(),
}));

const LEITOR = {
  id: "wiki-da-casa",
  nome: "Leitor da wiki",
  endpoint: "https://gw.casa/documento-externo",
  metodo: "POST" as const,
  cabecalhos: {},
  envelope: "",
  entrada: [{ chave: "link", rotulo: "Link", tipo: "texto" as const, obrigatorio: true }],
  saida: [{ chave: "conteudo", rotulo: "Conteúdo", tipo: "texto" as const, caminho: "$.conteudo", obrigatorio: true }],
};

/**
 * SPEC-105 fatia A, do lado da tela — o catálogo de conectores.
 *
 * A lista mostra o EM VIGOR (declarado + fábrica); o que se edita são os
 * declarados; e o Executar (fatia B) mostra a saída MAPEADA, com os
 * obrigatórios ausentes em voz alta.
 */
describe("o catálogo de conectores na tela (SPEC-105 fatia A)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(usePermissoes).mockReturnValue({ pode: () => true, carregando: false } as never);
    vi.mocked(apiCatalogoDeConectores.listar).mockResolvedValue({
      conectores: [
        { ...LEITOR, origem: "declarado", temCabecalhos: true },
        {
          ...LEITOR,
          id: "wiki-eng",
          nome: "Wiki de Engenharia",
          origem: "fabrica",
          temCabecalhos: false,
        },
      ],
    });
    vi.mocked(apiConectores.obter).mockResolvedValue({ conectores: [LEITOR] });
    vi.mocked(apiConectores.salvar).mockResolvedValue({ conectores: [] });
  });

  it("lista o catálogo em vigor com a contagem no título e a origem de cada um", async () => {
    render(<ConectoresTab />);

    await waitFor(() => expect(screen.getByTestId("catalogo-de-conectores")).toBeInTheDocument());
    expect(screen.getByText("Conectores (2 no catálogo)")).toBeInTheDocument();
    expect(screen.getByTestId("conector-wiki-da-casa")).toHaveTextContent("cadastrado");
    // O derivado do destino do gateway diz de onde veio — e ecoa o rótulo.
    expect(screen.getByTestId("conector-wiki-eng")).toHaveTextContent("do gateway");
    expect(screen.getByTestId("conector-wiki-eng")).toHaveTextContent("Wiki de Engenharia");
    // O segredo não chega à tela; o aviso de que existe, sim.
    expect(screen.getByTestId("conector-wiki-da-casa")).toHaveTextContent("com credencial no servidor");
  });

  it("cadastrar um conector novo salva a lista declarada inteira", async () => {
    render(<ConectoresTab />);
    await waitFor(() => expect(screen.getByTestId("adicionar-conector")).toBeInTheDocument());

    fireEvent.click(screen.getByTestId("adicionar-conector"));
    fireEvent.change(screen.getByLabelText("Identificador"), { target: { value: "volumetria" } });
    fireEvent.change(screen.getByLabelText("Endereço (endpoint)"), {
      target: { value: "https://gw.casa/volumetria" },
    });
    fireEvent.click(screen.getByTestId("salvar-conector"));

    await waitFor(() => expect(apiConectores.salvar).toHaveBeenCalled());
    const enviado = vi.mocked(apiConectores.salvar).mock.calls[0][0];
    expect(enviado.conectores.map((c) => c.id)).toEqual(["wiki-da-casa", "volumetria"]);
  });

  it("executar mostra a saída MAPEADA — e os obrigatórios ausentes em voz alta (§9.3)", async () => {
    vi.mocked(apiCatalogoDeConectores.executar).mockResolvedValue({
      conector: "wiki-da-casa",
      saida: { conteudo: "o texto da página" },
      ausentes: ["titulo"],
    });

    render(<ConectoresTab />);
    await waitFor(() => expect(screen.getByTestId("executar-wiki-da-casa")).toBeInTheDocument());

    fireEvent.click(screen.getByTestId("executar-wiki-da-casa"));
    fireEvent.change(screen.getByLabelText("Link *"), { target: { value: "https://wiki/pages/42" } });
    fireEvent.click(screen.getByTestId("rodar-wiki-da-casa"));

    await waitFor(() => expect(screen.getByTestId("saida-wiki-da-casa")).toBeInTheDocument());
    expect(apiCatalogoDeConectores.executar).toHaveBeenCalledWith("wiki-da-casa", {
      link: "https://wiki/pages/42",
    });
    expect(screen.getByTestId("saida-wiki-da-casa")).toHaveTextContent("o texto da página");
    expect(screen.getByTestId("saida-wiki-da-casa")).toHaveTextContent("A resposta não trouxe: titulo");
  });

  it("SPEC-106 B — criar um DESTINO do gateway pelo catálogo escreve no documento do exportador", async () => {
    vi.mocked(apiExportador.obter).mockResolvedValue({ endpoint: "", rotulo: "", cabecalhos: {}, destinos: [] });
    vi.mocked(apiExportador.salvar).mockResolvedValue({} as never);

    render(<ConectoresTab />);
    await waitFor(() => expect(screen.getByTestId("adicionar-destino-do-gateway")).toBeInTheDocument());

    fireEvent.click(screen.getByTestId("adicionar-destino-do-gateway"));
    fireEvent.change(screen.getByLabelText("Identificador"), { target: { value: "confluence-eng" } });
    fireEvent.change(screen.getByLabelText("Rótulo (como se chama para quem lê)"), { target: { value: "Confluence" } });
    fireEvent.change(screen.getByLabelText("Endereço (endpoint)"), { target: { value: "https://gw/doc" } });
    fireEvent.click(screen.getByTestId("salvar-destino"));

    await waitFor(() => expect(apiExportador.salvar).toHaveBeenCalled());
    // O catálogo edita OS MESMOS registros da antiga aba: o destino entra na
    // lista do exportador, não numa cópia paralela.
    const doc = vi.mocked(apiExportador.salvar).mock.calls[0][0];
    expect(doc.destinos).toEqual([
      { id: "confluence-eng", operacao: "documento", endpoint: "https://gw/doc", rotulo: "Confluence", metodo: "POST" },
    ]);
  });

  it("sem a permissão, a curadoria é dita — e não há botão de cadastrar", async () => {
    vi.mocked(usePermissoes).mockReturnValue({ pode: () => false, carregando: false } as never);

    render(<ConectoresTab />);
    await waitFor(() => expect(screen.getByTestId("catalogo-de-conectores")).toBeInTheDocument());

    expect(screen.queryByTestId("adicionar-conector")).not.toBeInTheDocument();
    expect(screen.getByText(/curado pela organização/)).toBeInTheDocument();
  });
});
