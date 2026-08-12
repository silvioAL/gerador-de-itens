import { test, expect } from "@playwright/test";
import { entrar } from "./auth";

/**
 * SPEC-44 — a revisão pós-IA sem os 30 cliques: sugestões geradas (mock de
 * /ia/sugerir), a barra agrega, "Confirmar todas" assina em lote, a fila
 * guiada percorre uma a uma, e a tela de itens deep-linka de volta.
 */
test("barra de pendências, confirmar todas, fila guiada e o deep-link da tela de itens", async ({ page }) => {
  test.setTimeout(60000);
  await page.addInitScript(() => localStorage.setItem("gerador:jornada-vista", "1"));
  await page.route(
    (url) => url.pathname === "/ia/status",
    (rota) => rota.fulfill({ json: { modelosChat: [], embeddingInstalado: false, capacidades: {} } })
  );
  // O "✨ Sugerir" individual devolve texto puro streamado — mock determinístico.
  await page.route(
    (url) => url.pathname === "/ia/sugerir",
    (rota) => rota.fulfill({ contentType: "text/plain", body: "Texto sugerido pela IA de teste" })
  );
  await entrar(page);

  await page.getByRole("button", { name: "☰ Menu" }).click();
  await page.getByRole("button", { name: "✦ Como funciona & cenários" }).click();
  await page.getByRole("button", { name: /Cenários prontos/ }).click();
  await page.getByRole("button", { name: "Carregar cenário: Dados não-relacionais" }).click();
  await page.locator('[data-tour="derivar-button"]').click();
  await page.getByTestId("assistente-balao-secundaria").click();

  // Antes de qualquer sugestão: a barra existe (campos vazios), sem "aguardando".
  await expect(page.getByTestId("barra-pendencias")).toBeVisible();
  await expect(page.getByTestId("barra-pendencias")).not.toContainText("aguardando");
  await expect(page.getByTestId("confirmar-todas")).toHaveCount(0);

  // Duas sugestões via "✨ Sugerir" no primeiro item.
  await page.locator('[data-testid^="item-"]').first().click();
  await page.getByRole("button", { name: "✨ Sugerir" }).nth(0).click();
  await page.getByRole("button", { name: "✨ Sugerir" }).nth(1).click();

  await expect(page.getByTestId("barra-pendencias")).toContainText("2 sugestões da esteira aguardando");

  // O lote global: um clique assina as duas.
  await page.getByTestId("confirmar-todas").click();
  await expect(page.getByTestId("barra-pendencias")).not.toContainText("aguardando");

  // A fila guiada: mais uma sugestão, revisada uma a uma.
  await page.getByRole("button", { name: "✨ Sugerir" }).first().click();
  await expect(page.getByTestId("barra-pendencias")).toContainText("1 sugestão da esteira aguardando");
  await page.getByTestId("revisar-uma-a-uma").click();
  await expect(page.getByTestId("fila-de-revisao")).toBeVisible();
  await expect(page.getByTestId("fila-progresso")).toHaveText("1 de 1");
  await page.getByTestId("fila-confirmar").click();
  await expect(page.getByTestId("fila-de-revisao")).toHaveCount(0);
  await expect(page.getByTestId("barra-pendencias")).not.toContainText("aguardando");

  // O ciclo fecha: gerar itens e voltar pelo chip de completude do card.
  for (const id of ["balao-sem-ia", "balao-sem-contexto"]) {
    if (await page.getByTestId(id).isVisible().catch(() => false)) {
      await page.getByTestId(id).getByRole("button", { name: "Dispensar sugestão" }).click();
    }
  }
  const botaoItens = page.getByTestId("balao-gerar-itens").or(page.getByTestId("balao-especificacao-itens"));
  await botaoItens.first().waitFor({ timeout: 10000 });
  await botaoItens.first().click();
  await expect(page.getByTestId("itens-screen")).toBeVisible();

  // Item PRONTO tem chip estático (sem link); item não-pronto tem o BOTÃO
  // de volta pra revisão daquele item — clica no segundo card (não-pronto).
  await expect(page.getByTestId("item-completude-0")).toContainText("Pronto pra exportar");
  await page.getByTestId("item-completude-1").click();
  await expect(page.getByTestId("itens-screen")).not.toBeVisible();
  await expect(page.locator('[data-testid^="item-"][aria-pressed="true"]').first()).toBeVisible();
});
