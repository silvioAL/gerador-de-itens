import type { Diagrama, DiagramaConfig } from "@gerador/engine";

export interface DiagramaCompactoProps {
  diagrama: Diagrama;
  config: DiagramaConfig;
  /** Id do nó em processamento agora (Fase 1d, SPEC-23) ou do item
   * selecionado manualmente (Fase D, SPEC-24) — destacado com um anel de
   * foco. `undefined` quando nenhum dos dois se aplica. */
  noAtivoId?: string;
  /** Id do nó usado como filtro (Fase D, SPEC-24) — os demais nós ficam
   * esmaecidos. `undefined` quando nenhum filtro está ativo. */
  noFiltradoId?: string;
  /** Clique num nó — a `ReviewScreen` decide se isso ativa/desativa o
   * filtro (segundo clique no mesmo nó limpa). */
  onClickNo?: (id: string) => void;
}

const LARGURA_NO = 128;
const ALTURA_NO = 44;
const PADDING = 30;

/**
 * Faixa de diagrama simplificada, só leitura pro propósito de edição — sem
 * zoom/pan/drag (isso já existe na versão completa, `gerarDiagramaHtml`,
 * atrás do botão "🔍 Ver diagrama completo"). Existe pra ficar sempre visível
 * durante a geração ao vivo (Fase 1d, SPEC-23), destacando o nó de verdade
 * sendo processado, e pra filtrar a lista de itens por nó via clique (Fase D,
 * SPEC-24) — não uma sequência decorativa como o protótipo de referência,
 * que anima sem IA real por trás.
 */
export function DiagramaCompacto({ diagrama, config, noAtivoId, noFiltradoId, onClickNo }: DiagramaCompactoProps) {
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
        // Aresta tocando o nó ativo ganha destaque + fluxo animado (Fase E —
        // "animação das conexões" era o gap visual mais citado em relação ao
        // protótipo) — puramente visual, não muda o mecanismo por trás.
        const tocaAtivo = !!noAtivoId && (e.source === noAtivoId || e.target === noAtivoId);
        return (
          <line
            key={e.id}
            x1={p1.x}
            y1={p1.y}
            x2={p2.x}
            y2={p2.y}
            stroke={tocaAtivo ? "#38bdf8" : e.cor}
            strokeWidth={tocaAtivo ? 2.2 : 1.4}
            opacity={tocaAtivo ? 0.95 : 0.6}
            className={tocaAtivo ? "diagrama-aresta-ativa" : undefined}
          />
        );
      })}
      {nos.map((n) => {
        const ativo = n.id === noAtivoId;
        const esmaecido = !!noFiltradoId && n.id !== noFiltradoId;
        return (
          <g
            key={n.id}
            data-testid={`diagrama-compacto-no-${n.id}`}
            className={ativo ? "diagrama-no-ativo" : undefined}
            onClick={onClickNo ? () => onClickNo(n.id) : undefined}
            style={onClickNo ? { cursor: "pointer" } : undefined}
            opacity={esmaecido ? 0.35 : 1}
          >
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
