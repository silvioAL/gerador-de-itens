import { useRef, useState } from "react";
import type { Diagrama, DiagramaConfig } from "@gerador/engine";

export interface DiagramaCompactoProps {
  diagrama: Diagrama;
  config: DiagramaConfig;
  /** Id do nó em processamento agora (Fase 1d, SPEC-23) ou do item
   * selecionado manualmente (Fase D, SPEC-24) — destacado com um halo da
   * cor do próprio tipo. `undefined` quando nenhum dos dois se aplica. */
  noAtivoId?: string;
  /** Id do nó usado como filtro (Fase D, SPEC-24) — os demais nós ficam
   * esmaecidos. `undefined` quando nenhum filtro está ativo. */
  noFiltradoId?: string;
  /** Clique num nó — a `ReviewScreen` decide se isso ativa/desativa o
   * filtro (segundo clique no mesmo nó limpa). */
  onClickNo?: (id: string) => void;
  /** Itens derivados por nó — vira o badge de contagem no canto do card,
   * como o `.cnt` do protótipo. */
  contagemPorNo?: Record<string, number>;
  /** Altura em px, quando a divisória arrastável (ReviewScreen) já mediu uma
   * — `undefined` cai no default proporcional de 30vh. */
  altura?: number;
}

// Proporções do protótipo (nó 210-240×64 num palco de 1200×430): aqui a
// largura é fixa porque as coordenadas vêm do canvas real, onde os nós têm
// tamanho uniforme — 200×64 preserva a mesma razão largura/altura.
const LARGURA_NO = 200;
const ALTURA_NO = 64;
const PADDING = 40;

interface Ponto {
  x: number;
  y: number;
}

/** Caminho de uma aresta no estilo do protótipo: reta de borda a borda
 * entre nós da mesma linha, curva cúbica (descendo/subindo pela vertical
 * média) entre linhas diferentes. Devolve também o ponto médio real do
 * caminho, onde o rótulo é ancorado. */
function caminhoAresta(a: Ponto, b: Ponto): { d: string; meio: Ponto } {
  if (Math.abs(a.y - b.y) < 10) {
    const esquerda = a.x < b.x ? a : b;
    const direita = a.x < b.x ? b : a;
    const x1 = esquerda.x + LARGURA_NO;
    const x2 = direita.x;
    const y = a.y + ALTURA_NO / 2;
    return { d: `M ${x1},${y} L ${x2},${y}`, meio: { x: (x1 + x2) / 2, y } };
  }
  const de = { x: a.x + LARGURA_NO / 2, y: a.y < b.y ? a.y + ALTURA_NO : a.y };
  const ate = { x: b.x + LARGURA_NO / 2, y: a.y < b.y ? b.y : b.y + ALTURA_NO };
  const meioY = (de.y + ate.y) / 2;
  const d = `M ${de.x},${de.y} C ${de.x},${meioY} ${ate.x},${meioY} ${ate.x},${ate.y}`;
  // Ponto da cúbica em t=0.5: B(0.5) = (p0 + 3·p1 + 3·p2 + p3) / 8.
  const meio = {
    x: (de.x + 3 * de.x + 3 * ate.x + ate.x) / 8,
    y: (de.y + 3 * meioY + 3 * meioY + ate.y) / 8,
  };
  return { d, meio };
}

/**
 * Faixa de diagrama fiel ao protótipo de referência (SPEC-24 Fase E —
 * achado real: "as conexões são parecidas com as do canvas, mas coloridas
 * e animadas... falta a animação na volta dos componentes sendo
 * construídos, a barra do fluxo informacional abaixo do diagrama"):
 * cards com tipo + nome + badge de contagem, arestas curvas na cor do nó
 * de origem com rótulo da conexão, halo no nó ativo, fundo pontilhado,
 * legenda de tipos e dica de filtro. Sem zoom/pan/drag (isso mora no
 * diagrama completo, `gerarDiagramaHtml`) — clique filtra os itens.
 */
export function DiagramaCompacto({ diagrama, config, noAtivoId, noFiltradoId, onClickNo, contagemPorNo, altura }: DiagramaCompactoProps) {
  // Pan/zoom (SPEC-24 Fase E — "deve ser possível clicar no quadro do canvas
  // e movimentá-lo, tal como no outro canvas do projeto, também ampliar,
  // reduzir"): a vista é um viewBox alternativo; `null` = enquadramento
  // automático. Arrastar o fundo move, roda do mouse amplia/reduz ancorado
  // no cursor, duplo clique volta ao enquadramento automático.
  const [vista, setVista] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const arrastoRef = useRef<{ x: number; y: number; vista: { x: number; y: number; w: number; h: number } } | null>(null);
  // Distingue arrasto de clique: depois de mover além do limiar, o clique
  // que o browser dispara ao soltar NÃO pode virar filtro por nó.
  const arrastouRef = useRef(false);

  const nos = diagrama.nodes.map((no) => ({
    id: no.id,
    label: no.label,
    tipo: config.nodeTypes[no.type]?.label ?? no.type,
    existente: no.status === "existente",
    x: no.x,
    y: no.y,
    cor: config.nodeTypes[no.type]?.color ?? "#64748b",
  }));

  const noPorId = (id: string) => nos.find((n) => n.id === id);

  const arestas = diagrama.edges
    .map((e) => ({
      ...e,
      a: noPorId(e.source),
      b: noPorId(e.target),
      rotulo: (config.edgeTypes[e.type]?.label ?? e.type).toUpperCase(),
    }))
    .filter((e): e is typeof e & { a: NonNullable<typeof e.a>; b: NonNullable<typeof e.b> } => !!e.a && !!e.b);

  const vistaBase =
    nos.length > 0
      ? (() => {
          const minX = Math.min(...nos.map((n) => n.x));
          const minY = Math.min(...nos.map((n) => n.y));
          const maxX = Math.max(...nos.map((n) => n.x + LARGURA_NO));
          const maxY = Math.max(...nos.map((n) => n.y + ALTURA_NO));
          // Respiro extra embaixo: a legenda flutua sobre o canto inferior
          // esquerdo e não pode cobrir a última linha de cards.
          return { x: minX - PADDING, y: minY - PADDING, w: maxX - minX + PADDING * 2, h: maxY - minY + PADDING + 90 };
        })()
      : { x: 0, y: 0, w: 400, h: 150 };

  const vistaEfetiva = vista ?? vistaBase;
  const viewBox = `${vistaEfetiva.x} ${vistaEfetiva.y} ${vistaEfetiva.w} ${vistaEfetiva.h}`;

  /** Converte um delta em pixels de tela pra unidades do viewBox. */
  function escalaPorPixel(): number {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return 1;
    return vistaEfetiva.w / rect.width;
  }

  function aoPressionar(e: React.PointerEvent<SVGSVGElement>) {
    // `!= null`: eventos sintetizados sem MouseEvent (jsdom) não têm button.
    if (e.button != null && e.button !== 0) return;
    arrastoRef.current = { x: e.clientX ?? 0, y: e.clientY ?? 0, vista: vistaEfetiva };
    arrastouRef.current = false;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // jsdom não implementa pointer capture — o arrasto ainda funciona
      // enquanto o ponteiro estiver sobre o svg.
    }
  }

  function aoMover(e: React.PointerEvent<SVGSVGElement>) {
    const inicio = arrastoRef.current;
    if (!inicio) return;
    const dx = (e.clientX ?? 0) - inicio.x;
    const dy = (e.clientY ?? 0) - inicio.y;
    if (!arrastouRef.current && Math.abs(dx) < 4 && Math.abs(dy) < 4) return;
    arrastouRef.current = true;
    const k = escalaPorPixel();
    setVista({ ...inicio.vista, x: inicio.vista.x - dx * k, y: inicio.vista.y - dy * k });
  }

  function aoSoltar() {
    arrastoRef.current = null;
  }

  function aoRodar(e: React.WheelEvent<SVGSVGElement>) {
    const fator = e.deltaY > 0 ? 1.15 : 1 / 1.15;
    const rect = svgRef.current?.getBoundingClientRect();
    const v = vistaEfetiva;
    // Zoom ancorado no cursor: o ponto sob o mouse continua sob o mouse.
    const px = rect && rect.width > 0 ? (e.clientX - rect.left) / rect.width : 0.5;
    const py = rect && rect.height > 0 ? (e.clientY - rect.top) / rect.height : 0.5;
    const w = Math.min(Math.max(v.w * fator, 200), vistaBase.w * 4);
    const h = (w / v.w) * v.h;
    setVista({ x: v.x + (v.w - w) * px, y: v.y + (v.h - h) * py, w, h });
  }

  const tiposPresentes = [...new Map(nos.map((n) => [n.tipo, n.cor])).entries()];

  return (
    <div style={{ ...palcoEstilo, ...(altura !== undefined ? { height: altura, minHeight: 120 } : {}) }}>
      <svg
        ref={svgRef}
        role="img"
        aria-label="Diagrama compacto da solução"
        viewBox={viewBox}
        preserveAspectRatio="xMidYMid meet"
        onPointerDown={aoPressionar}
        onPointerMove={aoMover}
        onPointerUp={aoSoltar}
        onPointerCancel={aoSoltar}
        onWheel={aoRodar}
        onDoubleClick={() => setVista(null)}
        style={{
          width: "100%",
          height: "100%",
          display: "block",
          touchAction: "none",
          cursor: arrastoRef.current ? "grabbing" : "grab",
        }}
      >
        <defs>
          <pattern id="diagrama-pontos" width={26} height={26} patternUnits="userSpaceOnUse">
            <circle cx={1} cy={1} r={1} fill="#1B2533" opacity={0.55} />
          </pattern>
        </defs>
        <rect x="-5000" y="-5000" width="10000" height="10000" fill="url(#diagrama-pontos)" />

        {arestas.map((e) => {
          const { d, meio } = caminhoAresta(e.a, e.b);
          const tocaAtivo = !!noAtivoId && (e.source === noAtivoId || e.target === noAtivoId);
          // Cor do nó de ORIGEM, como no protótipo (a aresta "pertence" a
          // quem inicia a comunicação).
          const cor = e.a.cor;
          const larguraRotulo = e.rotulo.length * 5.6 + 12;
          return (
            <g key={e.id}>
              <path
                data-testid={`diagrama-aresta-${e.id}`}
                d={d}
                pathLength={100}
                fill="none"
                stroke={cor}
                strokeWidth={tocaAtivo ? 2.2 : 1.5}
                strokeLinecap="round"
                opacity={tocaAtivo ? 0.95 : 0.7}
                className={tocaAtivo ? "diagrama-aresta-ativa" : "diagrama-aresta-entrando"}
              />
              {tocaAtivo && (
                <path
                  data-testid={`diagrama-cometa-${e.id}`}
                  d={d}
                  pathLength={100}
                  fill="none"
                  stroke="#e0f2fe"
                  strokeWidth={2.6}
                  strokeLinecap="round"
                  className="diagrama-cometa"
                />
              )}
              <rect
                x={meio.x - larguraRotulo / 2}
                y={meio.y - 8}
                width={larguraRotulo}
                height={16}
                rx={4}
                fill="#0C111A"
              />
              <text x={meio.x} y={meio.y + 3.5} textAnchor="middle" style={rotuloArestaEstilo}>
                {e.rotulo}
              </text>
            </g>
          );
        })}

        {nos.map((n, i) => {
          const ativo = n.id === noAtivoId;
          const esmaecido = !!noFiltradoId && n.id !== noFiltradoId;
          const contagem = contagemPorNo?.[n.id] ?? 0;
          return (
            <g
              key={n.id}
              data-testid={`diagrama-compacto-no-${n.id}`}
              className="diagrama-no-entrando"
              onClick={
                onClickNo
                  ? () => {
                      // O clique que o browser dispara ao soltar um arrasto de
                      // pan não pode virar filtro por nó.
                      if (!arrastouRef.current) onClickNo(n.id);
                    }
                  : undefined
              }
              style={{
                cursor: onClickNo ? "pointer" : undefined,
                animationDelay: `${i * 90}ms`,
                // Halo da cor do próprio tipo, como o `.node.sel` do
                // protótipo — não um azul fixo.
                filter: ativo ? `drop-shadow(0 0 9px ${n.cor})` : undefined,
              }}
              opacity={esmaecido ? 0.25 : 1}
            >
              <rect
                x={n.x}
                y={n.y}
                width={LARGURA_NO}
                height={ALTURA_NO}
                rx={10}
                fill="#151b28"
                stroke={ativo ? n.cor : "#263344"}
                strokeWidth={ativo ? 1.6 : 1}
                className={ativo ? "diagrama-no-ativo" : undefined}
              />
              <rect x={n.x} y={n.y + 6} width={3} height={ALTURA_NO - 12} fill={n.cor} rx={1.5} />
              <text x={n.x + 14} y={n.y + 22} style={tipoNoEstilo} fill={n.cor}>
                {n.tipo.toUpperCase()}
                {n.existente && (
                  <tspan dx={8} fill="#5C6A7E">
                    EXISTENTE
                  </tspan>
                )}
              </text>
              <text x={n.x + 14} y={n.y + 44} style={nomeNoEstilo}>
                {n.label.length > 24 ? `${n.label.slice(0, 23)}…` : n.label}
              </text>
              {contagem > 0 && (
                <>
                  <rect x={n.x + LARGURA_NO - 26} y={n.y + 8} width={18} height={18} rx={5} fill={`${n.cor}29`} />
                  <text
                    data-testid={`diagrama-contagem-${n.id}`}
                    x={n.x + LARGURA_NO - 17}
                    y={n.y + 21}
                    textAnchor="middle"
                    style={contagemEstilo}
                    fill={n.cor}
                  >
                    {contagem}
                  </text>
                </>
              )}
            </g>
          );
        })}
      </svg>

      {/* Barra do fluxo informacional (a `.legend` do protótipo): um traço
          na cor de cada tipo presente no diagrama. */}
      <div data-testid="diagrama-legenda" style={legendaEstilo}>
        {tiposPresentes.map(([tipo, cor]) => (
          <span key={tipo} style={legendaItemEstilo}>
            <i style={{ ...legendaTracoEstilo, background: cor }} />
            {tipo.toUpperCase()}
          </span>
        ))}
      </div>
      {onClickNo && <div style={dicaEstilo}>Clique num nó pra filtrar os itens</div>}
    </div>
  );
}

const palcoEstilo: React.CSSProperties = {
  position: "relative",
  height: "30vh",
  minHeight: 180,
  flexShrink: 0,
  borderBottom: "1px solid #1B2533",
  background: "radial-gradient(1100px 340px at 50% -8%, rgba(56, 189, 248, 0.09), transparent 70%), #0C111A",
  overflow: "hidden",
};

const rotuloArestaEstilo: React.CSSProperties = {
  fontFamily: "system-ui, sans-serif",
  fontSize: 10,
  fontWeight: 600,
  letterSpacing: "0.1em",
  fill: "#5C6A7E",
};

const tipoNoEstilo: React.CSSProperties = {
  fontFamily: "system-ui, sans-serif",
  fontSize: 9.5,
  fontWeight: 700,
  letterSpacing: "0.14em",
};

const nomeNoEstilo: React.CSSProperties = {
  fontFamily: "ui-monospace, monospace",
  fontSize: 12.5,
  fill: "#E8EEF8",
};

const contagemEstilo: React.CSSProperties = {
  fontFamily: "ui-monospace, monospace",
  fontSize: 10,
  fontWeight: 600,
};

const legendaEstilo: React.CSSProperties = {
  position: "absolute",
  left: 16,
  bottom: 10,
  display: "flex",
  gap: 14,
  flexWrap: "wrap",
  padding: "6px 11px",
  borderRadius: 10,
  background: "rgba(12, 17, 26, 0.7)",
  border: "1px solid #1B2533",
  backdropFilter: "blur(6px)",
};

const legendaItemEstilo: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  fontSize: 10,
  fontWeight: 600,
  letterSpacing: "0.1em",
  color: "#8D9BB0",
};

const legendaTracoEstilo: React.CSSProperties = {
  width: 8,
  height: 2,
  borderRadius: 2,
};

const dicaEstilo: React.CSSProperties = {
  position: "absolute",
  right: 16,
  bottom: 12,
  fontSize: 11.5,
  color: "#5C6A7E",
};
