import { test, expect } from "@playwright/test";
import { entrar } from "./auth";

const API = "http://localhost:4100";

/**
 * SPEC-63 — a régua sobre a FORMA do desenho, do ciclo inteiro.
 *
 * O que só o navegador prova: a régua criada **pela tela** chega ao documento
 * de regras do deploy, o motor a aplica sobre um desenho de verdade, ela acusa
 * no placar, e a exceção com motivo a silencia sem apagá-la.
 *
 * ## Sobre mexer em config global
 *
 * O §281 custou três specs vizinhos ensinando que config global em suíte
 * paralela é estado compartilhado. Aqui a régua criada é de FORMA, e as réguas
 * de forma **não existem em nenhum outro spec** — nenhum vizinho lê
 * `regras.topologia`, e o desenho que ela acusa é o desta demanda. Ainda assim
 * o `finally` restaura, porque a janela existe e o próximo spec a herda.
 */
test("§287 — a régua de forma nasce na tela, acusa o desenho e a exceção a silencia", async ({ page }) => {
  test.setTimeout(120000);
  await page.addInitScript(() => localStorage.setItem("gerador:jornada-vista", "1"));
  await page.route(
    (url) => url.pathname === "/ia/status",
    (rota) => rota.fulfill({ json: { modelosChat: [], embeddingInstalado: false, capacidades: {} } })
  );
  await entrar(page);

  const antes = await (await page.request.get(`${API}/config/regras`)).json();
  try {
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
    // Chegou ao documento de regras do deploy — não só ao estado da tela.
    await expect
      .poll(async () => {
        const doc = await (await page.request.get(`${API}/config/regras`)).json();
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
  } finally {
    await page.request.put(`${API}/config/regras`, { data: { documento: antes.documento } });
  }
});
