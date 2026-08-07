import { useRect } from "./TourOverlay";

export interface CursorFantasmaProps {
  selector: string | null;
}

/**
 * Cursor animado que se move até o alvo do passo atual, pra demo automática
 * parecer uma gravação de tela. Reaproveita o mesmo `useRect` do
 * `TourOverlay` pra medir a posição — movimento em linha reta via transição
 * CSS, não trajetória de mouse realista (fora de escopo, SPEC-17 Fase I).
 * Sem alvo (passo com `selector: null`, card central), não renderiza nada.
 */
export function CursorFantasma({ selector }: CursorFantasmaProps) {
  const rect = useRect(selector);
  if (!rect) return null;

  const x = rect.left + rect.width / 2;
  const y = rect.top + rect.height / 2;

  return (
    <div aria-hidden data-testid="cursor-fantasma" style={{ position: "fixed", top: 0, left: 0, zIndex: 90, pointerEvents: "none" }}>
      <style>{`
        @keyframes gerador-cursor-pulso {
          0% { transform: scale(0.6); opacity: 0.9; }
          70% { transform: scale(1.8); opacity: 0; }
          100% { transform: scale(1.8); opacity: 0; }
        }
      `}</style>
      <div
        key={selector}
        style={{
          position: "fixed",
          top: y,
          left: x,
          width: 26,
          height: 26,
          marginTop: -13,
          marginLeft: -13,
          borderRadius: "50%",
          background: "rgba(79, 70, 229, 0.9)",
          animation: "gerador-cursor-pulso 1.1s ease-out",
        }}
      />
      <div
        style={{
          position: "fixed",
          top: y,
          left: x,
          width: 14,
          height: 14,
          marginTop: -7,
          marginLeft: -7,
          borderRadius: "50%",
          background: "#4f46e5",
          border: "2px solid #fff",
          boxShadow: "0 2px 8px rgba(15, 23, 42, 0.35)",
          transition: "top .5s ease, left .5s ease",
        }}
      />
    </div>
  );
}
