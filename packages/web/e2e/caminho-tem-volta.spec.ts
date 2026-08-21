import { test, expect } from "@playwright/test";
import { entrar } from "./auth";

/**
 * §283 — RELATO REAL do usuário, com print do painel de caminhos mostrando dois
 * `✓` e nada clicável: *"aqui nessa parte de o usuário errar não consegue
 * ajustar"*.
 *
 * Confirmar não é clique inócuo — liga as réguas de tempo e de saltos sobre o
 * caminho e põe item no backlog (§249) — e ficava a um pixel do "não é
 * caminho", sem volta nenhuma dos dois lados.
 *
 * O que só o navegador prova é a IDA E VOLTA completa: o estado atravessa o
 * painel, o `conciliarPercursos` e o estado da quebra, e é nessa costura que a
 * volta poderia se perder.
 */
test("§283 — confirmar um caminho tem volta, e recusar também", async ({ page }) => {
  test.setTimeout(90000);
  await page.addInitScript(() => localStorage.setItem("gerador:jornada-vista", "1"));
  await page.route(
    (url) => url.pathname === "/ia/status",
    (rota) => rota.fulfill({ json: { modelosChat: [], embeddingInstalado: false, capacidades: {} } })
  );
  await entrar(page);

  // Cenário pronto: o desenho produz caminho de verdade, lido das setas.
  await page.getByTestId("abrir-cenarios").click();
  await page.getByRole("button", { name: "Carregar cenário: Dados não-relacionais" }).click();

  const chip = page.getByTestId("percursos-resumo");
  await expect(chip).toContainText("a confirmar");
  await chip.click();

  // ── Confirmar, e desfazer ──
  const confirmar = page.locator('[data-testid^="confirmar-pc::"]').first();
  await confirmar.click();
  await expect(page.getByTestId("percurso-confirmado")).toBeVisible();

  const desfazer = page.locator('[data-testid^="desfazer-pc::"]').first();
  await expect(desfazer).toBeVisible();
  await desfazer.click();

  // Voltou para a fila: é o que "desfazer" precisa significar aqui, e não
  // "some da tela" — o caminho continua existindo no desenho.
  await expect(page.getByTestId("percurso-a-confirmar").first()).toBeVisible();
  await expect(chip).toContainText("a confirmar");

  // ── Recusar, e reabrir ──
  await page.getByRole("button", { name: "não é caminho" }).first().click();

  // O recusado NÃO volta para a fila (senão o descarte brigaria com o
  // inferidor a cada render) — mas continua alcançável, atrás de um clique.
  const recusados = page.getByTestId("percursos-recusados");
  await expect(recusados).toContainText("recusado(s)");
  await recusados.getByText(/recusado\(s\)/).click();

  const reabrir = page.locator('[data-testid^="reabrir-pc::"]').first();
  await reabrir.click();
  await expect(page.getByTestId("percurso-a-confirmar").first()).toBeVisible();
});
