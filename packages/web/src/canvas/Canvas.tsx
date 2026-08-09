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
/** `"id:x:y|id:x:y"` de volta pra mapa. Reconstruir da string (em vez de ler
 * o array de nós) mantém a função pura e a dependência do memo honesta: tudo
 * que ela usa está na própria string. */
function posicoesDaGeometria(geometria: string): Map<string, { x: number; y: number }> {
  const mapa = new Map<string, { x: number; y: number }>();
  if (!geometria) return mapa;
  for (const parte of geometria.split("|")) {
    const [id, x, y] = parte.split(":");
    mapa.set(id, { x: Number(x), y: Number(y) });
  }
  return mapa;
}

const LABEL_STYLE = { fontSize: 11, fill: "#c5ceda" };
const LABEL_BG_STYLE = { fill: "#101823" };

/** Um objeto de estilo por COR, reaproveitado entre renders — o React Flow
 * compara por referência, e um literal novo a cada render faz o rótulo da
 * aresta repintar sem nada ter mudado. */
const estilosDeTraco = new Map<string, { stroke: string }>();
function estiloPorTipo(config: DiagramaConfig, tipo: string): { stroke: string } {
  const cor = config.edgeTypes[tipo]?.color ?? "#5c6a7e";
  let estilo = estilosDeTraco.get(cor);
  if (!estilo) {
    estilo = { stroke: cor };
    estilosDeTraco.set(cor, estilo);
  }
  return estilo;
}

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

  /**
   * ACHADO REAL do usuário: "o texto contido nas conexões (ex: publica) pisca
   * a cada conteúdo inserido" ao digitar no painel de propriedades.
   *
   * A causa era este memo depender de `quebra.diagrama.nodes`. Digitar num
   * campo do nó produz um array `nodes` NOVO — e ainda que nenhuma aresta
   * mude, o memo invalidava e devolvia objetos `Edge` novos (com `style` e
   * `labelStyle` literais recriados), fazendo o React Flow repintar todo
   * rótulo a cada tecla.
   *
   * Dos nós, as arestas precisam de UMA coisa só: a posição, pro
   * `handlesPadrao` (que usa apenas `x` e `y`). Então a dependência passa a
   * ser uma STRING de geometria — valor primitivo, que só muda quando um nó
   * de fato se move, entra ou sai. Digitar spec não mexe nela.
   */
  const geometriaNos = quebra.diagrama.nodes.map((n) => `${n.id}:${n.x}:${n.y}`).join("|");
  // Depende SÓ da string: ela é a identidade da geometria. Depender do array
  // de nós traria o piscar de volta — é literalmente o bug que se corrige aqui.
  const posicoes = useMemo(() => posicoesDaGeometria(geometriaNos), [geometriaNos]);

  const edges: Edge[] = useMemo(
    () =>
      quebra.diagrama.edges.map((e) => {
        const origem = posicoes.get(e.source);
        const destino = posicoes.get(e.target);
        const padrao = origem && destino ? handlesPadrao(origem, destino) : undefined;
        return {
          id: e.id,
          source: e.source,
          target: e.target,
          sourceHandle: e.sourceHandle ?? padrao?.sourceHandle,
          targetHandle: e.targetHandle ?? padrao?.targetHandle,
          selected: e.id === arestaSelecionadaId,
          label: config.edgeTypes[e.type]?.label ?? e.type,
          style: estiloPorTipo(config, e.type),
          // Constantes de módulo: literais aqui seriam objetos novos a cada
          // render, e é isso que o React Flow usa pra decidir se repinta.
          labelStyle: LABEL_STYLE,
          labelBgStyle: LABEL_BG_STYLE,
        };
      }),
    [posicoes, quebra.diagrama.edges, config, arestaSelecionadaId]
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
