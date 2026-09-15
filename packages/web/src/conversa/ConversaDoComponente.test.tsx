import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ConversaDoComponente } from "./ConversaDoComponente";
import { apiIa } from "../api/client";

vi.mock("../api/client", async (importActual) => ({
  ...(await importActual<typeof import("../api/client")>()),
  apiIa: { scriptDeMapeamento: vi.fn() },
}));

/**
 * SPEC-115 fatia F (§411) — **mapear um componente e decidir sobre ele.**
 *
 * > *"quanto a poder selecionar os componentes, pegar o script de mapeamento
 * > com o assistente e iterar em uma janela maior com ele para tomar decisões
 * > sobre o componente não achei nada"*
 *
 * As três coisas faltavam. O que estes testes guardam é a que não pode se
 * perder: **o produto não executa nada**. O ciclo é agente escreve → pessoa
 * roda → pessoa cola, e o passo do meio é dela porque é o único que toca o
 * ambiente real (fronteira da SPEC-75, reafirmada na SPEC-115 §2).
 */
const COMPONENTE = { id: "srv", rotulo: "srv-credito-api", tipo: "Serviço", techs: ["Java + Spring Boot"] };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(apiIa.scriptDeMapeamento).mockResolvedValue({
    script: "curl -s http://<host>/actuator/mappings",
    porque: "Lista as rotas que o serviço expõe hoje.",
  });
});

describe("sem componente selecionado", () => {
  it("diz o que fazer, em vez de oferecer campos que não levam a lugar nenhum", () => {
    render(<ConversaDoComponente componente={null} onDecidir={vi.fn()} />);

    expect(screen.getByTestId("conversa-do-componente-sem-foco")).toHaveTextContent("Selecione um componente");
    expect(screen.queryByTestId("pedir-script")).toBeNull();
  });

  it("explica POR QUE é por componente — não é limitação, é o recorte", () => {
    // §1.1.1: discutir oito componentes na mesma conversa produz decisões que
    // não dizem de qual chamada estão falando.
    render(<ConversaDoComponente componente={null} onDecidir={vi.fn()} />);

    expect(screen.getByTestId("conversa-do-componente-sem-foco")).toHaveTextContent("por componente");
  });
});

describe("o script de mapeamento", () => {
  it("é pedido COM o tipo e as techs do componente — é o tipo que dita a forma", async () => {
    render(<ConversaDoComponente componente={COMPONENTE} onDecidir={vi.fn()} />);

    fireEvent.click(screen.getByTestId("pedir-script"));

    await waitFor(() =>
      expect(apiIa.scriptDeMapeamento).toHaveBeenCalledWith({
        rotulo: "srv-credito-api",
        tipo: "Serviço",
        techs: ["Java + Spring Boot"],
        campos: undefined,
      })
    );
  });

  it("mostra o PORQUÊ antes do comando", async () => {
    // Quem vai colar algo num terminal decide isso lendo o propósito, não o awk.
    render(<ConversaDoComponente componente={COMPONENTE} onDecidir={vi.fn()} />);
    fireEvent.click(screen.getByTestId("pedir-script"));

    expect(await screen.findByTestId("porque-do-script")).toHaveTextContent("Lista as rotas que o serviço expõe");
  });

  it("mostra o comando VERBATIM, e diz que quem roda é a pessoa", async () => {
    /**
     * A frase que impede o mal-entendido mais caro desta tela: quem lê "script"
     * numa ferramenta espera um botão de rodar. Não há botão, e não vai haver —
     * o produto não tem, nem deveria ter, credencial do ambiente de ninguém.
     */
    render(<ConversaDoComponente componente={COMPONENTE} onDecidir={vi.fn()} />);
    fireEvent.click(screen.getByTestId("pedir-script"));

    expect(await screen.findByTestId("script-de-mapeamento")).toHaveTextContent(
      "curl -s http://<host>/actuator/mappings"
    );
    expect(screen.getByText(/O gerador não executa nada/)).toBeInTheDocument();
    // E a prova pela negativa: nenhum botão de executar, em lugar nenhum.
    expect(screen.queryByRole("button", { name: /rodar|executar/i })).toBeNull();
  });

  it("erro do agente aparece, e não derruba o resto da aba", async () => {
    vi.mocked(apiIa.scriptDeMapeamento).mockRejectedValue(new Error("sem credencial de IA"));
    render(<ConversaDoComponente componente={COMPONENTE} onDecidir={vi.fn()} />);

    fireEvent.click(screen.getByTestId("pedir-script"));

    expect(await screen.findByTestId("erro-da-conversa-do-componente")).toHaveTextContent("sem credencial de IA");
    // Colar contexto e decidir continuam possíveis: quem já tem o levantamento
    // na mão não depende do agente para o passo 1.
    expect(screen.getByLabelText("Saída do mapeamento")).toBeInTheDocument();
  });
});

describe("decidir sobre o componente", () => {
  it("manda o que foi colado, ancorado NESTE componente", async () => {
    const onDecidir = vi.fn().mockResolvedValue(2);
    render(<ConversaDoComponente componente={COMPONENTE} onDecidir={onDecidir} />);

    fireEvent.change(screen.getByLabelText("Saída do mapeamento"), {
      target: { value: "GET /creditos, POST /creditos" },
    });
    fireEvent.click(screen.getByTestId("decidir-sobre-componente"));

    await waitFor(() =>
      expect(onDecidir).toHaveBeenCalledWith({ contextoDoProjeto: "GET /creditos, POST /creditos", foco: "srv" })
    );
  });

  it("componente NOVO decide sem nada colado — parte do desenho ainda não existe", async () => {
    const onDecidir = vi.fn().mockResolvedValue(1);
    render(<ConversaDoComponente componente={COMPONENTE} onDecidir={onDecidir} />);

    fireEvent.click(screen.getByTestId("decidir-sobre-componente"));

    await waitFor(() => expect(onDecidir).toHaveBeenCalledWith({ contextoDoProjeto: "", foco: "srv" }));
  });

  it("o que volta é PROPOSTA, ancorada no componente, e aceitar é da pessoa", async () => {
    // É o que mantém a trava da SPEC-80 fatia D de pé: o modelo não decidiu
    // nada. Se a tela dissesse "pronto", a pessoa acreditaria que já vale.
    const onDecidir = vi.fn().mockResolvedValue(2);
    render(<ConversaDoComponente componente={COMPONENTE} onDecidir={onDecidir} />);

    fireEvent.click(screen.getByTestId("decidir-sobre-componente"));

    const resultado = await screen.findByTestId("resultado-da-conversa-do-componente");
    expect(resultado).toHaveTextContent("2 decisões propostas");
    expect(resultado).toHaveTextContent("srv-credito-api");
    expect(resultado).toHaveTextContent("aceitar é seu");
  });

  it("zero propostas é resposta legítima, e a tela concorda com o prompt", async () => {
    const onDecidir = vi.fn().mockResolvedValue(0);
    render(<ConversaDoComponente componente={COMPONENTE} onDecidir={onDecidir} />);

    fireEvent.click(screen.getByTestId("decidir-sobre-componente"));

    expect(await screen.findByTestId("resultado-da-conversa-do-componente")).toHaveTextContent(
      "lista vazia é resposta legítima"
    );
  });
});
