import type { NivelProntidao } from "@gerador/engine";

const CORES: Record<NivelProntidao, { bg: string; fg: string; label: string }> = {
  vermelho: { bg: "rgba(248, 113, 113, 0.16)", fg: "var(--vermelho)", label: "vermelho" },
  amarelo: { bg: "rgba(251, 191, 36, 0.14)", fg: "var(--amarelo)", label: "amarelo" },
  verde: { bg: "rgba(62, 207, 142, 0.16)", fg: "var(--verde)", label: "verde" },
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
