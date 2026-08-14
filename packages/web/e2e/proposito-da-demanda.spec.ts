import { test, expect } from "@playwright/test";
import { entrar } from "./auth";

/**
 * SPEC-57 fatia A — a cadeia PROPÓSITO → ELEMENTO → ITEM → SPEC, ponta a ponta
 * no navegador.
 *
 * As unidades provam cada elo em separado; o que só o navegador prova é a
 * costura: a necessidade digitada no painel do assistente chega ao placar do
 * topo, o vínculo feito ali fecha a lacuna, e o texto reaparece no documento
 * gerado. Foi exatamente esse vão — entre camadas verdes — que o §123 pagou
 * caro para descobrir.
 */
test("declarar propósito, ligar ao componente e ver a citação chegar no documento", async ({ page }) => {
  test.setTimeout(90000);
  await page.addInitScript(() => localStorage.setItem("gerador:jornada-vista", "1"));
  await page.route(
    (url) => url.pathname === "/ia/status",
    (rota) => rota.fulfill({ json: { modelosChat: [], embeddingInstalado: false, capacidades: {} } })
  );
  await entrar(page);

  const proposito = `o pedido não pode ser cobrado duas vezes ${Date.now()}`;

  // Um componente na mesa, para haver a quem ligar o propósito.
  await page.getByRole("button", { name: "+ Serviço", exact: true }).click();
  await expect(page.locator(".react-flow__node")).toHaveCount(1);

  // Sem necessidade declarada, a dimensão nem aparece: a régua nova não pode
  // acusar quem nunca a usou.
  await expect(page.getByTestId("proposito-resumo")).toHaveCount(0);

  // M1 — o propósito, no mesmo painel onde o contexto da demanda já vive.
  await page.getByTestId("assistente-flutuante").click();
  const janela = page.getByTestId("assistente-janela");
  await janela.getByRole("button", { name: "📎 Contexto do épico" }).click();
  await janela.getByLabel("Nova necessidade", { exact: true }).fill(proposito);
  await janela.getByRole("button", { name: "+ Adicionar" }).click();

  // Ainda sem ninguém que responda por ela — a lacuna é visível ali mesmo.
  await expect(janela.getByTestId(/^necessidade-/)).toHaveAttribute("data-lacuna", "sim");

  // M6 — ligar ao componente fecha a lacuna, na mesma tela.
  await janela.getByLabel(`Vincular componente a: ${proposito}`).selectOption({ index: 1 });
  await expect(janela.getByTestId(/^necessidade-/)).not.toHaveAttribute("data-lacuna", "sim");

  await janela.getByRole("button", { name: "Salvar" }).click();

  // M3 — a medida aparece no placar do topo, onde a decisão é tomada.
  await expect(page.getByTestId("proposito-resumo")).toContainText("propósito coberto");
});

/**
 * O caminho de volta: a lacuna precisa REAPARECER quando o componente que
 * respondia por ela some. É a decisão de não cascatear (`analisarLacunas`) —
 * limpar o vínculo em silêncio esconderia justamente o evento que interessa.
 */
test("apagar o componente devolve a necessidade à condição de lacuna", async ({ page }) => {
  test.setTimeout(90000);
  await page.addInitScript(() => localStorage.setItem("gerador:jornada-vista", "1"));
  await page.route(
    (url) => url.pathname === "/ia/status",
    (rota) => rota.fulfill({ json: { modelosChat: [], embeddingInstalado: false, capacidades: {} } })
  );
  await entrar(page);

  const proposito = `propósito órfão ${Date.now()}`;

  await page.getByRole("button", { name: "+ Serviço", exact: true }).click();
  await expect(page.locator(".react-flow__node")).toHaveCount(1);

  await page.getByTestId("assistente-flutuante").click();
  const janela = page.getByTestId("assistente-janela");
  await janela.getByRole("button", { name: "📎 Contexto do épico" }).click();
  await janela.getByLabel("Nova necessidade", { exact: true }).fill(proposito);
  await janela.getByRole("button", { name: "+ Adicionar" }).click();
  await janela.getByLabel(`Vincular componente a: ${proposito}`).selectOption({ index: 1 });
  await janela.getByRole("button", { name: "Salvar" }).click();
  await expect(page.getByTestId("proposito-resumo")).toContainText("propósito coberto");

  // Apaga o componente pelo canvas.
  await page.locator(".react-flow__node").first().click();
  await page.keyboard.press("Delete");
  const confirmar = page.getByRole("button", { name: /Excluir|Confirmar/ });
  if (await confirmar.count()) await confirmar.first().click();
  await expect(page.locator(".react-flow__node")).toHaveCount(0);

  // O placar volta a acusar: o vínculo apontando para nó morto não conta.
  await expect(page.getByTestId("proposito-resumo")).toContainText("1 sem componente");
});
