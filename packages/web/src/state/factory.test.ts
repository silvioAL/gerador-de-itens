import { describe, expect, it } from "vitest";
import type { Diagrama } from "@gerador/engine";
import { mesclarDiagrama } from "./factory";

function diagramaVazio(): Diagrama {
  return { nodes: [], edges: [] };
}

function cenarioMongo(): Diagrama {
  return {
    nodes: [
      { id: "n1", type: "service", status: "novo", label: "srv-catalogo", x: 100, y: 100, spec: {}, specNA: {} },
      { id: "n2", type: "mongo", status: "novo", label: "produtos", x: 400, y: 100, spec: {}, specNA: {} },
    ],
    edges: [{ id: "e1", source: "n1", target: "n2", type: "writes" }],
  };
}

describe("mesclarDiagrama", () => {
  it("num canvas vazio, entra com os mesmos IDs e sem deslocamento", () => {
    const resultado = mesclarDiagrama(diagramaVazio(), cenarioMongo());
    expect(resultado.nodes.map((n) => n.id)).toEqual(["n1", "n2"]);
    expect(resultado.nodes.map((n) => n.y)).toEqual([100, 100]);
    expect(resultado.edges).toEqual([{ id: "e1", source: "n1", target: "n2", type: "writes" }]);
  });

  it("com IDs colidindo, renumera os nós novos e ajusta as arestas pra apontar pro ID renumerado", () => {
    const atual: Diagrama = {
      nodes: [{ id: "n1", type: "service", status: "novo", label: "srv-existente", x: 0, y: 0, spec: {}, specNA: {} }],
      edges: [],
    };
    const resultado = mesclarDiagrama(atual, cenarioMongo());

    expect(resultado.nodes.map((n) => n.id)).toEqual(["n1", "n2", "n3"]);
    expect(resultado.nodes[0].label).toBe("srv-existente");
    expect(resultado.nodes[1].label).toBe("srv-catalogo");
    expect(resultado.nodes[2].label).toBe("produtos");

    const aresta = resultado.edges[0];
    expect(aresta.source).toBe("n2");
    expect(aresta.target).toBe("n3");
  });

  it("desloca o bloco novo abaixo do que já existe, nunca empilha em cima", () => {
    const atual: Diagrama = {
      nodes: [{ id: "n1", type: "service", status: "novo", label: "x", x: 0, y: 300, spec: {}, specNA: {} }],
      edges: [],
    };
    const resultado = mesclarDiagrama(atual, cenarioMongo());
    const [, srvNovo, mongoNovo] = resultado.nodes;

    expect(srvNovo.y).toBeGreaterThan(300);
    expect(mongoNovo.y).toBe(srvNovo.y);
  });

  it("adicionar o mesmo cenário duas vezes não colide entre as duas cópias", () => {
    let diagrama = mesclarDiagrama(diagramaVazio(), cenarioMongo());
    diagrama = mesclarDiagrama(diagrama, cenarioMongo());

    expect(diagrama.nodes.map((n) => n.id)).toEqual(["n1", "n2", "n3", "n4"]);
    expect(diagrama.edges.map((e) => e.id)).toEqual(["e1", "e2"]);
    expect(diagrama.edges[1]).toMatchObject({ source: "n3", target: "n4" });
  });

  it("preserva arestas e nós existentes intactos", () => {
    const atual = cenarioMongo();
    const resultado = mesclarDiagrama(atual, { nodes: [], edges: [] });
    expect(resultado).toEqual(atual);
  });
});
