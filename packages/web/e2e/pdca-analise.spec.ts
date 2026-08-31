import { test, expect } from "@playwright/test";
import { entrar } from "./auth";

const API = "http://localhost:4100";

/**
 * SPEC-94 fatia Z (§343) — **o ciclo de configuração, medido, contra a stack.**
 *
 * O usuário: *"não é PDCA sem análise crítica muito bem estruturada"* e *"o da
 * configuração faz parte, precisamos de métricas dele"*.
 *
 * A SPEC-94 §3 mediu que o ciclo do produto é `sentir → texto → aprovar →
 * aplicar`, com gatilho de uso individual: Plan, Do e Act, sem a etapa de
 * análise. Este spec prova o que só o navegador prova — que o painel existe, lê
 * o dado real do banco e **reage ao que acontece no ciclo**.
 *
 * ## Por que ele não fabrica o dado no front
 *
 * O cálculo é do engine e tem suíte própria com data fixa. O que falta provar é
 * a **cadeia inteira**: gravar pelo mesmo caminho do agente (`POST
 * /pdca/feedback`), o servidor agregar, e a tela mostrar. Um spec que injetasse
 * a resposta pela rede testaria o componente de novo, e não a cadeia.
 */

async function abrirPdca(page: import("@playwright/test").Page) {
  await page.getByRole("button", { name: "☰ Menu" }).click();
  await page.getByRole("button", { name: /PDCA/ }).click();
  await expect(page.getByTestId("analise-do-ciclo")).toBeVisible({ timeout: 10000 });
}

test("o painel da análise lê o ciclo de verdade, e responde ao que entra nele", async ({ page }) => {
  test.setTimeout(60000);
  await page.addInitScript(() => localStorage.setItem("gerador:jornada-vista", "1"));
  await page.route(
    (url) => url.pathname === "/ia/status",
    (rota) => rota.fulfill({ json: { modelosChat: [], embeddingInstalado: false, capacidades: {} } }),
  );
  await entrar(page);

  const marca = `analise e2e ${Date.now()}`;

  // O feedback entra pelo MESMO caminho do agente (M13) — não por um atalho de
  // teste. É o que faz este spec medir a cadeia, e não o componente.
  const criado = await page.request.post(`${API}/pdca/feedback`, { data: { texto: marca } });
  expect(criado.ok()).toBeTruthy();

  await abrirPdca(page);

  /**
   * Com feedback gravado, o painel **não** pode dizer que não há o que medir. É
   * a asserção mais importante daqui: ela liga a tela ao banco.
   */
  await expect(page.getByTestId("analise-sem-dado")).toHaveCount(0);
  await expect(page.getByTestId("medida-conversao")).toBeVisible();

  /**
   * **A régua de honestidade da fatia:** `null` vira "ainda não há", nunca `0%`.
   *
   * Num ciclo sem nenhuma decisão tomada, "0% de invalidação" leria como *"está
   * tudo ótimo"* sobre um conjunto onde ninguém decidiu nada. O teste aceita as
   * duas leituras possíveis — pode haver decisões de outros specs no mesmo
   * banco —, e recusa a terceira: um percentual afirmado sobre o vazio.
   */
  const invalidacao = page.getByTestId("medida-invalidacao");
  await expect(invalidacao).toBeVisible();
  const texto = (await invalidacao.textContent()) ?? "";
  expect(texto, `a medida de invalidação diz "${texto}"`).toMatch(/ainda não há|\d+%/);
});

test("uma solicitação pendente aparece na fila da análise", async ({ page }) => {
  /**
   * O que o painel mostra e a lista abaixo dele não mostram: **o conjunto**. A
   * fila é a primeira pergunta de uma análise crítica — o que está parado, e há
   * quanto tempo.
   */
  test.setTimeout(60000);
  await page.addInitScript(() => localStorage.setItem("gerador:jornada-vista", "1"));
  await page.route(
    (url) => url.pathname === "/ia/status",
    (rota) => rota.fulfill({ json: { modelosChat: [], embeddingInstalado: false, capacidades: {} } }),
  );
  await entrar(page);

  const marca = `pendente e2e ${Date.now()}`;
  const criada = await page.request.post(`${API}/ajustes`, {
    data: { recurso: "regras", descricao: marca },
  });
  expect(criada.ok()).toBeTruthy();

  await abrirPdca(page);

  // A fila conta pelo menos o que acabamos de criar. Número exato seria frágil:
  // a suíte roda em paralelo contra o mesmo banco, e outros specs criam pedidos.
  const pendentes = page.getByTestId("medida-pendentes");
  await expect(pendentes).toBeVisible();
  const valor = (await pendentes.textContent()) ?? "";
  expect(valor, `a fila diz "${valor}"`).not.toMatch(/nenhuma/);

  /**
   * E a concentração por recurso: é a promessa dos cinco times do `CONCEITO.md`
   * — *"se cinco times violam o mesmo padrão, o padrão está errado"* — que a
   * SPEC-94 §2.3 mediu como ganho sem mecanismo. Aqui ela é uma lista.
   */
  await expect(page.getByTestId("concentracao-por-recurso")).toBeVisible();
  await expect(page.getByTestId("recurso-regras")).toBeVisible();
});

test("a análise vem ANTES das listas — o conjunto antes dos itens", async ({ page }) => {
  /**
   * A ordem é argumento, e é o §3 da SPEC-94 virado pixel: as seções abaixo
   * mostram os itens um a um (o material da decisão); esta mostra o que só se vê
   * no conjunto. Uma análise que começa pelo primeiro card da lista é
   * exatamente a que a SPEC descreve como inexistente.
   *
   * Asserção por **coordenada**, e não por presença: as duas estão na página de
   * qualquer jeito, e o que se quer provar é a ordem.
   */
  test.setTimeout(60000);
  await page.addInitScript(() => localStorage.setItem("gerador:jornada-vista", "1"));
  await page.route(
    (url) => url.pathname === "/ia/status",
    (rota) => rota.fulfill({ json: { modelosChat: [], embeddingInstalado: false, capacidades: {} } }),
  );
  await entrar(page);
  await abrirPdca(page);

  const analise = await page.getByTestId("analise-do-ciclo").boundingBox();
  const feedbacks = await page.getByTestId("feedbacks-do-ciclo").boundingBox();

  expect(analise, "o painel da análise não renderizou").not.toBeNull();
  expect(feedbacks, "a lista de feedbacks não renderizou").not.toBeNull();
  expect(analise!.y, "a análise ficou depois das listas").toBeLessThan(feedbacks!.y);
});
