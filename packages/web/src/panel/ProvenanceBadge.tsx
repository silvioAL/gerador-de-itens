import type { ValorSpec } from "@gerador/engine";

const ESTILOS: Record<ValorSpec["origem"], React.CSSProperties> = {
  manual: { background: "var(--painel-alto)", color: "var(--texto-2)" },
  extraido: { background: "rgba(62, 207, 142, 0.16)", color: "var(--verde)" },
  inferido: { background: "rgba(251, 191, 36, 0.14)", color: "var(--amarelo)" },
  sugerido: { background: "rgba(99, 102, 241, 0.16)", color: "#6d28d9", fontWeight: 700 },
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
