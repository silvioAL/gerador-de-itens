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
      // SPEC-30: dois campos a mais viajam com a credencial. `baseUrlTranscricao`
      // vem do destino escolhido (aqui, nenhum) e `visao` da marcação manual —
      // que nasce desmarcada, porque oferecer anexo que falha custa a conversa.
      baseUrlTranscricao: undefined,
      visao: false,
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

/**
 * ACHADO apontado pelo usuário: as limitações existiam e a tela não as dizia —
 * a pessoa só descobria na falha. Estes testes existem para os avisos não
 * sumirem numa refatoração: eles são o que evita gastar tempo num caminho que
 * não existe (microfone com Ollama, esteira em CPU, visão marcada à toa).
 */
describe("ModeloIaTab — avisos do destino (SPEC-30)", () => {
  it("Ollama avisa que NÃO transcreve, e diz como subir a voz", async () => {
    await montar();
    fireEvent.change(screen.getByLabelText("Base URL do gateway"), {
      target: { value: "http://ollama:11434/v1" },
    });

    const avisos = screen.getByTestId("avisos-do-destino");
    expect(avisos).toHaveTextContent("não transcreve");
    expect(avisos).toHaveTextContent("--profile ia");
  });

  it("destino local avisa do tempo em CPU — com número, não com 'pode demorar'", async () => {
    await montar();
    fireEvent.change(screen.getByLabelText("Base URL do gateway"), {
      target: { value: "http://localhost:11434/v1" },
    });

    expect(screen.getByTestId("avisos-do-destino")).toHaveTextContent("3min40");
  });

  it("marcar visão avisa que ninguém verifica isso", async () => {
    await montar();
    fireEvent.change(screen.getByLabelText("Base URL do gateway"), {
      target: { value: "https://gateway-interno.empresa/v1" },
    });
    fireEvent.click(screen.getByLabelText("Este modelo enxerga imagem"));

    expect(screen.getByTestId("avisos-do-destino")).toHaveTextContent("não é verificado");
  });

  it("destino público sem visão marcada não vira ruído", async () => {
    // Aviso que aparece sempre deixa de ser lido — só aparece o que muda a
    // decisão daquele destino.
    await montar();
    fireEvent.change(screen.getByLabelText("Base URL do gateway"), {
      target: { value: "https://api.anthropic.com/v1" },
    });

    expect(screen.queryByTestId("avisos-do-destino")).toBeNull();
  });
});

/**
 * SPEC-74 fatia B — o destino que não gasta nada já vem escolhido.
 *
 * A régua tem DUAS metades, e a segunda é a que importa: o padrão vale no
 * vazio, e nunca por cima de quem já configurou. Uma credencial é da
 * organização inteira; apontá-la para o dublê sozinha seria a ferramenta
 * trocando o modelo de todo mundo sem pedir.
 */
const PRESET_SEM_CUSTO = {
  id: "sem-custo",
  nome: "Sem custo (respostas simuladas)",
  baseUrl: "http://gateway-falso:4123/v1",
  modelos: ["modelo-de-mentira"],
  modeloPadrao: "modelo-de-mentira",
  jsonNativo: true,
  observacao: "Não chama modelo nenhum.",
  simulado: true,
  baseUrlsAlternativas: ["http://127.0.0.1:4123"],
};

function statusComSemCusto(over: Partial<StatusIa> = {}): StatusIa {
  const base = status(over);
  return { ...base, presetsGateway: [PRESET_SEM_CUSTO, ...(base.presetsGateway ?? [])] };
}

describe("ModeloIaTab — o modo sem custo como padrão (SPEC-74)", () => {
  it("sem credencial nenhuma, o destino sem custo já vem escolhido e preenchido", async () => {
    await montar(statusComSemCusto());

    expect(screen.getByLabelText("Destino conhecido")).toHaveValue("sem-custo");
    expect(screen.getByLabelText("Base URL do gateway")).toHaveValue("http://gateway-falso:4123/v1");
    expect(screen.getByLabelText("Nome do modelo")).toHaveValue("modelo-de-mentira");
  });

  it("com credencial REAL salva, o padrão não encosta nela", async () => {
    await montar(
      statusComSemCusto({
        gateway: {
          configurado: true,
          baseUrl: "https://gw.interno/v1",
          modelo: "deepseek-chat",
          chaveMascarada: "sk-…7890",
        },
      })
    );

    expect(screen.getByLabelText("Base URL do gateway")).toHaveValue("https://gw.interno/v1");
    expect(screen.getByLabelText("Nome do modelo")).toHaveValue("deepseek-chat");
    expect(screen.getByLabelText("Destino conhecido")).not.toHaveValue("sem-custo");
  });

  it("sem o preset na lista, nada muda — o padrão não inventa endereço", async () => {
    // O servidor é quem manda a lista de destinos. Se ele não oferecer o
    // sem-custo (stack sem o serviço de pé), a tela não pode apontar para um
    // endereço que não responde.
    await montar();

    expect(screen.getByLabelText("Base URL do gateway")).toHaveValue("");
    expect(screen.getByLabelText("Destino conhecido")).toHaveValue("");
  });
});

describe("ModeloIaTab — a marca de destino simulado (SPEC-74 fatia D)", () => {
  it("o destino sem custo avisa, em primeiro lugar, que inventa as respostas", async () => {
    await montar(statusComSemCusto());

    const avisos = screen.getByTestId("avisos-do-destino");
    expect(avisos).toHaveTextContent("NÃO chama modelo nenhum");
    expect(avisos).toHaveTextContent("marcado como simulado");
  });

  it("o aviso vale para quem COLA o endereço à mão, não só para quem escolhe na lista", async () => {
    await montar(statusComSemCusto({ gateway: { configurado: true, baseUrl: "https://gw.interno/v1" } }));
    expect(screen.queryByTestId("avisos-do-destino")).toBeNull();

    fireEvent.change(screen.getByLabelText("Base URL do gateway"), {
      target: { value: "http://gateway-falso:4123/v1" },
    });

    expect(screen.getByTestId("avisos-do-destino")).toHaveTextContent("NÃO chama modelo nenhum");
  });

  it("destino de verdade não ganha a marca — duvidar de trabalho legítimo é o erro caro", async () => {
    await montar(statusComSemCusto());
    fireEvent.change(screen.getByLabelText("Base URL do gateway"), {
      target: { value: "https://api.anthropic.com/v1" },
    });

    expect(screen.queryByTestId("avisos-do-destino")).toBeNull();
  });
});

it("o dublê fora do compose (127.0.0.1) também é reconhecido como simulado", async () => {
  // A suíte E2E aponta para `127.0.0.1:4123`, e o preset oferece o nome do
  // serviço do compose. Sem os endereços alternativos, o destino simulado mais
  // exercitado do repositório seria justamente o que não recebe a marca.
  await montar(statusComSemCusto());
  fireEvent.change(screen.getByLabelText("Base URL do gateway"), {
    target: { value: "http://127.0.0.1:4123/v1" },
  });

  expect(screen.getByTestId("avisos-do-destino")).toHaveTextContent("NÃO chama modelo nenhum");
});
