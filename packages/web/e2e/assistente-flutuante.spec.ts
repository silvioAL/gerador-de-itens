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
  await janela.getByRole("button", { name: "📎 Contexto da demanda" }).click();
  await janela.getByLabel("Contexto da demanda (texto)").fill("migrar o faturamento para eventos");
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

test("dentro de Configurações o bubble flutua sobre a tela e abre direto no ⚙ Configurar", async ({ page }) => {
  await entrar(page);

  await page.getByRole("button", { name: "☰ Menu" }).click();
  await page.getByRole("button", { name: "Membros" }).click(); // SPEC-40: tela específica
  // O mesmo bubble, sobreposto à tela cheia — não some atrás dela.
  const fab = page.getByTestId("assistente-flutuante");
  await expect(fab).toBeVisible();

  // Abrir aqui cai no contexto de quem está configurando, não na conversa de desenho.
  await fab.click();
  const janela = page.getByTestId("assistente-janela");
  await expect(janela).toBeVisible();
  await expect(janela.getByRole("button", { name: "⚙ Configurar" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("configurar-conversa")).toBeVisible();
});

test("os botões antigos saíram do header — um caminho só, não três", async ({ page }) => {
  await entrar(page);

  // Se alguém devolver os botões ao header, este teste avisa que agora há
  // dois caminhos pra mesma coisa — a classe de defeito da §145/§148.
  await expect(page.locator("header").getByRole("button", { name: "✦ Desenhar conversando" })).toHaveCount(0);
  await expect(page.locator("header").getByRole("button", { name: "📎 Contexto da demanda" })).toHaveCount(0);
});

/**
 * §308 — RELATO REAL, com captura: *"aqui cortou parte do texto da
 * configuração"*. A aba aparecia como "⚙ Configura", sem o "r".
 *
 * Medido antes de mexer: a fileira do cabeçalho tem **418 px** e as três abas
 * mais o × precisam de **471**. Com `nowrap` dentro de uma janela
 * `overflow: hidden`, a terceira sumia pela borda — e já era assim antes de
 * "Contexto do épico" virar "Contexto da demanda" (§306); o rótulo novo, ~7 px
 * mais largo, só piorou um corte que já existia.
 *
 * ## Por que a régua é de LARGURA
 *
 * O botão continua no DOM e continua "visível" para o CSS — ele só está fora da
 * moldura. `toBeVisible()` passaria dos dois lados, como no §302. O que prova o
 * conserto é a geometria: nenhuma aba pode terminar depois da borda da janela.
 */
test("§308 — nenhuma aba do assistente é cortada pela borda da janela", async ({ page }) => {
  test.setTimeout(90000);
  await page.addInitScript(() => localStorage.setItem("gerador:jornada-vista", "1"));
  await page.route(
    (url) => url.pathname === "/ia/status",
    (rota) => rota.fulfill({ json: { modelosChat: [], embeddingInstalado: false, capacidades: {} } })
  );
  await entrar(page);

  await page.getByTestId("assistente-flutuante").click();
  await page.getByTestId("assistente-janela").waitFor();

  const medida = await page.evaluate(() => {
    const janela = document.querySelector('[data-testid="assistente-janela"]')!;
    const moldura = janela.getBoundingClientRect();
    const abas = [...janela.querySelectorAll("button")]
      .filter((b) => /Desenhar|Contexto|Configurar/.test(b.textContent ?? ""))
      .map((b) => ({ texto: (b.textContent ?? "").trim(), direita: b.getBoundingClientRect().right }));
    return { limite: moldura.right, abas };
  });

  expect(medida.abas).toHaveLength(3);
  for (const aba of medida.abas) {
    // Meio pixel de folga para o arredondamento do layout — a régua é sobre
    // vazar da moldura, não sobre precisão sub-pixel.
    expect(aba.direita, `a aba "${aba.texto}" vaza da janela`).toBeLessThanOrEqual(medida.limite + 0.5);
  }

  // E o texto chega inteiro: "Configura" truncado era exatamente o relato.
  await expect(page.getByRole("button", { name: "⚙ Configurar", exact: true })).toBeVisible();
});
