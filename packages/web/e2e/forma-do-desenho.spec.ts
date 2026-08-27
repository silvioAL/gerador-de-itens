import { test, expect } from "@playwright/test";
import { entrarEmTimeProprio } from "./auth";

const API = "http://localhost:4100";


/**
 * SPEC-63 — a régua sobre a FORMA do desenho, do ciclo inteiro.
 *
 * O que só o navegador prova: a régua criada **pela tela** chega ao documento
 * de regras do deploy, o motor a aplica sobre um desenho de verdade, ela acusa
 * no placar, e a exceção com motivo a silencia sem apagá-la.
 *
 * ## Sobre mexer em config de regras
 *
 * O §281 custou três specs vizinhos ensinando que config global em suíte
 * paralela é estado compartilhado. O §299 tentou remendar restaurando item a
 * item no `finally`, e ainda assim a CI travou PRs.
 *
 * §303 — o remédio deixou de ser um `finally`: este spec entra num time SÓ
 * DELE. O documento de regras é por time, ninguém mais grava neste, e não há
 * o que restaurar. Por isso não existe mais `try/finally` aqui — a ausência é
 * a correção.
 */
test("§287 — a régua de forma nasce na tela, acusa o desenho e a exceção a silencia", async ({ page }) => {
  test.setTimeout(120000);
  await page.addInitScript(() => localStorage.setItem("gerador:jornada-vista", "1"));
  await page.route(
    (url) => url.pathname === "/ia/status",
    (rota) => rota.fulfill({ json: { modelosChat: [], embeddingInstalado: false, capacidades: {} } })
  );
  // §303 — time próprio: a régua gravada aqui não pisa na de vizinho nenhum.
  const TIME = await entrarEmTimeProprio(page, "forma");

  // ── A régua nasce pela TELA, não por JSON (fatia D) ──
  await page.goto("/#/config/regras");
  await page.getByTestId("secao-forma").click();
  await expect(page.getByTestId("forma-vazia")).toBeVisible();

  await page.getByLabel("Texto da régua de forma").fill("Toda fila tem consumidor");
  await page
    .getByLabel("Por que esta régua existe")
    .fill("fila sem quem consuma acumula em silêncio até estourar o disco");
  await page.getByLabel("Componente da régua").selectOption({ label: "Fila Rabbit" });
  // A frase que a pessoa vai ler no placar, montada antes de gravar.
  await expect(page.getByTestId("forma-previa")).toContainText("Todo Fila Rabbit precisa de uma conexão");
  await page.getByTestId("adicionar-forma").click();

  await expect(page.getByTestId("forma-regra-forma-toda-fila-tem-consumidor")).toBeVisible();
  // Chegou ao documento de regras do deploy — não só ao estado da tela. Com o
  // `timeId`: sem ele a leitura cairia no documento GLOBAL, que a tela não
  // escreve mais, e o teste ficaria verde ou vermelho por um motivo alheio.
  await expect
    .poll(async () => {
      const doc = await (await page.request.get(`${API}/config/regras?timeId=${TIME}`)).json();
      return (doc.documento?.topologia ?? []).length;
    }, { timeout: 10000 })
    .toBe(1);

  // ── O motor aplica sobre um desenho de verdade (fatias A e B) ──
  await page.getByRole("button", { name: /Voltar à mesa de projeto/ }).click();
  await page.getByRole("button", { name: "+ Fila Rabbit" }).click();

  const chip = page.getByTestId("conformidade-resumo");
  await expect(chip).toContainText("fora do padrão");
  await chip.click();
  const lista = page.getByTestId("conformidade-lista");
  await expect(lista).toContainText("Toda fila tem consumidor");
  // §242 — o porquê é o que separa ensinar de cobrar.
  await expect(lista).toContainText("acumula em silêncio");

  // ── A válvula: aceitar com motivo tira do que cobra (fatia C) ──
  await lista.getByRole("button", { name: /Aceitar de propósito/ }).first().click();
  await lista.getByLabel(/Motivo para aceitar/).first().fill("o consumidor entra na próxima demanda");
  await lista.getByRole("button", { name: /Confirmar exceção/ }).first().click();

  // Sai do vermelho sem sair do histórico: o chip some porque nada mais cobra.
  await expect(page.getByTestId("conformidade-resumo")).toHaveCount(0);
});
