import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { Diagrama, DiagramaConfig } from "@gerador/engine";
import { DiagramaCompacto } from "./DiagramaCompacto";

const config: DiagramaConfig = {
  nodeTypes: {
    service: { label: "Serviço", derives: "service", techs: [], contextos: [], spec: [], color: "#38bdf8" },
    rabbit: { label: "Fila Rabbit", derives: "queue", techs: [], contextos: [], spec: [], color: "#f59e0b" },
  },
  edgeTypes: { publishes: { label: "publica", color: "#94a3b8" } },
  edgeRules: {},
};

const diagrama: Diagrama = {
  nodes: [
    { id: "n1", type: "service", label: "srv-checkout", x: 0, y: 0, status: "existente", spec: {}, specNA: {} },
    { id: "n2", type: "rabbit", label: "fila-pedidos", x: 300, y: 0, status: "novo", spec: {}, specNA: {} },
  ],
  edges: [{ id: "e1", source: "n1", target: "n2", type: "publishes" }],
};

describe("DiagramaCompacto (Fase 1d, SPEC-23)", () => {
  it("renderiza um nó por diagrama.nodes, com o rótulo visível", () => {
    render(<DiagramaCompacto diagrama={diagrama} config={config} />);
    expect(screen.getByText("srv-checkout")).toBeInTheDocument();
    expect(screen.getByText("fila-pedidos")).toBeInTheDocument();
  });

  it("destaca (stroke diferente) o nó ativo — o restante fica no traço padrão", () => {
    render(<DiagramaCompacto diagrama={diagrama} config={config} noAtivoId="n2" />);
    const ativo = screen.getByTestId("diagrama-compacto-no-n2").querySelector("rect");
    const inativo = screen.getByTestId("diagrama-compacto-no-n1").querySelector("rect");
    expect(ativo?.getAttribute("stroke")).toBe("#38bdf8");
    expect(inativo?.getAttribute("stroke")).toBe("#334155");
  });

  it("diagrama sem nós não quebra, cai num viewBox default", () => {
    render(<DiagramaCompacto diagrama={{ nodes: [], edges: [] }} config={config} />);
    expect(screen.getByRole("img", { name: "Diagrama compacto da solução" })).toBeInTheDocument();
  });

  it("clique num nó chama onClickNo com o id do nó (Fase D, SPEC-24)", () => {
    const onClickNo = vi.fn();
    render(<DiagramaCompacto diagrama={diagrama} config={config} onClickNo={onClickNo} />);
    fireEvent.click(screen.getByTestId("diagrama-compacto-no-n1"));
    expect(onClickNo).toHaveBeenCalledWith("n1");
  });

  it("aresta que toca o nó ativo ganha um cometa; as demais, não (Fase E, SPEC-24)", () => {
    // e1 liga n1→n2, então com n2 ativo ela recebe o cometa.
    const { rerender } = render(<DiagramaCompacto diagrama={diagrama} config={config} noAtivoId="n2" />);
    expect(screen.getByTestId("diagrama-cometa-e1")).toBeInTheDocument();

    // Sem nó ativo nenhum, nenhuma aresta anima — o diagrama fica em repouso.
    rerender(<DiagramaCompacto diagrama={diagrama} config={config} />);
    expect(screen.queryByTestId("diagrama-cometa-e1")).not.toBeInTheDocument();
  });

  it("com filtro ativo, o nó filtrado fica opaco e os demais esmaecidos (Fase D, SPEC-24)", () => {
    render(<DiagramaCompacto diagrama={diagrama} config={config} noFiltradoId="n1" />);
    expect(screen.getByTestId("diagrama-compacto-no-n1")).toHaveAttribute("opacity", "1");
    expect(screen.getByTestId("diagrama-compacto-no-n2")).toHaveAttribute("opacity", "0.35");
  });
});
