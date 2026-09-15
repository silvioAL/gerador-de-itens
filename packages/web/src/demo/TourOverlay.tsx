import { useEffect, useRef, useState } from "react";
import type { PassoTour } from "./useTour";
import { CursorFantasma } from "./CursorFantasma";

export interface TourOverlayProps {
  passo: PassoTour;
  indice: number;
  total: number;
  ultimo: boolean;
  onProximo: () => void;
  onPular: () => void;
  /** §252 — pausa explícita, do botão. */
  pausado?: boolean;
  /** Relógio segurado porque o ponteiro está sobre a carta. */
  segurado?: boolean;
  onSegurar?: (segurar: boolean) => void;
  /** Quanto dura o passo atual, em ms — a barra é lida disto. */
  duracao?: number;
  onAlternarPausa?: () => void;
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

/**
 * O palpite de partida, e ele só vale até a carta existir para ser medida.
 *
 * **§411 — por que deixou de ser a única conta.** Este número era usado como se
 * fosse a altura da carta, e o `maxHeight` dela é `min(70vh, 420px)`. Os dois
 * nunca bateram: bastava um texto longo num alvo baixo para a carta ser
 * "contida" a 240 e ainda assim terminar 140 px abaixo da dobra — com o
 * "Próximo" existindo, visível para o DOM e fora da viewport.
 *
 * Foi o que travou o tour quando a janela do assistente passou a expandir e
 * empurrou `delta-da-proposta` para baixo: `element is outside of the
 * viewport`, trinta segundos de retry, e o e2e vermelho. O comentário original
 * já dizia a regra certa — *"subestimar aqui é o que a jogava para fora"* — e
 * a régua não estava sendo seguida por ninguém.
 *
 * A correção não é aumentar o palpite: é **medir**. Um número escrito à mão
 * volta a divergir do CSS na primeira vez que alguém mexer num dos dois.
 */
export const ALTURA_ESTIMADA_DA_CARTA = 240;

/**
 * A altura REAL da carta, remedida quando o passo troca e no mesmo ritmo do
 * alvo.
 *
 * O mesmo intervalo de 300 ms do `useRect`, e pelo mesmo motivo: o conteúdo
 * muda por baixo (a barra de progresso aparece, a fonte carrega, o texto
 * reflui) sem disparar evento nenhum. `ResizeObserver` seria mais fino e não
 * existe em toda plataforma onde os testes rodam — e aqui a diferença entre
 * "fino" e "de 300 em 300 ms" não muda nada do que a pessoa vê.
 *
 * Altura zero (jsdom, primeiro quadro) **não** substitui o palpite: medir nada
 * e acreditar seria pior que estimar.
 */
function useAlturaDaCarta(ref: React.RefObject<HTMLDivElement | null>, passo: string): number {
  const [altura, setAltura] = useState(ALTURA_ESTIMADA_DA_CARTA);

  useEffect(() => {
    function medir() {
      const medida = ref.current?.getBoundingClientRect().height ?? 0;
      if (medida > 0) setAltura((atual) => (Math.abs(atual - medida) > 1 ? medida : atual));
    }
    medir();
    const id = setInterval(medir, 300);
    window.addEventListener("resize", medir);
    return () => {
      clearInterval(id);
      window.removeEventListener("resize", medir);
    };
  }, [ref, passo]);

  return altura;
}

export function posicionarCard(rect: DOMRect, altura = ALTURA_ESTIMADA_DA_CARTA): React.CSSProperties {
  const margem = 14;
  const largura = 300;
  const alturaEstimada = altura;

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

export function TourOverlay({
  passo,
  indice,
  total,
  ultimo,
  onProximo,
  onPular,
  pausado,
  segurado,
  duracao,
  onAlternarPausa,
  onSegurar,
}: TourOverlayProps) {
  const rect = useRect(passo.selector);
  const carta = useRef<HTMLDivElement>(null);
  const altura = useAlturaDaCarta(carta, passo.titulo);

  const cardStyle: React.CSSProperties = rect
    ? posicionarCard(rect, altura)
    : { position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)" };

  return (
    <>
      {!rect && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(15, 23, 42, 0.55)", zIndex: 79 }} />
      )}
      {/* §254 — o ponteiro vai até onde o passo agiu. Antes do anel na ordem
          de render só por clareza: os dois são `pointerEvents: none`. */}
      <CursorFantasma alvo={rect} passo={indice} />
      {rect && (
        <div
          style={{
            position: "fixed",
            top: rect.top - 6,
            left: rect.left - 6,
            width: rect.width + 12,
            height: rect.height + 12,
            borderRadius: 12,
            border: "2px solid var(--acento-gente)",
            boxShadow: "0 0 0 9999px rgba(15, 23, 42, 0.55)",
            pointerEvents: "none",
            zIndex: 80,
            transition: "top .2s ease, left .2s ease, width .2s ease, height .2s ease",
          }}
        />
      )}
      <div
        ref={carta}
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
        // §252 — SEGURAR, não pausar. Alternar a pausa aqui fazia o clique no
        // botão desfazer a pausa que o próprio movimento do mouse tinha criado.
        onMouseEnter={() => onSegurar?.(true)}
        onMouseLeave={() => onSegurar?.(false)}
      >
        {/* A barra é o que torna o avanço automático PREVISÍVEL: sem ela, a
            tela troca sozinha e a pessoa não sabe se foi o tour ou um erro. */}
        {onAlternarPausa && (
          <div style={{ height: 3, borderRadius: 2, background: "var(--borda)", overflow: "hidden", marginBottom: 10 }}>
            <div
              data-testid="tour-progresso"
              key={`${indice}-${(pausado || segurado) ? "p" : "r"}`}
              style={{
                height: "100%",
                background: "var(--acento-gente)",
                width: (pausado || segurado) ? "100%" : "0%",
                opacity: (pausado || segurado) ? 0.35 : 1,
                transition: (pausado || segurado) ? "none" : `width ${duracao ?? 0}ms linear`,
                animation: (pausado || segurado) ? "none" : "tour-progresso-anima 1ms",
              }}
              ref={(el) => {
                // Dispara a transição no frame seguinte à montagem — sem isto o
                // navegador aplica largura final e transição de uma vez só, e a
                // barra pula direto para 100%.
                if (el && !pausado) requestAnimationFrame(() => (el.style.width = "100%"));
              }}
            />
          </div>
        )}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--acento-gente-texto)", letterSpacing: 0.3 }}>
            PASSO {indice + 1} DE {total}
          </div>
          <div style={{ flex: 1 }} />
          {onAlternarPausa && (
            <button
              data-testid="tour-pausar"
              onClick={onAlternarPausa}
              aria-label={(pausado || segurado) ? "Retomar o tour" : "Pausar o tour"}
              style={{ ...linkEstilo, padding: "2px 6px", fontSize: 13 }}
            >
              {(pausado || segurado) ? "▶" : "⏸"}
            </button>
          )}
        </div>
        <div data-testid="tour-titulo" style={{ fontSize: 14, fontWeight: 700, color: "var(--texto)", margin: "4px 0 6px" }}>
          {passo.titulo}
        </div>
        <p data-testid="tour-texto" style={{ fontSize: 12.5, color: "var(--texto-2)", lineHeight: 1.5, margin: 0 }}>
          {passo.texto}
        </p>
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
  border: "1px solid var(--acento-gente)",
  background: "var(--acento-gente)",
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
