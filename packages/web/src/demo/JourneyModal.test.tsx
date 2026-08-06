import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { DiagramaConfig, Quebra } from "@gerador/engine";
import { JourneyModal } from "./JourneyModal";
import type { Cenario } from "./scenarios";

const config: DiagramaConfig = {
  nodeTypes: {
    service: { label: "Serviço", derives: "service", techs: [], contextos: [], spec: [], color: "#3b82f6" },
    mongo: { label: "Coleção Mongo", derives: "datastore", techs: [], contextos: [], spec: [], color: "#10b981" },
  },
  edgeTypes: {},
  edgeRules: {},
};

function quebraVazia(): Quebra {
  return { diagrama: { nodes: [], edges: [] } };
}

const cenarios: Cenario[] = [
  {
    id: "mongo",
    titulo: "Dados não-relacionais",
    descricao: "Coleção Mongo nova.",
    tipos: ["service", "mongo"],
    categoria: "demo",
    designPatterns: [],
    quebra: quebraVazia(),
  },
  {
    id: "hexagonal-pedidos",
    titulo: "Hexagonal: módulo de pedidos",
    descricao: "Referência de arquitetura hexagonal pra bootstrap de projeto novo.",
    tipos: ["service"],
    categoria: "padrao-arquitetural",
    designPatterns: ["hexagonal", "ddd"],
    quebra: quebraVazia(),
  },
];

describe("JourneyModal", () => {
  it("abre na aba jornada mostrando as 5 etapas e o que cada saída serve", () => {
    render(
      <JourneyModal
        config={config}
        cenarios={cenarios}
        onFechar={vi.fn()}
        onCarregarCenario={vi.fn()}
        onAdicionarCenario={vi.fn()}
        onImportarGraphify={vi.fn()}
        onIniciarTour={vi.fn()}
      />
    );

    expect(screen.getByText("Diagrama")).toBeInTheDocument();
    expect(screen.getByText("Prontidão")).toBeInTheDocument();
    expect(screen.getByText("Derivar")).toBeInTheDocument();
    expect(screen.getByText("Revisão")).toBeInTheDocument();
    expect(screen.getByText("Saídas")).toBeInTheDocument();
    expect(screen.getByText(/backlog pronto para colar/)).toBeInTheDocument();
    expect(screen.getByText(/mecanismo determinístico/)).toBeInTheDocument();
  });

  it("troca para a aba de cenários e lista todos os cenários recebidos, com categoria e design patterns quando houver", async () => {
    const user = userEvent.setup();
    render(
      <JourneyModal
        config={config}
        cenarios={cenarios}
        onFechar={vi.fn()}
        onCarregarCenario={vi.fn()}
        onAdicionarCenario={vi.fn()}
        onImportarGraphify={vi.fn()}
        onIniciarTour={vi.fn()}
      />
    );

    await user.click(screen.getByRole("button", { name: `Cenários prontos (${cenarios.length})` }));

    for (const cenario of cenarios) {
      expect(screen.getByText(cenario.titulo)).toBeInTheDocument();
    }
    expect(screen.getByText("arquitetura de referência")).toBeInTheDocument();
    expect(screen.getByText("hexagonal")).toBeInTheDocument();
    expect(screen.getByText("ddd")).toBeInTheDocument();
  });

  it("carregar um cenário chama onCarregarCenario com a quebra certa e fecha o modal", async () => {
    const user = userEvent.setup();
    const onCarregarCenario = vi.fn();
    const onFechar = vi.fn();
    render(
      <JourneyModal
        config={config}
        cenarios={cenarios}
        onFechar={onFechar}
        onCarregarCenario={onCarregarCenario}
        onAdicionarCenario={vi.fn()}
        onImportarGraphify={vi.fn()}
        onIniciarTour={vi.fn()}
      />
    );

    await user.click(screen.getByRole("button", { name: `Cenários prontos (${cenarios.length})` }));
    const cenarioMongo = cenarios.find((c) => c.id === "mongo")!;
    await user.click(screen.getByRole("button", { name: `Carregar cenário: ${cenarioMongo.titulo}` }));

    expect(onCarregarCenario).toHaveBeenCalledWith(cenarioMongo.quebra);
    expect(onFechar).toHaveBeenCalled();
  });

  it("adicionar um cenário chama onAdicionarCenario (não onCarregarCenario) e NÃO fecha o modal, pra dar pra adicionar outro em seguida", async () => {
    const user = userEvent.setup();
    const onCarregarCenario = vi.fn();
    const onAdicionarCenario = vi.fn();
    const onFechar = vi.fn();
    render(
      <JourneyModal
        config={config}
        cenarios={cenarios}
        onFechar={onFechar}
        onCarregarCenario={onCarregarCenario}
        onAdicionarCenario={onAdicionarCenario}
        onImportarGraphify={vi.fn()}
        onIniciarTour={vi.fn()}
      />
    );

    await user.click(screen.getByRole("button", { name: `Cenários prontos (${cenarios.length})` }));
    const cenarioMongo = cenarios.find((c) => c.id === "mongo")!;
    await user.click(screen.getByRole("button", { name: `Adicionar cenário ao canvas: ${cenarioMongo.titulo}` }));

    expect(onAdicionarCenario).toHaveBeenCalledWith(cenarioMongo.quebra);
    expect(onCarregarCenario).not.toHaveBeenCalled();
    expect(onFechar).not.toHaveBeenCalled();
    expect(screen.getByText("✓ Adicionado")).toBeInTheDocument();
  });

  it("troca para a aba Linha de comando e mostra o terminal simulado + tabela de comandos", async () => {
    const user = userEvent.setup();
    render(
      <JourneyModal
        config={config}
        cenarios={cenarios}
        onFechar={vi.fn()}
        onCarregarCenario={vi.fn()}
        onAdicionarCenario={vi.fn()}
        onImportarGraphify={vi.fn()}
        onIniciarTour={vi.fn()}
      />
    );

    await user.click(screen.getByRole("button", { name: "Linha de comando" }));

    // "gerador init" (e as demais) aparecem tanto no terminal simulado quanto
    // na tabela de comandos — daí getAllByText em vez de getByText.
    expect(screen.getAllByText("gerador init").length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText(/gerador derive/).length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText(/gerador implementar/).length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText(/gerador open/).length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText(/gerador import-graphify/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/gerador export-vault/).length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText(/npm install -g gerador-de-itens/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/skill do Claude Code/)).toBeInTheDocument();
  });

  it("troca para a aba Importar do Graphify e mostra a explicação do fluxo", async () => {
    const user = userEvent.setup();
    render(
      <JourneyModal
        config={config}
        cenarios={cenarios}
        onFechar={vi.fn()}
        onCarregarCenario={vi.fn()}
        onAdicionarCenario={vi.fn()}
        onImportarGraphify={vi.fn()}
        onIniciarTour={vi.fn()}
      />
    );

    await user.click(screen.getByRole("button", { name: "Importar do Graphify" }));

    expect(screen.getByText("Escolher graph.json")).toBeInTheDocument();
    expect(screen.getByText(/config\/graphify-mapping\.json/)).toBeInTheDocument();
  });

  it("clicar em Iniciar tour guiado chama onIniciarTour", async () => {
    const user = userEvent.setup();
    const onIniciarTour = vi.fn();
    render(
      <JourneyModal
        config={config}
        cenarios={cenarios}
        onFechar={vi.fn()}
        onCarregarCenario={vi.fn()}
        onAdicionarCenario={vi.fn()}
        onImportarGraphify={vi.fn()}
        onIniciarTour={onIniciarTour}
      />
    );

    await user.click(screen.getByRole("button", { name: "▶ Iniciar tour guiado" }));
    expect(onIniciarTour).toHaveBeenCalled();
  });

  it("fechar pelo X chama onFechar", async () => {
    const user = userEvent.setup();
    const onFechar = vi.fn();
    render(
      <JourneyModal
        config={config}
        cenarios={cenarios}
        onFechar={onFechar}
        onCarregarCenario={vi.fn()}
        onAdicionarCenario={vi.fn()}
        onImportarGraphify={vi.fn()}
        onIniciarTour={vi.fn()}
      />
    );

    await user.click(screen.getByRole("button", { name: "Fechar" }));
    expect(onFechar).toHaveBeenCalled();
  });
});
