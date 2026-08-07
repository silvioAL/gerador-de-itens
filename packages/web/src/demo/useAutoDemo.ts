import { useEffect, useRef, useState } from "react";
import { useTour, type UseTourOpts } from "./useTour";

const ATRASO_BASE_MS = 1800;
const ATRASO_POR_CARACTERE_MS = 35;
const ATRASO_MAXIMO_MS = 9000;

/** Tempo de leitura proporcional ao tamanho do texto do passo, com piso e teto —
 * um passo de uma frase não deveria durar o mesmo que um parágrafo inteiro. */
function calcularAtraso(texto: string): number {
  return Math.min(ATRASO_MAXIMO_MS, ATRASO_BASE_MS + texto.length * ATRASO_POR_CARACTERE_MS);
}

/**
 * Autoplay por cima do mesmo `useTour` — em vez de esperar clique em
 * "Próximo", avança sozinho num timer. Reaproveita a mesma lista de passos e
 * os mesmos `onEnter` (carrega cenário, seleciona nó, deriva): a demo pilota
 * o app de verdade, não é uma sequência de imagens estáticas.
 */
export function useAutoDemo(opts: UseTourOpts) {
  const tour = useTour(opts);
  const [rodando, setRodando] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!tour.ativo) setRodando(false);
  }, [tour.ativo]);

  useEffect(() => {
    if (!rodando || !tour.ativo || !tour.passoAtual) return;
    const atraso = calcularAtraso(tour.passoAtual.texto);
    timerRef.current = setTimeout(() => tour.proximo(), atraso);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rodando, tour.ativo, tour.indice]);

  function play() {
    if (!tour.ativo) tour.iniciar();
    setRodando(true);
  }

  function pausar() {
    setRodando(false);
  }

  function pularPraFim() {
    setRodando(false);
    tour.pular();
  }

  return { ...tour, rodando, play, pausar, pularPraFim };
}
