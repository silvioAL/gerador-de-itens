import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TokensTab } from "./TokensTab";
import { apiTokens } from "../api/client";

vi.mock("../api/client", () => ({
  apiTokens: { obter: vi.fn(), salvar: vi.fn() },
}));

const W3C = JSON.stringify({
  cor: {
    fundo: { painel: { $value: "#ffffff", $type: "color" } },
    texto: { padrao: { $value: "#0f172a", $type: "color" } },
  },
  espaco: { "2": { $value: "8px" } },
});

describe("a aba de design system (SPEC-79 fatia A)", () => {
  beforeEach(() => {
    // Sem isto o spy acumula entre casos, e o teste da demonstração passa a
    // contar as chamadas dos seis anteriores — falso vermelho que faria alguém
    // procurar defeito no produto.
    vi.clearAllMocks();
    vi.mocked(apiTokens.obter).mockResolvedValue({ tokens: [] });
    vi.mocked(apiTokens.salvar).mockResolvedValue({ tokens: [] } as never);
  });

  it("lista vazia é estado LEGÍTIMO, e a tela diz por quê", async () => {
    /**
     * A frase importa mais do que parece: quem abre esta aba pela primeira vez
     * precisa entender que não configurar design system não é atraso nem
     * pendência. É a mesma disciplina do §239 — dimensão nova não acusa quem
     * nunca a usou — e é o que impede a aba de nascer parecendo um erro.
     */
    render(<TokensTab />);

    await waitFor(() => expect(screen.getByTestId("tokens-tab")).toBeInTheDocument());
    expect(screen.getByText(/checagens de design system ficam caladas/i)).toBeInTheDocument();
  });

  it("colar o formato do W3C traz o sistema inteiro, agrupado", async () => {
    render(<TokensTab />);
    await waitFor(() => expect(screen.getByTestId("tokens-tab")).toBeInTheDocument());

    fireEvent.change(screen.getByTestId("tokens-colar-claro"), { target: { value: W3C } });
    fireEvent.click(screen.getByTestId("tokens-importar"));

    expect(await screen.findByText("3 tokens declarados")).toBeInTheDocument();
    expect(screen.getByText("cor.fundo.painel")).toBeInTheDocument();
    expect(screen.getByText("espaco.2")).toBeInTheDocument();
    // Agrupado pelo grupo raiz — cem tokens numa lista plana não se conferem.
    expect(screen.getByText("cor")).toBeInTheDocument();
  });

  it("JSON inválido diz o que houve, em vez de não fazer nada", async () => {
    render(<TokensTab />);
    await waitFor(() => expect(screen.getByTestId("tokens-tab")).toBeInTheDocument());

    fireEvent.change(screen.getByTestId("tokens-colar-claro"), { target: { value: "{ nao é json" } });
    fireEvent.click(screen.getByTestId("tokens-importar"));

    expect(await screen.findByText(/JSON inválido/)).toBeInTheDocument();
  });

  it("JSON válido mas SEM tokens também avisa — silêncio aqui é pior que erro", async () => {
    // A pessoa colou algo, nada aconteceu, e ela não tem como saber se o
    // formato estava errado ou se o arquivo estava vazio.
    render(<TokensTab />);
    await waitFor(() => expect(screen.getByTestId("tokens-tab")).toBeInTheDocument());

    fireEvent.change(screen.getByTestId("tokens-colar-claro"), { target: { value: '{"versao": 3}' } });
    fireEvent.click(screen.getByTestId("tokens-importar"));

    expect(await screen.findByText(/Nenhum token encontrado/)).toBeInTheDocument();
  });

  it("o modo escuro casa por NOME quando o segundo arquivo é colado", async () => {
    render(<TokensTab />);
    await waitFor(() => expect(screen.getByTestId("tokens-tab")).toBeInTheDocument());

    fireEvent.change(screen.getByTestId("tokens-colar-claro"), { target: { value: W3C } });
    fireEvent.change(screen.getByTestId("tokens-colar-escuro"), {
      target: { value: JSON.stringify({ cor: { fundo: { painel: { $value: "#0f172a" } } } }) },
    });
    fireEvent.click(screen.getByTestId("tokens-importar"));

    await screen.findByText("3 tokens declarados");
    // O claro e o escuro do mesmo token aparecem lado a lado.
    expect(screen.getAllByText("#0f172a").length).toBeGreaterThanOrEqual(2);
  });

  it("salvar manda o que está na tela", async () => {
    render(<TokensTab />);
    await waitFor(() => expect(screen.getByTestId("tokens-tab")).toBeInTheDocument());

    fireEvent.change(screen.getByTestId("tokens-colar-claro"), { target: { value: W3C } });
    fireEvent.click(screen.getByTestId("tokens-importar"));
    await screen.findByText("3 tokens declarados");
    fireEvent.click(screen.getByTestId("tokens-salvar"));

    await waitFor(() =>
      expect(apiTokens.salvar).toHaveBeenCalledWith({
        tokens: [
          { nome: "cor.fundo.painel", valor: "#ffffff", grupo: "cor" },
          { nome: "cor.texto.padrao", valor: "#0f172a", grupo: "cor" },
          { nome: "espaco.2", valor: "8px", grupo: "espaco" },
        ],
      })
    );
  });

  it("em demonstração não busca nem grava (§235)", async () => {
    render(<TokensTab demonstracao={[{ nome: "cor.marca", valor: "#4f46e5", grupo: "cor" }]} />);

    expect(screen.getByText("cor.marca")).toBeInTheDocument();
    expect(apiTokens.obter).not.toHaveBeenCalled();
    // Semear via API faria o tour ESCREVER no design system de quem só quis ver.
    expect(screen.getByTestId("tokens-salvar")).toBeDisabled();
  });
});
