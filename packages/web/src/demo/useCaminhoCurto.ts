import { useCallback, useEffect, useRef, useState } from "react";
import { ATOS } from "./atos";

/**
 * SPEC-92 fatia E — **"ver em 60 segundos": o caminho curto.**
 *
 * ## O que ele é, e por que ele existe no lugar de um vídeo
 *
 * O usuário pediu vídeo. A SPEC-82 §6.2 deixou a pergunta que ninguém respondeu
 * — *"a necessidade é dentro ou fora do app?"* — e esta peça responde à de
 * **dentro**: percorre os cinco atos parando em cada um, com o mesmo conteúdo,
 * saindo dos mesmos dados, e sem um artefato que envelheça em separado da
 * página. Um vídeo gravado hoje mostraria a página de hoje para sempre.
 *
 * ## Os 12 segundos saem da conta, não do olho
 *
 * A promessa é "60 segundos" e os atos são cinco. `60 / 5 = 12`. Se um sexto ato
 * entrar, o tempo por parada cai sozinho e a promessa continua verdadeira —
 * escolher 10 "porque parece bom" faria o rótulo mentir no dia do sexto.
 *
 * ## Interrompível, e a régua é a do tour (§253)
 *
 * Para com o botão, com `Escape`, e ao clicar em qualquer item do menu — quem
 * clica no menu está dizendo para onde quer ir, e continuar a levá-lo a outro
 * lugar seria sequestrar a rolagem pela porta dos fundos.
 *
 * **O que ele NÃO faz:** parar sozinho quando a pessoa rola. Não dá para
 * distinguir a rolagem dela da que este hook acabou de provocar sem heurística
 * de tempo, e heurística erra nos dois sentidos — ou ignora a pessoa, ou se
 * mata sozinho no meio. Fica dito em vez de ser adivinhado.
 *
 * ## A rolagem é do browser, e a suavidade é do CSS
 *
 * `scrollIntoView` sem `behavior` deixa `scroll-behavior` mandar — e ele está no
 * `styles.css`, dentro da guarda de `prefers-reduced-motion` que o §328 criou.
 * Uma fonte só para "a rolagem é suave?", válida também para as âncoras.
 */
export const SEGUNDOS_DO_CAMINHO = 60;
export const MS_POR_ATO = (SEGUNDOS_DO_CAMINHO / ATOS.length) * 1000;

export interface CaminhoCurto {
  percorrendo: boolean;
  /** O índice da parada atual, para a barra de progresso. `-1` quando parado. */
  parada: number;
  comecar: () => void;
  parar: () => void;
}

export function useCaminhoCurto(): CaminhoCurto {
  const [parada, setParada] = useState(-1);
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);

  const parar = useCallback(() => {
    if (temporizador.current) clearTimeout(temporizador.current);
    temporizador.current = null;
    setParada(-1);
  }, []);

  const comecar = useCallback(() => setParada(0), []);

  useEffect(() => {
    if (parada < 0) return;

    /* A rolagem acontece no efeito, e não no `comecar`, porque a última parada
       também precisa rolar — e ela é a que o `setTimeout` agenda, não a que
       algum clique produz. */
    document.getElementById(ATOS[parada].id)?.scrollIntoView({ block: "start" });

    if (parada >= ATOS.length - 1) {
      // Chegou ao fim: para sozinho. Um percurso que recomeça em laço é um
      // carrossel automático, e a SPEC-92 §5 recusa carrossel automático.
      temporizador.current = setTimeout(() => setParada(-1), MS_POR_ATO);
      return () => {
        if (temporizador.current) clearTimeout(temporizador.current);
      };
    }

    temporizador.current = setTimeout(() => setParada((p) => (p < 0 ? p : p + 1)), MS_POR_ATO);
    return () => {
      if (temporizador.current) clearTimeout(temporizador.current);
    };
  }, [parada]);

  useEffect(() => {
    if (parada < 0) return;
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === "Escape") parar();
    };
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [parada, parar]);

  return { percorrendo: parada >= 0, parada, comecar, parar };
}
