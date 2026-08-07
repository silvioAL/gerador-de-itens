import { useEffect, useRef, useState } from "react";
import { useTour, type UseTourOpts } from "./useTour";

const ATRASO_BASE_MS = 2400;
const ATRASO_POR_CARACTERE_MS = 45;
/** Exportado só pra teste montar um "com certeza já passou" sem duplicar o valor. */
export const ATRASO_MAXIMO_MS = 13000;

/** Tempo de leitura proporcional ao tamanho do texto do passo, com piso e teto —
 * um passo de uma frase não deveria durar o mesmo que um parágrafo inteiro.
 * Achado real: o teto sozinho cortava passos com animação própria (o terminal
 * digitando) antes dela terminar — `duracaoMinima` do passo, quando presente,
 * nunca é encurtada pelo teto, só o cálculo padrão baseado em texto é. */
function calcularAtraso(texto: string, duracaoMinima?: number): number {
  const porTexto = Math.min(ATRASO_MAXIMO_MS, ATRASO_BASE_MS + texto.length * ATRASO_POR_CARACTERE_MS);
  return Math.max(porTexto, duracaoMinima ?? 0);
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
    const atraso = calcularAtraso(tour.passoAtual.texto, tour.passoAtual.duracaoMinima);
    timerRef.current = setTimeout(() => tour.proximo(), atraso);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
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
