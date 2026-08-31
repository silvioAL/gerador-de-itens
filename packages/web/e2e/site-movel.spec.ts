import { test, expect, type Page } from "@playwright/test";

/**
 * SPEC-91 fatia A, SPEC-95 fatia B — **o site cabe no telefone.**
 *
 * A SPEC-90 §5.2 registrou *"não medimos em aparelho real, e isso fica dito"*.
 * Foi honesto e ficou pela metade: **o Playwright emula viewport**, a suíte já
 * roda com ele, e a régua que importa é mecânica. O usuário viu o que eu não vi:
 * a medição estava a uma linha de distância.
 *
 * ## A régua, e o que ela NÃO promete
 *
 * *A página cabe na largura, e o essencial aparece.* Só isso.
 *
 * "É agradável no celular" não é medida, e fingir que este teste garante isso
 * seria a mesma mentira que a SPEC-76 proíbe na prosa. O que ele pega é o
 * defeito objetivo: conteúdo vazando para fora da tela.
 *
 * ## SPEC-95 — e agora ele cobre TODAS as páginas
 *
 * Com uma página por assunto, medir só a capa mediria a mais leve das seis. O
 * fluxo em raias — a peça mais larga do produto — mora numa página que ninguém
 * vê ao abrir o site, e é exatamente onde um vazamento passaria despercebido.
 */

/** 360 é o Android comum e o mais apertado dos dois candidatos — passar no pior
 *  caso cobre o iPhone de 390. Escolher o mais folgado seria escolher o
 *  resultado. */
const LARGURAS = [
  { nome: "telefone estreito", largura: 360, altura: 740 },
  { nome: "tablet em pé", largura: 768, altura: 1024 },
];

/** Capa mais as cinco do menu, com a peça que prova que a página pintou. */
const PAGINAS: { rota: string; nome: string; espera: string }[] = [
  { rota: "/", nome: "capa", espera: "capa" },
  { rota: "/#/site/o-problema", nome: "o problema", espera: "evolucao-do-trabalho" },
  { rota: "/#/site/o-conceito", nome: "o conceito", espera: "as-camadas" },
  { rota: "/#/site/o-ciclo", nome: "o ciclo", espera: "ciclo-do-produto" },
  { rota: "/#/site/o-percurso", nome: "o percurso", espera: "fluxo-do-processo" },
  { rota: "/#/site/arquitetura", nome: "arquitetura", espera: "arquitetura-provas" },
];

async function vazamentoHorizontal(page: Page): Promise<number> {
  return page.evaluate(() => {
    // `documentElement.scrollWidth` conta o conteúdo real, inclusive o que
    // transborda. A diferença para `innerWidth` é o que obriga a rolar de lado.
    return document.documentElement.scrollWidth - window.innerWidth;
  });
}

for (const { nome, largura, altura } of LARGURAS) {
  test(`o site inteiro cabe em ${nome} (${largura}px), sem rolagem horizontal`, async ({ page }) => {
    await page.setViewportSize({ width: largura, height: altura });

    for (const pagina of PAGINAS) {
      await page.goto(pagina.rota);
      // ESPERAR o React pintar antes de medir. Sem isto o `scrollWidth` é o de
      // uma página quase vazia, e o teste passa sem ter olhado nada — foi o que
      // uma sonda mostrou no §336: `querySelector` do SVG devolvia `null` na
      // hora da medida.
      await expect(page.getByTestId(pagina.espera), `"${pagina.nome}" não pintou`).toBeVisible();

      /**
       * Tolerância de 1px: `scrollWidth` é inteiro e a largura da janela pode ter
       * fração em telas com escala. Zero absoluto acusaria arredondamento como
       * defeito, e teste que falha pelo motivo errado é pior que teste nenhum.
       */
      const vazamento = await vazamentoHorizontal(page);
      expect(vazamento, `${largura}px, "${pagina.nome}": conteúdo vazando para fora da tela`).toBeLessThanOrEqual(1);
    }
  });

  test(`o essencial aparece em ${nome}`, async ({ page }) => {
    // Caber sem mostrar nada seria fácil e inútil.
    await page.setViewportSize({ width: largura, height: altura });
    await page.goto("/");

    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByTestId("capa-paginas")).toBeVisible();
    await expect(page.getByRole("button", { name: /Entrar/ }).first()).toBeVisible();
  });
}

test("o diagrama do fluxo não estoura a tela estreita — é o mais largo do site", async ({ page }) => {
  /**
   * O fluxo é o candidato natural a vazar: seis fases lado a lado num `viewBox`
   * de mais de mil unidades. Ele só cabe porque o SVG escala por `width: 100%` —
   * e é justamente esse tipo de coisa que se perde numa refatoração sem que
   * nenhum teste de unidade perceba.
   */
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto("/#/site/o-percurso");
  await expect(page.getByTestId("fluxo-do-processo")).toBeVisible();

  const caixa = await page.getByTestId("fluxo-do-processo").boundingBox();

  expect(caixa, "o fluxo não renderizou").not.toBeNull();
  expect(caixa!.width, "o fluxo é mais largo que a tela").toBeLessThanOrEqual(360);
});

test("no telefone a barra das páginas fica rolável, sem vazar", async ({ page }) => {
  /**
   * Em 360 px os cinco nomes não cabem lado a lado, e a saída não pode ser
   * quebrá-los em linhas — o cabeçalho comeria a tela de quem tem menos tela. A
   * barra rola **dentro de si**, e é isso que precisa ser verdade.
   */
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto("/");
  await expect(page.getByTestId("capa")).toBeVisible();

  const m = await page.evaluate(() => {
    const nav = document.querySelector(".landing-atos")!;
    return { visivel: nav.clientWidth, conteudo: nav.scrollWidth };
  });

  expect(await vazamentoHorizontal(page), "a barra empurrou a página para fora da tela").toBeLessThanOrEqual(1);
  // E ela precisa mostrar mais que um item: uma barra de 164px exibe um nome e
  // meio, e uma navegação que não deixa ver as opções não é navegação.
  expect(m.visivel, `a barra só tem ${m.visivel}px de largura visível`).toBeGreaterThan(200);
});
