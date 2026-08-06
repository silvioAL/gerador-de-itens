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
