import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { DiagramaConfig } from "@gerador/engine";
import { ConfigurarPanel } from "./ConfigurarPanel";
import { PAPEIS_PADRAO } from "../api/client";

const configurarMock = vi.hoisted(() => vi.fn());
const sugerirConfigMock = vi.hoisted(() => vi.fn());
const minhasMock = vi.hoisted(() => vi.fn());
vi.mock("../api/client", async (importActual) => ({
  ...(await importActual<typeof import("../api/client")>()),
  apiIa: { configurar: configurarMock, sugerirConfig: sugerirConfigMock },
  apiAcessos: { minhas: minhasMock },
}));

const config = {
  nodeTypes: {
    service: { label: "Serviço", spec: [] },
    rabbitQueue: { label: "Fila Rabbit", spec: [] },
  },
  edgeTypes: { http: { label: "HTTP" } },
  edgeRules: {},
} as unknown as DiagramaConfig;

const CAMPO_PROPOSTO = {
  key: "runbookPlantao",
  label: "Runbook de plantão",
  type: "text",
  ajuda: "Link do runbook que o plantão segue.",
  opcoes: [],
  required: true,
  permiteNA: false,
};

function montar(extra: Partial<Parameters<typeof ConfigurarPanel>[0]> = {}) {
  const onCriarCampoNo = vi.fn().mockResolvedValue(undefined);
  const onCriarCampoAresta = vi.fn().mockResolvedValue(undefined);
  const onSalvarPipelineAgentes = vi.fn().mockResolvedValue(undefined);
  render(
    <ConfigurarPanel
      config={config}
      camposNo={[]}
      camposAresta={[]}
      pipelineAgentes={{ confirmacaoObrigatoria: true }}
      timeAtivo="time-pagamentos"
      hospedado={false}
      onCriarCampoNo={onCriarCampoNo}
      onCriarCampoAresta={onCriarCampoAresta}
      onSalvarPipelineAgentes={onSalvarPipelineAgentes}
      {...extra}
    />
  );
  return { onCriarCampoNo, onCriarCampoAresta, onSalvarPipelineAgentes };
}

async function enviarIntencao(texto: string) {
  fireEvent.change(screen.getByLabelText("Descreva o que configurar"), { target: { value: texto } });
  fireEvent.click(screen.getByRole("button", { name: "Enviar" }));
}

beforeEach(() => {
  configurarMock.mockReset();
  sugerirConfigMock.mockReset();
  minhasMock.mockReset();
  configurarMock.mockResolvedValue({
    texto: "Proponho um campo obrigatório de runbook no Serviço.",
    propostas: [{ alvo: "campo-no", instrucao: "campo obrigatório de runbook de plantão para serviços" }],
  });
  sugerirConfigMock.mockResolvedValue(CAMPO_PROPOSTO);
});

describe("ConfigurarPanel (SPEC-34 Fase 1 — configurar conversando)", () => {
  it("a conversa vira proposta materializada, e Aplicar cria o campo pela rota de sempre", async () => {
    const props = montar();
    await enviarIntencao("todo serviço novo precisa declarar o runbook de plantão");

    // Passo 1 recebeu a conversa e o resumo da config atual.
    await waitFor(() => expect(configurarMock).toHaveBeenCalled());
    const [pedido] = configurarMock.mock.calls.at(-1)!;
    expect(pedido.mensagens.at(-1)).toEqual({
      autor: "voce",
      texto: "todo serviço novo precisa declarar o runbook de plantão",
    });
    expect(pedido.resumoConfig).toContain("service (Serviço)");

    // Passo 2 materializou com a instrução destilada, não com a conversa.
    await waitFor(() => expect(sugerirConfigMock).toHaveBeenCalled());
    expect(sugerirConfigMock.mock.calls.at(-1)![0]).toMatchObject({
      alvo: "campo-no",
      instrucao: "campo obrigatório de runbook de plantão para serviços",
    });

    await waitFor(() => expect(screen.getByText("Runbook de plantão")).toBeInTheDocument());
    expect(props.onCriarCampoNo).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Aplicar" }));
    await waitFor(() => expect(props.onCriarCampoNo).toHaveBeenCalled());
    expect(props.onCriarCampoNo.mock.calls.at(-1)![0]).toMatchObject({
      tipoNo: "service",
      key: "runbookPlantao",
      label: "Runbook de plantão",
      required: true,
      timeId: "time-pagamentos",
    });
    expect(await screen.findByTestId("proposta-aplicada")).toBeInTheDocument();
  });

  it("o destino é escolha do usuário — trocar o select muda onde o campo nasce", async () => {
    const props = montar();
    await enviarIntencao("campo de fila");
    await waitFor(() => expect(screen.getByText("Runbook de plantão")).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText("Destino da proposta"), { target: { value: "rabbitQueue" } });
    fireEvent.click(screen.getByRole("button", { name: "Aplicar" }));

    await waitFor(() => expect(props.onCriarCampoNo).toHaveBeenCalled());
    expect(props.onCriarCampoNo.mock.calls.at(-1)![0]).toMatchObject({ tipoNo: "rabbitQueue" });
  });

  it("aplicar um papel preserva os papéis de fábrica — gravar só o novo apagaria a esteira", async () => {
    configurarMock.mockResolvedValue({
      texto: "Proponho um papel de segurança.",
      propostas: [{ alvo: "papel", instrucao: "papel que revisa requisitos de segurança" }],
    });
    sugerirConfigMock.mockResolvedValue({
      id: "seguranca",
      nome: "Segurança",
      descricao: "Revisa requisitos de segurança",
      preambulo: "Você é o revisor de segurança…",
      contextos: [],
    });
    const props = montar();
    await enviarIntencao("quero um agente de segurança na esteira");
    await waitFor(() => expect(screen.getByText("Segurança")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Aplicar" }));
    await waitFor(() => expect(props.onSalvarPipelineAgentes).toHaveBeenCalled());
    const salvo = props.onSalvarPipelineAgentes.mock.calls.at(-1)![0];
    expect(salvo.papeis).toHaveLength(PAPEIS_PADRAO.length + 1);
    expect(salvo.papeis.at(-1)).toMatchObject({ id: "seguranca", grupo: "especialista", ativo: true });
  });

  it("sem permissão o Aplicar fica desabilitado COM o motivo escrito — não some (§144)", async () => {
    minhasMock.mockResolvedValue({ rbacAtivo: true, porRecurso: {} });
    montar({ hospedado: true });
    await enviarIntencao("campo novo");
    await waitFor(() => expect(screen.getByText("Runbook de plantão")).toBeInTheDocument());

    const aplicar = screen.getByRole("button", { name: "Aplicar" });
    await waitFor(() => expect(aplicar).toBeDisabled());
    expect(screen.getByText(/sem permissão para editar campo de componente/)).toBeInTheDocument();
  });

  it("resposta sem proposta é conversa, não erro — o agente pode perguntar de volta", async () => {
    configurarMock.mockResolvedValue({ texto: "Em qual tipo de componente isso vale?", propostas: [] });
    montar();
    await enviarIntencao("quero melhorar a configuração");

    await waitFor(() => expect(screen.getByText("Em qual tipo de componente isso vale?")).toBeInTheDocument());
    expect(sugerirConfigMock).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Aplicar" })).not.toBeInTheDocument();
  });
});
