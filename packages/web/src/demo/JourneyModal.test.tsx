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
        onIniciarTour={vi.fn()}
        onIniciarTourDeConfiguracao={vi.fn()}
      />
    );

    expect(screen.getByText("Diagrama")).toBeInTheDocument();
    expect(screen.getByText("Prontidão")).toBeInTheDocument();
    expect(screen.getByText("Derivar")).toBeInTheDocument();
    expect(screen.getByText("Revisão")).toBeInTheDocument();
    expect(screen.getByText("Especificação de solução")).toBeInTheDocument();
    expect(screen.getByText(/gera um único markdown com tudo/)).toBeInTheDocument();
    // §255 — a frase "motor determinístico — não um LLM" dizia o que o motor
    // NÃO é e seguia em frente. A modal agora abre explicando o que ele É, e
    // isso vale aqui e na landing pública (mesmo componente).
    expect(screen.getByTestId("explicacao-do-motor")).toBeInTheDocument();
    expect(screen.getByTestId("explicacao-do-motor").textContent).toMatch(/A IA escreve o/);
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
        onIniciarTour={vi.fn()}
        onIniciarTourDeConfiguracao={vi.fn()}
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
        onIniciarTour={vi.fn()}
        onIniciarTourDeConfiguracao={vi.fn()}
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
        onIniciarTour={vi.fn()}
        onIniciarTourDeConfiguracao={vi.fn()}
      />
    );

    await user.click(screen.getByRole("button", { name: `Cenários prontos (${cenarios.length})` }));
    const cenarioMongo = cenarios.find((c) => c.id === "mongo")!;
    await user.click(screen.getByRole("button", { name: `Adicionar cenário à mesa de projeto: ${cenarioMongo.titulo}` }));

    expect(onAdicionarCenario).toHaveBeenCalledWith(cenarioMongo.quebra);
    expect(onCarregarCenario).not.toHaveBeenCalled();
    expect(onFechar).not.toHaveBeenCalled();
    expect(screen.getByText("✓ Adicionado")).toBeInTheDocument();
  });

  it("§212 — a aba de importar do Graphify NÃO existe mais", () => {
    render(
      <JourneyModal
        config={config}
        cenarios={cenarios}
        onFechar={vi.fn()}
        onCarregarCenario={vi.fn()}
        onAdicionarCenario={vi.fn()}
        onIniciarTour={vi.fn()}
        onIniciarTourDeConfiguracao={vi.fn()}
      />
    );

    // Guarda de remoção: sobraram DUAS abas, e nenhuma menção ao importador.
    // Sem isto, alguém "restaura" a aba num merge e ninguém percebe.
    expect(screen.queryByRole("button", { name: /Graphify/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/graph\.json/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "A jornada" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Cenários prontos/ })).toBeInTheDocument();
  });

  /**
   * §243 — guarda de REMOÇÃO, no padrão do §212. A demonstração automática saiu
   * porque fazia exatamente o que o tour faz (mesma lista de passos, mesmos
   * `onEnter`), com a única diferença de avançar sozinha. Duas portas para o
   * mesmo conteúdo custam manutenção dobrada e obrigam quem chega a escolher
   * sem saber a diferença.
   *
   * Sem esta guarda, um merge distraído devolve o botão e ninguém percebe —
   * ele parece uma feature legítima.
   */
  it("§243 — a demonstração automática não volta", () => {
    render(
      <JourneyModal
        config={config}
        cenarios={cenarios}
        onFechar={vi.fn()}
        onCarregarCenario={vi.fn()}
        onAdicionarCenario={vi.fn()}
        onIniciarTour={vi.fn()}
        onIniciarTourDeConfiguracao={vi.fn()}
      />
    );

    expect(screen.queryByRole("button", { name: /Demonstração automática/i })).not.toBeInTheDocument();
    // E os dois que ficaram continuam lá — a guarda é sobre ausência, não
    // sobre ter esvaziado o header.
    expect(screen.getByRole("button", { name: /Iniciar tour guiado/ })).toBeInTheDocument();
    expect(screen.getByTestId("tour-configuracao")).toBeInTheDocument();
  });

  it("§236 — clicar em Tour de configuração chama o SEGUNDO tour, não o primeiro", async () => {
    // Dois tours, dois botões: o primeiro responde "isto serve pra quê?", o
    // segundo "como eu moldo pro meu time". Trocar um pelo outro entregaria
    // tela de administração a quem ainda está avaliando a ferramenta.
    const user = userEvent.setup();
    const onIniciarTour = vi.fn();
    const onIniciarTourDeConfiguracao = vi.fn();
    render(
      <JourneyModal
        config={config}
        cenarios={cenarios}
        onFechar={vi.fn()}
        onCarregarCenario={vi.fn()}
        onAdicionarCenario={vi.fn()}
        onIniciarTour={onIniciarTour}
        onIniciarTourDeConfiguracao={onIniciarTourDeConfiguracao}
      />
    );

    await user.click(screen.getByTestId("tour-configuracao"));

    expect(onIniciarTourDeConfiguracao).toHaveBeenCalled();
    expect(onIniciarTour).not.toHaveBeenCalled();
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
        onIniciarTour={onIniciarTour}
        onIniciarTourDeConfiguracao={vi.fn()}
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
        onIniciarTour={vi.fn()}
        onIniciarTourDeConfiguracao={vi.fn()}
      />
    );

    await user.click(screen.getByRole("button", { name: "Fechar" }));
    expect(onFechar).toHaveBeenCalled();
  });
});
