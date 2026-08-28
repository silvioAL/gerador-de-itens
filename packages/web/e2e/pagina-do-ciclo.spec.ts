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
test("a landing mostra o ciclo, marca o que ainda não existe, e desdobra ao clique", async ({ page }) => {
  test.setTimeout(90000);
  // Sem `entrar`: o ponto é justamente a página ANTES do login. Quem chega aqui
  // não sabe o que a ferramenta é.
  await page.goto("/");

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

  // O que não existe está MARCADO, com palavra e não só cor.
  const ausente = ESTAGIOS_DO_CICLO.find((e) => e.estado === "ausente")!;
  await expect(page.getByTestId(`estagio-item-${ausente.id}`)).toContainText("ainda não existe");

  // E o desdobramento abre ao clique — foi o que o pedido chamou de
  // "interativo", e é o que impede o círculo de ser um infográfico que
  // ninguém lê.
  await page.getByTestId(`estagio-item-${ausente.id}`).click();
  await expect(page.getByTestId(`estagio-detalhe-${ausente.id}`)).toContainText("O que falta");

  // A promessa continua sendo a primeira coisa: o círculo é MAPA, não primeira
  // impressão. Denso na primeira tela é a definição de não se vender bem.
  const promessa = page.getByRole("heading", { name: /Do diagrama ao backlog/ });
  await expect(promessa).toBeVisible();
  const caixaPromessa = await promessa.boundingBox();
  const caixaCiclo = await ciclo.boundingBox();
  expect(caixaPromessa!.y).toBeLessThan(caixaCiclo!.y);
});
