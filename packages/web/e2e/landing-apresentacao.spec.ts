import { test, expect, type Page } from "@playwright/test";

/**
 * SPEC-92 fatias B e E (§341) — **a navegação existe, e ela chega inteira.**
 *
 * As travas de unidade (`landing.travas.test.tsx`) provam que toda âncora do
 * menu tem uma seção do outro lado. O que elas **não** sabem é se clicar leva a
 * pessoa a um lugar onde ela consegue ler — e é justamente aí que esta página
 * já falhou três vezes seguidas (§333, §334, §338): rótulo sobreposto, caixa
 * transbordando, texto vazando. Todos com a suíte verde, porque `textContent`
 * não sabe de pixel.
 *
 * O defeito específico deste padrão é o **cabeçalho fixo decapitando a seção**:
 * a âncora rola o topo do ato para debaixo da barra, e quem clicou em "O ciclo"
 * chega numa tela que começa no meio. `getById(...)` continua encontrando o
 * elemento, `toBeVisible()` continua verdadeiro, e o defeito passa.
 *
 * Por isso a asserção é sobre **coordenada**, e não sobre presença.
 */

/** O mesmo valor de `--altura-do-cabecalho` no `styles.css`. Lido do CSS em vez
 *  de copiado: dois números que precisam concordar e moram em arquivos
 *  diferentes divergem na primeira vez que um deles muda. */
async function alturaDoCabecalho(page: Page): Promise<number> {
  return page.evaluate(() =>
    parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--altura-do-cabecalho")),
  );
}

const ATOS = ["o-problema", "a-tese", "o-ciclo", "o-percurso", "comecar"];

/**
 * Onde o topo da seção está agora.
 *
 * ## Duas tentativas erradas antes desta, e as duas mediam o caminho
 *
 * A primeira esperava a posição virar um número inteiro e dormia 250 ms: mediu
 * o ciclo em `y=426`, no meio de uma rolagem de três telas.
 *
 * A segunda esperava o `scrollY` **parar de mudar** por 120 ms — o que parece
 * certo e tem uma corrida: entre o clique e o início da rolagem suave existe um
 * intervalo, e sob seis workers em paralelo ele passa de 120 ms. O teste então
 * media a página **antes de ela começar a andar** e via "a-tese" em `y=300`.
 * Contra a stack, sondando de 200 em 200 ms, os cinco atos param em `y=100`: o
 * defeito era do teste, não da página.
 *
 * A régua sem corrida é `expect.poll`: reavalia até a condição valer. Não
 * pergunta "já parou?", pergunta "já chegou?" — que é o que o teste quer saber.
 */
async function topoDaSecao(page: Page, id: string): Promise<number> {
  const caixa = await page.locator(`section#${id}`).boundingBox();
  return caixa ? caixa.y : Number.NaN;
}

test("`--altura-do-cabecalho` cobre a barra em toda largura, inclusive telefone", async ({ page }) => {
  /**
   * A variável é o que separa a âncora do defeito, e ela é um número escrito à
   * mão. A primeira escrita usou 94 px — a altura em 1440 px — e em 360 px a
   * barra mede **99**: os controles apertam e ela engorda. Cinco pixels de
   * chapéu cortado, na tela em que ninguém abre o inspetor.
   *
   * Sobrar é inofensivo, faltar corta. Por isso a régua é `real ≤ declarada`, e
   * ela roda nas três larguras — senão o pior caso volta a ser adivinhado.
   */
  for (const largura of [360, 768, 1440]) {
    await page.setViewportSize({ width: largura, height: 800 });
    await page.goto("/");
    await expect(page.getByTestId("ciclo-do-produto")).toBeVisible();

    const { real, declarada } = await page.evaluate(() => ({
      real: document.querySelector(".landing-cabecalho")!.getBoundingClientRect().height,
      declarada: parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--altura-do-cabecalho")),
    }));

    expect(real, `em ${largura}px a barra tem ${real}px e a variável diz ${declarada}px`).toBeLessThanOrEqual(declarada);
  }
});

test("no telefone a barra das partes fica rolável, sem vazar a página", async ({ page }) => {
  /**
   * Em 360 px os cinco nomes não cabem lado a lado, e a saída não pode ser
   * quebrá-los em linhas — o cabeçalho comeria a tela de quem tem menos tela.
   * A barra rola **dentro de si**, e é isso que precisa ser verdade: rolável, e
   * sem produzir rolagem horizontal no documento (a régua do §336).
   */
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto("/");
  await expect(page.getByTestId("fluxo-do-processo")).toBeVisible();

  const m = await page.evaluate(() => {
    const nav = document.querySelector(".landing-atos")!;
    return {
      vazamento: document.documentElement.scrollWidth - window.innerWidth,
      visivel: nav.clientWidth,
      conteudo: nav.scrollWidth,
    };
  });

  expect(m.vazamento, "a barra empurrou a página para fora da tela").toBeLessThanOrEqual(1);
  // E ela precisa mostrar mais que um item: uma barra de 164px exibe um nome e
  // meio, e uma navegação que não deixa ver as opções não é navegação.
  expect(m.visivel, `a barra só tem ${m.visivel}px de largura visível`).toBeGreaterThan(200);
});

test("as cinco partes existem como âncora e como seção", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("ciclo-do-produto")).toBeVisible();

  for (const id of ATOS) {
    await expect(page.getByTestId(`ato-link-${id}`), `o menu não tem "${id}"`).toBeVisible();
    await expect(page.locator(`section#${id}`), `não há seção para "${id}"`).toHaveCount(1);
  }
});

test("clicar em cada parte leva a seção para a viewport, ABAIXO do cabeçalho fixo", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("ciclo-do-produto")).toBeVisible();

  const cabecalho = await alturaDoCabecalho(page);
  expect(cabecalho, "`--altura-do-cabecalho` não está declarada").toBeGreaterThan(0);

  for (const id of ATOS) {
    await page.getByTestId(`ato-link-${id}`).click();

    /**
     * O topo da seção precisa parar **visível e abaixo da barra**.
     *
     * O último ato é a exceção legítima: ele é curto e fica no fim do documento,
     * então o browser não tem quanto rolar — a página acaba antes. Exigir a
     * mesma coordenada dele seria exigir que o documento tivesse mais altura do
     * que tem, e o teste ficaria vermelho por um defeito que não existe.
     */
    const ultimo = id === ATOS[ATOS.length - 1];
    const tetoDeChegada = ultimo ? 900 : cabecalho + 60;

    await expect
      .poll(() => topoDaSecao(page, id), {
        timeout: 8000,
        message: `"${id}" não chegou ao topo da viewport (teto ${tetoDeChegada})`,
      })
      .toBeLessThan(tetoDeChegada);

    if (!ultimo) {
      // A tolerância de 2px é de arredondamento de rolagem; é esta asserção que
      // pega o cabeçalho fixo decapitando a seção.
      const y = await topoDaSecao(page, id);
      expect(y, `"${id}" chegou ESCONDIDA atrás do cabeçalho (y=${y}, barra=${cabecalho})`).toBeGreaterThanOrEqual(cabecalho - 2);
    }
  }
});

test("a parte em que a pessoa está fica marcada no menu", async ({ page }) => {
  /**
   * `aria-current="location"` e não só a cor — quem não distingue as cores tem
   * que conseguir ouvir qual é a atual. É a mesma disciplina que a SPEC-76 já
   * aplica a status no ciclo e nas conexões.
   */
  await page.goto("/");
  await expect(page.getByTestId("ciclo-do-produto")).toBeVisible();

  await page.getByTestId("ato-link-o-ciclo").click();
  await expect.poll(() => topoDaSecao(page, "o-ciclo"), { timeout: 8000 }).toBeLessThan(200);

  await expect(page.getByTestId("ato-link-o-ciclo")).toHaveAttribute("aria-current", "location");
  // E só uma de cada vez: duas marcas simultâneas dizem à pessoa que ela está
  // em dois lugares, que é pior do que não marcar nada.
  await expect(page.locator('[aria-current="location"]')).toHaveCount(1);
});

test("o endereço da parte é linkável — abrir direto nela funciona", async ({ page }) => {
  /**
   * É o que separa uma âncora de um botão que rola: `…/#o-percurso` mandado
   * para alguém abre no lugar certo. Sem isto, "partes para navegar" seria
   * navegação só para quem já está na página.
   */
  await page.goto("/#o-percurso");
  await expect(page.getByTestId("fluxo-do-processo")).toBeVisible();
  const cabecalho = await alturaDoCabecalho(page);

  /**
   * Esta asserção pegou um defeito de verdade: antes da correção o ato ficava em
   * `y=3302` — a página não rolava nada, porque o browser processa o hash antes
   * de o React pintar. Ver `useAncoraInicial`.
   *
   * O `poll` cobre a janela de assentamento daquele hook (1500 ms), em que a
   * rolagem se reaplica enquanto os SVGs mudam a altura da página.
   */
  await expect
    .poll(() => topoDaSecao(page, "o-percurso"), { timeout: 8000, message: "abrir pelo link não parou no ato" })
    .toBeLessThan(cabecalho + 60);

  const y = await topoDaSecao(page, "o-percurso");
  expect(y, `abrir pelo link parou em y=${y}, e o topo útil é ${cabecalho}`).toBeGreaterThanOrEqual(cabecalho - 2);
});

test("o caminho curto começa, mostra em que parada está, e para quando pedem", async ({ page }) => {
  /**
   * A régua do tour (§253): **interrompível a qualquer momento.** O percurso
   * inteiro leva 60s e este teste não os gasta — o que precisa ser provado é
   * que ele sai do lugar e que o botão de parar realmente para, não que os
   * cinco temporizadores disparam.
   */
  await page.goto("/");
  await expect(page.getByTestId("ciclo-do-produto")).toBeVisible();

  await page.getByTestId("caminho-curto").click();
  await expect(page.getByTestId("caminho-curto")).toHaveText(/Parar — 1 de 5/);
  await page.waitForTimeout(800);

  // Saiu do topo: o percurso levou a pessoa ao primeiro ato.
  expect(await page.evaluate(() => window.scrollY), "o caminho curto não rolou nada").toBeGreaterThan(100);

  await page.getByTestId("caminho-curto-cabecalho").click();
  await expect(page.getByTestId("caminho-curto")).toHaveText(/Ver em 60 segundos/);

  // E parado é parado: a posição não pode continuar mudando sozinha.
  const onde = await page.evaluate(() => window.scrollY);
  await page.waitForTimeout(1500);
  expect(await page.evaluate(() => window.scrollY), "continuou andando depois do Parar").toBe(onde);
});

test("Escape também interrompe o caminho curto", async ({ page }) => {
  // A régua do tour de novo: quem não achar o botão tem a tecla que o resto do
  // produto já usa para sair de qualquer coisa.
  await page.goto("/");
  await expect(page.getByTestId("ciclo-do-produto")).toBeVisible();

  await page.getByTestId("caminho-curto").click();
  await expect(page.getByTestId("caminho-curto")).toHaveText(/Parar/);

  await page.keyboard.press("Escape");

  await expect(page.getByTestId("caminho-curto")).toHaveText(/Ver em 60 segundos/);
});
