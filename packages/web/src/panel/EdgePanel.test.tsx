import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { DiagramaConfig } from "@gerador/engine";
import { useQuebra } from "../state/useQuebra";
import { EdgePanel } from "./EdgePanel";

const config: DiagramaConfig = {
  nodeTypes: {
    service: { label: "Serviço", derives: "service", techs: [], contextos: [], spec: [] },
    kafka: { label: "Tópico Kafka", derives: "queue", techs: [], contextos: [], spec: [] },
  },
  edgeTypes: {
    publishes: { label: "publica" },
    consumes: { label: "consome" },
    pubsub: { label: "publica+consome" },
  },
  edgeRules: {
    kafka: { valid: ["publishes", "consumes", "pubsub"], default: "publishes" },
  },
};

function Harness() {
  const quebraState = useQuebra(
    {
      diagrama: {
        nodes: [
          { id: "n1", type: "service", x: 0, y: 0, label: "srv", status: "novo", spec: {}, specNA: {} },
          { id: "n2", type: "kafka", x: 100, y: 0, label: "topico", status: "novo", spec: {}, specNA: {} },
        ],
        edges: [{ id: "e1", source: "n1", target: "n2", type: "publishes" }],
      },
    },
    config
  );
  const aresta = quebraState.quebra.diagrama.edges[0];
  return <EdgePanel aresta={aresta} config={config} quebraState={quebraState} />;
}

describe("EdgePanel", () => {
  it("mostra as origens/destino e as opções válidas de tipo para o nó de destino", () => {
    render(<Harness />);
    expect(screen.getByText("srv → topico")).toBeInTheDocument();
    expect(screen.getByRole("combobox")).toHaveValue("publishes");
    expect(screen.getByRole("option", { name: "consome" })).toBeInTheDocument();
  });

  it("trocar o select muda o tipo da aresta (reflete no próprio select controlado)", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.selectOptions(screen.getByRole("combobox"), "consumes");
    expect(screen.getByRole("combobox")).toHaveValue("consumes");
  });
});

describe("EdgePanel — campos de EdgeTypeConfig.spec (SPEC-21)", () => {
  const configComCampo: DiagramaConfig = {
    ...config,
    edgeTypes: {
      ...config.edgeTypes,
      publishes: {
        label: "publica",
        spec: [{ key: "roteamento", label: "Chave de roteamento", type: "text" }],
      },
    },
  };

  function HarnessComCampo() {
    const quebraState = useQuebra(
      {
        diagrama: {
          nodes: [
            { id: "n1", type: "service", x: 0, y: 0, label: "srv", status: "novo", spec: {}, specNA: {} },
            { id: "n2", type: "kafka", x: 100, y: 0, label: "topico", status: "novo", spec: {}, specNA: {} },
          ],
          edges: [{ id: "e1", source: "n1", target: "n2", type: "publishes" }],
        },
      },
      configComCampo
    );
    const aresta = quebraState.quebra.diagrama.edges[0];
    return <EdgePanel aresta={aresta} config={configComCampo} quebraState={quebraState} />;
  }

  it("renderiza o campo customizado do tipo de aresta atual", () => {
    render(<HarnessComCampo />);
    expect(screen.getByText("Chave de roteamento")).toBeInTheDocument();
  });

  it("editar o campo grava o valor com origem manual (visível ao reabrir com o mesmo estado)", async () => {
    const user = userEvent.setup();
    render(<HarnessComCampo />);

    await user.type(screen.getByRole("textbox", { name: "Chave de roteamento" }), "pedido.criado");
    expect(screen.getByRole("textbox", { name: "Chave de roteamento" })).toHaveValue("pedido.criado");
  });

  it("tipo de aresta sem spec configurado não renderiza nenhum campo extra", () => {
    render(<Harness />);
    expect(screen.queryByText("Chave de roteamento")).not.toBeInTheDocument();
  });
});
