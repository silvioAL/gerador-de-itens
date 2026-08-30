/**
 * §254 — o ponteiro que mostra ONDE o tour agiu.
 *
 * Existiu antes (`CursorFantasma`, removido no §243 junto com a demonstração
 * automática) e volta como parte do tour, não como um segundo mecanismo — a
 * mesma disciplina do §252.
 *
 * ## O que ele é, e o que ele não é
 *
 * Ele **não simula clique**. Cada passo do tour executa a ação de verdade no
 * `onEnter` (abre a tela, seleciona o nó, deriva); o ponteiro só vai até o
 * lugar onde isso aconteceu e dá o pulso. A distinção importa: um cursor que
 * fingisse clicar seria teatro, e teatro numa demonstração é a mesma família de
 * mentira que o §234 pagou caro — a tela dizendo uma coisa e a ferramenta
 * fazendo outra.
 *
 * Sem alvo (passo de tela cheia) ele não aparece: apontar para o nada é pior
 * que não apontar.
 */
export interface CursorFantasmaProps {
  /** O retângulo do alvo do passo atual. `null` = passo sem alvo. */
  alvo: DOMRect | null;
  /** Muda a cada passo — é o que dispara o pulso de novo. */
  passo: number;
}

export function CursorFantasma({ alvo, passo }: CursorFantasmaProps) {
  if (!alvo) return null;

  // Um pouco para dentro do canto superior esquerdo, como uma mão pousaria —
  // o centro exato cobriria justamente o que o passo quer mostrar.
  const x = alvo.left + Math.min(28, alvo.width * 0.3);
  const y = alvo.top + Math.min(24, alvo.height * 0.5);

  return (
    <div
      data-testid="cursor-fantasma"
      aria-hidden="true"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        transform: `translate(${x}px, ${y}px)`,
        // Desliza entre passos: o salto instantâneo não conta a história de
        // "fui dali para cá", que é a única razão de o ponteiro existir.
        transition: "transform .55s cubic-bezier(.22,.61,.36,1)",
        zIndex: 82,
        pointerEvents: "none",
      }}
    >
      {/* O pulso: reinicia a cada passo porque a `key` muda. */}
      <span
        key={passo}
        data-testid="cursor-pulso"
        style={{
          position: "absolute",
          top: -14,
          left: -14,
          width: 28,
          height: 28,
          borderRadius: "50%",
          border: "2px solid var(--acento-gente-texto)",
          animation: "cursor-pulso .7s ease-out",
        }}
      />
      <svg width="22" height="22" viewBox="0 0 24 24" style={{ filter: "drop-shadow(0 2px 4px rgba(0,0,0,.5))" }}>
        <path d="M5 3l14 8-6 1.5L10 19z" fill="#fff" stroke="#1e1b4b" strokeWidth="1.2" strokeLinejoin="round" />
      </svg>
      <style>{`@keyframes cursor-pulso {
        from { transform: scale(.4); opacity: .9; }
        to { transform: scale(1.9); opacity: 0; }
      }`}</style>
    </div>
  );
}
