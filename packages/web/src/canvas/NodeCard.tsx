import { Fragment } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { calcularProntidao, type Aresta, type DiagramaConfig, type No } from "@gerador/engine";
import { MAPA_ICONES } from "./icones";

export interface NodeCardData extends Record<string, unknown> {
  no: No;
  config: DiagramaConfig;
  arestas: Aresta[];
  quebraTime?: string;
  /**
   * SPEC-65 fatia C — a leitura DESTE nó, quando existe.
   *
   * Ausente na maioria dos nós, e é assim que ela significa algo quando
   * aparece: marca que existe em todo nó vira moldura do card, e moldura
   * ninguém lê.
   */
  marca?: MarcaNoCard;
}

export interface MarcaNoCard {
  numero: number;
  titulo: string;
  /** Acende as conexões envolvidas — a leitura vira visível NA figura. */
  onOlhar?: () => void;
  onDesviar?: () => void;
}

const CORES_NIVEL: Record<string, string> = {
  vermelho: "#ef4444",
  amarelo: "#f59e0b",
  verde: "#22c55e",
};

const handleEstilo: React.CSSProperties = {
  width: 9,
  height: 9,
  background: "var(--borda-forte)",
  border: "1.5px solid var(--texto-mudo)",
};

/** Um ponto de conexão por lado, cada um servindo como origem E destino — permite
 * arrastar uma aresta a partir de qualquer lado do nó, como no protótipo HTML. */
const LADOS = [Position.Top, Position.Right, Position.Bottom, Position.Left];

export function NodeCard({ data, selected }: NodeProps & { data: NodeCardData }) {
  const { no, config, arestas, quebraTime, marca } = data;
  const cfg = config.nodeTypes[no.type];
  const prontidao = cfg ? calcularProntidao(cfg.spec, no, arestas) : null;
  const corNivel = prontidao ? CORES_NIVEL[prontidao.nivel] : "#94a3b8";
  const corTipo = cfg?.color ?? "#94a3b8";
  const IconeTipo = cfg?.icon ? MAPA_ICONES[cfg.icon] : undefined;
  const mostrarBadgeTime = no.status === "existente" && no.time && no.time !== quebraTime;

  return (
    <div
      style={{
        borderRadius: 10,
        borderTop: selected ? "2px solid var(--acento-indigo)" : "1px solid var(--borda-forte)",
        borderRight: selected ? "2px solid var(--acento-indigo)" : "1px solid var(--borda-forte)",
        borderBottom: selected ? "2px solid var(--acento-indigo)" : "1px solid var(--borda-forte)",
        borderLeft: `4px solid ${corTipo}`,
        background: "var(--painel-alto)",
        minWidth: 190,
        boxShadow: selected ? "0 4px 14px rgba(99,102,241,.35)" : "0 1px 3px rgba(0,0,0,.35)",
        overflow: "visible",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      {LADOS.map((lado) => (
        <Fragment key={lado}>
          <Handle id={`target-${lado}`} type="target" position={lado} style={handleEstilo} />
          <Handle id={`source-${lado}`} type="source" position={lado} style={handleEstilo} />
        </Fragment>
      ))}

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "6px 10px",
          background: `${corTipo}22`,
          borderBottom: "1px solid var(--borda)",
          fontSize: 11,
          fontWeight: 600,
          color: "var(--texto-2)",
          textTransform: "uppercase",
          letterSpacing: 0.4,
        }}
      >
        <span
          title={`Prontidão: ${prontidao?.nivel ?? "desconhecida"}`}
          style={{
            width: 9,
            height: 9,
            borderRadius: "50%",
            background: corNivel,
            flexShrink: 0,
          }}
        />
        <span
          aria-hidden="true"
          title={cfg?.label ?? no.type}
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 16,
            height: 16,
            borderRadius: 4,
            background: corTipo,
            color: "#ffffff",
            fontSize: 9.5,
            fontWeight: 700,
            lineHeight: 1,
            flexShrink: 0,
          }}
        >
          {IconeTipo ? (
            <IconeTipo size={11} strokeWidth={2.5} />
          ) : (
            cfg?.icon ?? ((cfg?.label ?? no.type).trim().charAt(0).toUpperCase() || "?")
          )}
        </span>
        <span style={{ flex: 1 }}>{cfg?.label ?? no.type}</span>
        {/* SPEC-65 fatia C — a marca da leitura. Cor de tinta, nunca vermelho
            nem âmbar: os dois já significam "errado" e "atenção" na mesa, e um
            fato não é nem um nem outro. */}
        {marca && (
          <span
            data-testid={`marca-leitura-${no.id}`}
            title={marca.titulo}
            onMouseEnter={marca.onOlhar}
            onMouseLeave={marca.onDesviar}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 3,
              fontSize: 10,
              fontWeight: 700,
              padding: "1px 6px",
              borderRadius: 999,
              border: "1px solid var(--acento-indigo)",
              color: "var(--acento-indigo)",
              background: "rgba(99, 102, 241, 0.12)",
              cursor: "help",
            }}
          >
            ⏱ {marca.numero}
          </span>
        )}
        <span
          style={{
            fontSize: 10,
            padding: "1px 6px",
            borderRadius: 999,
            background: no.status === "novo" ? "rgba(56, 189, 248, 0.16)" : "var(--painel)",
            color: no.status === "novo" ? "var(--acento)" : "var(--texto-fraco)",
          }}
        >
          {no.status}
        </span>
      </div>

      <div style={{ padding: "8px 10px" }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: "var(--texto)", fontFamily: "ui-monospace, 'Cascadia Mono', monospace" }}>{no.label}</div>
        {mostrarBadgeTime && (
          <div
            style={{
              marginTop: 6,
              display: "inline-block",
              fontSize: 10,
              padding: "1px 6px",
              borderRadius: 999,
              background: "rgba(251, 191, 36, 0.14)",
              color: "var(--amarelo)",
            }}
          >
            time: {no.time}
          </div>
        )}
      </div>
    </div>
  );
}
