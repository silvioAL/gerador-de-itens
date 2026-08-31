import { PAGINAS, CAPA, rotaDaPagina, type PaginaDoSite } from "./paginas";

/**
 * SPEC-95 fatia B — **o menu do site.**
 *
 * Herdado do `demo/NavegacaoDosAtos` (§341), com três diferenças que não são
 * cosméticas:
 *
 * 1. **`aria-current="page"`, e não `location`.** `location` é o valor certo para
 *    "você está aqui dentro deste documento"; quando o destino é outra página, o
 *    valor é `page`. Um leitor de tela anuncia coisas diferentes, e a diferença é
 *    exatamente a que esta rodada implementa.
 * 2. **A página atual vem da ROTA, não de `IntersectionObserver`.** Não há mais o
 *    que observar: a marca é um fato do endereço, não uma inferência sobre
 *    rolagem. Some com ela a única parte do §341 que dependia de API de browser.
 * 3. **A marca da casa é um link para a capa.** Num site é o que se espera; numa
 *    página só, seria um link para o topo — inútil.
 */
export function MenuDoSite({ atual }: { atual: PaginaDoSite }) {
  return (
    <nav className="landing-atos" aria-label="Páginas">
      {PAGINAS.map((pagina, i) => {
        const marcada = pagina.id === atual.id;
        return (
          <a
            key={pagina.id}
            href={rotaDaPagina(pagina)}
            data-testid={`menu-${pagina.id}`}
            aria-current={marcada ? "page" : undefined}
          >
            <span className="landing-ato-numero" aria-hidden="true">
              {String(i + 1).padStart(2, "0")}
            </span>
            {pagina.nome}
          </a>
        );
      })}
    </nav>
  );
}

/** A marca, que leva à capa. Fora do `<nav>` de propósito: ela não é uma das
 *  páginas do menu, e listá-la lá daria seis itens numa barra dimensionada para
 *  cinco (§341 mediu que cinco já rolam em 360 px). */
export function MarcaDoSite() {
  return (
    <a href={rotaDaPagina(CAPA)} data-testid="marca-do-site" className="landing-marca">
      Gerador de Itens
    </a>
  );
}
