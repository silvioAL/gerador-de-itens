import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { DiagramaConfig, Quebra } from "@gerador/engine";

/** Props que o Canvas entregou ao React Flow no último render — o dublê não
 * escuta teclado, então é só isso que dá pra afirmar daqui. */
const propsDoReactFlow: Record<string, unknown> = {};

vi.mock("@xyflow/react", async (importActual) => {
  const real = await importActual<typeof import("@xyflow/react")>();
  return {
    ...real,
    ReactFlow: ({ children, ...props }: { children?: React.ReactNode }) => {
      Object.assign(propsDoReactFlow, props);
      return <div data-testid="rf">{children}</div>;
    },
    Background: () => null,
    Controls: () => null,
    MiniMap: () => null,
    ReactFlowProvider: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
    useReactFlow: () => ({ fitView: vi.fn() }),
  };
});

const { Canvas } = await import("../canvas/Canvas");
const { PropertiesPanel } = await import("./PropertiesPanel");
const { useQuebra } = await import("../state/useQuebra");

const config = {
  nodeTypes: { service: { label: "Serviço", color: "#60a5fa", spec: [] } },
  edgeTypes: {},
  edgeRules: { _fallback: { valid: [], default: undefined } },
} as unknown as DiagramaConfig;

const quebra = {
  id: "q1", titulo: "T", time: "time-a",
  diagrama: {
    nodes: [{ id: "n1", type: "service", label: "srv-propostas", x: 0, y: 0, status: "novo", spec: {}, specNA: {} }],
    edges: [],
  },
} as unknown as Quebra;

/**
 * O CAMINHO QUE O USUÁRIO USA — e que o teste do #294 não cobria: ele
 * seleciona o componente no canvas e clica em "Excluir nó" no painel de
 * propriedades. Meu teste anterior chamava `pedirExclusao` direto do hook e
 * renderizava o Canvas sozinho; nunca exercitou os dois componentes juntos.
 */
describe("excluir pelo painel de propriedades (composição real)", () => {
  function Tela() {
    const estado = useQuebra(quebra, config);
    const no = estado.quebra.diagrama.nodes[0];
    return (
      <div>
        <Canvas quebraState={estado} config={config} />
        {no ? (
          <PropertiesPanel
            no={no}
            arestas={estado.quebra.diagrama.edges}
            config={config}
            quebraState={estado}
            time={quebra.time}
          />
        ) : (
          <span data-testid="sem-no">nó excluído</span>
        )}
      </div>
    );
  }

  it("clicar em Excluir nó abre a confirmação — não apaga direto", async () => {
    render(<Tela />);
    await userEvent.click(screen.getByText(/Excluir nó/i));

    expect(await screen.findByTestId("confirmar-exclusao")).toBeTruthy();
    expect(screen.queryByTestId("sem-no")).toBeNull();
  });

  /**
   * ATÉ ONDE ESTE ARQUIVO VAI, e por quê.
   *
   * O teste acima PASSAVA com o defeito #302 presente: o usuário selecionava o
   * componente, apertava `Delete`, e não vinha nem a confirmação nem a
   * exclusão. Aqui `@xyflow/react` é um dublê, e é DENTRO do React Flow que a
   * tecla vira `NodeChange` — um dublê nunca ia recusar `Delete`, porque não é
   * ele quem escuta o teclado.
   *
   * Então este caso afirma só o que é honesto afirmar de um dublê: qual valor
   * o Canvas mandou. Quem prova o comportamento é
   * `e2e/excluir-componente.spec.ts`, no navegador, com a lib de verdade.
   */
  it("declara Delete E Backspace como teclas de exclusão (o E2E é quem prova que funcionam)", () => {
    render(<Tela />);
    expect(propsDoReactFlow.deleteKeyCode).toEqual(["Delete", "Backspace"]);
  });
});
