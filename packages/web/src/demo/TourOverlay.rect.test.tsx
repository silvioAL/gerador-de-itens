import { describe, expect, it, vi, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { ALTURA_ESTIMADA_DA_CARTA, posicionarCard, useRect } from "./TourOverlay";

/**
 * §251 — o alvo do passo é trazido para a tela ANTES de ser medido.
 *
 * Sem isto, um passo que aponta para algo abaixo da dobra (o painel do nó
 * rola) mede um retângulo fora da viewport: o anel de destaque fica invisível
 * e a carta é posicionada a partir de um lugar que ninguém vê. Foi assim que o
 * passo "Peça ao agente" travou o tour inteiro.
 *
 * A rolagem é uma vez por passo, e não a cada medição — de 300 em 300 ms ela
 * brigaria com quem está lendo.
 */
describe("useRect — o alvo entra na tela antes de ser medido", () => {
  afterEach(() => vi.restoreAllMocks());

  it("rola até o alvo quando o seletor aponta para um elemento", () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    const alvo = document.createElement("div");
    alvo.setAttribute("data-testid", "alvo-do-passo");
    document.body.appendChild(alvo);

    renderHook(() => useRect("[data-testid=alvo-do-passo]"));

    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "center", inline: "nearest" });
    alvo.remove();
  });

  it("seletor sem alvo não quebra — o passo só perde o destaque", () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;

    const { result } = renderHook(() => useRect("[data-testid=nao-existe]"));

    expect(scrollIntoView).not.toHaveBeenCalled();
    expect(result.current).toBeNull();
  });

  it("passo sem seletor (tela cheia) não tenta rolar nada", () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;

    renderHook(() => useRect(null));

    expect(scrollIntoView).not.toHaveBeenCalled();
  });
});

/**
 * §251 — a carta nunca sai da tela.
 *
 * Achado honesto: o que destravou o tour foi encurtar os textos, e o clamp
 * ficou sem cobertura. Estes testes são a cobertura — porque texto cresce
 * sozinho ao longo do tempo, e o dia em que crescer de novo é o dia em que o
 * "Próximo" some sem ninguém entender por quê.
 */
describe("posicionarCard — a navegação nunca fica fora do alcance", () => {
  function rect(p: Partial<DOMRect>): DOMRect {
    return { top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0, toJSON: () => ({}), ...p } as DOMRect;
  }

  it("alvo colado no rodapé não empurra a carta para fora", () => {
    const style = posicionarCard(rect({ top: window.innerHeight - 20, bottom: window.innerHeight - 5, left: 100, right: 200 }));

    // Não basta o topo estar na tela: o CORPO da carta (onde mora o "Próximo")
    // precisa caber. Era exatamente isso que falhava.
    expect(Number(style.top)).toBeGreaterThanOrEqual(0);
    expect(Number(style.top) + 240).toBeLessThanOrEqual(window.innerHeight);
  });

  it("alvo colado na borda direita não empurra a carta para fora", () => {
    const style = posicionarCard(rect({ top: 100, bottom: 130, left: window.innerWidth - 10, right: window.innerWidth }));

    expect(Number(style.left)).toBeGreaterThanOrEqual(0);
    expect(Number(style.left) + 300).toBeLessThanOrEqual(window.innerWidth);
  });

  it("alvo acima da dobra (rect negativo) também é contido", () => {
    const style = posicionarCard(rect({ top: -400, bottom: -320, left: -50, right: 40 }));

    expect(Number(style.top)).toBeGreaterThanOrEqual(0);
    expect(Number(style.left)).toBeGreaterThanOrEqual(0);
  });

  /**
   * §411 — **o caso que estava descoberto, e foi o que travou o tour de verdade.**
   *
   * Os três testes acima medem contra 240, que era o palpete escrito no código.
   * A carta, porém, pode ir até `min(70vh, 420px)` — e uma carta de 400 px
   * "contida" a 240 termina 160 px abaixo da dobra, com o "Próximo" visível
   * para o DOM e fora da viewport. Foi exatamente o erro do e2e: *element is
   * outside of the viewport*, trinta segundos de retry, e nenhum teste de
   * unidade acusando.
   *
   * Por isso a altura agora é MEDIDA e entra como argumento: o que este teste
   * guarda é que o clamp respeita a altura que recebeu, qualquer que seja ela.
   */
  it.each([240, 320, 420])("carta de %ipx cabe inteira na tela, com o Próximo alcançável", (altura) => {
    const colada = posicionarCard(
      rect({ top: window.innerHeight - 20, bottom: window.innerHeight - 5, left: 100, right: 200 }),
      altura
    );

    expect(Number(colada.top)).toBeGreaterThanOrEqual(0);
    expect(Number(colada.top) + altura).toBeLessThanOrEqual(window.innerHeight);
  });

  it("a altura padrão continua sendo a estimativa — quem não mede não muda de comportamento", () => {
    const comPadrao = posicionarCard(rect({ top: 300, bottom: 340, left: 100, right: 200 }));
    const comEstimativa = posicionarCard(rect({ top: 300, bottom: 340, left: 100, right: 200 }), ALTURA_ESTIMADA_DA_CARTA);

    expect(comPadrao).toEqual(comEstimativa);
  });
});
