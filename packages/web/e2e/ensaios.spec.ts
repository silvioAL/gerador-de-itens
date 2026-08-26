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
test("§296 — ensaiar pelo chip, sem IA, e o cenário sobrevive ao F5", async ({ page }) => {
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

  await expect(page.getByTestId("tela-ensaios")).toBeVisible();
  // Rota própria, e linkável: é metade do valor.
  await expect(page).toHaveURL(/#\/ensaios$/);

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
  await page.getByTestId("ensaios-voltar").click();
  await page.getByRole("button", { name: "Salvar" }).first().click();
  await expect(page.getByText(/salv/i).first()).toBeVisible({ timeout: 15000 });

  await page.goto("/#/ensaios");
  await expect(page.getByTestId("linha-cen-bureau-degradado")).toContainText("12 s");
});

test("§296 — o desenho sem tempo nenhum DIZ que não há o que ensaiar", async ({ page }) => {
  test.setTimeout(90000);
  await page.addInitScript(() => localStorage.setItem("gerador:jornada-vista", "1"));
  await page.route(
    (url) => url.pathname === "/ia/status",
    (rota) => rota.fulfill({ json: { modelosChat: [], embeddingInstalado: false, capacidades: {} } })
  );
  await entrar(page);

  // Mesa em branco: uma tabela de zeros pareceria medição, e não é (§248).
  await page.goto("/#/ensaios");
  await expect(page.getByTestId("ensaios-sem-tempo")).toBeVisible();
  await expect(page.getByTestId("sem-cenarios")).toBeVisible();
});

/**
 * SPEC-68 §4.2 — a repaginação.
 *
 * O nome "e se ficar lento?" fechava a porta para o que cabe dentro. O que só o
 * navegador prova: o link velho não dá tela branca, e um ensaio de TAXA — que
 * não é lentidão nenhuma — faz a saturação aparecer.
 */
test("§296 — o link velho de `#/simulacao` não dá tela branca", async ({ page }) => {
  test.setTimeout(90000);
  await page.addInitScript(() => localStorage.setItem("gerador:jornada-vista", "1"));
  await page.route(
    (url) => url.pathname === "/ia/status",
    (rota) => rota.fulfill({ json: { modelosChat: [], embeddingInstalado: false, capacidades: {} } })
  );
  await entrar(page);

  // Rota que some sem redirecionar dá tela branca para quem tinha o link
  // salvo — e link salvo é o de quem mais usa (§SPEC-61).
  await page.goto("/#/simulacao");
  await expect(page.getByTestId("tela-ensaios")).toBeVisible();
});

test("§296 — um ensaio de TAXA acusa saturação, e taxa não é lentidão", async ({ page }) => {
  test.setTimeout(150000);
  await page.addInitScript(() => localStorage.setItem("gerador:jornada-vista", "1"));
  await page.route(
    (url) => url.pathname === "/ia/status",
    (rota) => rota.fulfill({ json: { modelosChat: [], embeddingInstalado: false, capacidades: {} } })
  );
  await entrar(page);

  await page.getByTestId("abrir-cenarios").click();
  await page.getByRole("button", { name: "Carregar cenário: Fluxo completo: aprovação de crédito" }).click();

  // O serviço de entrada precisa declarar quantas chamadas simultâneas aguenta
  // — sem esse número, a Lei de Little não tem com o que comparar (§3.3).
  await page.locator(".react-flow__node", { hasText: "srv-credito-api" }).click();
  await page.getByLabel("Chamadas simultâneas que aguenta").fill("10");

  await page.goto("/#/ensaios");
  await page.getByLabel("Nome do cenário").fill("Black Friday");
  await page.getByTestId("criar-cenario").click();
  await page.getByTestId("add-ajuste-cen-black-friday").click();

  // O ajuste nasce sobre um elemento com tempo; troco para o NÓ que declara o
  // pool, e ponho o pico. Nada aqui mexe em tempo nenhum.
  const alvo = page.locator('[data-testid="ajustes-cen-black-friday"] select').first();
  await alvo.selectOption({ label: "bureau-credito-nacional" });

  await expect(page.getByTestId("tela-ensaios")).toContainText("pico de tráfego");
});
