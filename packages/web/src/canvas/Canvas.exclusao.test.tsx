import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { act, renderHook } from "@testing-library/react";
/**
 * Mesmo apoio do `Canvas.piscar.test.tsx`: o ReactFlow real precisa de
 * `ResizeObserver` e de layout, que o jsdom não tem. A diferença é que aqui o
 * dublê PRECISA renderizar `children` — o diálogo de confirmação é filho do
 * `<ReactFlow>`, e um dublê que devolvesse só uma div o esconderia do teste.
 */
vi.mock("@xyflow/react", async (importActual) => {
  const real = await importActual<typeof import("@xyflow/react")>();
  return {
    ...real,
    ReactFlow: ({ children }: { children?: React.ReactNode }) => <div data-testid="reactflow-falso">{children}</div>,
    Background: () => null,
    Controls: () => null,
    MiniMap: () => null,
    ReactFlowProvider: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
    useReactFlow: () => ({ fitView: vi.fn() }),
  };
});

import { ReactFlowProvider } from "@xyflow/react";
import type { DiagramaConfig, Quebra } from "@gerador/engine";
import { Canvas } from "./Canvas";
import { useQuebra } from "../state/useQuebra";

const config = {
  nodeTypes: { service: { label: "Serviço", color: "#60a5fa", spec: [] } },
  edgeTypes: { async: { label: "publica", color: "#f59e0b" } },
  edgeRules: { _fallback: { valid: ["async"], default: "async" } },
} as unknown as DiagramaConfig;

function quebraCom(nos: { id: string; label: string }[], arestas: { id: string; source: string; target: string }[]): Quebra {
  return {
    id: "q1",
    titulo: "T",
    time: "time-a",
    diagrama: {
      nodes: nos.map((n, i) => ({ ...n, type: "service", x: i * 200, y: 0, status: "novo", spec: {}, specNA: {} })),
      edges: arestas.map((a) => ({ ...a, type: "async" })),
    },
  } as unknown as Quebra;
}

/**
 * Pedido do usuário: "ao selecionar um componente na tela, deveria perguntar ao
 * usuário se deseja excluir o componente do diagrama, e após a confirmação
 * então deletar".
 *
 * O que estes testes protegem não é o diálogo — é que NADA some antes do
 * "Excluir". Uma confirmação que já apagou por baixo e só pergunta depois seria
 * indistinguível deste teste se ele olhasse apenas a tela.
 */
describe("confirmação antes de excluir (canvas)", () => {
  it("pedir exclusão NÃO remove nada — só depois de confirmar", () => {
    const { result } = renderHook(() => useQuebra(quebraCom([{ id: "n1", label: "srv" }], []), config));

    act(() => result.current.pedirExclusao("no", "n1"));
    // O ponto do teste: entre pedir e confirmar, o nó continua no diagrama.
    expect(result.current.quebra.diagrama.nodes).toHaveLength(1);
    expect(result.current.exclusaoPendente).toEqual({ tipo: "no", id: "n1" });

    act(() => result.current.confirmarExclusao());
    expect(result.current.quebra.diagrama.nodes).toHaveLength(0);
    expect(result.current.exclusaoPendente).toBeNull();
  });

  it("cancelar devolve o estado intacto — inclusive as arestas do nó", () => {
    const { result } = renderHook(() =>
      useQuebra(
        quebraCom(
          [
            { id: "n1", label: "srv" },
            { id: "n2", label: "fila" },
          ],
          [{ id: "e1", source: "n1", target: "n2" }]
        ),
        config
      )
    );

    act(() => result.current.pedirExclusao("no", "n1"));
    act(() => result.current.cancelarExclusao());

    expect(result.current.quebra.diagrama.nodes).toHaveLength(2);
    expect(result.current.quebra.diagrama.edges).toHaveLength(1);
    expect(result.current.exclusaoPendente).toBeNull();
  });

  it("o diálogo diz QUANTAS conexões vão junto — é o que não se vê olhando o nó", async () => {
    function Tela() {
      const estado = useQuebra(
        quebraCom(
          [
            { id: "n1", label: "srv-propostas" },
            { id: "n2", label: "fila" },
            { id: "n3", label: "srv-contratos" },
          ],
          [
            { id: "e1", source: "n1", target: "n2" },
            { id: "e2", source: "n3", target: "n1" },
          ]
        ),
        config
      );
      return (
        <ReactFlowProvider>
          <button onClick={() => estado.pedirExclusao("no", "n1")}>excluir n1</button>
          <Canvas diagramaState={estado} config={config} />
        </ReactFlowProvider>
      );
    }

    render(<Tela />);
    await userEvent.click(screen.getByText("excluir n1"));

    const dialogo = await screen.findByTestId("confirmar-exclusao");
    expect(dialogo).toHaveTextContent("srv-propostas");
    // Duas arestas tocam n1 (uma saindo, uma chegando) — o número precisa
    // contar as DUAS direções, não só as que saem.
    expect(dialogo).toHaveTextContent("2");
  });

  it("confirmar pelo diálogo remove o nó de verdade", async () => {
    const aoRemover = vi.fn();
    function Tela() {
      const estado = useQuebra(quebraCom([{ id: "n1", label: "srv" }], []), config);
      aoRemover(estado.quebra.diagrama.nodes.length);
      return (
        <ReactFlowProvider>
          <button onClick={() => estado.pedirExclusao("no", "n1")}>excluir</button>
          <Canvas diagramaState={estado} config={config} />
        </ReactFlowProvider>
      );
    }

    render(<Tela />);
    await userEvent.click(screen.getByText("excluir"));
    await userEvent.click(await screen.findByTestId("confirmar-exclusao-ok"));

    expect(aoRemover).toHaveBeenLastCalledWith(0);
    expect(screen.queryByTestId("confirmar-exclusao")).toBeNull();
  });
});

/**
 * ACHADO REAL do usuário: depois de "Aplicar à mesa de projeto", os componentes "não
 * aparecem a menos que se clique em próximo pendente (1 por 1)".
 *
 * O teste vive no hook porque é lá que a decisão mora: `fitView` em si é do
 * React Flow e não vale a pena redublar. O que pode regredir é o contador
 * deixar de ser incrementado por quem insere em lote — ou passar a ser
 * incrementado por quem não deveria.
 */
describe("pedido de enquadramento (viewport após inserção em lote)", () => {
  const proposta = {
    nos: [
      { id: "a", tipo: "service", rotulo: "srv-propostas" },
      { id: "b", tipo: "service", rotulo: "srv-contratos" },
    ],
    arestas: [{ de: "a", para: "b", tipo: "async" }],
  };

  it("aplicar a proposta da conversa pede enquadramento", () => {
    const { result } = renderHook(() => useQuebra(quebraCom([], []), config));
    const antes = result.current.pedidoDeEnquadramento;

    act(() => result.current.aplicarDiagramaProposto(proposta));

    expect(result.current.quebra.diagrama.nodes).toHaveLength(2);
    expect(result.current.pedidoDeEnquadramento).toBe(antes + 1);
  });

  it("adicionar UM nó pela paleta NÃO pede — a pessoa acabou de escolher onde ele fica", () => {
    const { result } = renderHook(() => useQuebra(quebraCom([], []), config));
    const antes = result.current.pedidoDeEnquadramento;

    act(() => result.current.adicionarNo("service", 100, 100));

    expect(result.current.quebra.diagrama.nodes).toHaveLength(1);
    expect(result.current.pedidoDeEnquadramento).toBe(antes);
  });

  it("cada lote pede de novo — dois aplicares seguidos não podem contar como um", () => {
    const { result } = renderHook(() => useQuebra(quebraCom([], []), config));

    act(() => result.current.aplicarDiagramaProposto(proposta));
    act(() => result.current.aplicarDiagramaProposto(proposta));

    expect(result.current.pedidoDeEnquadramento).toBe(2);
    // E o segundo lote entra ABAIXO do primeiro (mesclarDiagrama), que é
    // exatamente o motivo de o enquadramento ser necessário.
    const ys = result.current.quebra.diagrama.nodes.map((n) => n.y);
    expect(Math.max(...ys)).toBeGreaterThan(Math.min(...ys));
  });
});
