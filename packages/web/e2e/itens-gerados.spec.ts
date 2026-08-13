import { test, expect } from "@playwright/test";
import { entrar } from "./auth";

/**
 * SPEC-41 Parte B — o ciclo dos itens de trabalho visto no navegador: derivar,
 * pedir "Gerar itens de trabalho" ao agente da revisão e cair na tela
 * `#/itens` com os cards e a régua de completude. A IA fica desligada de
 * propósito (mock do /ia/status): o caminho passa pelos balões M4→M5→M12, que
 * é exatamente a condução de quem abre a revisão sem esteira.
 */
test("gerar itens na revisão abre a tela #/itens com cards e completude", async ({ page }) => {
  test.setTimeout(60000);
  await page.addInitScript(() => localStorage.setItem("gerador:jornada-vista", "1"));
  await page.route(
    (url) => url.pathname === "/ia/status",
    (rota) => rota.fulfill({ json: { modelosChat: [], embeddingInstalado: false, capacidades: {} } })
  );
  await entrar(page);

  await page.getByRole("button", { name: "☰ Menu" }).click();
  await page.getByRole("button", { name: "✦ Como funciona & cenários" }).click();
  await page.getByRole("button", { name: /Cenários prontos/ }).click();
  await page.getByRole("button", { name: "Carregar cenário: Dados não-relacionais" }).click();
  await page.locator('[data-tour="derivar-button"]').click();
  // Sem título: derivar sem salvar (exploração) — os itens ficam locais.
  await page.getByTestId("assistente-balao-secundaria").click();

  // A condução até o M12: dispensa "sem IA" (M4) e, se vier, "sem contexto"
  // (M5 — cenário pronto pode chegar já tocado, e aí o M5 é pulado).
  await page.getByTestId("balao-sem-ia").getByRole("button", { name: "Dispensar sugestão" }).click();
  await expect(page.getByTestId("balao-sem-contexto").or(page.getByTestId("balao-gerar"))).toBeVisible();
  if (await page.getByTestId("balao-sem-contexto").isVisible()) {
    await page.getByTestId("balao-sem-contexto").getByRole("button", { name: "Dispensar sugestão" }).click();
  }
  await expect(page.getByTestId("balao-gerar")).toBeVisible();
  await page.getByTestId("balao-gerar-itens").click();

  // A tela dos itens, na rota própria.
  await expect(page.getByTestId("itens-screen")).toBeVisible();
  expect(page.url()).toContain("#/itens");
  await expect(page.getByTestId("itens-resumo")).toContainText(/de \d+ itens? prontos? pra exportar/);

  // Cards com a régua de completude — material recém-derivado tem ✍️ pendentes.
  const primeiro = page.getByTestId("item-gerado-0");
  await expect(primeiro).toBeVisible();
  await expect(page.getByTestId("item-completude-0")).toContainText(/especificar|confirmar|Pronto/);

  // SPEC-47 — a escrita do item está À VISTA (era "Ver corpo" colapsado), e
  // termina na entrega final.
  await expect(page.getByTestId("item-corpo-0")).toContainText("História de usuário");
  await expect(page.getByTestId("item-corpo-0")).toContainText("Entrega final");
  await page.getByTestId("item-expandir-0").click(); // recolher é o que é sob demanda
  await expect(page.getByTestId("item-corpo-0")).toHaveCount(0);

  // Voltar ao canvas devolve a revisão (escondida, não desmontada).
  await page.getByRole("button", { name: "Voltar ao canvas" }).click();
  await expect(page.getByTestId("itens-screen")).not.toBeVisible();
});

test("menu ☰ leva à tela de itens; sem geração, o vazio conduz", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("gerador:jornada-vista", "1"));
  await page.route(
    (url) => url.pathname === "/ia/status",
    (rota) => rota.fulfill({ json: { modelosChat: [], embeddingInstalado: false, capacidades: {} } })
  );
  await entrar(page);

  await page.getByRole("button", { name: "☰ Menu" }).click();
  await page.getByRole("button", { name: "Itens de trabalho" }).click();

  await expect(page.getByTestId("itens-screen")).toBeVisible();
  await expect(page.getByTestId("itens-vazio")).toContainText("Nenhum item gerado ainda");
  await page.getByRole("button", { name: "Ir para a demanda" }).click();
  await expect(page.getByTestId("itens-screen")).not.toBeVisible();
});
