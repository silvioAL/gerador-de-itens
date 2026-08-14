import { test, expect } from "@playwright/test";
import { entrar } from "./auth";

const API = "http://localhost:4100";

/**
 * §214 — a mesma varredura do §213, nas outras trocas de contexto que a
 * ferramenta tem: o PRODUTO da demanda e a PESSOA na sessão.
 *
 * A classe de defeito é sempre a mesma: um estado que descreve "o que estou
 * vendo agora" e sobrevive à troca. Nos itens escritos (§210) e no rascunho do
 * assistente (§213) ele existia; aqui a pergunta é se existe também quando o
 * que muda é o produto ou quem está logado — e neste segundo caso o vazamento
 * não seria só confuso, seria material de uma pessoa aparecendo para outra.
 */
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("gerador:jornada-vista", "1"));
  await page.route(
    (url) => url.pathname === "/ia/status",
    (rota) => rota.fulfill({ json: { modelosChat: [], embeddingInstalado: false, capacidades: {} } })
  );
});

test("§214 — trocar o produto da demanda troca o contexto que vai no prompt", async ({ page }) => {
  test.setTimeout(90000);
  await entrar(page);

  const nomeA = `Produto A ${Date.now()}`;
  const nomeB = `Produto B ${Date.now()}`;
  const termoA = `termo exclusivo de A ${Date.now()}`;
  const termoB = `termo exclusivo de B ${Date.now()}`;
  const ids: string[] = [];
  try {
    for (const [nome, termo] of [
      [nomeA, termoA],
      [nomeB, termoB],
    ]) {
      const criado = await page.request.post(`${API}/produtos`, { data: { nome } });
      expect(criado.status()).toBe(201);
      const { id } = await criado.json();
      ids.push(id);
      await page.request.post(`${API}/produtos/${id}/glossario`, { data: { termo, definicao: "definição" } });
    }
    await page.reload();

    await page.getByTestId("abrir-cenarios").click();
    await page.getByRole("button", { name: "Carregar cenário: Dados não-relacionais" }).click();

    const escolherProduto = async (nome: string) => {
      await page.getByTestId("assistente-flutuante").click();
      const janela = page.getByTestId("assistente-janela");
      await janela.getByRole("button", { name: "📎 Contexto do épico" }).click();
      await janela.getByLabel("Produto desta demanda").selectOption({ label: nome });
      await janela.getByRole("button", { name: "Salvar" }).click();
    };

    await escolherProduto(nomeA);
    await page.locator('[data-tour="derivar-button"]').click();
    await page.getByTestId("assistente-balao-secundaria").click(); // sem título

    await page.getByTestId("abrir-simulacao").click();
    await expect(page.getByTestId("simulacao-prompt-0")).toContainText(termoA);
    await page.getByRole("button", { name: "Fechar" }).first().click();

    // Troca para o produto B: o prompt tem que acompanhar. Um contexto que
    // fica "pregado" seria o defeito do §210 na camada que mais importa — o
    // que o modelo lê para escrever o item.
    await page.getByRole("button", { name: "Voltar ao canvas" }).click();
    await escolherProduto(nomeB);
    await page.locator('[data-tour="derivar-button"]').click();
    await page.getByTestId("assistente-balao-secundaria").click();

    await page.getByTestId("abrir-simulacao").click();
    const prompt = page.getByTestId("simulacao-prompt-0");
    await expect(prompt).toContainText(termoB);
    await expect(prompt).not.toContainText(termoA);
  } finally {
    for (const id of ids) await page.request.delete(`${API}/produtos/${id}`);
  }
});

test("§214 — sair e entrar com outra pessoa não deixa a demanda da anterior na tela", async ({ page }) => {
  test.setTimeout(90000);
  await entrar(page);

  // Alguém trabalha: cenário no canvas e contexto do épico escrito.
  const contexto = `rascunho de quem estava antes ${Date.now()}`;
  await page.getByTestId("abrir-cenarios").click();
  await page.getByRole("button", { name: "Carregar cenário: Dados não-relacionais" }).click();
  await expect(page.locator(".react-flow__node").first()).toBeVisible();

  await page.getByTestId("assistente-flutuante").click();
  const janela = page.getByTestId("assistente-janela");
  await janela.getByRole("button", { name: "📎 Contexto do épico" }).click();
  await janela.getByLabel("Contexto do épico (texto)").fill(contexto);
  await janela.getByRole("button", { name: "Salvar" }).click();

  // Sai e entra como OUTRA pessoa, no mesmo navegador.
  await page.getByRole("button", { name: "☰ Menu" }).click();
  await page.getByRole("button", { name: "Sair" }).click();
  await entrar(page, "time-pagamentos", "outro@gerador.local");

  // Nada da sessão anterior pode estar na tela: nem o desenho, nem o rascunho.
  // Aqui o vazamento não seria só confuso — seria material de uma pessoa
  // aparecendo para outra.
  await expect(page.locator(".react-flow__node")).toHaveCount(0);
  await page.getByTestId("assistente-flutuante").click();
  await page.getByTestId("assistente-janela").getByRole("button", { name: "📎 Contexto do épico" }).click();
  await expect(page.getByTestId("assistente-janela").getByLabel("Contexto do épico (texto)")).toHaveValue("");
});
