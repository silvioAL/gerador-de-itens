import { test, expect } from "@playwright/test";
import { entrar } from "./auth";

const API = "http://localhost:4100";

/**
 * §213 — a CLASSE do bug do §210, varrida em vez de esperada.
 *
 * Lá, os itens escritos de uma demanda apareciam em outra porque a lista vivia
 * no estado do App e sobrevivia à troca. O mesmo risco existe para todo estado
 * que descreve a demanda ATUAL: a revisão derivada, a condução do assistente,
 * o contexto do épico. Este spec percorre a troca de demanda e cobra que nada
 * da anterior atravesse.
 */
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("gerador:jornada-vista", "1"));
  await page.route(
    (url) => url.pathname === "/ia/status",
    (rota) => rota.fulfill({ json: { modelosChat: [], embeddingInstalado: false, capacidades: {} } })
  );
});

test("§213 — o canvas mostra o diagrama da demanda ABERTA, não o da anterior", async ({ page }) => {
  test.setTimeout(90000);
  await entrar(page);

  const outra = `outra demanda ${Date.now()}`;
  expect(
    (
      await page.request.post(`${API}/quebras`, {
        data: { titulo: outra, time: "time-pagamentos", diagrama: { nodes: [], edges: [] } },
      })
    ).status()
  ).toBe(201);
  // A lista de "Abrir…" é carregada no boot: sem recarregar, a quebra criada
  // agora por API não aparece nela.
  await page.reload();

  // Demanda A: um cenário pronto, com nós no canvas.
  await page.getByTestId("abrir-cenarios").click();
  await page.getByRole("button", { name: "Carregar cenário: Dados não-relacionais" }).click();
  await expect(page.locator(".react-flow__node").first()).toBeVisible();
  expect(await page.locator(".react-flow__node").count()).toBeGreaterThan(0);

  await page.getByRole("button", { name: "☰ Menu" }).click();
  await page.getByRole("button", { name: "Abrir…" }).click();
  await page.getByPlaceholder("ex.: aprovação de crédito").fill(outra);
  await page.getByRole("button", { name: new RegExp(outra) }).click();

  // A demanda aberta está vazia: nenhum nó da anterior pode ficar no canvas.
  await expect(page.locator(".react-flow__node")).toHaveCount(0);
  await expect(page.getByTestId("titulo-da-quebra")).toContainText(outra);
});

test("§213 — o contexto do épico é o da demanda aberta, não o da anterior", async ({ page }) => {
  test.setTimeout(90000);
  await entrar(page);

  const contextoDeA = `contexto da primeira ${Date.now()}`;
  const outra = `demanda limpa ${Date.now()}`;
  expect(
    (
      await page.request.post(`${API}/quebras`, {
        data: { titulo: outra, time: "time-pagamentos", diagrama: { nodes: [], edges: [] } },
      })
    ).status()
  ).toBe(201);
  await page.reload();

  // Demanda A recebe um contexto de épico digitado à mão.
  await page.getByTestId("assistente-flutuante").click();
  const janela = page.getByTestId("assistente-janela");
  await janela.getByRole("button", { name: "📎 Contexto da demanda" }).click();
  await janela.getByLabel("Contexto da demanda (texto)").fill(contextoDeA);
  await janela.getByRole("button", { name: "Salvar" }).click();

  // Reabre o painel e o DEIXA aberto durante a troca: é aqui que o vazamento
  // pode acontecer — o campo é `useState(demandInfo)`, inicializado UMA vez;
  // se o painel não for desmontado ao abrir outra demanda, ele continua
  // exibindo (e salvando) o texto da anterior.
  await page.getByTestId("assistente-flutuante").click();
  await page.getByTestId("assistente-janela").getByRole("button", { name: "📎 Contexto da demanda" }).click();
  await expect(page.getByTestId("assistente-janela").getByLabel("Contexto da demanda (texto)")).toHaveValue(contextoDeA);

  await page.getByRole("button", { name: "☰ Menu" }).click();
  await page.getByRole("button", { name: "Abrir…" }).click();
  await page.getByPlaceholder("ex.: aprovação de crédito").fill(outra);
  await page.getByRole("button", { name: new RegExp(outra) }).click();
  await expect(page.getByRole("button", { name: "+ Serviço", exact: true })).toBeVisible();

  // Trocar de demanda FECHA o painel: o rascunho que estava nele era da
  // demanda anterior, e mantê-lo aberto significaria salvá-lo na nova.
  await expect(page.getByTestId("assistente-janela")).toHaveCount(0);

  // E, ao reabrir, o contexto é o da demanda ABERTA — vazio, no caso.
  await page.getByTestId("assistente-flutuante").click();
  await page.getByTestId("assistente-janela").getByRole("button", { name: "📎 Contexto da demanda" }).click();
  await expect(page.getByTestId("assistente-janela").getByLabel("Contexto da demanda (texto)")).toHaveValue("");
});
