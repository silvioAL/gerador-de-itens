import { test, expect } from "@playwright/test";
import { entrar } from "./auth";

const API = "http://localhost:4100";

/**
 * SPEC-39 — o ciclo do PDCA de ponta a ponta: cadência 1 (todo uso é
 * momento), derivar → gerar especificação pelo agente → feedback → e a
 * entrevista no retorno ao canvas. A cadência é config GLOBAL: restaurada no
 * finally pra não mudar o comportamento dos specs vizinhos.
 */
test("entrevista, geração pelo agente e feedback — o ciclo inteiro com cadência 1", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("gerador:jornada-vista", "1"));
  await page.route(
    (url) => url.pathname === "/ia/status",
    (rota) => rota.fulfill({ json: { modelosChat: [], embeddingInstalado: false, capacidades: {} } })
  );
  await entrar(page);

  const configurar = await page.request.put(`${API}/pdca/config`, {
    data: { cadenciaUsos: 1, cadenciaFeedback: 1 },
  });
  expect(configurar.status()).toBe(200);

  try {
    await page.getByRole("button", { name: "+ Fila Rabbit" }).click();
    await page.locator(".react-flow__node", { hasText: "Fila Rabbit" }).click();
    const painel = page.locator("aside");
    await painel.getByRole("textbox", { name: "Nome da fila" }).fill("proposta.aprovada.q");
    await painel.getByRole("checkbox", { name: "Durable" }).check();
    await painel.getByRole("combobox", { name: "Tipo de fila" }).selectOption("quorum");
    await painel.getByRole("spinbutton", { name: "TTL da mensagem (ms)" }).fill("60000");
    await painel.getByRole("combobox", { name: "Ack" }).selectOption("manual");

    await page.locator('[data-tour="derivar-button"]').click();
    await page.getByTestId("assistente-balao-secundaria").click(); // sem título

    // Geração pelo agente: M4 e M5 dispensados, M12 baixa.
    await page.getByTestId("balao-sem-ia").getByRole("button", { name: "Dispensar sugestão" }).click();
    await page.getByTestId("balao-sem-contexto").getByRole("button", { name: "Dispensar sugestão" }).click();
    const download = page.waitForEvent("download");
    await page.getByTestId("balao-gerar-acao").click();
    await download;

    // M13 — cadência de feedback 1: o balão pergunta o que faltou/sobrou, e o
    // texto chega no servidor (201).
    await expect(page.getByTestId("balao-feedback")).toBeVisible();
    await page.getByLabel("O que faltou ou sobrou").fill("faltou item de DLQ no checklist técnico");
    const gravado = page.waitForResponse((r) => r.url().includes("/pdca/feedback") && r.status() === 201);
    await page.getByTestId("balao-feedback-enviar").click();
    await gravado;

    // M11 — no retorno ao canvas, a entrevista do PDCA (cadência 1: o uso da
    // derivação já marcou o momento). Dev é owner: o chip abre a conversa de
    // configuração.
    await page.getByRole("button", { name: "Voltar ao canvas" }).click();
    await expect(page.getByTestId("assistente-balao")).toContainText("Sentiu falta");
    await page.getByTestId("assistente-balao-acao").click();
    await expect(page.getByTestId("assistente-janela")).toBeVisible();
  } finally {
    await page.request.put(`${API}/pdca/config`, { data: { cadenciaUsos: 5, cadenciaFeedback: 3 } });
  }
});
