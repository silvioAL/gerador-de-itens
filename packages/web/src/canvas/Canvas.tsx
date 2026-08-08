import { useMemo } from "react";
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  type Connection,
  type Edge,
  type Node,
  type NodeChange,
  type EdgeChange,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { DiagramaConfig, No } from "@gerador/engine";
import type { UseQuebra } from "../state/useQuebra";
import { NodeCard, type NodeCardData } from "./NodeCard";

const nodeTypes = { domNo: NodeCard };

/**
 * Lado do handle quando a aresta não veio de um drag real (carregada de um
 * `quebra.json`, cenário de demo, ou criada por `tentarConectar` sem handle
 * explícito) — sem isso a aresta sempre ancorava no primeiro handle declarado
 * no nó (topo), não importa a posição relativa dos dois nós no canvas.
 */
export function handlesPadrao(origem: Pick<No, "x" | "y">, destino: Pick<No, "x" | "y">) {
  const dx = destino.x - origem.x;
  const dy = destino.y - origem.y;
  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0
      ? { sourceHandle: "source-right", targetHandle: "target-left" }
      : { sourceHandle: "source-left", targetHandle: "target-right" };
  }
  return dy >= 0
    ? { sourceHandle: "source-bottom", targetHandle: "target-top" }
    : { sourceHandle: "source-top", targetHandle: "target-bottom" };
}

export interface CanvasProps {
  quebraState: UseQuebra;
  config: DiagramaConfig;
}

export function Canvas({ quebraState, config }: CanvasProps) {
  const {
    quebra,
    selecionadoId,
    setSelecionadoId,
    arestaSelecionadaId,
    setArestaSelecionadaId,
    moverNo,
    removerNo,
    tentarConectar,
    removerAresta,
  } = quebraState;

  const nodes: Node[] = useMemo(
    () =>
      quebra.diagrama.nodes.map((no) => ({
        id: no.id,
        type: "domNo",
        position: { x: no.x, y: no.y },
        selected: no.id === selecionadoId,
        data: {
          no,
          config,
          arestas: quebra.diagrama.edges,
          quebraTime: quebra.time,
        } satisfies NodeCardData,
      })),
    [quebra.diagrama.nodes, quebra.diagrama.edges, quebra.time, config, selecionadoId]
  );

  const edges: Edge[] = useMemo(
    () =>
      quebra.diagrama.edges.map((e) => {
        const origem = quebra.diagrama.nodes.find((n) => n.id === e.source);
        const destino = quebra.diagrama.nodes.find((n) => n.id === e.target);
        const padrao = origem && destino ? handlesPadrao(origem, destino) : undefined;
        return {
          id: e.id,
          source: e.source,
          target: e.target,
          sourceHandle: e.sourceHandle ?? padrao?.sourceHandle,
          targetHandle: e.targetHandle ?? padrao?.targetHandle,
          selected: e.id === arestaSelecionadaId,
          label: config.edgeTypes[e.type]?.label ?? e.type,
          style: { stroke: config.edgeTypes[e.type]?.color ?? "#5c6a7e" },
          labelStyle: { fontSize: 11, fill: "#c5ceda" },
          labelBgStyle: { fill: "#101823" },
        };
      }),
    [quebra.diagrama.nodes, quebra.diagrama.edges, config.edgeTypes, arestaSelecionadaId]
  );

  function onNodesChange(changes: NodeChange[]) {
    for (const change of changes) {
      if (change.type === "position" && change.position) {
        moverNo(change.id, change.position.x, change.position.y);
      }
      if (change.type === "remove") {
        removerNo(change.id);
      }
    }
  }

  function onEdgesChange(changes: EdgeChange[]) {
    for (const change of changes) {
      if (change.type === "remove") {
        removerAresta(change.id);
      }
    }
  }

  function onConnect(connection: Connection) {
    if (!connection.source || !connection.target) return;
    tentarConectar(connection.source, connection.target, connection.sourceHandle, connection.targetHandle);
  }

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onConnect={onConnect}
      onNodeClick={(_, node) => {
        setSelecionadoId(node.id);
        setArestaSelecionadaId(null);
      }}
      onEdgeClick={(_, edge) => {
        setArestaSelecionadaId(edge.id);
        setSelecionadoId(null);
      }}
      onPaneClick={() => {
        setSelecionadoId(null);
        setArestaSelecionadaId(null);
      }}
      fitView
    >
      {/* Mesmos pontos do fundo do DiagramaCompacto (protótipo) — cor e
          espaçamento iguais pro canvas e a revisão lerem como um sistema só. */}
      <Background color="#1B2533" gap={26} size={1.4} />
      <Controls />
      <MiniMap
        pannable
        zoomable
        bgColor="#101823"
        maskColor="rgba(12, 17, 26, 0.72)"
        nodeColor="#263344"
        style={{
          border: "1px solid #263344",
          borderRadius: 8,
          boxShadow: "0 4px 14px rgba(0,0,0,.4)",
        }}
      />
    </ReactFlow>
  );
}
