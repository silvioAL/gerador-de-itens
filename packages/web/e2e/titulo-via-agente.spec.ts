import { test, expect } from "@playwright/test";
import { entrar } from "./auth";

/**
 * O campo "Título" do header morreu: o nome da demanda é mapeado SÓ pelo
 * agente (balão-pergunta). Este spec prova o segundo caminho da pergunta —
 * Salvar sem título não trava nem grava sem nome: pergunta, aplica e salva.
 */
test("Salvar sem título: o agente pergunta o nome, aplica e a quebra é salva — sem derivar nada", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("gerador:jornada-vista", "1"));
  await page.route(
    (url) => url.pathname === "/ia/status",
    (rota) => rota.fulfill({ json: { modelosChat: [], embeddingInstalado: false, capacidades: {} } })
  );
  await entrar(page);

  // O campo de digitar não existe mais em lugar nenhum.
  await expect(page.getByLabel("Título da quebra")).toHaveCount(0);

  await page.getByRole("button", { name: "+ Serviço", exact: true }).click();
  await page.getByRole("button", { name: "Salvar", exact: true }).click();

  const balao = page.getByTestId("assistente-balao");
  await expect(balao).toContainText("Pra salvar a quebra eu preciso de um nome");
  await page.getByLabel("ex.: Fatura mensal em lote").fill("Cadastro de clientes v2");
  await page.getByTestId("assistente-balao-confirmar").click();

  // Salvou (header diz "salva"), o título virou texto no header, e NENHUMA
  // revisão abriu — a intenção era salvar, não derivar.
  await expect(page.getByText(/· salva$/)).toBeVisible();
  await expect(page.getByTestId("titulo-da-quebra")).toHaveText("Cadastro de clientes v2");
  await expect(page.getByText("Revisão da quebra")).not.toBeVisible();
});
