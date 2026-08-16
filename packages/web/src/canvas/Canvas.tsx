import { useEffect, useMemo, useRef } from "react";
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
  useReactFlow,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { DiagramaConfig, No } from "@gerador/engine";
import type { UseDiagrama } from "../state/useDiagrama";
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

/**
 * ACHADO REAL: o usuário selecionou o componente, apertou `Delete` e nada
 * aconteceu — nem a exclusão, nem a confirmação. O padrão do React Flow é
 * `deleteKeyCode: "Backspace"` e só; `Delete` nunca chegou a virar um
 * `NodeChange` do tipo `remove`, então `onNodesChange` não tinha o que pedir.
 * A confirmação estava certa o tempo todo — quem faltava era a tecla.
 *
 * Constante de módulo porque o React Flow compara a prop por referência: um
 * array literal aqui seria um valor novo a cada render.
 */
const TECLAS_DE_EXCLUSAO = ["Delete", "Backspace"];

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
  /** SPEC-59 fatia C — o canvas depende de um DIAGRAMA, não de uma quebra.
   * Era `UseQuebra`, e por isso qualquer segundo desenho esbarrava no domínio
   * da demanda. `UseQuebra` continua servindo aqui por composição. */
  diagramaState: UseDiagrama;
  config: DiagramaConfig;
  /** Time padrão dos nós que não declaram o próprio — é da quebra, e por isso
   * entra como valor, não como estado: o canvas não vai buscá-lo. */
  timePadrao?: string;
}

export function Canvas({ diagramaState, config, timePadrao }: CanvasProps) {
  const {
    diagrama,
    selecionadoId,
    setSelecionadoId,
    arestaSelecionadaId,
    setArestaSelecionadaId,
    moverNo,
    tentarConectar,
    pedidoDeEnquadramento,
    exclusaoPendente,
    pedirExclusao,
    cancelarExclusao,
    confirmarExclusao,
  } = diagramaState;

  /**
   * ACHADO REAL do usuário: depois de "Aplicar à mesa de projeto" os componentes "não
   * aparecem", e com nós pré-existentes "não aparecem nem assim".
   *
   * A prop `fitView` abaixo enquadra SÓ no primeiro render — é o
   * comportamento documentado dela, e é fácil ler como "sempre enquadra".
   * Inserção em lote depois disso caía fora da área visível, e pior a cada
   * lote, porque `mesclarDiagrama` empilha os novos em `max(y) + 220`.
   *
   * O contador vem de `useQuebra` e só é incrementado por quem insere em lote
   * (conversa, cenário, import) — nunca por um nó avulso da paleta, que a
   * pessoa acabou de posicionar.
   */
  const { fitView } = useReactFlow();
  const ultimoPedido = useRef(pedidoDeEnquadramento);
  useEffect(() => {
    if (pedidoDeEnquadramento === ultimoPedido.current) return;
    ultimoPedido.current = pedidoDeEnquadramento;
    // `duration`: o movimento mostra DE ONDE pra onde a tela foi. Saltar seco
    // deixa a dúvida de se o canvas mudou ou se apareceu outro diagrama.
    fitView({ padding: 0.2, duration: 400 });
  }, [pedidoDeEnquadramento, fitView]);


  const nodes: Node[] = useMemo(
    () =>
      diagrama.nodes.map((no) => ({
        id: no.id,
        type: "domNo",
        position: { x: no.x, y: no.y },
        selected: no.id === selecionadoId,
        data: {
          no,
          config,
          arestas: diagrama.edges,
          quebraTime: timePadrao,
        } satisfies NodeCardData,
      })),
    [diagrama.nodes, diagrama.edges, timePadrao, config, selecionadoId]
  );

  /**
   * ACHADO REAL do usuário: "o texto contido nas conexões (ex: publica) pisca
   * a cada conteúdo inserido" ao digitar no painel de propriedades.
   *
   * A causa era este memo depender de `diagrama.nodes`. Digitar num
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
  const geometriaNos = diagrama.nodes.map((n) => `${n.id}:${n.x}:${n.y}`).join("|");
  // Depende SÓ da string: ela é a identidade da geometria. Depender do array
  // de nós traria o piscar de volta — é literalmente o bug que se corrige aqui.
  const posicoes = useMemo(() => posicoesDaGeometria(geometriaNos), [geometriaNos]);

  const edges: Edge[] = useMemo(
    () =>
      diagrama.edges.map((e) => {
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
    [posicoes, diagrama.edges, config, arestaSelecionadaId]
  );

  function onNodesChange(changes: NodeChange[]) {
    for (const change of changes) {
      if (change.type === "position" && change.position) {
        moverNo(change.id, change.position.x, change.position.y);
      }
      // Não apaga: PEDE. Como os nós são derivados de `quebra`, o React Flow
      // some com ele internamente e o próximo render o traz de volta — nada se
      // perde enquanto a confirmação está aberta.
      if (change.type === "remove") pedirExclusao("no", change.id);
    }
  }

  function onEdgesChange(changes: EdgeChange[]) {
    for (const change of changes) {
      if (change.type === "remove") pedirExclusao("aresta", change.id);
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
      deleteKeyCode={TECLAS_DE_EXCLUSAO}
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
      {exclusaoPendente && (
        <ConfirmarExclusao
          alvo={
            exclusaoPendente.tipo === "no"
              ? {
                  tipo: "no",
                  rotulo: diagrama.nodes.find((n) => n.id === exclusaoPendente.id)?.label ?? "este componente",
                  conexoes: diagrama.edges.filter(
                    (e) => e.source === exclusaoPendente.id || e.target === exclusaoPendente.id
                  ).length,
                }
              : { tipo: "aresta" }
          }
          onCancelar={cancelarExclusao}
          onConfirmar={confirmarExclusao}
        />
      )}
    </ReactFlow>
  );
}

interface ConfirmarExclusaoProps {
  alvo: { tipo: "no"; rotulo: string; conexoes: number } | { tipo: "aresta" };
  onCancelar: () => void;
  onConfirmar: () => void;
}

/** Sobre o canvas, não um `window.confirm`: o texto precisa dizer o rótulo do
 * componente e quantas conexões somem junto, e o `confirm` do navegador não
 * combina com o tema nem aceita destaque no botão destrutivo. */
function ConfirmarExclusao({ alvo, onCancelar, onConfirmar }: ConfirmarExclusaoProps) {
  const ehNo = alvo.tipo === "no";
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={ehNo ? "Excluir componente" : "Excluir conexão"}
      data-testid="confirmar-exclusao"
      onClick={onCancelar}
      style={sobreposicaoEstilo}
    >
      <div onClick={(e) => e.stopPropagation()} style={caixaEstilo}>
        <h3 style={{ margin: "0 0 8px", fontSize: 15 }}>
          {ehNo ? `Excluir "${alvo.rotulo}"?` : "Excluir esta conexão?"}
        </h3>
        <p style={{ margin: "0 0 16px", fontSize: 13, color: "var(--texto-2)", lineHeight: 1.5 }}>
          {ehNo ? (
            <>
              O componente sai do diagrama com tudo que foi preenchido nele
              {alvo.conexoes > 0 ? (
                <>
                  , e as <strong>{alvo.conexoes}</strong> conexões ligadas a ele vão junto
                </>
              ) : null}
              . Não dá pra desfazer.
            </>
          ) : (
            "A conexão sai do diagrama junto com o que foi preenchido nela. Não dá pra desfazer."
          )}
        </p>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button onClick={onCancelar} style={botaoNeutroEstilo}>
            Cancelar
          </button>
          <button onClick={onConfirmar} data-testid="confirmar-exclusao-ok" style={botaoDestrutivoEstilo} autoFocus>
            Excluir
          </button>
        </div>
      </div>
    </div>
  );
}

const sobreposicaoEstilo: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  // Acima dos controles e do minimapa do React Flow, que ficam em z-index 5.
  zIndex: 20,
  display: "grid",
  placeItems: "center",
  background: "rgba(8, 12, 20, 0.6)",
};

const caixaEstilo: React.CSSProperties = {
  width: 380,
  maxWidth: "90%",
  padding: 18,
  borderRadius: 12,
  border: "1px solid var(--borda-forte)",
  background: "var(--painel-alto)",
  boxShadow: "0 12px 32px rgba(0,0,0,.5)",
};

const botaoNeutroEstilo: React.CSSProperties = {
  padding: "7px 14px",
  borderRadius: 8,
  border: "1px solid var(--borda-forte)",
  background: "var(--painel)",
  color: "var(--texto)",
  fontSize: 13,
  cursor: "pointer",
};

const botaoDestrutivoEstilo: React.CSSProperties = {
  padding: "7px 14px",
  borderRadius: 8,
  border: "1px solid #7f1d1d",
  background: "#b91c1c",
  color: "#fff",
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
};
