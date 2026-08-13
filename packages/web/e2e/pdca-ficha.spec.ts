import { test, expect } from "@playwright/test";
import { entrar } from "./auth";

const API = "http://localhost:4100";

/**
 * SPEC-52 — o ciclo fechando sozinho na FICHA: feedback → propor um campo com
 * prévia da ficha → aprovar → aplicar — e o campo aparece de verdade no painel
 * de quem vai preencher, sem ninguém abrir a tela de campos.
 *
 * Este é o pedido que mais aparecia ("falta um campo de SLA no serviço") e o
 * único do PDCA que ainda terminava em "abra a configuração e edite à mão".
 *
 * Campos são estado GLOBAL do ambiente, como o documento de regras: o teste
 * apaga o que criou no `finally` (mesma disciplina do §162).
 */
test("feedback → campo proposto com prévia da ficha → aplicar → o campo aparece no painel", async ({ page }) => {
  test.setTimeout(60000);
  await page.addInitScript(() => localStorage.setItem("gerador:jornada-vista", "1"));
  await page.route(
    (url) => url.pathname === "/ia/status",
    (rota) => rota.fulfill({ json: { modelosChat: [], embeddingInstalado: false, capacidades: {} } })
  );
  await entrar(page);

  const marca = `SLA e2e ${Date.now()}`;
  try {
    const criado = await page.request.post(`${API}/pdca/feedback`, { data: { texto: `feedback e2e: ${marca}` } });
    expect(criado.ok()).toBeTruthy();

    await page.getByRole("button", { name: "☰ Menu" }).click();
    await page.getByRole("button", { name: /PDCA/ }).click();

    const feedbackCard = page.locator('[data-testid^="feedback-"]', { hasText: marca });
    await expect(feedbackCard).toBeVisible({ timeout: 10000 });
    await feedbackCard.getByRole("button", { name: "✨ Propor ajuste" }).click();

    // O alvo novo: a ficha do componente, não o texto do item.
    await page.getByLabel("Documento a ajustar").selectOption("campos-no");
    await page.getByLabel("Componente da ficha").selectOption({ label: "Fila Rabbit" });
    await page.getByLabel("Rótulo do campo").fill(marca);

    // A prévia é a ficha inteira: o campo novo entrando ao lado dos que já
    // existem — é assim que se vê se ele faz sentido ali.
    const previa = page.getByTestId("previa-da-ficha");
    await expect(previa.getByTestId("ficha-campo-novo")).toContainText(marca);
    await expect(previa).toContainText("Nome da fila");

    await page.getByTestId("salvar-ajuste").click();

    const ajuste = page.locator('[data-testid^="ajuste-"]', { hasText: marca });
    await expect(ajuste).toBeVisible();
    // A descrição da operação fala de ficha e de campo, sem jargão.
    await expect(ajuste).toContainText("ficha de");
    await ajuste.getByRole("button", { name: "Aprovar" }).click();
    await ajuste.getByRole("button", { name: "Aplicar agora" }).click();
    await expect(ajuste).toContainText("aplicada");

    // O que importa: o campo chega em quem vai PREENCHER, sem ninguém abrir a
    // tela de campos. Vale para o que já está desenhado — a ficha é lida na
    // hora, não copiada no desenho.
    await page.getByRole("button", { name: "☰ Menu" }).click();
    await page.getByRole("button", { name: "Nova quebra" }).click();
    await page.getByRole("button", { name: "+ Fila Rabbit" }).click();
    await page.locator(".react-flow__node", { hasText: "Fila Rabbit" }).click();
    await expect(page.locator("aside").getByRole("textbox", { name: marca })).toBeVisible();
  } finally {
    const campos = (await (await page.request.get(`${API}/campos-no`)).json()) as { id: string; label: string }[];
    for (const campo of campos.filter((c) => c.label === marca)) {
      await page.request.delete(`${API}/campos-no/${campo.id}`);
    }
  }
});
