import { test, expect } from "@playwright/test";
import { entrar } from "./auth";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("gerador:jornada-vista", "1"));
});

test("resumo de prontidão: popover abre ao clicar (não só hover), mostra o que falta, e Próximo pendente navega entre nós vermelhos", async ({
  page,
}) => {
  await entrar(page);

  await page.getByRole("button", { name: "+ Serviço" }).click();
  await page.getByRole("button", { name: "+ Fila Rabbit" }).click();

  // Os dois nós recém-criados são vermelhos (campos obrigatórios em aberto).
  const badgeVermelho = page.getByRole("button", { name: /vermelho/i });
  await expect(badgeVermelho).toBeVisible();
  await expect(page.getByText("Nome do serviço")).not.toBeVisible();

  await badgeVermelho.click();
  await expect(page.getByText("Nome do serviço")).toBeVisible();

  // Clicar fora (no título do header) fecha o popover sem selecionar nada.
  await page.getByText("Gerador de Itens").click();
  await expect(page.getByText("Nome do serviço")).not.toBeVisible();

  // "Próximo pendente" seleciona o primeiro nó vermelho e abre o painel dele.
  const botaoProximo = page.getByRole("button", { name: /Próximo pendente \(2\)/ });
  await botaoProximo.click();
  const painel = page.locator("aside");
  await expect(painel.getByText("vermelho")).toBeVisible();

  // Clicar de novo avança para o outro nó pendente (painel muda de tipo).
  const tipoAntes = await painel.locator("h2").first().textContent();
  await botaoProximo.click();
  const tipoDepois = await painel.locator("h2").first().textContent();
  expect(tipoDepois).not.toBe(tipoAntes);
});
