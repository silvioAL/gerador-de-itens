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
 * (Era exportado também para o cursor da demo automática, removida no §243.) */
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
    // §251 — trazer o alvo para a tela ANTES de medir, uma vez por passo.
    //
    // Sem isto, um passo que aponta para algo abaixo da dobra (o painel do nó
    // rola) mede um retângulo fora da viewport, a carta é posicionada a partir
    // dele e vai parar fora da tela — o tour trava, porque o "Próximo" existe e
    // não dá para clicar. Uma vez só, e não a cada medição: rolar de 300 em 300
    // ms brigaria com quem está lendo.
    // `?.scrollIntoView?.` e não `?.scrollIntoView`: jsdom não implementa o
    // método, e presumir que toda plataforma o tem quebraria o teste de quem
    // nem está exercitando rolagem.
    document.querySelector(selector)?.scrollIntoView?.({ block: "center", inline: "nearest" });
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

export function posicionarCard(rect: DOMRect): React.CSSProperties {
  const margem = 14;
  const largura = 300;
  // Bate com o `maxHeight` da carta: subestimar aqui é o que a jogava para
  // fora da tela quando o texto era longo.
  const alturaEstimada = 240;

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

  // Cinto de segurança: mesmo com o alvo na tela, um retângulo alto pode jogar
  // a carta para fora. Fora da viewport ela é inalcançável, e um tour que não
  // avança é pior que um tour que aponta para o lugar errado.
  return {
    position: "fixed",
    top: Math.max(margem, Math.min(top, window.innerHeight - alturaEstimada - margem)),
    left: Math.max(margem, Math.min(left, window.innerWidth - largura - margem)),
  };
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
          // §251 — a carta não pode crescer além da tela. Texto longo empurrava
          // o "Próximo" para fora da viewport, e o tour travava com o botão
          // existindo e inalcançável. O texto rola; a navegação nunca sai.
          maxHeight: "min(70vh, 420px)",
          overflowY: "auto",
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
