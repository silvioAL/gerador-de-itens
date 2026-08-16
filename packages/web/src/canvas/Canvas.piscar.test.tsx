import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { ReactFlowProvider } from "@xyflow/react";
import type { Edge } from "@xyflow/react";
import type { DiagramaConfig } from "@gerador/engine";
import { Canvas } from "./Canvas";

/**
 * O `Canvas` usa `useReactFlow` (para enquadrar depois de inserção em lote),
 * que exige o `ReactFlowProvider` como ancestral. Em produção ele sempre está
 * lá — `App.tsx` envolve o canvas inteiro. Renderizar solto aqui era o teste
 * montando um cenário que não existe; embrulhar aproxima o teste do app.
 */
function comProvider(elemento: React.ReactElement) {
  return <ReactFlowProvider>{elemento}</ReactFlowProvider>;
}

/**
 * ACHADO REAL do usuário: "ao digitar o conteúdo das especificações na tela
 * inicial, o texto contido nas conexões (ex: publica) pisca a cada conteúdo
 * inserido".
 *
 * O React Flow decide repintar por IDENTIDADE das props. O bug era o memo das
 * arestas depender do array de nós: digitar num campo do nó gerava um array
 * novo, o memo invalidava e devolvia `Edge`s novos — com `style`/`labelStyle`
 * literais recriados —, e o rótulo repintava a cada tecla.
 *
 * O teste captura o que o ReactFlow RECEBE em cada render e compara as
 * referências. Não dá pra ver "piscar" em jsdom; dá pra ver a causa dele.
 */
const edgesRecebidos: Edge[][] = [];
vi.mock("@xyflow/react", async (importActual) => {
  const real = await importActual<typeof import("@xyflow/react")>();
  return {
    ...real,
    // O canvas real precisa de ResizeObserver e de layout, que jsdom não tem.
    // O que interessa aqui é só O QUE ele recebe.
    ReactFlow: ({ edges }: { edges: Edge[] }) => {
      edgesRecebidos.push(edges);
      return <div data-testid="reactflow-falso" />;
    },
    Background: () => null,
    Controls: () => null,
    MiniMap: () => null,
  };
});

const config = {
  nodeTypes: {
    service: { label: "Serviço", spec: [{ key: "nome", label: "Nome", type: "text" }] },
    kafka: { label: "Tópico Kafka", spec: [] },
  },
  edgeTypes: { publishes: { label: "publica", color: "#8b5cf6" } },
  edgeRules: {},
} as unknown as DiagramaConfig;

/**
 * Espelha o que `useDiagrama.atualizarNo` faz de verdade:
 * `{...d, nodes: nodes.map(...)}` — ou seja, o array de ARESTAS mantém a
 * referência; só os nós são recriados. Um fake que também recriasse as arestas
 * testaria outra coisa (e passaria a impressão errada de que o bug continua).
 *
 * §259 — o fixture descrevia `{ quebra: { diagrama } }`, o contrato anterior à
 * separação. Ele apontou sozinho que o canvas tinha deixado de conhecer quebra.
 */
const ARESTAS = [{ id: "e1", source: "n1", target: "n2", type: "publishes" }];
const N2 = { id: "n2", type: "kafka", label: "topico", x: 300, y: 0, spec: {} };

function estado(specDoNo: Record<string, unknown>, n2 = N2) {
  return {
    diagrama: {
      nodes: [{ id: "n1", type: "service", label: "srv", x: 0, y: 0, spec: specDoNo }, n2],
      edges: ARESTAS,
    },
    selecionadoId: null,
    setSelecionadoId: vi.fn(),
    arestaSelecionadaId: null,
    setArestaSelecionadaId: vi.fn(),
    moverNo: vi.fn(),
    removerNo: vi.fn(),
    tentarConectar: vi.fn(),
    removerAresta: vi.fn(),
  } as never;
}

describe("Canvas — o rótulo da conexão não pode repintar quando se digita no nó", () => {
  it("digitar no spec de um nó NÃO troca as referências das arestas", () => {
    edgesRecebidos.length = 0;
    const { rerender } = render(comProvider(<Canvas diagramaState={estado({ nome: { valor: "a", origem: "manual" } })} config={config} />));
    // Cada tecla produz um objeto `spec` novo — é o que a UI real faz.
    rerender(comProvider(<Canvas diagramaState={estado({ nome: { valor: "ab", origem: "manual" } })} config={config} />));
    rerender(comProvider(<Canvas diagramaState={estado({ nome: { valor: "abc", origem: "manual" } })} config={config} />));

    expect(edgesRecebidos.length).toBeGreaterThanOrEqual(3);
    const primeiro = edgesRecebidos[0][0];
    const ultimo = edgesRecebidos.at(-1)![0];
    // As mesmas referências: nada pra o React Flow repintar.
    expect(ultimo).toBe(primeiro);
    expect(ultimo.style).toBe(primeiro.style);
    expect(ultimo.labelStyle).toBe(primeiro.labelStyle);
    expect(ultimo.label).toBe("publica");
  });

  it("mover um nó AINDA recalcula — os handles dependem da posição", () => {
    // A correção não pode ter sido "congelar tudo": o que muda geometria
    // precisa continuar mudando a aresta.
    edgesRecebidos.length = 0;
    const spec = { nome: { valor: "a", origem: "manual" } };
    const { rerender } = render(comProvider(<Canvas diagramaState={estado(spec)} config={config} />));
    expect(edgesRecebidos.at(-1)![0].sourceHandle).toBe("source-right");

    // n2 vai pra ESQUERDA de n1: o handle padrão tem que virar.
    rerender(comProvider(<Canvas diagramaState={estado(spec, { ...N2, x: -300 })} config={config} />));
    expect(edgesRecebidos.at(-1)![0].sourceHandle).toBe("source-left");
  });
});
