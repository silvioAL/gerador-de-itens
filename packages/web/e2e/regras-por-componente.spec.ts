import { test, expect } from "@playwright/test";
import { entrar } from "./auth";

const API = "http://localhost:4100";

/**
 * SPEC-36 Opção A — a projeção por componente, de ponta a ponta: criar a
 * regra escolhendo "Fila Rabbit" (sem digitar tech nem contexto) e vê-la
 * chegar no item derivado de uma Fila Rabbit. O documento de regras é global
 * do ambiente: o teste restaura o original no finally (mesma disciplina do
 * §162 — estado sujo em config compartilhada derruba os specs vizinhos).
 */
test("regra criada pelo componente grava o contexto certo e chega no item derivado", async ({ page }) => {
  test.setTimeout(60000); // fluxo longo (config + reload + derivação) — 30s estourava com a stack fria
  await page.addInitScript(() => localStorage.setItem("gerador:jornada-vista", "1"));
  await page.route(
    (url) => url.pathname === "/ia/status",
    (rota) => rota.fulfill({ json: { modelosChat: [], embeddingInstalado: false, capacidades: {} } })
  );
  await entrar(page);

  const original = (await (await page.request.get(`${API}/config/regras`)).json()).documento;
  try {
    await page.getByRole("button", { name: "☰ Menu" }).click();
    await page.getByRole("button", { name: /Regras de refinamento/ }).click();

    const form = page.getByTestId("nova-regra-por-componente");
    await expect(form).toBeVisible();
    await form.getByLabel("Componente da nova regra").selectOption({ label: "Fila Rabbit" });
    // A prévia diz o alcance antes de salvar.
    await expect(page.getByTestId("alcance-da-regra")).toContainText("Fila Rabbit");
    await form.getByLabel("Texto da nova regra").fill("Política de DLQ definida e documentada?");
    await page.getByTestId("adicionar-regra-por-componente").click();

    // A regra entrou no grupo Backend — sem o usuário ter dito "Backend".
    await expect(
      page.getByTestId("regras-grupo-Backend").getByText("Política de DLQ definida e documentada?").first()
    ).toBeVisible();

    // Agora o outro lado: uma Fila Rabbit derivada RECEBE a regra. O App
    // carrega as regras no boot — recarrega pra derivação usar o documento novo.
    // O reload agora mantém a TELA (rota #/config/regras — SPEC-40): navegar
  // pro canvas explicitamente, recarregando o app com as regras novas.
  await page.goto("/#/");
    await expect(page.getByRole("button", { name: "+ Fila Rabbit" })).toBeVisible({ timeout: 10000 });
    await page.getByRole("button", { name: "+ Fila Rabbit" }).click();
    await page.locator(".react-flow__node", { hasText: "Fila Rabbit" }).click();
    const painel = page.locator("aside");
    await painel.getByRole("textbox", { name: "Nome da fila" }).fill("proposta.aprovada.q");
    await painel.getByRole("checkbox", { name: "Durable" }).check();
    await painel.getByRole("combobox", { name: "Tipo de fila" }).selectOption("quorum");
    await painel.getByRole("spinbutton", { name: "TTL da mensagem (ms)" }).fill("60000");
    await painel.getByRole("combobox", { name: "Ack" }).selectOption("manual");

    await page.locator('[data-tour="derivar-button"]').click();
    await page.getByTestId("assistente-balao-secundaria").click(); // sem título: derivar sem salvar

    await page.locator('[data-testid^="item-"]').first().click();
    await expect(page.getByText("Política de DLQ definida e documentada?")).toBeVisible();
  } finally {
    await page.request.put(`${API}/config/regras`, { data: { documento: original } });
  }
});
