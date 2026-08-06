import { describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import type { DiagramaConfig } from "@gerador/engine";
import { useQuebra } from "./useQuebra";
import { quebraVazia } from "./factory";

const config: DiagramaConfig = {
  nodeTypes: {
    service: { label: "Serviço", derives: "service", techs: ["Backend"], contextos: [], spec: [] },
    rabbit: {
      label: "Fila Rabbit",
      derives: "queue",
      techs: ["Backend"],
      contextos: ["Backend-mensagens rabbitmq"],
      spec: [
        { key: "topic", label: "Nome da fila", type: "text", required: true },
        { key: "ack", label: "Ack", type: "select", options: ["manual", "auto"], required: true, permiteNA: false },
      ],
    },
    "sem-regra": { label: "Sem regra de conexão", derives: "generic", techs: [], contextos: [], spec: [] },
  },
  edgeTypes: {
    http: { label: "HTTP" },
    publishes: { label: "publica" },
    consumes: { label: "consome" },
  },
  edgeRules: {
    rabbit: { valid: ["publishes", "consumes"], default: "publishes" },
  },
};

function setup() {
  return renderHook(() => useQuebra(quebraVazia("Port"), config));
}

describe("useQuebra", () => {
  it("adicionarNo cria um nó novo com defaults do tipo", () => {
    const { result } = setup();
    act(() => result.current.adicionarNo("rabbit", 10, 20));

    expect(result.current.quebra.diagrama.nodes).toHaveLength(1);
    const no = result.current.quebra.diagrama.nodes[0];
    expect(no).toMatchObject({ id: "n1", type: "rabbit", label: "Fila Rabbit", status: "novo", x: 10, y: 20 });
  });

  it("tentarConectar cria aresta com o tipo default de edgeRules quando o destino é válido", () => {
    const { result } = setup();
    act(() => {
      result.current.adicionarNo("service", 0, 0);
      result.current.adicionarNo("rabbit", 100, 0);
    });
    act(() => result.current.tentarConectar("n1", "n2"));

    expect(result.current.quebra.diagrama.edges).toEqual([{ id: "e1", source: "n1", target: "n2", type: "publishes" }]);
    expect(result.current.edgeRejeitada).toBeNull();
  });

  it("tentarConectar guarda o handle de onde a conexão foi arrastada — sem isso o canvas sempre renderiza do handle padrão (topo)", () => {
    const { result } = setup();
    act(() => {
      result.current.adicionarNo("service", 0, 0);
      result.current.adicionarNo("rabbit", 100, 0);
    });
    act(() => result.current.tentarConectar("n1", "n2", "source-right", "target-left"));

    expect(result.current.quebra.diagrama.edges[0]).toMatchObject({
      sourceHandle: "source-right",
      targetHandle: "target-left",
    });
  });

  it("tentarConectar rejeita e não cria aresta quando o tipo de destino não tem edgeRules", () => {
    const { result } = setup();
    act(() => {
      result.current.adicionarNo("service", 0, 0);
      result.current.adicionarNo("sem-regra", 100, 0);
    });
    act(() => result.current.tentarConectar("n1", "n2"));

    expect(result.current.quebra.diagrama.edges).toHaveLength(0);
    expect(result.current.edgeRejeitada?.motivo).toContain("sem-regra");
  });

  it("definirValorSpec grava valor com origem manual", () => {
    const { result } = setup();
    act(() => result.current.adicionarNo("rabbit", 0, 0));
    act(() => result.current.definirValorSpec("n1", "topic", "fila.teste"));

    expect(result.current.quebra.diagrama.nodes[0].spec.topic).toEqual({
      valor: "fila.teste",
      origem: "manual",
    });
  });

  it("definirNA e depois removerNA limpa a justificativa", () => {
    const { result } = setup();
    act(() => result.current.adicionarNo("rabbit", 0, 0));
    act(() => result.current.definirNA("n1", "topic", "não se aplica"));
    expect(result.current.quebra.diagrama.nodes[0].specNA.topic).toEqual({ motivo: "não se aplica" });

    act(() => result.current.removerNA("n1", "topic"));
    expect(result.current.quebra.diagrama.nodes[0].specNA.topic).toBeUndefined();
  });

  it("confirmarValor marca confirmado=true sem alterar o valor", () => {
    const { result } = setup();
    act(() => result.current.adicionarNo("rabbit", 0, 0));
    act(() =>
      result.current.setQuebra((q) => ({
        ...q,
        diagrama: {
          ...q.diagrama,
          nodes: q.diagrama.nodes.map((n) =>
            n.id === "n1"
              ? { ...n, spec: { ack: { valor: "manual", origem: "inferido", confianca: 0.8, confirmado: false } } }
              : n
          ),
        },
      }))
    );
    act(() => result.current.confirmarValor("n1", "ack"));

    expect(result.current.quebra.diagrama.nodes[0].spec.ack).toMatchObject({
      valor: "manual",
      confirmado: true,
    });
  });

  it("removerNo também remove as arestas ligadas a ele", () => {
    const { result } = setup();
    act(() => {
      result.current.adicionarNo("service", 0, 0);
      result.current.adicionarNo("rabbit", 100, 0);
    });
    act(() => result.current.tentarConectar("n1", "n2"));
    expect(result.current.quebra.diagrama.edges).toHaveLength(1);

    act(() => result.current.removerNo("n2"));
    expect(result.current.quebra.diagrama.nodes).toHaveLength(1);
    expect(result.current.quebra.diagrama.edges).toHaveLength(0);
  });
});
