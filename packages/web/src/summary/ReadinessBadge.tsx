import type { NivelProntidao } from "@gerador/engine";

const CORES: Record<NivelProntidao, { bg: string; fg: string; label: string }> = {
  vermelho: { bg: "#fee2e2", fg: "#b91c1c", label: "vermelho" },
  amarelo: { bg: "#fef3c7", fg: "#92400e", label: "amarelo" },
  verde: { bg: "#dcfce7", fg: "#15803d", label: "verde" },
};

export function ReadinessBadge({ nivel }: { nivel: NivelProntidao }) {
  const c = CORES[nivel];
  return (
    <span
      style={{
        fontSize: 10,
        fontWeight: 700,
        padding: "2px 8px",
        borderRadius: 999,
        background: c.bg,
        color: c.fg,
        textTransform: "uppercase",
        letterSpacing: 0.3,
      }}
    >
      {c.label}
    </span>
  );
}
