import { useEffect, useState } from "react";
import { ATOS, ancoraDoAto } from "./atos";

/**
 * SPEC-92 fatia B — **a navegação que a página não tinha.**
 *
 * A medição do §341 contra a stack: `a[href^="#"]` = **0**. Não havia como
 * navegar; só existia rolar do começo ao fim de 4693 px, e foi exatamente por
 * isso que o usuário pediu *"partes para navegar"*.
 *
 * ## Por que `<a href>` de verdade, e não `onClick` com `scrollIntoView`
 *
 * Um botão que rola é uma âncora pior em quatro pontos, e todos são régua desta
 * página (SPEC-92 §3.1):
 *
 * - **não é linkável** — `…/#o-ciclo` mandado para alguém abre no lugar certo;
 * - **não sobrevive sem JavaScript**, e a rolagem é a única coisa aqui que não
 *   precisa dele;
 * - **não aparece no teclado** como link, nem no leitor de tela como destino;
 * - o browser já faz a rolagem, e faz respeitando `prefers-reduced-motion`
 *   sozinho — a guarda global do §328 cobre `scroll-behavior: smooth` sem uma
 *   linha de JavaScript.
 *
 * O `onClick` daqui **não navega**: ele só interrompe o caminho curto, porque
 * quem clica num item de menu está dizendo para onde quer ir, e insistir em
 * levá-lo a outro lugar é sequestrar a rolagem pela porta dos fundos.
 *
 * ## Marcar onde a pessoa está
 *
 * `IntersectionObserver` com uma faixa estreita no alto da tela: o ato marcado é
 * o que está passando sob o cabeçalho, não o que ocupa mais pixels. As seções
 * têm alturas muito diferentes — o ciclo tem 800 px e o convite tem 178 —, e
 * "maior área visível" faria a marca pular para trás ao entrar numa seção curta.
 */
export function NavegacaoDosAtos({ aoNavegar }: { aoNavegar?: () => void }) {
  const atual = useAtoVisivel();

  return (
    <nav className="landing-atos" aria-label="Partes desta página">
      {ATOS.map((ato, i) => {
        const marcado = atual === ato.id;
        return (
          <a
            key={ato.id}
            href={ancoraDoAto(ato)}
            data-testid={`ato-link-${ato.id}`}
            /* `aria-current="location"` é o valor certo para "você está aqui"
               dentro de um documento — `page` seria para outra página. E ele
               existe porque a marca não pode ser só a cor (SPEC-76): quem não a
               distingue precisa que o leitor de tela anuncie qual é o atual. */
            aria-current={marcado ? "location" : undefined}
            onClick={aoNavegar}
          >
            <span className="landing-ato-numero" aria-hidden="true">
              {String(i + 1).padStart(2, "0")}
            </span>
            {ato.nome}
          </a>
        );
      })}
    </nav>
  );
}

/**
 * Qual ato está sob o cabeçalho agora.
 *
 * A guarda do `undefined` não é defensiva à toa: o jsdom não implementa
 * `IntersectionObserver`, e as travas de `landing.travas.test.tsx` renderizam a
 * página inteira. Sem ela, a suíte de unidade quebraria por uma API de browser —
 * e o consertado seria mockar o observador em vez de a página funcionar sem ele.
 */
function useAtoVisivel(): string | null {
  const [atual, setAtual] = useState<string | null>(null);

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;

    const secoes = ATOS.map((a) => document.getElementById(a.id)).filter((e): e is HTMLElement => e !== null);
    if (secoes.length === 0) return;

    /**
     * A faixa: do alto da tela até 70% abaixo dele. O que cruza essa fatia é o
     * que a pessoa está lendo.
     *
     * `-88px` no topo desconta o cabeçalho fixo — sem isso o ato marcado é o que
     * está ESCONDIDO atrás da barra, que é o defeito mais comum deste padrão.
     */
    const observador = new IntersectionObserver(
      (entradas) => {
        const visiveis = entradas.filter((e) => e.isIntersecting);
        if (visiveis.length === 0) return;
        // A mais alta na página entre as que cruzam a faixa: ao rolar para
        // baixo, é a que acabou de entrar sob o cabeçalho.
        const topo = visiveis.reduce((a, b) => (a.boundingClientRect.top <= b.boundingClientRect.top ? a : b));
        setAtual(topo.target.id);
      },
      { rootMargin: "-88px 0px -30% 0px", threshold: 0 },
    );

    for (const secao of secoes) observador.observe(secao);
    return () => observador.disconnect();
  }, []);

  return atual;
}
