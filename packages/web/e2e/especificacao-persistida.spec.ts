import { test, expect } from "@playwright/test";
import { entrar } from "./auth";

/**
 * §184 — a especificação gerada fica SALVA na quebra, e reabrir a demanda
 * reconhece isso: balão no canvas (M14) conduz à revisão, e o chat abre
 * sozinho com a fala adaptada (mesma mecânica do M1, outra fala).
 */
test("gerar salva a especificação na quebra; reabrir conduz à revisão com a fala de demanda já especificada", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("gerador:jornada-vista", "1"));
  // O contador de usos do PDCA é global do ambiente: quando a cadência bate,
  // o balão da ENTREVISTA tem prioridade e rouba o momento que este spec mede.
  // Neutralizar aqui é o que torna o teste sobre a especificação, não sobre
  // quantas vezes a suíte já derivou hoje.
  await page.route(
    (url) => url.pathname === "/pdca/uso",
    (rota) => rota.fulfill({ json: { contagem: 1, momento: false, ultimosItens: [] } })
  );
  await page.route(
    (url) => url.pathname === "/ia/status",
    (rota) => rota.fulfill({ json: { modelosChat: [], embeddingInstalado: false, capacidades: {} } })
  );
  await entrar(page);

  // Fila completa → derivar COM nome (pra quebra ficar salva).
  await page.getByRole("button", { name: "+ Fila Rabbit" }).click();
  await page.locator(".react-flow__node", { hasText: "Fila Rabbit" }).click();
  const painel = page.locator("aside");
  await painel.getByRole("textbox", { name: "Nome da fila" }).fill("proposta.aprovada.q");
  await painel.getByRole("checkbox", { name: "Durable" }).check();
  await painel.getByRole("combobox", { name: "Tipo de fila" }).selectOption("quorum");
  await painel.getByRole("spinbutton", { name: "TTL da mensagem (ms)" }).fill("60000");
  await painel.getByRole("combobox", { name: "Ack" }).selectOption("manual");

  const titulo = `Espec persistida ${Math.random().toString(36).slice(2, 7)}`;
  await page.locator('[data-tour="derivar-button"]').click();
  await page.getByLabel("ex.: Fatura mensal em lote").fill(titulo);
  await page.getByTestId("assistente-balao-confirmar").click();

  // Gera pelo agente (M4 e M5 dispensados) — o markdown vai pra quebra e o
  // auto-save grava a versão.
  await page.getByTestId("balao-sem-ia").getByRole("button", { name: "Dispensar sugestão" }).click();
  await page.getByTestId("balao-sem-contexto").getByRole("button", { name: "Dispensar sugestão" }).click();
  const download = page.waitForEvent("download");
  await page.getByTestId("balao-gerar-acao").click();
  await download;
  await page.getByRole("button", { name: "Voltar ao canvas" }).click();
  await expect(page.getByText(/· salva$/)).toBeVisible();

  // Recomeça do zero e REABRE a demanda: o material salvo volta inteiro.
  await page.getByRole("button", { name: "☰ Menu" }).click(); // SPEC-40: item do menu
  await page.getByRole("button", { name: "Nova quebra" }).click();
  await page.getByRole("button", { name: "☰ Menu" }).click(); // SPEC-40: item do menu
  await page.getByRole("button", { name: "Abrir…" }).click();
  await page.getByPlaceholder(/busca/i).or(page.getByRole("textbox")).first().fill(titulo);
  // exact: o balão da entrevista do PDCA (M11) pode citar o título nos últimos itens
  await page.getByText(titulo, { exact: true }).first().click();

  // M14 — o agente reconhece a demanda já especificada e conduz à revisão.
  const balao = page.getByTestId("assistente-balao");
  await expect(balao).toContainText("já tem a especificação de solução completa");
  await balao.getByTestId("assistente-balao-acao").click();

  // O chat da revisão abre SOZINHO com a fala adaptada (não a do M1).
  await expect(page.getByTestId("conversa-especificacao")).toBeVisible();
  await expect(page.getByTestId("conversa-especificacao")).toContainText(/já tem a especificação de solução completa/);
});
