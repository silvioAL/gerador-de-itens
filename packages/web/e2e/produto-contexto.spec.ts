import { test, expect } from "@playwright/test";
import { entrar } from "./auth";

const API = "http://localhost:4100";

/**
 * SPEC-53 Fase 1 — o produto existe, guarda contexto e a demanda aponta pra
 * ele. O que se prova aqui é a fundação: sem ela a Fase 2 (o contexto chegando
 * em quem escreve o item) não tem de onde ler.
 *
 * Produto é estado GLOBAL da organização: o teste apaga o que criou no
 * `finally`, mesma disciplina do §162.
 */
test("cadastrar produto com contexto e glossário, e ligar a demanda a ele", async ({ page }) => {
  test.setTimeout(60000);
  await page.addInitScript(() => localStorage.setItem("gerador:jornada-vista", "1"));
  await page.route(
    (url) => url.pathname === "/ia/status",
    (rota) => rota.fulfill({ json: { modelosChat: [], embeddingInstalado: false, capacidades: {} } })
  );
  await entrar(page);

  const nome = `Portabilidade e2e ${Date.now()}`;
  try {
    await page.getByRole("button", { name: "☰ Menu" }).click();
    await page.getByRole("button", { name: "Contexto do produto" }).click();

    await page.getByLabel("Nome do produto novo").fill(nome);
    await page.getByTestId("criar-produto").click();
    await expect(page.getByTestId("editor-do-produto")).toBeVisible();

    // As seções do contexto — o que vai junto com toda demanda deste produto.
    await page.getByLabel("O que é").fill("Levar a conta do cliente para outro banco.");
    await page.getByLabel("Restrições").fill("Resolução 4.753 do BACEN.");
    await page.getByTestId("salvar-produto").click();
    await expect(page.getByTestId("produto-salvo")).toBeVisible();

    // O glossário: a seção que faz o item deixar de ser genérico de negócio.
    await page.getByLabel("Termo", { exact: true }).fill("Fatura em aberto");
    await page.getByLabel("Definição").fill("A que venceu e não foi paga");
    await page.getByTestId("salvar-termo").click();
    await expect(page.getByTestId("termo-do-glossario")).toContainText("A que venceu e não foi paga");

    // Sobrevive ao F5 — é banco, não estado de tela.
    await page.reload();
    await expect(page.getByLabel("O que é")).toHaveValue("Levar a conta do cliente para outro banco.");

    // E a DEMANDA aponta pro produto, pelo painel de contexto do épico.
    // Cenário pronto primeiro: carregar cenário troca a quebra inteira, então
    // escolher o produto antes seria escolher para uma demanda que morre em
    // seguida — e o botão de derivar só liga com os campos preenchidos.
    await page.getByRole("button", { name: "☰ Menu" }).click();
    await page.getByRole("button", { name: "Nova quebra" }).click();
    await page.getByTestId("abrir-cenarios").click();
    await page.getByRole("button", { name: "Carregar cenário: Dados não-relacionais" }).click();
    await page.getByTestId("assistente-flutuante").click();
    const janela = page.getByTestId("assistente-janela");
    await janela.getByRole("button", { name: "📎 Contexto do épico" }).click();
    await janela.getByLabel("Produto desta demanda").selectOption({ label: nome });
    await janela.getByRole("button", { name: "Salvar" }).click();

    // O vínculo atravessa a persistência — o campo que morria na borda (SPEC-31).
    const salva = page.waitForResponse((r) => r.url().includes("/quebras") && r.request().method() === "POST");
    await page.locator('[data-tour="derivar-button"]').click();
    await page.getByLabel("ex.: Fatura mensal em lote").fill(`demanda com produto ${Date.now()}`);
    await page.getByTestId("assistente-balao-confirmar").click();
    const corpo = await (await salva).json();
    expect(corpo.produtoId).toBeTruthy();
  } finally {
    const produtos = (await (await page.request.get(`${API}/produtos`)).json()) as { id: string; nome: string }[];
    for (const p of produtos.filter((p) => p.nome === nome)) {
      await page.request.delete(`${API}/produtos/${p.id}`);
    }
  }
});
