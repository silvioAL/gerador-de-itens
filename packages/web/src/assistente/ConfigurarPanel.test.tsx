import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { DiagramaConfig } from "@gerador/engine";
import { ConfigurarPanel } from "./ConfigurarPanel";
import { PAPEIS_PADRAO } from "../api/client";

const configurarMock = vi.hoisted(() => vi.fn());
const sugerirConfigMock = vi.hoisted(() => vi.fn());
const statusIaMock = vi.hoisted(() => vi.fn().mockResolvedValue({ capacidades: {} }));
const minhasMock = vi.hoisted(() => vi.fn());
const regrasObterMock = vi.hoisted(() => vi.fn());
const regrasSalvarMock = vi.hoisted(() => vi.fn());
vi.mock("../api/client", async (importActual) => ({
  ...(await importActual<typeof import("../api/client")>()),
  apiIa: { configurar: configurarMock, sugerirConfig: sugerirConfigMock, status: statusIaMock, transcrever: vi.fn() },
  apiAcessos: { minhas: minhasMock },
  apiRegras: { obter: regrasObterMock, salvar: regrasSalvarMock },
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
  regrasObterMock.mockReset();
  regrasSalvarMock.mockReset();
  regrasSalvarMock.mockImplementation(async (d) => d);
  // O painel agora é sempre hospedado (§158): o hook de permissões busca de
  // verdade — modo aberto (sem papel) é o default que deixa tudo permitido.
  minhasMock.mockResolvedValue({ rbacAtivo: false, porRecurso: {} });
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
    montar();
    await enviarIntencao("campo novo");
    await waitFor(() => expect(screen.getByText("Runbook de plantão")).toBeInTheDocument());

    const aplicar = screen.getByRole("button", { name: "Aplicar" });
    await waitFor(() => expect(aplicar).toBeDisabled());
    expect(screen.getByText(/sem permissão para editar campo de componente/)).toBeInTheDocument();
  });

  it("aplicar uma regra acrescenta na seção da tech e PRESERVA o resto do documento", async () => {
    configurarMock.mockResolvedValue({
      texto: "Proponho um requisito de retry.",
      propostas: [{ alvo: "regra-refinamento", instrucao: "definir política de retry para chamadas kafka" }],
    });
    sugerirConfigMock.mockResolvedValue({ texto: "Definir a política de retry e o timeout", contextos: [] });
    // Documento com material que a conversa NÃO edita — sumir com ele seria o
    // defeito clássico de "a UI virou dona do arquivo" (SPEC-23 §6.7).
    regrasObterMock.mockResolvedValue({
      tipos: ["Story"],
      porTech: {
        java: {
          checklistTecnico: [{ texto: "definir pool", contextos: [] }],
          checklistProcesso: [{ texto: "abrir mudança", contextos: [] }],
        },
      },
    });
    montar({ techs: ["java", "kafka"] });
    await enviarIntencao("todo consumo kafka precisa de política de retry");
    await waitFor(() => expect(screen.getByText("Definir a política de retry e o timeout")).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText("Destino da proposta"), { target: { value: "kafka" } });
    fireEvent.click(screen.getByRole("button", { name: "Aplicar" }));

    await waitFor(() => expect(regrasSalvarMock).toHaveBeenCalled());
    const salvo = regrasSalvarMock.mock.calls.at(-1)![0];
    expect(salvo.tipos).toEqual(["Story"]);
    expect(salvo.porTech.java.checklistTecnico).toEqual([{ texto: "definir pool", contextos: [] }]);
    expect(salvo.porTech.java.checklistProcesso).toEqual([{ texto: "abrir mudança", contextos: [] }]);
    expect(salvo.porTech.kafka.checklistTecnico).toEqual([
      { texto: "Definir a política de retry e o timeout", contextos: [] },
    ]);
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

describe("ConfigurarPanel — botão de falar (SPEC-30, achado real: a fala prometia voz e o botão não existia)", () => {
  it("aparece quando o provedor transcreve — mesma regra das outras duas janelas de conversa", async () => {
    statusIaMock.mockResolvedValue({ capacidades: { transcricao: true } });
    montar();
    expect(await screen.findByTestId("voz-falar")).toBeTruthy();
  });

  it("não aparece quando o provedor não transcreve", async () => {
    statusIaMock.mockResolvedValue({ capacidades: { transcricao: false } });
    montar();
    await waitFor(() => expect(statusIaMock).toHaveBeenCalled());
    expect(screen.queryByTestId("voz-falar")).toBeNull();
  });
});

/**
 * §274 — o contexto do produto proposto pela CONVERSA.
 *
 * O §271 tinha uma caixinha de instrução única dentro da aba de produto. Ela
 * serve a quem já sabe dizer o produto inteiro numa frase, que é o caso raro;
 * escrever o que um produto É se faz por partes, e isso é conversa.
 */
describe("ConfigurarPanel — contexto do produto", () => {
  const CONTEXTO = {
    objetivo: "Levar a conta do cliente para outro banco.",
    quemUsa: "Cliente PF que troca de banco.",
    regrasDeNegocio: "",
    sistemas: "",
    restricoes: "Resolução 4.753 do BACEN.",
  };

  it("a proposta mostra só as seções preenchidas, e aplicar grava no produto escolhido", async () => {
    configurarMock.mockResolvedValue({
      texto: "Posso escrever o contexto da Portabilidade.",
      propostas: [{ alvo: "contexto-do-produto", instrucao: "portabilidade de conta salário" }],
    });
    sugerirConfigMock.mockResolvedValue(CONTEXTO);
    const onAplicarContextoDoProduto = vi.fn().mockResolvedValue(undefined);
    montar({ produtos: [{ id: "p1", nome: "Portabilidade" }], onAplicarContextoDoProduto });

    await enviarIntencao("quero descrever a portabilidade");

    const cartao = await screen.findByTestId("proposta-contexto-do-produto");
    expect(cartao.textContent).toContain("Levar a conta do cliente para outro banco.");
    // Seção vazia não vira rótulo solto: listar "Sistemas" sem conteúdo faria a
    // proposta parecer maior do que é.
    expect(cartao.textContent).not.toContain("Sistemas");

    fireEvent.click(screen.getByRole("button", { name: "Aplicar" }));

    await waitFor(() => expect(onAplicarContextoDoProduto).toHaveBeenCalledWith("p1", CONTEXTO));
  });

  it("sem produto cadastrado, não há para onde aplicar", async () => {
    configurarMock.mockResolvedValue({
      texto: "Posso escrever o contexto.",
      propostas: [{ alvo: "contexto-do-produto", instrucao: "portabilidade" }],
    });
    sugerirConfigMock.mockResolvedValue(CONTEXTO);
    const onAplicarContextoDoProduto = vi.fn().mockResolvedValue(undefined);
    montar({ produtos: [], onAplicarContextoDoProduto });

    await enviarIntencao("quero descrever a portabilidade");
    await screen.findByTestId("proposta-contexto-do-produto");

    // O botão fica apagado — e DIZ por quê. Botão morto sem explicação lê como
    // app quebrado (a régua do §144, que este arquivo já aplicava à permissão).
    expect(screen.getByRole("button", { name: "Aplicar" })).toBeDisabled();
    expect(screen.getByTestId("sem-destino").textContent).toContain("cadastre um produto antes");
    expect(onAplicarContextoDoProduto).not.toHaveBeenCalled();
  });
});
