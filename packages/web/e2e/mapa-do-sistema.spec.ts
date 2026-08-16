import { test, expect } from "@playwright/test";
import { entrar } from "./auth";

const API = "http://localhost:4100";

/**
 * SPEC-59 fatias A/B/D — o mapa do sistema, ponta a ponta.
 *
 * As unidades provam o modelo de leitura e a tela em separado. O que só o
 * navegador prova é que a edição feita AQUI chega ao servidor: um toggle que
 * pinta a tela e não grava é a pior versão desta feature, porque a pessoa sai
 * achando que configurou.
 */
test("o mapa mostra a esteira, e ligar/desligar por ele grava de verdade", async ({ page }) => {
  test.setTimeout(90000);
  await page.addInitScript(() => localStorage.setItem("gerador:jornada-vista", "1"));
  await entrar(page);

  await page.getByRole("button", { name: "☰ Menu" }).click();
  await page.getByTestId("menu-sistema").click();
  await expect(page.getByTestId("sistema-screen")).toBeVisible();

  // A esteira de fábrica, como sequência.
  await expect(page.getByTestId("agente-po")).toBeVisible();
  await expect(page.getByTestId("agente-qa")).toBeVisible();

  const estadoInicial = await page.getByTestId("agente-po").getAttribute("data-estado");
  expect(estadoInicial).not.toBe("desligado");

  // Desligar pelo mapa.
  await page.getByTestId("alternar-po").click();
  await expect(page.getByTestId("agente-po")).toHaveAttribute("data-estado", "desligado");

  // O que importa não é a tela ter pintado: é o servidor ter recebido.
  await expect
    .poll(
      async () => {
        const cfg = await (await page.request.get(`${API}/config/pipeline-agentes`)).json();
        return cfg.documento.papeis.find((p: { id: string }) => p.id === "po")?.ativo;
      },
      { timeout: 15000 }
    )
    .toBe(false);

  // E religar volta ao que era — a ação é reversível em um clique, que é o que
  // dispensa o modal de "ver o efeito antes de aplicar": o efeito é o mapa.
  await page.getByTestId("alternar-po").click();
  await expect
    .poll(
      async () => {
        const cfg = await (await page.request.get(`${API}/config/pipeline-agentes`)).json();
        return cfg.documento.papeis.find((p: { id: string }) => p.id === "po")?.ativo;
      },
      { timeout: 15000 }
    )
    .toBe(true);
});
