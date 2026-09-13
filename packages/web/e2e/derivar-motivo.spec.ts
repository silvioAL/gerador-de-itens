import { test, expect } from "@playwright/test";
import { entrar } from "./auth";

/**
 * SPEC-112 fatia B (M3/M4) — **o Derivar diz por que está morto, sem hover.**
 *
 * Medido na main antes desta fatia: o botão nascia `disabled` com o motivo só
 * no `title` do HTML (sem tooltip em toque; num botão desabilitado é fácil nem
 * tentar), e o remédio ("Próximo pendente") ficava numa faixa à parte, sem
 * ligação nenhuma com o botão morto. A prova lê o motivo pelo TEXTO da tela
 * (nunca por `title`/hover) e usa o botão ao lado para chegar ao nó.
 */
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("gerador:jornada-vista", "1"));
});

test("o motivo do Derivar desabilitado aparece no corpo da tela, e o botão ao lado leva ao nó", async ({ page }) => {
  await entrar(page);

  await page.getByRole("button", { name: "+ Fila Rabbit" }).click();
  await page.getByRole("button", { name: "+ Serviço", exact: true }).click();

  // D3 — a régua não mudou: dois nós vermelhos continuam travando o Derivar.
  const botaoDerivar = page.locator('[data-tour="derivar-button"]');
  await expect(botaoDerivar).toBeDisabled();

  // O motivo está no CORPO (texto lido sem hover nenhum), nomeando os DOIS
  // componentes — não só a contagem.
  const motivo = page.getByTestId("motivo-derivar-desabilitado");
  await expect(motivo).toContainText("2 componentes com campo obrigatório em branco");
  await expect(motivo).toContainText("Fila Rabbit");
  await expect(motivo).toContainText("Serviço");

  // O botão ao lado do motivo chega ao nó — cicla pelos vermelhos, um a cada
  // clique (o mesmo padrão do "Próximo pendente" da faixa de prontidão).
  const proximo = motivo.getByRole("button", { name: "▶ Próximo pendente" });
  await proximo.click();
  const painel = page.locator("aside");
  await expect(painel.locator("h2, strong").first()).toBeVisible();
  const primeiroSelecionado = await painel.textContent();

  await proximo.click();
  const segundoSelecionado = await painel.textContent();
  // Ciclou para o OUTRO vermelho — não ficou preso no mesmo nó.
  expect(segundoSelecionado).not.toBe(primeiroSelecionado);

  // Preenchendo os dois, o motivo some e o Derivar habilita — a régua continua
  // sendo a mesma de sempre (D3), só a comunicação mudou.
  const filaNode = page.locator(".react-flow__node", { hasText: "Fila Rabbit" });
  await filaNode.click();
  await painel.getByRole("textbox", { name: "Nome da fila" }).fill("motivo.e2e.q");
  await painel.getByRole("checkbox", { name: "Durable" }).check();
  await painel.getByRole("combobox", { name: "Tipo de fila" }).selectOption("quorum");
  await painel.getByRole("spinbutton", { name: "TTL da mensagem (ms)" }).fill("60000");
  await painel.getByRole("combobox", { name: "Ack" }).selectOption("manual");

  const servicoNode = page.locator(".react-flow__node", { hasText: "Serviço" }).first();
  await servicoNode.click();
  // "Nome do serviço" é o ÚNICO campo obrigatório do tipo (config/diagrama):
  // preenchê-lo já basta para o nó virar verde.
  await painel.getByRole("textbox", { name: "Nome do serviço" }).fill("servico-motivo-e2e");

  await expect(motivo).toHaveCount(0);
  await expect(botaoDerivar).toBeEnabled();
});
