import { test, expect, type Page } from "@playwright/test";

/**
 * SPEC-95 fatias A e B (§342) — **o site em páginas, contra a stack.**
 *
 * As travas de unidade provam que todo item do menu resolve e que nenhuma rota
 * pública colide com o app. O que elas **não** sabem é se clicar leva a pessoa a
 * um lugar onde ela consegue ler — e é aí que esta página já falhou quatro vezes
 * (§333, §334, §338, §341): rótulo sobreposto, caixa transbordando, texto
 * vazando, chapéu escondido atrás da barra. Todas com a suíte verde, porque
 * `textContent` não sabe de pixel.
 */

const PAGINAS = ["o-problema", "o-conceito", "o-ciclo", "o-percurso", "arquitetura"];

/** O mesmo valor de `--altura-do-cabecalho` no `styles.css`, lido do CSS em vez
 *  de copiado: dois números que precisam concordar e moram em arquivos
 *  diferentes divergem na primeira vez que um deles muda. */
async function alturaDoCabecalho(page: Page): Promise<number> {
  return page.evaluate(() =>
    parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--altura-do-cabecalho")),
  );
}

test("a capa mostra o que é o produto e aponta para todas as páginas", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

  for (const id of PAGINAS) {
    /* §350 — a capa deixou de listar seções e passou a listar PERGUNTAS: o
       destino é o mesmo, o que muda é o que a pessoa lê antes de clicar. */
    await expect(page.getByTestId(`pergunta-${id}`).first(), `nenhuma pergunta leva a "${id}"`).toBeVisible();
  }
});

test("a capa NÃO carrega as peças pesadas — é o que a torna capa", async ({ page }) => {
  /**
   * A fatia C, afirmada em pixel. Até o §341 a capa trazia as sete peças de uma
   * vez: 4800 px, 5,3 telas. Era o motivo do *"está ficando longa"*.
   *
   * Se alguém trouxer o ciclo de volta para cá "porque explica bem", este teste
   * fica vermelho — e ele explica mesmo; o problema é onde.
   */
  await page.goto("/");
  await expect(page.getByTestId("capa")).toBeVisible();

  await expect(page.getByTestId("ciclo-do-produto")).toHaveCount(0);
  await expect(page.getByTestId("fluxo-do-processo")).toHaveCount(0);

  const altura = await page.evaluate(() => document.body.scrollHeight);
  expect(altura, `a capa tem ${altura}px — ela deixou de ser capa`).toBeLessThan(2000);
});

test("cada página do menu abre, com a peça que lhe pertence", async ({ page }) => {
  const ESPERADO: Record<string, string> = {
    "o-problema": "evolucao-do-trabalho",
    "o-conceito": "as-camadas",
    "o-ciclo": "ciclo-do-produto",
    "o-percurso": "fluxo-do-processo",
    arquitetura: "arquitetura-provas",
  };

  await page.goto("/");
  for (const id of PAGINAS) {
    await page.getByTestId(`menu-${id}`).click();
    await expect(page.getByTestId(`pagina-${id}`), `"${id}" não abriu`).toBeVisible();
    await expect(page.getByTestId(ESPERADO[id]), `"${id}" abriu sem a peça dela`).toBeVisible();
  }
});

test("o chapéu da página chega ABAIXO do cabeçalho fixo", async ({ page }) => {
  /**
   * O defeito clássico deste padrão, e o que o §341 pegou: com cabeçalho fixo, a
   * pessoa chega numa seção decapitada. `toBeVisible()` continua verdadeiro e o
   * defeito passa — por isso a asserção é sobre **coordenada**.
   *
   * Aqui ele é ainda mais provável que na versão com âncoras: trocar de página
   * rola para o topo, e "topo" é `0`, que fica atrás da barra.
   */
  /* O `goto` vem ANTES de ler a variável: em `about:blank` não há folha de
     estilo, e `getComputedStyle` devolve string vazia — o teste falhava com
     `NaN` acusando uma variável que está declarada. */
  await page.goto("/");
  const cabecalho = await alturaDoCabecalho(page);
  expect(cabecalho, "`--altura-do-cabecalho` não está declarada").toBeGreaterThan(0);

  for (const id of PAGINAS) {
    await page.goto(`/#/site/${id}`);
    await expect(page.getByTestId(`pagina-${id}`)).toBeVisible();

    const caixa = await page.locator(`main[data-testid="pagina-${id}"] header`).boundingBox();
    expect(caixa, `o chapéu de "${id}" não renderizou`).not.toBeNull();
    expect(caixa!.y, `o chapéu de "${id}" ficou atrás do cabeçalho (y=${caixa!.y}, barra=${cabecalho})`).toBeGreaterThanOrEqual(cabecalho - 2);
  }
});

test("o endereço de cada página é linkável — abrir direto funciona", async ({ page }) => {
  /**
   * É a diferença entre uma página e uma âncora, e é o motivo desta rodada:
   * `…/#/site/arquitetura` mandado para alguém abre **naquele assunto**, sem
   * carregar o resto do site junto.
   */
  await page.goto("/#/site/arquitetura");

  await expect(page.getByTestId("pagina-arquitetura")).toBeVisible();
  await expect(page.getByTestId("arquitetura-provas")).toBeVisible();
  await expect(page.getByTestId("menu-arquitetura")).toHaveAttribute("aria-current", "page");
});

test("um endereço público desconhecido cai na capa, não em tela branca", async ({ page }) => {
  // Link velho de página pública não pode virar nada — a mesma régua que o
  // `rotaDoHash` já aplica ao hash desconhecido (SPEC-61 §6.7).
  await page.goto("/#/site/pagina-que-nunca-existiu");

  await expect(page.getByTestId("capa")).toBeVisible();
});

test("a página em que a pessoa está fica marcada, e só uma", async ({ page }) => {
  await page.goto("/#/site/o-ciclo");
  await expect(page.getByTestId("pagina-o-ciclo")).toBeVisible();

  await expect(page.getByTestId("menu-o-ciclo")).toHaveAttribute("aria-current", "page");
  // Duas marcas simultâneas dizem à pessoa que ela está em dois lugares, o que é
  // pior que não marcar nada.
  await expect(page.locator('[aria-current="page"]')).toHaveCount(1);
});

test("o rodapé leva à página seguinte, e a última convida a entrar", async ({ page }) => {
  /**
   * Sem isto, o fim de cada página é um beco: a pessoa terminou de ler e a única
   * saída visível é o menu lá em cima, que exige rolar de volta tudo o que ela
   * acabou de rolar.
   */
  await page.goto("/#/site/o-problema");
  await expect(page.getByTestId("proxima-pagina")).toBeVisible();
  await page.getByTestId("proxima-pagina").click();
  await expect(page.getByTestId("pagina-o-conceito")).toBeVisible();

  // A última não tem "a seguir" — e oferecer uma sexta página que não existe
  // seria a promessa vazia que este site recusa.
  await page.goto("/#/site/arquitetura");
  await expect(page.getByTestId("pagina-arquitetura")).toBeVisible();
  await expect(page.getByTestId("proxima-pagina")).toHaveCount(0);
});

test("trocar de página volta ao topo", async ({ page }) => {
  /**
   * Ir de uma página longa para uma curta sem isto deixa a pessoa no meio da
   * nova — ou abaixo do fim dela, olhando o rodapé sem saber que mudou de
   * assunto. É o comportamento que um site tem e um documento com âncoras não
   * precisa ter.
   */
  await page.goto("/#/site/o-percurso");
  await expect(page.getByTestId("fluxo-do-processo")).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 900));
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(400);

  await page.getByTestId("menu-o-problema").click();
  await expect(page.getByTestId("pagina-o-problema")).toBeVisible();

  await expect.poll(() => page.evaluate(() => window.scrollY), { timeout: 5000 }).toBeLessThan(50);
});

test("a marca do cabeçalho volta para a capa", async ({ page }) => {
  await page.goto("/#/site/arquitetura");
  await expect(page.getByTestId("pagina-arquitetura")).toBeVisible();

  await page.getByTestId("marca-do-site").click();

  await expect(page.getByTestId("capa")).toBeVisible();
});

test("`--altura-do-cabecalho` cobre a barra em toda largura, inclusive telefone", async ({ page }) => {
  /**
   * A variável é o que separa a âncora do defeito, e é um número escrito à mão.
   * No §341 a primeira escrita usou 94 px — a altura em 1440 — e em 360 px a
   * barra mede 99: os controles apertam e ela engorda.
   *
   * Sobrar é inofensivo; faltar corta o chapéu. Por isso a régua é
   * `real ≤ declarada`, nas três larguras.
   */
  for (const largura of [360, 768, 1440]) {
    await page.setViewportSize({ width: largura, height: 800 });
    await page.goto("/#/site/o-ciclo");
    await expect(page.getByTestId("ciclo-do-produto")).toBeVisible();

    const { real, declarada } = await page.evaluate(() => ({
      real: document.querySelector(".landing-cabecalho")!.getBoundingClientRect().height,
      declarada: parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--altura-do-cabecalho")),
    }));

    expect(real, `em ${largura}px a barra tem ${real}px e a variável diz ${declarada}px`).toBeLessThanOrEqual(declarada);
  }
});
