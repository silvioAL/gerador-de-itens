import { useEffect, useState } from "react";
import { paginaDoSite, type PaginaDoSite } from "./paginas";

/**
 * SPEC-95 fatia A — a rota pública, e ela é decidida **antes de qualquer
 * sessão**.
 *
 * ## Por que antes, e não depois
 *
 * A página pública não pode esperar rede. Quem abre `#/site/arquitetura` vindo
 * de um link recebe a página, não a tela *"Verificando sessão…"* — e o botão do
 * canto se resolve sozinho depois (`Entrar` ou `Ir para o app`), porque saber se
 * há sessão é detalhe de um botão, não pré-requisito do conteúdo.
 *
 * ## Por que um hook próprio, e não `useRotaHash`
 *
 * O `useRotaHash` devolve `Rota`, que é o espaço de telas do app, e manda tudo
 * que não conhece para o `canvas`. Reusá-lo obrigaria `Rota` a significar duas
 * coisas — o defeito do §263 na sua forma mais barata de evitar.
 *
 * Os dois escutam o mesmo `hashchange` e não se atrapalham: um responde por
 * `#/site/…`, o outro pelo resto, e a trava de `paginas.test.tsx` garante que
 * não há segmento nos dois.
 */
export function useRotaDoSite(): PaginaDoSite | null {
  const [pagina, setPagina] = useState<PaginaDoSite | null>(() => paginaDoSite(window.location.hash));

  useEffect(() => {
    const aoMudar = () => setPagina(paginaDoSite(window.location.hash));
    window.addEventListener("hashchange", aoMudar);
    return () => window.removeEventListener("hashchange", aoMudar);
  }, []);

  /**
   * Ao trocar de página, volta ao topo.
   *
   * Sem isto, ir de uma página longa para uma curta deixa a pessoa no meio da
   * nova — ou, pior, abaixo do fim dela, olhando o rodapé sem saber que mudou de
   * assunto. É o comportamento que um site tem e um documento com âncoras não
   * precisa ter: mais uma diferença entre os dois que só aparece usando.
   */
  useEffect(() => {
    if (pagina) window.scrollTo({ top: 0, behavior: "auto" });
  }, [pagina]);

  return pagina;
}
