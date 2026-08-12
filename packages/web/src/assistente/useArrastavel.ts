import { useRef, useState } from "react";

/**
 * Arrasto de um elemento `position: fixed` (pedido do usuário: o bubble
 * apareceu SOBRE um botão e não tinha como mover). Pointer events com captura;
 * um arrasto de verdade (>6px) suprime o clique que o browser dispara ao
 * soltar — sem isso, todo arrasto abriria o assistente no fim. A posição
 * persiste em localStorage e é limitada à viewport (um bubble arrastado pra
 * fora da tela seria pior que um bubble mal posicionado).
 */
export function useArrastavel(chaveStorage: string, tamanho = 48) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(() => {
    try {
      const salvo = localStorage.getItem(chaveStorage);
      return salvo ? (JSON.parse(salvo) as { x: number; y: number }) : null;
    } catch {
      return null;
    }
  });
  const pegada = useRef<{ dx: number; dy: number } | null>(null);
  const moveu = useRef(false);
  const ultima = useRef<{ x: number; y: number } | null>(null);

  function limitar(x: number, y: number) {
    return {
      x: Math.min(Math.max(0, x), window.innerWidth - tamanho),
      y: Math.min(Math.max(0, y), window.innerHeight - tamanho),
    };
  }

  function onPointerDown(e: React.PointerEvent<HTMLElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    pegada.current = { dx: e.clientX - r.left, dy: e.clientY - r.top };
    moveu.current = false;
    // jsdom não implementa pointer capture — o optional chaining mantém os
    // testes de clique funcionando sem mock.
    e.currentTarget.setPointerCapture?.(e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent<HTMLElement>) {
    if (!pegada.current) return;
    const alvo = limitar(e.clientX - pegada.current.dx, e.clientY - pegada.current.dy);
    if (!moveu.current) {
      const r = e.currentTarget.getBoundingClientRect();
      if (Math.abs(alvo.x - r.left) < 6 && Math.abs(alvo.y - r.top) < 6) return;
      moveu.current = true;
    }
    ultima.current = alvo;
    setPos(alvo);
  }

  function onPointerUp() {
    if (pegada.current && moveu.current && ultima.current) {
      try {
        localStorage.setItem(chaveStorage, JSON.stringify(ultima.current));
      } catch {
        // sem storage (aba privada etc.), a posição vale só até o reload
      }
    }
    pegada.current = null;
  }

  /** No capture do clique: um arrasto que termina em cima do botão NÃO é um
   * clique de abrir. */
  function onClickCapture(e: React.MouseEvent<HTMLElement>) {
    if (moveu.current) {
      e.preventDefault();
      e.stopPropagation();
      moveu.current = false;
    }
  }

  const estiloArrasto: React.CSSProperties = pos
    ? { left: pos.x, top: pos.y, right: "auto", bottom: "auto" }
    : {};

  return {
    estiloArrasto,
    handlersDeArrasto: { onPointerDown, onPointerMove, onPointerUp, onClickCapture },
  };
}
