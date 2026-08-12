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

  it("tipo comprido é truncado com reticências pra não colidir com o badge (achado real: letra sobreposta no SERVIÇO DE BATCH)", () => {
    const cfg: DiagramaConfig = {
      ...config,
      nodeTypes: {
        ...config.nodeTypes,
        batch: { label: "Serviço de Batch (Spring Batch)", derives: "service", techs: [], contextos: [], spec: [], color: "#38bdf8" },
      },
    };
    const diag: Diagrama = {
      nodes: [{ id: "nb", type: "batch", label: "faturamento", x: 0, y: 0, status: "novo", spec: {}, specNA: {} }],
      edges: [],
    };
    render(<DiagramaCompacto diagrama={diag} config={cfg} contagemPorNo={{ nb: 4 }} />);

    const tipo = within(screen.getByTestId("diagrama-compacto-no-nb")).getByText(/SERVIÇO DE BATCH/);
    // Com badge de contagem o teto é 18 caracteres — o texto termina em "…"
    // em vez de correr por baixo do círculo.
    expect(tipo.textContent).toMatch(/…$/);
    expect(tipo.textContent!.length).toBeLessThanOrEqual(18);
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
    // e1 liga n1→n2, então com n2 ativo E a esteira rodando ela recebe o cometa.
    const { rerender } = render(<DiagramaCompacto diagrama={diagrama} config={config} noAtivoId="n2" animado />);
    expect(screen.getByTestId("diagrama-cometa-e1")).toBeInTheDocument();

    // Sem nó ativo nenhum, nenhuma aresta anima — o diagrama fica em repouso.
    rerender(<DiagramaCompacto diagrama={diagrama} config={config} animado />);
    expect(screen.queryByTestId("diagrama-cometa-e1")).not.toBeInTheDocument();
  });

  it("esteira parada: nó selecionado mantém o destaque estático, mas SEM cometa nem pulso — achado real: 'encerro a aplicação e as animações seguem rodando'", () => {
    render(<DiagramaCompacto diagrama={diagrama} config={config} noAtivoId="n2" />);
    expect(screen.queryByTestId("diagrama-cometa-e1")).not.toBeInTheDocument();
    const noAtivo = screen.getByTestId("diagrama-compacto-no-n2").querySelector("rect");
    expect(noAtivo).not.toHaveClass("diagrama-no-ativo");
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

describe("DiagramaCompacto — arrastar o fundo (achados reais do usuário)", () => {
  /** O painel real é largo e BAIXO (30vh): é isso que faz a escala do
   * `preserveAspectRatio="meet"` ser ditada pela altura, e era o que o cálculo
   * antigo ignorava. */
  function comTamanho(largura: number, altura: number) {
    vi.spyOn(SVGElement.prototype, "getBoundingClientRect").mockReturnValue({
      x: 0, y: 0, width: largura, height: altura, top: 0, left: 0, right: largura, bottom: altura,
      toJSON: () => ({}),
    } as DOMRect);
  }

  function vistaDoSvg(): { x: number; y: number; w: number; h: number } {
    const [x, y, w, h] = screen.getByRole("img").getAttribute("viewBox")!.split(" ").map(Number);
    return { x, y, w, h };
  }

  it("arrastar N pixels move o desenho os MESMOS N pixels (não uma fração)", () => {
    // Relato: "preciso arrastar até muito distante para movimentar — efeito
    // análogo a pouca sensibilidade". A causa era usar só w/largura ignorando
    // que, num painel baixo, quem dita a escala do `meet` é a ALTURA.
    comTamanho(900, 200);
    const { container } = render(<DiagramaCompacto diagrama={diagrama} config={config} />);
    const svg = container.querySelector("svg")!;
    const antes = vistaDoSvg();

    fireEvent(svg, eventoPonteiro("pointerdown", { clientX: 500, clientY: 100, button: 0, pointerId: 1 }));
    fireEvent(svg, eventoPonteiro("pointermove", { clientX: 400, clientY: 100, pointerId: 1 }));

    const depois = vistaDoSvg();
    // 100px de arrasto × escala real (h/altura, que é a que manda aqui).
    const escalaReal = Math.max(antes.w / 900, antes.h / 200);
    expect(depois.x - antes.x).toBeCloseTo(100 * escalaReal, 5);
    // E a escala real é MAIOR que a que o cálculo antigo usava — é a diferença
    // que o usuário sentiu como falta de sensibilidade.
    expect(escalaReal).toBeGreaterThan(antes.w / 900);
  });

  it("o svg não deixa selecionar texto — arrastar o fundo não pode pintar os rótulos de azul", () => {
    comTamanho(900, 200);
    const { container } = render(<DiagramaCompacto diagrama={diagrama} config={config} />);
    expect(container.querySelector("svg")!.style.userSelect).toBe("none");
  });
});
