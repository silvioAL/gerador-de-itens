import { test, expect } from "@playwright/test";
import { entrar } from "./auth";

/**
 * #299 — a simulação vista no navegador, com uma quebra de verdade.
 *
 * O motor tem teste de unidade; o que só o navegador prova é que o botão existe
 * onde a decisão é tomada (ao lado do que GASTA) e que o painel abre legível.
 */
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("gerador:jornada-vista", "1"));
});

test("simular mostra as chamadas e o prompt real, sem chamar o modelo", async ({ page }) => {
  const chamadasDeIa: string[] = [];
  // Predicado, e não o glob `**/ia/**`: em dev o Vite serve o próprio módulo
  // `packages/aplicacao/src/casos-de-uso/ia/pedidos.ts`, e o glob abortava o
  // carregamento da aplicação antes mesmo do login. `pathname` exato só casa
  // com a API.
  await page.route(
    (url) => url.pathname.startsWith("/ia/"),
    (rota) => {
      chamadasDeIa.push(rota.request().url());
      return rota.abort();
    }
  );

  await entrar(page);
  await page.getByRole("button", { name: "☰ Menu" }).click(); // SPEC-40: item do menu
  await page.getByRole("button", { name: "✦ Como funciona & cenários" }).click();
  await page.getByRole("button", { name: /Cenários prontos/ }).click();
  await page.getByRole("button", { name: "Carregar cenário: Dados não-relacionais" }).click();
  await page.locator('[data-tour="derivar-button"]').click();
  // Cenário sem título → o assistente pergunta o nome; simulação é exploração.
  await page.getByTestId("assistente-balao-secundaria").click();

  await page.getByTestId("abrir-simulacao").click();
  const painel = page.getByTestId("simulacao-esteira");
  await expect(painel).toBeVisible();

  // O resumo diz o custo; o prompt aberto traz o texto que sairia.
  await expect(page.getByTestId("simulacao-resumo")).toContainText("chamada(s) ao modelo");
  await expect(page.getByTestId("simulacao-prompt-0")).toContainText("Campos a responder");

  // O ponto da feature: nenhuma chamada de IA saiu.
  expect(chamadasDeIa.filter((u) => u.includes("/ia/pipeline"))).toEqual([]);
});
