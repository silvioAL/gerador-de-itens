import { test, expect } from "@playwright/test";
import { entrar } from "./auth";
import { derivarNaMesa } from "./derivar";

const API = "http://localhost:4100";

/**
 * SPEC-53 Fase 2 — o contexto do produto CHEGA em quem escreve o item.
 *
 * A Fase 1 só criou onde guardar; é aqui que ela deixa de repetir o defeito do
 * §21 (um `produto` que ninguém lia). A prova usa a simulação da esteira, que
 * mostra o prompt REAL que sairia — sem gastar chamada de modelo.
 */
test("o contexto do produto entra no prompt da esteira, separado do contexto da demanda", async ({ page }) => {
  test.setTimeout(60000);
  await page.addInitScript(() => localStorage.setItem("gerador:jornada-vista", "1"));
  await page.route(
    (url) => url.pathname === "/ia/status",
    (rota) => rota.fulfill({ json: { modelosChat: [], embeddingInstalado: false, capacidades: {} } })
  );
  await entrar(page);

  const nome = `Produto no prompt ${Date.now()}`;
  const termo = `Fatura em aberto ${Date.now()}`;
  let produtoId = "";
  try {
    // Cenário montado pela API: o que se testa aqui é o PROMPT, não o cadastro
    // (esse é o `produto-contexto.spec.ts`).
    const criado = await page.request.post(`${API}/produtos`, { data: { nome } });
    expect(criado.status()).toBe(201);
    produtoId = (await criado.json()).id;
    await page.request.put(`${API}/produtos/${produtoId}`, {
      data: { objetivo: "Cobrar o que foi consumido no mês." },
    });
    await page.request.post(`${API}/produtos/${produtoId}/glossario`, {
      data: { termo, definicao: "a que venceu e não foi paga" },
    });

    await page.reload();
    await page.getByTestId("abrir-cenarios").click();
    await page.getByRole("button", { name: "Carregar cenário: Dados não-relacionais" }).click();

    // A demanda aponta pro produto E tem contexto próprio: é a separação dos
    // dois no prompt que este teste existe pra provar.
    await page.getByTestId("assistente-flutuante").click();
    const janela = page.getByTestId("assistente-janela");
    await janela.getByRole("button", { name: "📎 Contexto do épico" }).click();
    await janela.getByLabel("Produto desta demanda").selectOption({ label: nome });
    await janela.getByLabel("Contexto do épico (texto)").fill("Nesta entrega, só o fechamento mensal.");
    await janela.getByRole("button", { name: "Salvar" }).click();

    await derivarNaMesa(page);
    await page.getByTestId("assistente-balao-secundaria").click(); // sem título

    await page.getByTestId("abrir-simulacao").click();
    const prompt = page.getByTestId("simulacao-prompt-0");
    await expect(prompt).toBeVisible();

    // O que o modelo vai receber: os dois contextos, com rótulos que dizem
    // qual vale sempre e qual vale só desta vez.
    await expect(prompt).toContainText("Contexto do PRODUTO");
    await expect(prompt).toContainText(termo);
    await expect(prompt).toContainText("Cobrar o que foi consumido no mês.");
    await expect(prompt).toContainText("Contexto desta demanda");
    await expect(prompt).toContainText("Nesta entrega, só o fechamento mensal.");

    // E na ORDEM certa — o geral orienta a leitura do específico.
    const texto = (await prompt.textContent()) ?? "";
    expect(texto.indexOf("Contexto do PRODUTO")).toBeLessThan(texto.indexOf("Contexto desta demanda"));
  } finally {
    // §262 — varrer por PREFIXO, e não só o id desta rodada. O nome carrega
    // `Date.now()`: uma execução interrompida antes daqui deixa uma linha que
    // nenhuma execução seguinte apaga, e produto é estado GLOBAL — o resíduo
    // vira o primeiro item da lista de outro teste. Foi assim que o flake do
    // `produto-contexto` nasceu.
    const produtos = (await (await page.request.get(`${API}/produtos`)).json()) as { id: string; nome: string }[];
    for (const p of produtos.filter((p) => p.nome.startsWith("Produto no prompt "))) {
      await page.request.delete(`${API}/produtos/${p.id}`);
    }
  }
});
