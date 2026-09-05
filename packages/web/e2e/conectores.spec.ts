import { test, expect } from "@playwright/test";
import { entrar } from "./auth";

const API = "http://localhost:4100";
const GATEWAY_FALSO = "http://localhost:4123";

/**
 * SPEC-105 fatias A+B — **a régua de aceite da SPEC inteira, no navegador.**
 *
 * Uma integração nova entra como UMA linha de configuração (um conector
 * apontando para um endpoint que o dublê já servia) e é executada pela tela,
 * com a saída lida pelos `caminho`s declarados. Nenhuma porta, nenhum
 * adaptador, nenhuma rota nova, nenhum endpoint novo no dublê — se qualquer
 * uma dessas peças tivesse sido necessária, a fatia A não teria terminado.
 */
test("cadastrar um conector pela tela e executá-lo — sem tocar em código", async ({ page }) => {
  test.setTimeout(90000);
  await page.addInitScript(() => localStorage.setItem("gerador:jornada-vista", "1"));
  await page.route(
    (url) => url.pathname === "/ia/status",
    (rota) => rota.fulfill({ json: { modelosChat: [], embeddingInstalado: false, capacidades: {} } })
  );
  await entrar(page);

  const configOriginal = (await (await page.request.get(`${API}/config/conectores`)).json()).documento;
  try {
    await page.goto("/#/config/conectores");
    await expect(page.getByTestId("conectores-tab")).toBeVisible();

    // Cadastro pela tela: id, endereço (o dublê já serve /documento-externo),
    // a entrada `link` e a saída `conteudo` lida por caminho.
    await page.getByTestId("adicionar-conector").click();
    await page.getByLabel("Identificador").fill("wiki-e2e");
    await page.getByLabel("Nome", { exact: true }).fill("Leitor da wiki (E2E)");
    await page.getByLabel("Endereço (endpoint)").fill(`${GATEWAY_FALSO}/v1/documento-externo`);

    const entrada = page.getByTestId("form-conector");
    await entrada.getByRole("button", { name: "+ campo" }).first().click();
    await page.getByLabel("Entrada — o que mandar — chave do campo 1").fill("link");
    await page.getByLabel("Entrada — o que mandar — rótulo do campo 1").fill("Link");
    await entrada.getByRole("checkbox").first().check();

    await entrada.getByRole("button", { name: "+ campo" }).nth(1).click();
    await page.getByLabel("Saída — como ler o que volta — chave do campo 1").fill("conteudo");
    await page.getByLabel("Saída — como ler o que volta — caminho do campo 1").fill("$.conteudo");

    await page.getByTestId("salvar-conector").click();
    await expect(page.getByTestId("conector-wiki-e2e")).toBeVisible();
    await expect(page.getByTestId("conector-wiki-e2e")).toContainText("cadastrado");

    // Executar (fatia B): a saída vem MAPEADA — o conteúdo que o dublê serve.
    await page.getByTestId("executar-wiki-e2e").click();
    await page.getByLabel("Link *").fill("https://wiki.invalido/pages/42");
    await page.getByTestId("rodar-wiki-e2e").click();

    await expect(page.getByTestId("saida-wiki-e2e")).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId("saida-wiki-e2e")).toContainText("conteudo");

    // §9.3 — sem o obrigatório, o erro diz o nome do campo; nada roda com default.
    await page.getByLabel("Link *").fill("");
    await page.getByTestId("rodar-wiki-e2e").click();
    await expect(page.getByTestId("erro-execucao-wiki-e2e")).toContainText("link");
  } finally {
    await page.request.put(`${API}/config/conectores`, { data: { documento: configOriginal } });
  }
});
