import { test, expect, type Page } from "@playwright/test";

/**
 * SPEC-91 fatia A — **a medição de móvel que eu tinha declarado como impossível
 * de fazer aqui.**
 *
 * A SPEC-90 §5.2 registrou: *"não medimos em aparelho real, e isso fica dito."*
 * Foi honesto e ficou pela metade — **o Playwright emula viewport**, a suíte já
 * roda com ele, e a régua que importa é mecânica.
 *
 * O usuário viu o que eu não vi: a medição estava a uma linha de distância.
 *
 * ## A régua, e o que ela NÃO promete
 *
 * *A página cabe na largura, e o essencial aparece.* Só isso.
 *
 * "É agradável no celular" não é medida, e fingir que este teste garante isso
 * seria a mesma mentira que a SPEC-76 proíbe na prosa. O que ele pega é o
 * defeito objetivo: conteúdo vazando para fora da tela, que obriga a rolagem
 * horizontal e é o modo mais comum de uma landing quebrar em telefone.
 */

/** 360 é o Android comum e o mais apertado dos dois candidatos — passar no pior
 * caso cobre o iPhone de 390. Escolher o mais folgado seria escolher o
 * resultado. */
const LARGURAS = [
  { nome: "telefone estreito", largura: 360, altura: 740 },
  { nome: "tablet em pé", largura: 768, altura: 1024 },
];

async function vazamentoHorizontal(page: Page): Promise<number> {
  return page.evaluate(() => {
    // `documentElement.scrollWidth` conta o conteúdo real, inclusive o que
    // transborda. A diferença para `innerWidth` é o que obriga a rolar de lado.
    return document.documentElement.scrollWidth - window.innerWidth;
  });
}

for (const { nome, largura, altura } of LARGURAS) {
  test(`a landing cabe em ${nome} (${largura}px), sem rolagem horizontal`, async ({ page }) => {
    await page.setViewportSize({ width: largura, height: altura });
    await page.goto("/");
    // ESPERAR o React pintar antes de medir. Sem isto o `scrollWidth` é o de uma
    // página quase vazia, e o teste passa sem ter olhado nada — foi o que uma
    // sonda mostrou: `querySelector` do SVG devolvia `null` na hora da medida.
    await expect(page.getByTestId("fluxo-do-processo")).toBeVisible();

    /**
     * Tolerância de 1px: `scrollWidth` é inteiro e a largura da janela pode ter
     * fração em telas com escala. Zero absoluto acusaria arredondamento como
     * defeito, e teste que falha pelo motivo errado é pior que teste nenhum.
     */
    expect(await vazamentoHorizontal(page), `${largura}px: conteúdo vazando para fora da tela`).toBeLessThanOrEqual(1);
  });

  test(`o essencial da landing aparece em ${nome}`, async ({ page }) => {
    // Caber sem mostrar nada seria fácil e inútil. Estas são as peças sem as
    // quais a página não explica o que a ferramenta é.
    await page.setViewportSize({ width: largura, height: altura });
    await page.goto("/");

    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByTestId("ciclo-do-produto")).toBeVisible();
    await expect(page.getByTestId("fluxo-do-processo")).toBeVisible();
    await expect(page.getByRole("button", { name: /Entrar/ }).first()).toBeVisible();
  });
}

test("o diagrama do fluxo não estoura a tela estreita — é o mais largo da página", async ({ page }) => {
  /**
   * O fluxo é o candidato natural a vazar: seis fases lado a lado num `viewBox`
   * de mais de mil unidades. Ele só cabe porque o SVG escala por `width: 100%` —
   * e é justamente esse tipo de coisa que se perde numa refatoração sem que
   * nenhum teste de unidade perceba.
   */
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto("/");
  await expect(page.getByTestId("fluxo-do-processo")).toBeVisible();

  const caixa = await page.getByTestId("fluxo-do-processo").boundingBox();

  expect(caixa, "o fluxo não renderizou").not.toBeNull();
  expect(caixa!.width, "o fluxo é mais largo que a tela").toBeLessThanOrEqual(360);
});
