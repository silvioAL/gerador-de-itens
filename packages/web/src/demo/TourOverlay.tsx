import { useEffect, useState } from "react";
import type { PassoTour } from "./useTour";

export interface TourOverlayProps {
  passo: PassoTour;
  indice: number;
  total: number;
  ultimo: boolean;
  onProximo: () => void;
  onPular: () => void;
}

/** Reposiciona a cada 300ms — o alvo pode mudar de lugar entre passos (painel
 * abrindo, revisão substituindo o canvas) sem que o tour dispare um evento pra isso.
 * Exportado porque CursorFantasma.tsx (demo automática) reaproveita a mesma medição. */
export function useRect(selector: string | null): DOMRect | null {
  const [rect, setRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    if (!selector) {
      setRect(null);
      return;
    }
    function medir() {
      const el = document.querySelector(selector!);
      setRect(el ? el.getBoundingClientRect() : null);
    }
    medir();
    window.addEventListener("resize", medir);
    const id = setInterval(medir, 300);
    return () => {
      window.removeEventListener("resize", medir);
      clearInterval(id);
    };
  }, [selector]);

  return rect;
}

function posicionarCard(rect: DOMRect): React.CSSProperties {
  const margem = 14;
  const largura = 300;
  const alturaEstimada = 170;

  let top = rect.bottom + margem;
  let left = Math.min(Math.max(rect.left, margem), window.innerWidth - largura - margem);

  if (top + alturaEstimada > window.innerHeight) {
    const acima = rect.top - alturaEstimada - margem;
    if (acima > margem) {
      top = acima;
    } else {
      top = Math.max(margem, Math.min(rect.top, window.innerHeight - alturaEstimada - margem));
      left = rect.right + margem;
      if (left + largura > window.innerWidth) left = Math.max(margem, rect.left - largura - margem);
    }
  }

  return { position: "fixed", top, left };
}

export function TourOverlay({ passo, indice, total, ultimo, onProximo, onPular }: TourOverlayProps) {
  const rect = useRect(passo.selector);

  const cardStyle: React.CSSProperties = rect
    ? posicionarCard(rect)
    : { position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)" };

  return (
    <>
      {!rect && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(15, 23, 42, 0.55)", zIndex: 79 }} />
      )}
      {rect && (
        <div
          style={{
            position: "fixed",
            top: rect.top - 6,
            left: rect.left - 6,
            width: rect.width + 12,
            height: rect.height + 12,
            borderRadius: 12,
            border: "2px solid #4f46e5",
            boxShadow: "0 0 0 9999px rgba(15, 23, 42, 0.55)",
            pointerEvents: "none",
            zIndex: 80,
            transition: "top .2s ease, left .2s ease, width .2s ease, height .2s ease",
          }}
        />
      )}
      <div
        style={{
          ...cardStyle,
          zIndex: 81,
          background: "var(--painel)",
          borderRadius: 12,
          boxShadow: "0 12px 30px rgba(15, 23, 42, 0.35)",
          padding: 16,
          width: 300,
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <div style={{ fontSize: 11, fontWeight: 700, color: "#a5b4fc", letterSpacing: 0.3 }}>
          PASSO {indice + 1} DE {total}
        </div>
        <div data-testid="tour-titulo" style={{ fontSize: 14, fontWeight: 700, color: "var(--texto)", margin: "4px 0 6px" }}>
          {passo.titulo}
        </div>
        <p style={{ fontSize: 12.5, color: "var(--texto-2)", lineHeight: 1.5, margin: 0 }}>{passo.texto}</p>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 14 }}>
          <button onClick={onPular} style={linkEstilo}>
            Pular tour
          </button>
          <button onClick={onProximo} style={botaoEstilo}>
            {ultimo ? "Concluir" : "Próximo"}
          </button>
        </div>
      </div>
    </>
  );
}

const botaoEstilo: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  padding: "7px 14px",
  borderRadius: 7,
  border: "1px solid #4f46e5",
  background: "#4f46e5",
  color: "#fff",
  cursor: "pointer",
};

const linkEstilo: React.CSSProperties = {
  fontSize: 12,
  color: "var(--texto-fraco)",
  background: "none",
  border: "none",
  cursor: "pointer",
  padding: "7px 4px",
};
