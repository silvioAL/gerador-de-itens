import { Fragment } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { calcularProntidao, type Aresta, type DiagramaConfig, type No } from "@gerador/engine";
import { MAPA_ICONES } from "./icones";

export interface NodeCardData extends Record<string, unknown> {
  no: No;
  config: DiagramaConfig;
  arestas: Aresta[];
  quebraTime?: string;
}

const CORES_NIVEL: Record<string, string> = {
  vermelho: "#ef4444",
  amarelo: "#f59e0b",
  verde: "#22c55e",
};

const handleEstilo: React.CSSProperties = {
  width: 9,
  height: 9,
  background: "#cbd5e1",
  border: "1.5px solid #64748b",
};

/** Um ponto de conexão por lado, cada um servindo como origem E destino — permite
 * arrastar uma aresta a partir de qualquer lado do nó, como no protótipo HTML. */
const LADOS = [Position.Top, Position.Right, Position.Bottom, Position.Left];

export function NodeCard({ data, selected }: NodeProps & { data: NodeCardData }) {
  const { no, config, arestas, quebraTime } = data;
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
        borderTop: selected ? "2px solid #6366f1" : "1px solid #cbd5e1",
        borderRight: selected ? "2px solid #6366f1" : "1px solid #cbd5e1",
        borderBottom: selected ? "2px solid #6366f1" : "1px solid #cbd5e1",
        borderLeft: `4px solid ${corTipo}`,
        background: "#ffffff",
        minWidth: 190,
        boxShadow: selected ? "0 4px 14px rgba(99,102,241,.25)" : "0 1px 3px rgba(0,0,0,.08)",
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
          background: `${corTipo}1a`,
          borderBottom: "1px solid #e2e8f0",
          fontSize: 11,
          fontWeight: 600,
          color: "#475569",
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
        <span
          style={{
            fontSize: 10,
            padding: "1px 6px",
            borderRadius: 999,
            background: no.status === "novo" ? "#dbeafe" : "#f1f5f9",
            color: no.status === "novo" ? "#1d4ed8" : "#475569",
          }}
        >
          {no.status}
        </span>
      </div>

      <div style={{ padding: "8px 10px" }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: "#0f172a" }}>{no.label}</div>
        {mostrarBadgeTime && (
          <div
            style={{
              marginTop: 6,
              display: "inline-block",
              fontSize: 10,
              padding: "1px 6px",
              borderRadius: 999,
              background: "#fef3c7",
              color: "#92400e",
            }}
          >
            time: {no.time}
          </div>
        )}
      </div>
    </div>
  );
}
