import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ReactFlowProvider, type NodeProps } from "@xyflow/react";
import type { DiagramaConfig, No } from "@gerador/engine";
import { NodeCard, type NodeCardData } from "./NodeCard";

const config: DiagramaConfig = {
  nodeTypes: {
    kafka: {
      label: "Tópico Kafka",
      derives: "queue",
      techs: ["Backend"],
      contextos: [],
      color: "#f97316",
      icon: "K",
      spec: [],
    },
    mongo: {
      label: "Coleção Mongo",
      derives: "datastore",
      techs: ["Backend"],
      contextos: [],
      color: "#10b981",
      icon: "Database",
      spec: [],
    },
    generico: {
      label: "Tipo genérico",
      derives: "generic",
      techs: [],
      contextos: [],
      color: "#94a3b8",
      spec: [],
    },
  },
  edgeTypes: {},
  edgeRules: {},
};

function noBase(type: string): No {
  return { id: "n1", type, x: 0, y: 0, label: "meu-no", status: "novo", spec: {}, specNA: {} };
}

function renderCard(no: No) {
  const data: NodeCardData = { no, config, arestas: [] };
  return render(
    <ReactFlowProvider>
      <NodeCard {...({ data, selected: false } as unknown as NodeProps & { data: NodeCardData })} />
    </ReactFlowProvider>
  );
}

describe("NodeCard — badge de ícone por tipo de nó", () => {
  it("mostra o texto configurado em config.nodeTypes[type].icon quando não é um nome de ícone conhecido", () => {
    renderCard(noBase("kafka"));
    expect(screen.getByText("K")).toBeInTheDocument();
  });

  it("com um nome de ícone do catálogo (ex.: Database), renderiza o SVG de verdade, não texto literal", () => {
    const { container } = renderCard(noBase("mongo"));
    const badge = container.querySelector('span[title="Coleção Mongo"]');
    expect(badge?.querySelector("svg")).toBeInTheDocument();
    expect(screen.queryByText("Database")).not.toBeInTheDocument();
  });

  it("sem icon configurado, cai na primeira letra do label em vez de ficar em branco", () => {
    renderCard(noBase("generico"));
    expect(screen.getByText("T")).toBeInTheDocument();
  });

  it("tipo desconhecido (sem entrada em nodeTypes), cai na primeira letra do próprio type", () => {
    renderCard(noBase("tipo-fora-da-config"));
    expect(screen.getByText("T")).toBeInTheDocument();
  });
});
