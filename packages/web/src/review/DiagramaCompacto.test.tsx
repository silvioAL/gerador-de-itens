import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { Diagrama, DiagramaConfig } from "@gerador/engine";
import { DiagramaCompacto } from "./DiagramaCompacto";

/** jsdom (25) não implementa PointerEvent — o fireEvent.pointerDown cai num
 * Event genérico que DESCARTA clientX/button do init. Este helper cria o
 * Event e atribui as propriedades à mão, que é o que o handler lê. */
function eventoPonteiro(tipo: string, props: Record<string, unknown>) {
  const ev = new Event(tipo, { bubbles: true, cancelable: true });
  Object.assign(ev, props);
  return ev;
}

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

  it("nó ativo ganha borda e halo NA COR DO PRÓPRIO TIPO, não num azul fixo (Fase E, fiel ao protótipo)", () => {
    render(<DiagramaCompacto diagrama={diagrama} config={config} noAtivoId="n2" />);
    const grupoAtivo = screen.getByTestId("diagrama-compacto-no-n2");
    const ativo = grupoAtivo.querySelector("rect");
    const inativo = screen.getByTestId("diagrama-compacto-no-n1").querySelector("rect");
    // n2 é rabbit (#f59e0b) — a borda e o drop-shadow herdam essa cor.
    expect(ativo?.getAttribute("stroke")).toBe("#f59e0b");
    expect(grupoAtivo.style.filter).toContain("#f59e0b");
    expect(inativo?.getAttribute("stroke")).toBe("#263344");
  });

  it("card mostra o TIPO do nó (e a marca EXISTENTE quando for o caso), como no protótipo", () => {
    render(<DiagramaCompacto diagrama={diagrama} config={config} />);
    // Escopado no card (`within`): a legenda embaixo repete os nomes dos
    // tipos, então texto solto seria ambíguo.
    const n1 = within(screen.getByTestId("diagrama-compacto-no-n1"));
    expect(n1.getByText(/SERVIÇO/)).toBeInTheDocument();
    expect(n1.getByText("EXISTENTE")).toBeInTheDocument();
    expect(within(screen.getByTestId("diagrama-compacto-no-n2")).getByText("FILA RABBIT")).toBeInTheDocument();
  });

  it("aresta colorida pela cor do nó de origem, com o rótulo da conexão em caps no meio", () => {
    render(<DiagramaCompacto diagrama={diagrama} config={config} />);
    const aresta = screen.getByTestId("diagrama-aresta-e1");
    expect(aresta.getAttribute("stroke")).toBe("#38bdf8"); // cor de n1 (service), a origem
    expect(screen.getByText("PUBLICA")).toBeInTheDocument();
  });

  it("badge de contagem aparece só nos nós com itens derivados", () => {
    render(<DiagramaCompacto diagrama={diagrama} config={config} contagemPorNo={{ n1: 3 }} />);
    expect(screen.getByTestId("diagrama-contagem-n1")).toHaveTextContent("3");
    expect(screen.queryByTestId("diagrama-contagem-n2")).not.toBeInTheDocument();
  });

  it("legenda lista cada tipo presente no diagrama (a barra de fluxo informacional do protótipo)", () => {
    render(<DiagramaCompacto diagrama={diagrama} config={config} onClickNo={vi.fn()} />);
    const legenda = within(screen.getByTestId("diagrama-legenda"));
    expect(legenda.getByText("SERVIÇO")).toBeInTheDocument();
    expect(legenda.getByText("FILA RABBIT")).toBeInTheDocument();
    expect(screen.getByText("Clique num nó pra filtrar os itens")).toBeInTheDocument();
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

  it("arrastar o fundo faz pan (viewBox muda) e duplo clique volta ao enquadramento automático (Fase E)", () => {
    render(<DiagramaCompacto diagrama={diagrama} config={config} />);
    const svg = screen.getByRole("img", { name: "Diagrama compacto da solução" });
    const viewBoxInicial = svg.getAttribute("viewBox");

    fireEvent(svg, eventoPonteiro("pointerdown", { clientX: 100, clientY: 100, button: 0, pointerId: 1 }));
    fireEvent(svg, eventoPonteiro("pointermove", { clientX: 160, clientY: 130, pointerId: 1 }));
    fireEvent(svg, eventoPonteiro("pointerup", { pointerId: 1 }));
    expect(svg.getAttribute("viewBox")).not.toBe(viewBoxInicial);

    fireEvent.doubleClick(svg);
    expect(svg.getAttribute("viewBox")).toBe(viewBoxInicial);
  });

  it("roda do mouse dá zoom (viewBox encolhe ao aproximar)", () => {
    render(<DiagramaCompacto diagrama={diagrama} config={config} />);
    const svg = screen.getByRole("img", { name: "Diagrama compacto da solução" });
    const larguraInicial = Number(svg.getAttribute("viewBox")!.split(" ")[2]);

    fireEvent.wheel(svg, { deltaY: -100, clientX: 100, clientY: 60 });
    const larguraDepois = Number(svg.getAttribute("viewBox")!.split(" ")[2]);
    expect(larguraDepois).toBeLessThan(larguraInicial);
  });

  it("depois de um arrasto de pan, o clique de soltar NÃO vira filtro por nó", () => {
    const onClickNo = vi.fn();
    render(<DiagramaCompacto diagrama={diagrama} config={config} onClickNo={onClickNo} />);
    const svg = screen.getByRole("img", { name: "Diagrama compacto da solução" });

    fireEvent(svg, eventoPonteiro("pointerdown", { clientX: 10, clientY: 10, button: 0, pointerId: 1 }));
    fireEvent(svg, eventoPonteiro("pointermove", { clientX: 80, clientY: 40, pointerId: 1 }));
    fireEvent(svg, eventoPonteiro("pointerup", { pointerId: 1 }));
    fireEvent.click(screen.getByTestId("diagrama-compacto-no-n1"));
    expect(onClickNo).not.toHaveBeenCalled();
  });

  it("com filtro ativo, o nó filtrado fica opaco e os demais esmaecidos (Fase D, SPEC-24)", () => {
    render(<DiagramaCompacto diagrama={diagrama} config={config} noFiltradoId="n1" />);
    expect(screen.getByTestId("diagrama-compacto-no-n1")).toHaveAttribute("opacity", "1");
    expect(screen.getByTestId("diagrama-compacto-no-n2")).toHaveAttribute("opacity", "0.25");
  });
});
