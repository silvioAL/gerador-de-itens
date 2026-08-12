import { test, expect, type Page } from "@playwright/test";
import { entrar } from "./auth";

/** O client fala com a API direto (VITE_API_URL) — request relativo bateria no Vite (404). */
const API = "http://localhost:4100";

/**
 * SPEC-38 Fase 1 — níveis de participação, de ponta a ponta contra o servidor
 * de verdade: o owner monta o time pela API (mesma sessão do browser), o
 * `visualizar` entra e a tela NÃO oferece escrita — e o servidor nega mesmo
 * que a UI falhe (o teste força o 403 via request direto).
 */

/** Login de quem tem UM time só — não passa pela EscolherTimeScreen (o App
 * usa o único time direto), então o `entrar()` compartilhado não serve. */
async function entrarComTimeUnico(page: Page, email: string) {
  await page.goto("/");
  await page.getByRole("button", { name: "Entrar" }).first().click();
  await page.getByPlaceholder("voce@empresa.com").fill(email);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByRole("button", { name: "+ Serviço", exact: true })).toBeVisible({ timeout: 10000 });
}

test("visualizar lê a quebra mas não vê o Salvar; o servidor nega a escrita por trás", async ({ page, browser }) => {
  await page.addInitScript(() => localStorage.setItem("gerador:jornada-vista", "1"));
  await entrar(page);

  // O owner monta o cenário pela API: time novo (o criador nasce owner) e um
  // membro `visualizar`. Sufixo aleatório porque o banco E2E é descartável
  // entre rodadas, mas não entre re-execuções da mesma stack.
  const timeId = "time-e2e-niveis"; // fixo e idempotente: um time novo POR RODADA fazia a lista da EscolherTimeScreen crescer até empurrar o time do seed pra fora do viewport (flake real medido)
  const viewer = `viewer-${Math.random().toString(36).slice(2, 8)}@gerador.local`;
  const criar = await page.request.post(`${API}/times`, { data: { timeId } });
  expect([201, 409]).toContain(criar.status()); // 409 = rodada anterior na mesma stack já criou; o dev segue owner
  const adicionar = await page.request.post(`${API}/times/${timeId}/membros`, {
    data: { email: viewer, nivel: "visualizar" },
  });
  expect(adicionar.status()).toBe(201);

  // O visualizar entra numa sessão própria (contexto de browser separado).
  const contexto = await browser.newContext();
  const paginaViewer = await contexto.newPage();
  await paginaViewer.addInitScript(() => localStorage.setItem("gerador:jornada-vista", "1"));
  await entrarComTimeUnico(paginaViewer, viewer);

  // A UI não oferece o que seria 403: sem botão Salvar. Os vizinhos (Abrir…)
  // continuam lá — é esconder a escrita, não mutilar o header.
  // "Abrir…" mudou pro menu (SPEC-40) — segue lá pro viewer; Salvar não.
  await paginaViewer.getByRole("button", { name: "☰ Menu" }).click();
  await expect(paginaViewer.getByRole("button", { name: "Abrir…" })).toBeVisible();
  await paginaViewer.getByRole("button", { name: "Fechar menu" }).click();
  await expect(paginaViewer.getByRole("button", { name: "Salvar", exact: true })).not.toBeVisible();

  // E mesmo que a UI falhasse, o servidor nega: escrita direta é 403 com o
  // nível exigido no corpo.
  const negado = await paginaViewer.request.post(`${API}/quebras`, {
    data: { time: timeId, diagrama: { nodes: [], edges: [] } },
  });
  expect(negado.status()).toBe(403);
  expect((await negado.json()).nivelExigido).toBe("operar");

  // O owner segue vendo o Salvar — o gate é por nível, não uma regressão geral.
  await expect(page.getByRole("button", { name: "Salvar", exact: true })).toBeVisible();

  await contexto.close();
});

test("aba Membros mostra e edita níveis, e a mudança persiste no servidor", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("gerador:jornada-vista", "1"));
  await entrar(page);

  const timeId = "time-e2e-teto";
  const operador = `oper-${Math.random().toString(36).slice(2, 8)}@gerador.local`;
  expect([201, 409]).toContain((await page.request.post(`${API}/times`, { data: { timeId } })).status());
  expect(
    (await page.request.post(`${API}/times/${timeId}/membros`, { data: { email: operador, nivel: "operar" } })).status()
  ).toBe(201);

  // O POST /times reemitiu a sessão com o time novo, mas o app carregou antes:
  // o reload traz o /auth/me atualizado e o time aparece no seletor do header.
  await page.reload();
  // O seletor de time mora no MENU (SPEC-40); trocar o time recarrega o app
  // (key={timeAtivo}) e o menu fecha junto — reabre pra navegar.
  await page.getByRole("button", { name: "☰ Menu" }).click();
  await page.getByLabel("Time (stack conhecida)").selectOption(timeId);
  await page.getByRole("button", { name: "☰ Menu" }).click();
  await page.getByRole("button", { name: /Membros/ }).click();

  await expect(page.getByText(operador)).toBeVisible();
  await expect(page.getByLabel(`Nível de ${operador}`)).toHaveValue("operar");

  // Owner promove pelo select; recarregar a aba prova que foi pro servidor,
  // não só pro estado local.
  await page.getByLabel(`Nível de ${operador}`).selectOption("owner");
  await page.getByRole("button", { name: "Voltar ao canvas" }).click();
  await page.getByRole("button", { name: "☰ Menu" }).click();
  await page.getByRole("button", { name: /Membros/ }).click();
  await expect(page.getByLabel(`Nível de ${operador}`)).toHaveValue("owner");
});
