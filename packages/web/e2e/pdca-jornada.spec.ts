import { test, expect } from "@playwright/test";
import { entrar } from "./auth";

const API = "http://localhost:4100";

/**
 * SPEC-45 — a jornada inteira no navegador: o feedback que o agente coletou
 * APARECE, vira solicitação com prévia num item de exemplo, é aprovada e
 * aplicada — e o documento de regras muda de verdade no fim.
 *
 * O documento de regras é global do ambiente: o teste restaura o original no
 * finally (mesma disciplina do §162).
 */
test("feedback → proposta com prévia → aprovar → aplicar muda a configuração", async ({ page }) => {
  test.setTimeout(60000);
  await page.addInitScript(() => localStorage.setItem("gerador:jornada-vista", "1"));
  await page.route(
    (url) => url.pathname === "/ia/status",
    (rota) => rota.fulfill({ json: { modelosChat: [], embeddingInstalado: false, capacidades: {} } })
  );
  await entrar(page);

  const original = (await (await page.request.get(`${API}/config/regras`)).json()).documento;
  const marca = `DLQ e2e ${Date.now()}`;
  try {
    // O feedback chega pelo mesmo caminho do agente (M13).
    const criado = await page.request.post(`${API}/pdca/feedback`, { data: { texto: `feedback e2e: ${marca}` } });
    expect(criado.ok()).toBeTruthy();

    await page.getByRole("button", { name: "☰ Menu" }).click();
    await page.getByRole("button", { name: /PDCA/ }).click();

    // 1. O que disseram — o buraco do §194 fechado.
    const feedbackCard = page.locator('[data-testid^="feedback-"]', { hasText: marca });
    await expect(feedbackCard).toBeVisible({ timeout: 10000 });

    // 2. Propor com prévia iterativa num item de exemplo.
    await feedbackCard.getByRole("button", { name: "✨ Propor ajuste" }).click();
    await expect(page.getByTestId("estudio-de-ajuste")).toBeVisible();
    await page.getByLabel("Texto do item").fill(marca);
    await expect(page.getByTestId("previa-adicionado")).toContainText(marca);
    await expect(page.getByTestId("previa-markdown")).toContainText(marca);

    await page.getByTestId("salvar-ajuste").click();

    // 3. Revisar: a solicitação nasce pendente, ligada ao feedback.
    const ajuste = page.locator('[data-testid^="ajuste-"]', { hasText: marca });
    await expect(ajuste).toBeVisible();
    await ajuste.getByRole("button", { name: "Aprovar" }).click();

    // 4. Aplicar: o documento muda de verdade.
    await ajuste.getByRole("button", { name: "Aplicar agora" }).click();
    await expect(ajuste).toContainText("aplicada");

    const regrasDepois = (await (await page.request.get(`${API}/config/regras`)).json()).documento;
    const todosOsItens = Object.values(regrasDepois.porTech as Record<string, { checklistTecnico?: { texto: string }[] }>)
      .flatMap((t) => t.checklistTecnico ?? [])
      .map((c) => c.texto);
    expect(todosOsItens).toContain(marca);
  } finally {
    await page.request.put(`${API}/config/regras`, { data: { documento: original } });
  }
});
