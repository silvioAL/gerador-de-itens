import type { Diagrama, DiagramaConfig } from "@gerador/engine";

export interface DiagramaCompactoProps {
  diagrama: Diagrama;
  config: DiagramaConfig;
  /** Id do nó em processamento agora (Fase 1d, SPEC-23) — destacado com um
   * anel de foco. `undefined` quando a geração não está rodando. */
  noAtivoId?: string;
}

const LARGURA_NO = 128;
const ALTURA_NO = 44;
const PADDING = 30;

/**
 * Faixa de diagrama simplificada, só leitura — sem zoom/pan/clique (isso já
 * existe na versão completa, `gerarDiagramaHtml`, atrás do botão "🔍 Ver
 * diagrama completo"). Existe só pra ficar sempre visível durante a geração
 * ao vivo (Fase 1d, SPEC-23) e destacar o nó de verdade sendo processado —
 * não uma sequência decorativa como o protótipo de referência, que anima sem
 * IA real por trás.
 */
export function DiagramaCompacto({ diagrama, config, noAtivoId }: DiagramaCompactoProps) {
  const nos = diagrama.nodes.map((no) => ({
    id: no.id,
    label: no.label,
    x: no.x,
    y: no.y,
    cor: config.nodeTypes[no.type]?.color ?? "#64748b",
  }));

  const centro = (n: { x: number; y: number }) => ({ x: n.x + LARGURA_NO / 2, y: n.y + ALTURA_NO / 2 });
  const noPorId = (id: string) => nos.find((n) => n.id === id);

  const arestas = diagrama.edges
    .map((e) => ({ ...e, a: noPorId(e.source), b: noPorId(e.target), cor: config.edgeTypes[e.type]?.color ?? "#475569" }))
    .filter((e): e is typeof e & { a: NonNullable<typeof e.a>; b: NonNullable<typeof e.b> } => !!e.a && !!e.b);

  const viewBox =
    nos.length > 0
      ? (() => {
          const minX = Math.min(...nos.map((n) => n.x));
          const minY = Math.min(...nos.map((n) => n.y));
          const maxX = Math.max(...nos.map((n) => n.x + LARGURA_NO));
          const maxY = Math.max(...nos.map((n) => n.y + ALTURA_NO));
          return `${minX - PADDING} ${minY - PADDING} ${maxX - minX + PADDING * 2} ${maxY - minY + PADDING * 2}`;
        })()
      : "0 0 400 150";

  return (
    <svg
      role="img"
      aria-label="Diagrama compacto da solução"
      viewBox={viewBox}
      preserveAspectRatio="xMidYMid meet"
      style={{ width: "100%", height: 150, display: "block", background: "#0C111A" }}
    >
      {arestas.map((e) => {
        const p1 = centro(e.a);
        const p2 = centro(e.b);
        return (
          <line
            key={e.id}
            x1={p1.x}
            y1={p1.y}
            x2={p2.x}
            y2={p2.y}
            stroke={e.cor}
            strokeWidth={1.4}
            opacity={0.6}
          />
        );
      })}
      {nos.map((n) => {
        const ativo = n.id === noAtivoId;
        return (
          <g key={n.id} data-testid={`diagrama-compacto-no-${n.id}`}>
            <rect
              x={n.x}
              y={n.y}
              width={LARGURA_NO}
              height={ALTURA_NO}
              rx={8}
              fill="#151b28"
              stroke={ativo ? "#38bdf8" : "#334155"}
              strokeWidth={ativo ? 2.5 : 1.5}
            />
            <rect x={n.x} y={n.y} width={4} height={ALTURA_NO} fill={n.cor} rx={2} />
            <text x={n.x + 12} y={n.y + ALTURA_NO / 2 + 4} fontSize={11} fontWeight={600} fill="#e2e8f0">
              {n.label.length > 16 ? `${n.label.slice(0, 15)}…` : n.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
