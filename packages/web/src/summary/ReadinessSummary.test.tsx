import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Diagrama, DiagramaConfig } from "@gerador/engine";
import { ReadinessSummary } from "./ReadinessSummary";

const config: DiagramaConfig = {
  nodeTypes: {
    service: {
      label: "Serviço",
      derives: "service",
      techs: [],
      contextos: [],
      spec: [{ key: "nome", label: "Nome do serviço", type: "text", required: true }],
    },
  },
  edgeTypes: {},
  edgeRules: {},
};

function diagramaComDoisVermelhosEUmVerde(): Diagrama {
  return {
    nodes: [
      { id: "n1", type: "service", status: "novo", label: "srv-a", x: 0, y: 0, spec: {}, specNA: {} },
      { id: "n2", type: "service", status: "novo", label: "srv-b", x: 0, y: 0, spec: {}, specNA: {} },
      {
        id: "n3",
        type: "service",
        status: "novo",
        label: "srv-c",
        x: 0,
        y: 0,
        spec: { nome: { valor: "srv-c", origem: "manual" } },
        specNA: {},
      },
    ],
    edges: [],
  };
}

describe("ReadinessSummary", () => {
  it("popover da contagem começa fechado e abre ao clicar no badge, mostrando o campo que falta", async () => {
    const user = userEvent.setup();
    render(
      <ReadinessSummary diagrama={diagramaComDoisVermelhosEUmVerde()} config={config} onSelecionar={vi.fn()} />
    );

    expect(screen.queryByText("srv-a")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /vermelho/i }));

    expect(screen.getByText("srv-a")).toBeInTheDocument();
    expect(screen.getByText("srv-b")).toBeInTheDocument();
    // Os dois nós vermelhos compartilham o mesmo campo obrigatório em aberto.
    expect(screen.getAllByText("Nome do serviço")).toHaveLength(2);
  });

  it("clicar num item da lista seleciona o nó e fecha o popover", async () => {
    const user = userEvent.setup();
    const onSelecionar = vi.fn();
    render(
      <ReadinessSummary diagrama={diagramaComDoisVermelhosEUmVerde()} config={config} onSelecionar={onSelecionar} />
    );

    await user.click(screen.getByRole("button", { name: /vermelho/i }));
    await user.click(screen.getByText("srv-a"));

    expect(onSelecionar).toHaveBeenCalledWith("n1");
    expect(screen.queryByText("srv-b")).not.toBeInTheDocument();
  });

  it("clicar fora do popover fecha ele", async () => {
    const user = userEvent.setup();
    render(
      <div>
        <ReadinessSummary diagrama={diagramaComDoisVermelhosEUmVerde()} config={config} onSelecionar={vi.fn()} />
        <button>fora</button>
      </div>
    );

    await user.click(screen.getByRole("button", { name: /vermelho/i }));
    expect(screen.getByText("srv-a")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "fora" }));
    expect(screen.queryByText("srv-a")).not.toBeInTheDocument();
  });

  it('"Próximo pendente" cicla pelos nós vermelho/amarelo, um a cada clique, voltando ao início ao esgotar', async () => {
    const user = userEvent.setup();
    const onSelecionar = vi.fn();
    render(
      <ReadinessSummary diagrama={diagramaComDoisVermelhosEUmVerde()} config={config} onSelecionar={onSelecionar} />
    );

    const botaoProximo = screen.getByRole("button", { name: /Próximo pendente \(2\)/ });
    await user.click(botaoProximo);
    await user.click(botaoProximo);
    await user.click(botaoProximo);

    expect(onSelecionar.mock.calls.map((c) => c[0])).toEqual(["n1", "n2", "n1"]);
  });

  it("sem nenhum nó pendente, não mostra o botão Próximo pendente", () => {
    const diagrama: Diagrama = {
      nodes: [
        {
          id: "n1",
          type: "service",
          status: "novo",
          label: "srv-a",
          x: 0,
          y: 0,
          spec: { nome: { valor: "srv-a", origem: "manual" } },
          specNA: {},
        },
      ],
      edges: [],
    };
    render(<ReadinessSummary diagrama={diagrama} config={config} onSelecionar={vi.fn()} />);

    expect(screen.queryByText(/Próximo pendente/)).not.toBeInTheDocument();
  });
});

/**
 * SPEC-57 fatia A — a dimensão PROPÓSITO na mesma barra.
 * A medida aparece onde a decisão é tomada (SPEC-56 §0.8), não numa aba de
 * relatório: é por isso que ela mora aqui e não numa tela nova.
 */
describe("ReadinessSummary — a dimensão propósito", () => {
  it("sem necessidade declarada, o indicador NÃO aparece", () => {
    // Dimensão nova não pode acusar quem nunca a usou.
    render(
      <ReadinessSummary diagrama={diagramaComDoisVermelhosEUmVerde()} config={config} onSelecionar={() => {}} />
    );
    expect(screen.queryByTestId("proposito-resumo")).not.toBeInTheDocument();
  });

  it("necessidade sem componente aparece contada, e o clique leva onde se resolve", async () => {
    const user = userEvent.setup();
    const onAbrirProposito = vi.fn();
    render(
      <ReadinessSummary
        diagrama={diagramaComDoisVermelhosEUmVerde()}
        config={config}
        onSelecionar={() => {}}
        necessidades={[
          { id: "r1", texto: "sem ninguém", origem: "manual", atendidaPor: [] },
          { id: "r2", texto: "coberta", origem: "manual", atendidaPor: ["n1"] },
        ]}
        onAbrirProposito={onAbrirProposito}
      />
    );

    const chip = screen.getByTestId("proposito-resumo");
    expect(chip).toHaveTextContent("1 sem componente");

    await user.click(chip);
    expect(onAbrirProposito).toHaveBeenCalled();
  });

  it("com tudo coberto, o indicador diz isso em vez de sumir", () => {
    // Sumir faria parecer que a dimensão não existe; dizer "coberto" é o que
    // dá crédito ao trabalho de ligar.
    render(
      <ReadinessSummary
        diagrama={diagramaComDoisVermelhosEUmVerde()}
        config={config}
        onSelecionar={() => {}}
        necessidades={[{ id: "r1", texto: "coberta", origem: "manual", atendidaPor: ["n1"] }]}
      />
    );
    expect(screen.getByTestId("proposito-resumo")).toHaveTextContent("propósito coberto");
  });

  it("necessidade sugerida e não confirmada não conta como lacuna", () => {
    render(
      <ReadinessSummary
        diagrama={diagramaComDoisVermelhosEUmVerde()}
        config={config}
        onSelecionar={() => {}}
        necessidades={[{ id: "r1", texto: "sugerida", origem: "sugerido", atendidaPor: [] }]}
      />
    );
    expect(screen.getByTestId("proposito-resumo")).toHaveTextContent("propósito coberto");
  });
});
