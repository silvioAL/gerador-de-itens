import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { StatusIa } from "../api/client";
import { ModeloIaTab } from "./ModeloIaTab";

const statusMock = vi.hoisted(() => vi.fn());
const salvarCredencialMock = vi.hoisted(() => vi.fn());
const testarCredencialMock = vi.hoisted(() => vi.fn());
const salvarConfigMock = vi.hoisted(() => vi.fn());

vi.mock("../api/client", async (importActual) => ({
  ...(await importActual<typeof import("../api/client")>()),
  apiIa: { status: statusMock, salvarCredencial: salvarCredencialMock, testarCredencial: testarCredencialMock },
  apiConfigIa: { salvar: salvarConfigMock },
}));

function status(over: Partial<StatusIa> = {}): StatusIa {
  return {
    chatInstalado: true,
    embeddingInstalado: true,
    pronto: true,
    caminhoModelos: "/home/x/.gerador/models",
    provedor: "qwen-local",
    modelosChat: [
      {
        id: "qwen-local",
        nome: "Qwen3-4B",
        papel: "Qwen3-4B (chat/instruct)",
        instalado: true,
        tamanhoAproximadoBytes: 2_500_000_000,
        raciocinador: true,
        selecionado: true,
      },
      {
        id: "compativel-openai",
        nome: "Gateway compatível com OpenAI",
        papel: "Wrapper corporativo, DeepSeek oficial, Ollama…",
        instalado: false,
        tamanhoAproximadoBytes: 0,
        raciocinador: false,
        selecionado: false,
        remoto: true,
      },
    ],
    gateway: { configurado: false },
    presetsGateway: [
      {
        id: "anthropic",
        nome: "Claude (Anthropic)",
        baseUrl: "https://api.anthropic.com/v1",
        modelos: ["claude-sonnet-5", "claude-opus-5"],
        modeloPadrao: "claude-sonnet-5",
        jsonNativo: false,
        urlChave: "https://console.anthropic.com/settings/keys",
        observacao: "Precisa de uma chave de API do console da Anthropic",
      },
      {
        id: "deepseek",
        nome: "DeepSeek (oficial)",
        baseUrl: "https://api.deepseek.com/v1",
        modelos: ["deepseek-chat"],
        modeloPadrao: "deepseek-chat",
        jsonNativo: true,
        observacao: "Cobrança por uso.",
      },
    ],
    ...over,
  };
}

beforeEach(() => {
  statusMock.mockReset();
  salvarCredencialMock.mockReset().mockResolvedValue({ ok: true });
  testarCredencialMock.mockReset();
  salvarConfigMock.mockReset().mockResolvedValue({ provedorPadrao: "compativel-openai" });
  statusMock.mockResolvedValue(status());
});

async function montar(inicial?: StatusIa) {
  if (inicial) statusMock.mockResolvedValue(inicial);
  render(<ModeloIaTab />);
  await waitFor(() => expect(screen.getByTestId("modelo-ia-compativel-openai")).toBeInTheDocument());
}

describe("ModeloIaTab — card do gateway (SPEC-25 Fase 2)", () => {
  it("mostra os TRÊS campos e nada mais — base URL, chave, modelo", async () => {
    await montar();
    expect(screen.getByLabelText("Base URL do gateway")).toBeInTheDocument();
    expect(screen.getByLabelText("Chave de API")).toBeInTheDocument();
    expect(screen.getByLabelText("Nome do modelo")).toBeInTheDocument();
  });

  it("a chave é campo de senha e nunca aparece em texto claro", async () => {
    await montar();
    expect(screen.getByLabelText("Chave de API")).toHaveAttribute("type", "password");
  });

  it("com credencial salva, mostra a MÁSCARA — nunca a chave", async () => {
    await montar(
      status({
        gateway: { configurado: true, baseUrl: "https://gw.interno/v1", modelo: "deepseek-chat", chaveMascarada: "sk-…7890" },
      })
    );
    expect(screen.getByLabelText("Base URL do gateway")).toHaveValue("https://gw.interno/v1");
    expect(screen.getByLabelText("Chave de API")).toHaveAttribute("placeholder", "chave atual: sk-…7890");
    // O campo em si fica vazio: não há como o servidor devolver a chave.
    expect(screen.getByLabelText("Chave de API")).toHaveValue("");
  });

  it("Salvar só habilita com os três preenchidos", async () => {
    await montar();
    const salvar = screen.getByRole("button", { name: "Salvar" });
    expect(salvar).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Base URL do gateway"), { target: { value: "https://gw/v1" } });
    fireEvent.change(screen.getByLabelText("Chave de API"), { target: { value: "sk-1" } });
    expect(salvar).toBeDisabled(); // falta o modelo

    fireEvent.change(screen.getByLabelText("Nome do modelo"), { target: { value: "deepseek-chat" } });
    expect(salvar).toBeEnabled();
  });

  it("um /ia/status que chega no meio da digitação NÃO apaga o que foi digitado", async () => {
    // A corrida que deixou este arquivo intermitente na CI: o pai refaz
    // `/ia/status` (depois de salvar, ou porque o card montou em duas passadas)
    // e o efeito que preenche os campos com a credencial do servidor jogava por
    // cima do texto em edição. Aqui ela é provocada de propósito.
    const { rerender } = render(<ModeloIaTab />);
    await waitFor(() => expect(screen.getByTestId("modelo-ia-compativel-openai")).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText("Base URL do gateway"), { target: { value: "https://digitando/v1" } });
    fireEvent.change(screen.getByLabelText("Chave de API"), { target: { value: "sk-1" } });
    fireEvent.change(screen.getByLabelText("Nome do modelo"), { target: { value: "meu-modelo" } });

    rerender(<ModeloIaTab />); // status chegando de novo no meio do caminho
    await waitFor(() => expect(screen.getByLabelText("Base URL do gateway")).toHaveValue("https://digitando/v1"));
    expect(screen.getByLabelText("Nome do modelo")).toHaveValue("meu-modelo");
    expect(screen.getByRole("button", { name: "Salvar" })).toBeEnabled();
  });

  it("escolher Claude preenche base URL e modelo — ninguém tem que adivinhar a URL", async () => {
    await montar();
    fireEvent.change(screen.getByLabelText("Destino conhecido"), { target: { value: "anthropic" } });

    expect(screen.getByLabelText("Base URL do gateway")).toHaveValue("https://api.anthropic.com/v1");
    expect(screen.getByLabelText("Nome do modelo")).toHaveValue("claude-sonnet-5");
  });

  it("o preset AVISA que a Anthropic ignora o modo JSON — a garantia ali é mais fraca", async () => {
    // A camada de compatibilidade da Anthropic ignora `response_format`
    // (documentado por eles). Quem escolhe merece saber antes, não depois de
    // uma resposta estranha: a estrutura passa a vir de validação + retry.
    await montar();
    fireEvent.change(screen.getByLabelText("Destino conhecido"), { target: { value: "anthropic" } });

    const nota = screen.getByTestId("preset-nota-anthropic");
    expect(nota).toHaveTextContent(/ignora o modo JSON/i);
    expect(nota).toHaveTextContent(/chave de API do console/i);
  });

  it("destino com JSON nativo NÃO mostra o aviso — ele é sobre a exceção", async () => {
    await montar();
    fireEvent.change(screen.getByLabelText("Destino conhecido"), { target: { value: "deepseek" } });
    expect(screen.getByTestId("preset-nota-deepseek")).not.toHaveTextContent(/ignora o modo JSON/i);
  });

  it("trocar de destino troca o modelo sugerido, mas preserva o digitado à mão", async () => {
    // Sem isso, ir de Claude pro DeepSeek deixaria "claude-sonnet-5" apontando
    // pro endpoint errado — erro que só apareceria na primeira chamada.
    await montar();
    fireEvent.change(screen.getByLabelText("Destino conhecido"), { target: { value: "anthropic" } });
    fireEvent.change(screen.getByLabelText("Destino conhecido"), { target: { value: "deepseek" } });
    expect(screen.getByLabelText("Nome do modelo")).toHaveValue("deepseek-chat");

    // Nome próprio de gateway interno sobrevive à troca.
    fireEvent.change(screen.getByLabelText("Nome do modelo"), { target: { value: "modelo-interno-v3" } });
    fireEvent.change(screen.getByLabelText("Destino conhecido"), { target: { value: "anthropic" } });
    expect(screen.getByLabelText("Nome do modelo")).toHaveValue("modelo-interno-v3");
  });

  it("credencial já salva reconhece o destino — não volta como 'preencher à mão'", async () => {
    await montar(
      status({
        gateway: {
          configurado: true,
          baseUrl: "https://api.anthropic.com/v1",
          modelo: "claude-opus-5",
          chaveMascarada: "sk-…7890",
        },
      })
    );
    expect(screen.getByLabelText("Destino conhecido")).toHaveValue("anthropic");
  });

  it("com chave já salva, dá pra mudar só a base URL sem redigitar a chave", async () => {
    // O campo mostra a máscara, não a chave — exigir redigitá-la seria hostil.
    await montar(
      status({ gateway: { configurado: true, baseUrl: "https://antigo/v1", modelo: "m", chaveMascarada: "sk-…9" } })
    );
    fireEvent.change(screen.getByLabelText("Base URL do gateway"), { target: { value: "https://novo/v1" } });
    expect(screen.getByRole("button", { name: "Salvar" })).toBeEnabled();
  });

  it("Salvar manda os três campos e limpa a chave da tela", async () => {
    await montar();
    fireEvent.change(screen.getByLabelText("Base URL do gateway"), { target: { value: "https://gw/v1" } });
    fireEvent.change(screen.getByLabelText("Chave de API"), { target: { value: "sk-secreta" } });
    fireEvent.change(screen.getByLabelText("Nome do modelo"), { target: { value: "deepseek-chat" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));

    await waitFor(() => expect(salvarCredencialMock).toHaveBeenCalled());
    expect(salvarCredencialMock).toHaveBeenCalledWith({
      baseUrl: "https://gw/v1",
      chave: "sk-secreta",
      modelo: "deepseek-chat",
    });
    // A chave sai da tela assim que é gravada.
    await waitFor(() => expect(screen.getByLabelText("Chave de API")).toHaveValue(""));
  });

  it("Testar conexão mostra a amostra que o gateway respondeu", async () => {
    testarCredencialMock.mockResolvedValue({ ok: true, amostra: "ok", duracaoMs: 1200 });
    await montar(
      status({ gateway: { configurado: true, baseUrl: "https://gw/v1", modelo: "m", chaveMascarada: "sk-…9" } })
    );
    fireEvent.click(screen.getByRole("button", { name: "Testar conexão" }));

    await waitFor(() => expect(screen.getByTestId("gateway-resultado")).toHaveTextContent("Respondeu em 1.2s"));
    expect(screen.getByTestId("gateway-resultado")).toHaveTextContent("ok");
  });

  it("falha no teste aparece como falha, não como sucesso silencioso", async () => {
    testarCredencialMock.mockResolvedValue({ ok: false, erro: "Credencial recusada pelo gateway (HTTP 401)." });
    await montar(
      status({ gateway: { configurado: true, baseUrl: "https://gw/v1", modelo: "m", chaveMascarada: "sk-…9" } })
    );
    fireEvent.click(screen.getByRole("button", { name: "Testar conexão" }));

    await waitFor(() =>
      expect(screen.getByTestId("gateway-resultado")).toHaveTextContent("Credencial recusada pelo gateway")
    );
  });

  it("sem credencial, o radio do gateway fica desabilitado — selecionar quebraria a esteira", async () => {
    await montar();
    expect(screen.getByLabelText("Usar Gateway compatível com OpenAI")).toBeDisabled();
  });

  it("com credencial, selecionar o gateway grava em config/ia.json", async () => {
    await montar(
      status({ gateway: { configurado: true, baseUrl: "https://gw/v1", modelo: "m", chaveMascarada: "sk-…9" }, modelosChat: [
        {
          id: "compativel-openai",
          nome: "Gateway compatível com OpenAI",
          papel: "gateway",
          instalado: true,
          tamanhoAproximadoBytes: 0,
          raciocinador: false,
          selecionado: false,
          remoto: true,
        },
      ] })
    );
    fireEvent.click(screen.getByLabelText("Usar Gateway compatível com OpenAI"));
    await waitFor(() => expect(salvarConfigMock).toHaveBeenCalledWith({ provedorPadrao: "compativel-openai" }));
  });

  it("com o gateway em uso, não cobra o embedding local — ele só serve ao RAG", async () => {
    await montar(
      status({
        embeddingInstalado: false,
        gateway: { configurado: true, baseUrl: "https://gw/v1", modelo: "m", chaveMascarada: "sk-…9" },
        modelosChat: [
          {
            id: "compativel-openai",
            nome: "Gateway compatível com OpenAI",
            papel: "gateway",
            instalado: true,
            tamanhoAproximadoBytes: 0,
            raciocinador: false,
            selecionado: true,
            remoto: true,
          },
        ],
      })
    );
    expect(screen.queryByText(/modelo de embedding não está instalado/)).not.toBeInTheDocument();
  });
});
