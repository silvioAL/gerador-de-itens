import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { DiagramaConfig } from "@gerador/engine";
import { ConversaPanel } from "./ConversaPanel";

const proporDiagramaMock = vi.hoisted(() => vi.fn());
vi.mock("../api/client", async (importActual) => ({
  ...(await importActual<typeof import("../api/client")>()),
  // SPEC-30 Fase 1a: a janela agora pergunta ao servidor se o provedor
  // transcreve (`useVozNaEntrada`). Sem `status` no mock, o componente
  // quebra — e o mock incompleto seria uma mentira sobre o contrato.
  // "não transcreve" mantém estas specs no cenário que elas descrevem.
  apiIa: { proporDiagrama: proporDiagramaMock, status: async () => ({ capacidades: { transcricao: false } }) },
}));

const config = {
  nodeTypes: {
    service: { label: "Serviço", spec: [] },
    rabbitQueue: { label: "Fila Rabbit", spec: [] },
  },
  edgeTypes: { http: { label: "HTTP" }, publica: { label: "publica em" } },
  edgeRules: {},
} as unknown as DiagramaConfig;

const PROPOSTA = {
  nos: [
    { id: "n1", tipo: "service", rotulo: "srv-checkout", motivo: "orquestra o fechamento do pedido" },
    { id: "n2", tipo: "service", rotulo: "srv-fidelidade", motivo: "guarda o saldo de pontos" },
  ],
  arestas: [{ de: "n1", para: "n2", tipo: "http", motivo: "consulta o saldo antes de fechar" }],
};

beforeEach(() => {
  proporDiagramaMock.mockReset();
  proporDiagramaMock.mockResolvedValue(PROPOSTA);
});

describe("ConversaPanel (SPEC-27 Fase 1 — a conversa do desenho)", () => {
  it("manda a descrição junto com os tipos que a configuração REALMENTE tem", async () => {
    render(<ConversaPanel config={config} onAplicar={vi.fn()} onFechar={vi.fn()} techs={["Backend"]} />);

    fireEvent.change(screen.getByLabelText("Descreva a demanda"), {
      target: { value: "o checkout precisa consultar o saldo de pontos" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Enviar" }));

    await waitFor(() => expect(proporDiagramaMock).toHaveBeenCalled());
    const [pedido] = proporDiagramaMock.mock.calls.at(-1)!;
    expect(pedido.descricao).toBe("o checkout precisa consultar o saldo de pontos");
    // É isso que impede o modelo de propor um tipo que a ferramenta não sabe criar.
    expect(pedido.tiposDeNo).toEqual([
      { id: "service", rotulo: "Serviço" },
      { id: "rabbitQueue", rotulo: "Fila Rabbit" },
    ]);
    expect(pedido.tiposDeConexao.map((t: { id: string }) => t.id)).toEqual(["http", "publica"]);
    expect(pedido.techs).toEqual(["Backend"]);
  });

  it("a proposta aparece com o PORQUÊ de cada nó — sem isso é caixa-preta pedindo confiança cega", async () => {
    render(<ConversaPanel config={config} onAplicar={vi.fn()} onFechar={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Descreva a demanda"), { target: { value: "qualquer coisa" } });
    fireEvent.click(screen.getByRole("button", { name: "Enviar" }));

    await waitFor(() => expect(screen.getByText("srv-checkout")).toBeInTheDocument());
    expect(screen.getByText("orquestra o fechamento do pedido")).toBeInTheDocument();
    expect(screen.getByText("consulta o saldo antes de fechar")).toBeInTheDocument();
  });

  it("nada é aplicado sozinho: só ao clicar em Aplicar ao canvas", async () => {
    const onAplicar = vi.fn();
    render(<ConversaPanel config={config} onAplicar={onAplicar} onFechar={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Descreva a demanda"), { target: { value: "qualquer coisa" } });
    fireEvent.click(screen.getByRole("button", { name: "Enviar" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Aplicar ao canvas" })).toBeInTheDocument());
    expect(onAplicar).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Aplicar ao canvas" }));
    expect(onAplicar).toHaveBeenCalledWith(PROPOSTA);
  });

  it("o contexto do épico já escrito entra na caixa — não se pede pra digitar tudo de novo", () => {
    render(
      <ConversaPanel
        config={config}
        contextoInicial="reduzir o tempo de aprovação de crédito de 3 dias pra 1 hora"
        onAplicar={vi.fn()}
        onFechar={vi.fn()}
      />
    );
    expect(screen.getByLabelText("Descreva a demanda")).toHaveValue(
      "reduzir o tempo de aprovação de crédito de 3 dias pra 1 hora"
    );
  });

  it("a stack do time entra no pedido — contexto que o usuário não deveria repetir a cada demanda", async () => {
    render(
      <ConversaPanel
        config={config}
        timeAtivo="pagamentos"
        perfisTime={{ pagamentos: { service: { linguagem: "Java", framework: "Spring Boot" } } }}
        onAplicar={vi.fn()}
        onFechar={vi.fn()}
      />
    );
    fireEvent.change(screen.getByLabelText("Descreva a demanda"), { target: { value: "x" } });
    fireEvent.click(screen.getByRole("button", { name: "Enviar" }));

    await waitFor(() => expect(proporDiagramaMock).toHaveBeenCalled());
    const [pedido] = proporDiagramaMock.mock.calls.at(-1)!;
    expect(pedido.perfilTime).toContain("linguagem: Java");
    expect(pedido.perfilTime).toContain("framework: Spring Boot");
  });

  it("falha do modelo aparece na conversa, sem derrubar a janela", async () => {
    proporDiagramaMock.mockRejectedValue(new Error("modelos de IA não instalados"));
    render(<ConversaPanel config={config} onAplicar={vi.fn()} onFechar={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Descreva a demanda"), { target: { value: "x" } });
    fireEvent.click(screen.getByRole("button", { name: "Enviar" }));

    await waitFor(() => expect(screen.getByText(/Não consegui: modelos de IA não instalados/)).toBeInTheDocument());
    expect(screen.getByLabelText("Descreva a demanda")).toBeInTheDocument();
  });
});
