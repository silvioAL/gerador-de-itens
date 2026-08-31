import { useEffect } from "react";
import { ATOS } from "./atos";

/**
 * SPEC-92 fatia B (§341) — **abrir `/#o-percurso` direto tem que parar no ato.**
 *
 * ## O defeito, e por que só o E2E o pegou
 *
 * As travas de unidade provavam que toda âncora tem seção do outro lado, e o
 * teste de clique provava que clicar leva ao lugar certo. **Abrir pelo endereço
 * não funcionava**: a seção ficava em `y=3302` — a página nem rolava.
 *
 * A causa é de ordem, não de HTML. O browser processa o hash quando termina de
 * carregar o documento, e nesse instante a landing **ainda não existe**: ela é
 * React, e o React pinta depois. `getElementById("o-percurso")` devolve `null`,
 * o browser desiste, e quando a seção enfim aparece o hash já foi consumido.
 *
 * É o mesmo erro de ordem que o §336 achou no teste de móvel — medir antes de o
 * React pintar —, agora do lado do produto em vez do lado do teste.
 *
 * ## Por que isso importa mais do que parece
 *
 * É o que separa uma âncora de um botão que rola. A SPEC-92 §3.1 pediu âncoras
 * *"linkáveis"*, e um menu que só funciona para quem já está na página é meia
 * navegação: o endereço mandado para alguém abriria no topo, e a pessoa que
 * recebeu "olha a parte do ciclo" cairia na capa sem saber por quê.
 *
 * ## Rolar uma vez não basta: a página ainda está crescendo
 *
 * A segunda tentativa esperou dois quadros e rolou. O ato caiu de `y=3302` para
 * `y=1458` — melhor, e ainda errado. **A altura da página muda depois da
 * primeira pintura**: os SVGs das sete peças assentam, as fontes trocam, e o
 * destino escorrega para baixo do lugar onde estava quando a rolagem aconteceu.
 *
 * Então a rolagem se **reaplica** enquanto o corpo mudar de tamanho, com um
 * limite de tempo. Não é laço de tentativa: é seguir um alvo que ainda se move,
 * e parar quando ele para.
 *
 * ## E ela solta na hora em que a pessoa toca na página
 *
 * Insistir depois disso seria sequestrar a rolagem — o que a SPEC-92 §1 recusa
 * por nome. Qualquer gesto de rolar cancela o resto, mesmo dentro da janela.
 *
 * ## `auto`, e não a rolagem suave da página
 *
 * No carregamento, o salto seco é o comportamento certo — e é o que o browser
 * sempre fez com âncoras. Ver a página desfilar sozinha por três telas até
 * chegar ao destino não é informação, é espera. Vale para todo mundo, então não
 * depende de `prefers-reduced-motion`.
 */

/** Quanto tempo o layout tem para se assentar. Acima disto, quem estiver
 *  mudando de tamanho não é a página carregando — é a pessoa usando. */
const JANELA_DE_ASSENTAMENTO_MS = 1500;

export function useAncoraInicial(): void {
  useEffect(() => {
    const id = window.location.hash.replace(/^#/, "");
    if (!id || !ATOS.some((a) => a.id === id)) return;
    // O jsdom não implementa `ResizeObserver`, e as travas de unidade montam a
    // página inteira. Sem esta guarda, a suíte quebraria por uma API de browser.
    if (typeof ResizeObserver === "undefined") return;

    let ativo = true;
    const reaplicar = () => {
      if (ativo) document.getElementById(id)?.scrollIntoView({ behavior: "auto", block: "start" });
    };

    const soltar = () => {
      ativo = false;
      observador.disconnect();
      clearTimeout(fim);
      for (const evento of GESTOS) window.removeEventListener(evento, soltar);
    };

    const observador = new ResizeObserver(reaplicar);
    const fim = setTimeout(soltar, JANELA_DE_ASSENTAMENTO_MS);

    reaplicar();
    observador.observe(document.body);
    for (const evento of GESTOS) window.addEventListener(evento, soltar, { passive: true });

    return soltar;
  }, []);
}

/** Os gestos que significam "eu assumo daqui". */
const GESTOS = ["wheel", "touchstart", "keydown"] as const;
