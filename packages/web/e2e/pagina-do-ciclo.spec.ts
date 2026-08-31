import { test, expect } from "@playwright/test";
import { ESTAGIOS_DO_CICLO } from "../src/demo/ciclo";

/**
 * SPEC-76 fatias B e C — a página que explica o ciclo, no navegador.
 *
 * A régua da SPEC é uma frase: **a página não pode prometer o que o produto não
 * faz.** O teste de unidade prova que o DADO está honesto e que cada estágio
 * existente tem rota; este prova o que só o navegador prova — que a página
 * pública mostra o ciclo antes do login, e que o desdobramento abre.
 */
test("o site mostra o ciclo, marca o que ainda não existe, e desdobra ao clique", async ({ page }) => {
  test.setTimeout(90000);
  // Sem `entrar`: o ponto é justamente a página ANTES do login. Quem chega aqui
  // não sabe o que a ferramenta é.
  //
  // SPEC-95 (§342) — o ciclo deixou de morar na capa e ganhou página própria. O
  // que este teste prova não mudou: que ele é público, que a contagem sai do
  // dado e que o desdobramento abre. Mudou o endereço.
  await page.goto("/#/site/o-ciclo");

  const ciclo = page.getByTestId("ciclo-do-produto");
  await expect(ciclo).toBeVisible();

  // A tese, no centro: é a coisa mais difícil de comunicar, porque é uma
  // AUSÊNCIA de comportamento — e é o que separa isto de um gerador.
  await expect(ciclo).toContainText("propõe, nunca");

  // A contagem sai do dado. Uma prosa dizendo "nove de doze" continuaria
  // dizendo isso depois de o décimo ficar pronto — foi o que aconteceu com a
  // tabela da própria SPEC entre ela ser escrita e a SPEC-77 ser entregue.
  const existem = ESTAGIOS_DO_CICLO.filter((e) => e.estado !== "ausente").length;
  await expect(page.getByTestId("ciclo-contagem")).toContainText(
    `${existem} dos ${ESTAGIOS_DO_CICLO.length} estágios existem hoje`
  );

  /**
   * O estado está MARCADO com PALAVRA, e não só com cor — vale para daltonismo,
   * impressão e alto contraste.
   *
   * **SPEC-84: este trecho fazia `find(e => e.estado === "ausente")!`**, e a
   * SPEC-84 fechou o último buraco do ciclo: o `!` virou `undefined.id` e o
   * teste quebrou por acerto, não por defeito. Era a segunda vez — a SPEC-79
   * tinha feito o mesmo com o último `parcial`.
   *
   * A versão nova percorre o que existe em vez de caçar um estado específico.
   * Ela continua valendo no dia em que um estágio novo nascer incompleto, que é
   * justamente quando ela vai importar. A prova da MÁQUINA de marcar ausência,
   * com um estágio fabricado, é do unitário — aqui o navegador prova o que só
   * ele prova: que a página pública mostra isso antes do login.
   */
  for (const estagio of ESTAGIOS_DO_CICLO) {
    const item = page.getByTestId(`estagio-item-${estagio.id}`);
    if (estagio.estado === "completo") {
      // O completo NÃO ganha palavra: marcar o que está certo é a definição de
      // ruído, e ruído se aprende a ignorar junto com o que importava.
      await expect(item).not.toContainText("ainda não existe");
      await expect(item).not.toContainText("parcial");
    } else {
      await expect(item).toContainText(estagio.estado === "parcial" ? "parcial" : "ainda não existe");
    }
  }

  // E o desdobramento abre ao clique — foi o que o pedido chamou de
  // "interativo", e é o que impede o círculo de ser um infográfico que
  // ninguém lê.
  const primeiro = ESTAGIOS_DO_CICLO[0];
  await page.getByTestId(`estagio-item-${primeiro.id}`).click();
  await expect(page.getByTestId(`estagio-detalhe-${primeiro.id}`)).toContainText(primeiro.detalhe.slice(0, 40));

  /**
   * O título da página vem ANTES do círculo: o diagrama é MAPA, não primeira
   * impressão. Denso na primeira tela é a definição de não se vender bem.
   *
   * O seletor é o `h1`, e não o texto: prender a ORDEM da página ao enunciado
   * exato faria toda revisão de copy quebrar um teste que não é sobre copy —
   * `site.travas.test.tsx` é quem afirma o conteúdo.
   *
   * **SPEC-95 (§342) — e o `h1` desta página é a pergunta**, não a manchete do
   * produto: cada página do site tem título próprio, e a manchete ficou na capa,
   * que é onde ela é a primeira coisa que alguém lê.
   */
  const titulo = page.getByRole("heading", { level: 1 });
  await expect(titulo).toBeVisible();
  const caixaTitulo = await titulo.boundingBox();
  const caixaCiclo = await ciclo.boundingBox();
  expect(caixaTitulo!.y).toBeLessThan(caixaCiclo!.y);
});
