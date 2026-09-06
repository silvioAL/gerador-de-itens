import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { DiagramaConfig } from "@gerador/engine";
import { ConversaPanel } from "./ConversaPanel";

/**
 * SPEC-81 fatia D, do lado da tela — **o ADR chega na caixa, não no diagrama.**
 *
 * Arquivo separado do `ConversaPanel.test.tsx` porque aquele mocka a `api/client`
 * com `importActual` espalhado: sobrescrever `apiExportador` lá mudaria o cenário
 * de doze specs que não têm nada a ver com ADR.
 */

const obterMock = vi.hoisted(() => vi.fn());
const executarConectorMock = vi.hoisted(() => vi.fn());
const buscarQuebraMock = vi.hoisted(() => vi.fn());

vi.mock("../api/client", async (importActual) => ({
  ...(await importActual<typeof import("../api/client")>()),
  apiIa: { proporDiagrama: vi.fn(), status: async () => ({ capacidades: { transcricao: false } }) },
  apiExportador: { obter: obterMock },
  apiQuebras: { buscar: buscarQuebraMock },
  apiCatalogoDeConectores: { executar: executarConectorMock },
}));

const config = {
  nodeTypes: { service: { label: "Serviço", spec: [] } },
  edgeTypes: { http: { label: "HTTP" } },
  edgeRules: {},
} as unknown as DiagramaConfig;

const COM_DESTINO = {
  endpoint: "",
  rotulo: "",
  cabecalhos: {},
  destinos: [{ id: "a", operacao: "adr", endpoint: "https://gw/adr", rotulo: "ADR" }],
};

/** SPEC-107 G3 — a tela lê o gateway pelo executor genérico de conector; o mock
 * devolve o ADR CRU (`{saida: {adrs}}`), e a conversão para decisão roda no
 * hook, com a aplicação. */
const RESPOSTA_DO_GATEWAY = {
  conector: "a",
  saida: {
    adrs: [
      {
        id: "ADR-14",
        titulo: "Integração com bureau",
        escolhida: "Fila",
        porque: "desacopla o tempo do parceiro",
        status: "aceita",
        autor: "ana",
        em: "2026-08-29T10:00:00.000Z",
        link: "https://adr/14",
      },
    ],
  },
  ausentes: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  obterMock.mockResolvedValue(COM_DESTINO);
  executarConectorMock.mockResolvedValue(RESPOSTA_DO_GATEWAY);
  buscarQuebraMock.mockResolvedValue({ decisoes: [] });
});

describe("trazer as decisões da casa para a conversa (SPEC-81 fatia D)", () => {
  it("o texto do ADR aparece NA CAIXA — a pessoa lê antes de enviar", async () => {
    /**
     * O §325 parou porque um ADR importado nascia sem âncora e não havia onde
     * uma decisão solta aparecer. Aqui ele nem vira decisão: vira texto, e a
     * decisão nasce depois, ancorada nos nós que o desenho criou.
     */
    render(<ConversaPanel config={config} onAplicar={vi.fn()} techs={["Backend"]} quebraId="q-1" />);

    fireEvent.click(await screen.findByTestId("trazer-adr"));

    const caixa = screen.getByLabelText("Descreva a demanda") as HTMLTextAreaElement;
    await waitFor(() => expect(caixa.value).toContain("Integração com bureau"));
    expect(screen.getByTestId("adr-trazidos")).toHaveTextContent("revise antes de enviar");
  });

  it("NÃO envia sozinho — o botão de enviar continua sendo da pessoa", async () => {
    // Texto vindo de um repositório de terceiro indo direto ao modelo viraria nó
    // errado no diagrama sem ninguém saber de onde veio.
    render(<ConversaPanel config={config} onAplicar={vi.fn()} techs={["Backend"]} quebraId="q-1" />);

    fireEvent.click(await screen.findByTestId("trazer-adr"));

    await waitFor(() => expect(screen.getByTestId("adr-trazidos")).toBeInTheDocument());
    expect(screen.queryByText(/pensando/i)).toBeNull();
  });

  it("sem demanda salva o botão não existe — sem id não há o que perguntar", async () => {
    render(<ConversaPanel config={config} onAplicar={vi.fn()} techs={["Backend"]} />);

    await waitFor(() => expect(obterMock).toHaveBeenCalled());
    expect(screen.queryByTestId("trazer-adr")).toBeNull();
  });

  it("sem destino de ADR configurado o botão não existe", async () => {
    // A mesma disciplina do botão de falar: um botão que busca e morre
    // desperdiça o tempo e a atenção de quem clica.
    obterMock.mockResolvedValue({ endpoint: "", rotulo: "", cabecalhos: {} });
    render(<ConversaPanel config={config} onAplicar={vi.fn()} techs={["Backend"]} quebraId="q-1" />);

    await waitFor(() => expect(obterMock).toHaveBeenCalled());
    expect(screen.queryByTestId("trazer-adr")).toBeNull();
  });

  it("zero decisões diz isso, e não deixa a caixa mentir", async () => {
    executarConectorMock.mockResolvedValue({ conector: "a", saida: { adrs: [] }, ausentes: [] });
    render(<ConversaPanel config={config} onAplicar={vi.fn()} techs={["Backend"]} quebraId="q-1" />);

    fireEvent.click(await screen.findByTestId("trazer-adr"));

    await waitFor(() => expect(screen.getByTestId("adr-trazidos")).toHaveTextContent("nenhuma decisão nova"));
    expect((screen.getByLabelText("Descreva a demanda") as HTMLTextAreaElement).value).toBe("");
  });

  it("falha do gateway aparece na tela e a conversa segue", async () => {
    executarConectorMock.mockRejectedValue(new Error("gateway fora do ar"));
    render(<ConversaPanel config={config} onAplicar={vi.fn()} techs={["Backend"]} quebraId="q-1" />);

    fireEvent.click(await screen.findByTestId("trazer-adr"));

    await waitFor(() => expect(screen.getByTestId("adr-erro")).toHaveTextContent("gateway fora do ar"));
    expect(screen.getByLabelText("Descreva a demanda")).toBeEnabled();
  });
});
