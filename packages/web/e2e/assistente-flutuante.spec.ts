import { test, expect } from "@playwright/test";
import { entrar } from "./auth";

/**
 * #298 — o assistente flutuante: os dois overlays de "conversar com a
 * ferramenta" (desenhar conversando e contexto do épico) num único gatilho no
 * canto inferior direito.
 *
 * O que só o navegador prova aqui: que o gatilho existe na tela real (os
 * botões antigos saíram do header — se o assistente não abrir, as duas
 * features simplesmente sumiram do produto), e que o texto salvo numa aba
 * chega à outra passando pelo estado real do App.
 */
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("gerador:jornada-vista", "1"));
});

test("abre na conversa, e o contexto salvo numa aba pré-preenche a outra", async ({ page }) => {
  await entrar(page);

  const fab = page.getByTestId("assistente-flutuante");
  await expect(fab).toBeVisible();

  // Abrir cai na conversa — a ação primária.
  await fab.click();
  await expect(page.getByTestId("conversa-desenho")).toBeVisible();

  // Troca pra aba de contexto, escreve e salva. Salvar fecha a janela.
  const janela = page.getByTestId("assistente-janela");
  await janela.getByRole("button", { name: "📎 Contexto do épico" }).click();
  await janela.getByLabel("Contexto do épico (texto)").fill("migrar o faturamento para eventos");
  await janela.getByRole("button", { name: "Salvar" }).click();
  await expect(janela).toHaveCount(0);

  // Reabrir: a conversa começa com o contexto na caixa — é a integração que
  // justifica os dois morarem no mesmo lugar (o texto atravessa o App real,
  // quebra.demandInfo, não um estado interno do painel).
  await fab.click();
  await expect(page.getByLabel("Descreva a demanda")).toHaveValue("migrar o faturamento para eventos");

  // O próprio botão fecha (vira ×) — sem depender do × interno da janela.
  await fab.click();
  await expect(page.getByTestId("assistente-janela")).toHaveCount(0);
});

test("os botões antigos saíram do header — um caminho só, não três", async ({ page }) => {
  await entrar(page);

  // Se alguém devolver os botões ao header, este teste avisa que agora há
  // dois caminhos pra mesma coisa — a classe de defeito da §145/§148.
  await expect(page.locator("header").getByRole("button", { name: "✦ Desenhar conversando" })).toHaveCount(0);
  await expect(page.locator("header").getByRole("button", { name: "📎 Contexto do épico" })).toHaveCount(0);
});
