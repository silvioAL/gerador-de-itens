import { test, expect } from "@playwright/test";
import { entrar } from "./auth";

/**
 * SPEC-66 — a bancada de ensaio.
 *
 * O que só o navegador prova: a porta nasce no chip da leitura, a rota é
 * própria (e sobrevive ao F5), e o ciclo inteiro — criar cenário, arrastar o
 * fator, ver o Δ — acontece **sem IA nenhuma**. É a fatia B provando que a
 * tela não nasceu dependente da fatia D.
 */
test("§295 — ensaiar lentidão pelo chip, sem IA, e o cenário sobrevive ao F5", async ({ page }) => {
  test.setTimeout(150000);
  await page.addInitScript(() => localStorage.setItem("gerador:jornada-vista", "1"));
  await page.route(
    (url) => url.pathname === "/ia/status",
    (rota) => rota.fulfill({ json: { modelosChat: [], embeddingInstalado: false, capacidades: {} } })
  );
  await entrar(page);

  await page.getByTestId("abrir-cenarios").click();
  await page.getByRole("button", { name: "Carregar cenário: Fluxo completo: aprovação de crédito" }).click();

  // ── A porta é o chip da leitura: quem lê "resposta ≥ 3,0 s" é quem quer
  //    perguntar "e se piorar?" ──
  await page.getByTestId("leitura-resumo").click();
  await page.getByTestId("abrir-simulacao").click();

  await expect(page.getByTestId("tela-simulacao")).toBeVisible();
  // Rota própria, e linkável: é metade do valor.
  await expect(page).toHaveURL(/#\/simulacao$/);

  // A âncora traz o número de HOJE — sem ela, todo número da tabela é solto.
  await expect(page.getByTestId("linha-hoje")).toContainText("3,0 s");

  // ── Criar um cenário à mão. Nenhuma IA envolvida. ──
  await expect(page.getByTestId("sugerir-cenarios")).toBeVisible();
  await page.getByLabel("Nome do cenário").fill("Bureau degradado");
  await page.getByTestId("criar-cenario").click();

  const linha = page.getByTestId("linha-cen-bureau-degradado");
  await expect(linha).toBeVisible();

  // ── O ajuste, e o número acompanhando o gesto ──
  // O único componente com tempo é o bureau (timeoutMs: 3000 no nó).
  await page.getByTestId("add-ajuste-cen-bureau-degradado").click();
  const fator = page.locator('[data-testid^="fator-"]').first();
  await expect(fator).toBeVisible();
  // 2× por padrão: 3000 → 6000, e o Δ contra hoje é +3,0 s.
  await expect(linha).toContainText("6,0 s");
  await expect(linha).toContainText("+3,0 s");

  // Arrastar recalcula sem recarregar nada — o cálculo é puro e local.
  await fator.fill("4");
  await expect(linha).toContainText("12 s");
  await expect(linha).toContainText("+9,0 s");

  // "Quem domina" aponta o culpado — o total diz que dói, isto diz onde.
  await expect(linha).toContainText("bureau-credito-nacional");

  // ── Salvar e recarregar: o ensaio é do time, não da sessão ──
  await page.getByTestId("simulacao-voltar").click();
  await page.getByRole("button", { name: "Salvar" }).first().click();
  await expect(page.getByText(/salv/i).first()).toBeVisible({ timeout: 15000 });

  await page.goto("/#/simulacao");
  await expect(page.getByTestId("linha-cen-bureau-degradado")).toContainText("12 s");
});

test("§295 — o desenho sem tempo nenhum DIZ que não há o que ensaiar", async ({ page }) => {
  test.setTimeout(90000);
  await page.addInitScript(() => localStorage.setItem("gerador:jornada-vista", "1"));
  await page.route(
    (url) => url.pathname === "/ia/status",
    (rota) => rota.fulfill({ json: { modelosChat: [], embeddingInstalado: false, capacidades: {} } })
  );
  await entrar(page);

  // Mesa em branco: uma tabela de zeros pareceria medição, e não é (§248).
  await page.goto("/#/simulacao");
  await expect(page.getByTestId("simulacao-sem-tempo")).toBeVisible();
  await expect(page.getByTestId("sem-cenarios")).toBeVisible();
});
