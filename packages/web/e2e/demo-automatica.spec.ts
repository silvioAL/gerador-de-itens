import { test, expect } from "@playwright/test";
import { entrar } from "./auth";

/**
 * §198 / revisão de cobertura — a DEMONSTRAÇÃO AUTOMÁTICA no navegador.
 *
 * O tour guiado (clicar "Próximo") já tinha spec; a demo, que é a outra metade
 * do botão e a que o usuário pediu para diferenciar, não tinha nenhuma. E ela
 * é a única feature do produto que depende de TEMPO: passa de passo sozinha,
 * pausa, continua. Teste de unidade não alcança isso — só o relógio real.
 */
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("gerador:jornada-vista", "1"));
  await page.route(
    (url) => url.pathname === "/ia/status",
    (rota) => rota.fulfill({ json: { modelosChat: [], embeddingInstalado: false, capacidades: {} } })
  );
});

test("a demo anda sozinha, pausa onde está e continua de onde parou", async ({ page }) => {
  test.setTimeout(90000);
  await entrar(page);

  await page.getByTestId("abrir-demonstracao").click();
  await page.getByRole("button", { name: "▶ Demonstração automática" }).click();

  const passo = page.getByText(/PASSO \d+ DE \d+/);
  await expect(passo).toBeVisible();
  // O cursor fantasma é o que diferencia a demo do tour: alguém "usando" a
  // tela, em vez de um balão parado esperando clique. Ele só existe em passo
  // COM alvo — o primeiro é card central (ver CursorFantasma), então esperá-lo
  // logo no início testaria uma coisa que o produto não promete.
  await expect
    .poll(() => page.getByTestId("cursor-fantasma").count(), { timeout: 30000 })
    .toBeGreaterThan(0);

  const numeroDoPasso = async () => {
    const texto = (await passo.textContent()) ?? "";
    return Number(/PASSO (\d+)/.exec(texto)?.[1] ?? 0);
  };

  const primeiro = await numeroDoPasso();
  // Sem tocar em nada: ela avança por conta própria. É a feature inteira.
  await expect
    .poll(numeroDoPasso, { timeout: 30000, message: "a demo deveria avançar sozinha" })
    .toBeGreaterThan(primeiro);

  // Pausar CONGELA — e o passo em que parou continua na tela (pausar não pode
  // reiniciar nem pular).
  await page.getByRole("button", { name: "⏸ Pausar" }).click();
  const congelado = await numeroDoPasso();
  await page.waitForTimeout(6000);
  expect(await numeroDoPasso()).toBe(congelado);

  // E continua DE ONDE PAROU.
  await page.getByRole("button", { name: "▶ Continuar" }).click();
  await expect
    .poll(numeroDoPasso, { timeout: 30000, message: "continuar deveria retomar o avanço" })
    .toBeGreaterThan(congelado);
});

test("encerrar a demo fecha tudo — sem overlay preso nem cursor fantasma órfão", async ({ page }) => {
  await entrar(page);

  await page.getByTestId("abrir-demonstracao").click();
  await page.getByRole("button", { name: "▶ Demonstração automática" }).click();
  await expect(page.getByText(/PASSO \d+ DE \d+/)).toBeVisible();

  await page.getByRole("button", { name: "Encerrar demo" }).click();

  await expect(page.getByTestId("cursor-fantasma")).toHaveCount(0);
  await expect(page.getByText(/PASSO \d+ DE \d+/)).toHaveCount(0);
  // E a aplicação continua utilizável — a demo não pode deixar a tela travada.
  await expect(page.getByRole("button", { name: "+ Serviço", exact: true })).toBeVisible();
});
