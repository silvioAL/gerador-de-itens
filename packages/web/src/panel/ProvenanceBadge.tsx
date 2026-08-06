import type { ValorSpec } from "@gerador/engine";

const ESTILOS: Record<ValorSpec["origem"], React.CSSProperties> = {
  manual: { background: "#f1f5f9", color: "#475569" },
  extraido: { background: "#dcfce7", color: "#15803d" },
  inferido: { background: "#fef3c7", color: "#92400e" },
  sugerido: { background: "#ede9fe", color: "#6d28d9", fontWeight: 700 },
};

const ROTULOS: Record<ValorSpec["origem"], string> = {
  manual: "manual",
  extraido: "extraído",
  inferido: "inferido",
  sugerido: "sugerido",
};

export function ProvenanceBadge({ valorSpec }: { valorSpec: ValorSpec }) {
  const titulo =
    valorSpec.origem === "extraido"
      ? valorSpec.evidencia ?? "evidência não informada"
      : valorSpec.origem === "inferido"
        ? `confiança ${Math.round((valorSpec.confianca ?? 0) * 100)}%`
        : undefined;

  return (
    <span
      title={titulo}
      style={{
        fontSize: 10,
        padding: "1px 6px",
        borderRadius: 999,
        ...ESTILOS[valorSpec.origem],
      }}
    >
      {ROTULOS[valorSpec.origem]}
    </span>
  );
}
