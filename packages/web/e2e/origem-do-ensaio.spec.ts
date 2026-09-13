import { test, expect } from "@playwright/test";
import { entrar, entrarEmTimeProprio } from "./auth";

const API = "http://localhost:4100";

/**
 * SPEC-112 fatia E (R2) — **o laço do ensaio fecha de onde veio.**
 *
 * M2 (medido antes de escrever): chegar à bancada pelo chip "ensaiar" da mesa
 * e decidir (Avançar/Retornar) sempre devolvia ao CANVAS de fluxos — mesmo
 * para quem nunca tinha aberto um fluxo, só clicado o chip da mesa. A jornada
 * contínua quebrava bem no fechamento do laço.
 *
 * A origem viaja no HASH (`#/tela/<execucaoId>/mesa` ou `/canvas`), não em
 * estado do componente — é o que faz ela sobreviver ao F5 (R2).
 */
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("gerador:jornada-vista", "1"));
  await page.route(
    (url) => url.pathname === "/ia/status",
    (rota) => rota.fulfill({ json: { modelosChat: [], embeddingInstalado: false, capacidades: {} } })
  );
});

test("vindo da MESA (o chip 'ensaiar'), decidir volta para a mesa — e sobrevive ao F5", async ({ page }) => {
  test.setTimeout(150000);
  await entrar(page);

  // Um desenho com tempo declarado — sem número não há o que ensaiar (§305),
  // e a porta seria "ensaiar-falta", não "abrir-simulacao".
  await page.getByRole("button", { name: "+ Serviço", exact: true }).click();
  await page.getByRole("button", { name: "+ API Externa" }).click();
  const svc = page.locator(".react-flow__node", { hasText: "Serviço" }).first();
  const api = page.locator(".react-flow__node", { hasText: "API Externa" }).first();
  await svc.waitFor();
  await api.waitFor();
  const origem = svc.locator(".react-flow__handle-right.source");
  const destino = api.locator(".react-flow__handle-left.target");
  const caixaOrigem = await origem.boundingBox();
  const caixaDestino = await destino.boundingBox();
  if (!caixaOrigem || !caixaDestino) throw new Error("handle de conexão não encontrado no DOM");
  await page.mouse.move(caixaOrigem.x + caixaOrigem.width / 2, caixaOrigem.y + caixaOrigem.height / 2);
  await page.mouse.down();
  await page.mouse.move(caixaDestino.x + caixaDestino.width / 2, caixaDestino.y + caixaDestino.height / 2, { steps: 15 });
  await page.mouse.up();
  await api.click();
  await page.locator("aside").getByLabel(/Timeout/).first().fill("3000");

  await page.getByRole("button", { name: "Salvar" }).first().click();
  await page.getByLabel("ex.: Fatura mensal em lote").fill(`origem-mesa-e2e ${Date.now()}`);
  await page.getByTestId("assistente-balao-confirmar").click();
  await expect(page.getByTestId("titulo-da-quebra")).toBeVisible();

  // ── O gesto que nasce na MESA: o chip da leitura ──
  await page.getByTestId("leitura-resumo").click();
  await page.getByTestId("abrir-simulacao").click();
  await expect(page.getByTestId("tela-ensaios")).toBeVisible({ timeout: 30000 });

  // A origem está no ENDEREÇO — não é um detalhe de implementação: é o que
  // prova que ela sobrevive à recarga, a seguir.
  await expect(page).toHaveURL(/#\/tela\/[^/]+\/mesa$/);

  // ── F5 no meio do caminho: a origem PRECISA sobreviver (R2) ──
  await page.reload();
  await expect(page.getByTestId("tela-ensaios")).toBeVisible({ timeout: 30000 });
  await expect(page).toHaveURL(/#\/tela\/[^/]+\/mesa$/);

  // ── Decidir: Avançar volta para a MESA, não para o canvas de fluxos ──
  await page.getByTestId("tela-avancar").click();
  await expect(page.getByRole("button", { name: "+ Serviço", exact: true })).toBeVisible({ timeout: 30000 });
  await expect(page.getByTestId("fluxo-screen")).toHaveCount(0);
});

test("vindo do CANVAS de um fluxo, decidir volta para o canvas — não para a mesa", async ({ page }) => {
  test.setTimeout(150000);
  const timeId = await entrarEmTimeProprio(page, "origem-do-ensaio");

  // A demanda ATIVA do time: a fiação do ensaio lê por ela quando ninguém
  // manda `demandaId` explícito (o caminho que o botão "Executar" da tela usa).
  await page.request.post(`${API}/quebras`, {
    data: { titulo: `origem-canvas-e2e ${Date.now()}`, time: timeId, diagrama: { nodes: [], edges: [] } },
  });

  await page.goto("/#/fluxo/ensaio-de-cenarios");
  await expect(page.getByTestId("fluxo-screen")).toBeVisible();
  await page.getByTestId("executar-fluxo").click();

  // ── A porta no rastro do CANVAS — o gesto que a fatia C/D tornou comum ──
  await expect(page.getByTestId("aguardando-tela")).toBeVisible({ timeout: 30000 });
  await page.getByTestId("abrir-tela-do-stage").click();
  await expect(page.getByTestId("tela-ensaios")).toBeVisible({ timeout: 30000 });
  await expect(page).toHaveURL(/#\/tela\/[^/]+\/canvas$/);

  // ── F5: a origem sobrevive (R2) ──
  await page.reload();
  await expect(page.getByTestId("tela-ensaios")).toBeVisible({ timeout: 30000 });
  await expect(page).toHaveURL(/#\/tela\/[^/]+\/canvas$/);

  // ── Decidir: Avançar volta para o CANVAS do fluxo — não para a mesa ──
  await page.getByTestId("tela-avancar").click();
  await expect(page.getByTestId("fluxo-screen")).toBeVisible({ timeout: 30000 });
  await expect(page).toHaveURL(/#\/fluxo\/ensaio-de-cenarios/);
});
