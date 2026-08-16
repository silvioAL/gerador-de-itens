import { test, expect } from "@playwright/test";
import { entrar } from "./auth";
import { derivarNaMesa } from "./derivar";

const API = "http://localhost:4100";

/**
 * SPEC-49 — a exportação pelo caminho real: derivar com nome (a quebra é
 * salva), confirmar o que a esteira escreveu até um item ficar PRONTO, gerar
 * os itens e mandar pro destino configurado.
 *
 * O "agente" aqui é o `/health` do próprio servidor, que só aceita GET: o
 * POST volta 404 e o motivo REAL do destino atravessa até a tela, por item.
 * É o que o teste prova — o caminho inteiro do produto (quem pode sair, quem
 * fica, e o porquê visível), sem depender do tracker de ninguém.
 */
test("configurar destino, exportar os prontos e mostrar o motivo — item com pendência fica de fora", async ({ page }) => {
  test.setTimeout(90000);
  await page.addInitScript(() => localStorage.setItem("gerador:jornada-vista", "1"));
  await page.route(
    (url) => url.pathname === "/ia/status",
    (rota) => rota.fulfill({ json: { modelosChat: [], embeddingInstalado: false, capacidades: {} } })
  );
  await page.route(
    (url) => url.pathname === "/pdca/uso",
    (rota) => rota.fulfill({ json: { contagem: 1, momento: false, ultimosItens: [] } })
  );
  await page.route(
    (url) => url.pathname === "/ia/sugerir",
    (rota) => rota.fulfill({ contentType: "text/plain", body: "Texto sugerido pela IA de teste" })
  );
  await entrar(page);

  const configOriginal = (await (await page.request.get(`${API}/config/exportador`)).json()).documento;
  try {
    await page.request.put(`${API}/config/exportador`, {
      data: { documento: { endpoint: `${API}/health`, rotulo: "Agente de teste", cabecalhos: {} } },
    });

    // Cenário + derivar COM nome: a quebra é salva, e só quebra salva exporta.
    await page.getByTestId("abrir-cenarios").click();
    await page.getByRole("button", { name: "Carregar cenário: Dados não-relacionais" }).click();
    await derivarNaMesa(page);
    await page.getByLabel("ex.: Fatura mensal em lote").fill(`exportação e2e ${Date.now()}`);
    await page.getByTestId("assistente-balao-confirmar").click();

    // Deixa um item PRONTO: responde os campos do primeiro item e confirma.
    await page.locator('[data-testid^="item-"]').first().click();
    // Campos DIFERENTES: `first()` três vezes re-sugeriria o mesmo (o campo
    // sugerido continua com o botão até ser confirmado).
    for (let i = 0; i < 3; i++) {
      await page.getByRole("button", { name: "✨ Sugerir" }).nth(i).click();
      await page.waitForTimeout(300);
    }
    await page.getByTestId("confirmar-todas").click();
    await expect(page.getByTestId("barra-pendencias")).not.toContainText("aguardando");

    // Gerar os itens (eles persistem, porque a quebra tem id).
    for (const id of ["balao-sem-ia", "balao-sem-contexto"]) {
      if (await page.getByTestId(id).isVisible().catch(() => false)) {
        await page.getByTestId(id).getByRole("button", { name: "Dispensar sugestão" }).click();
        await page.waitForTimeout(500);
      }
    }
    const botaoItens = page.getByTestId("balao-gerar-itens").or(page.getByTestId("balao-especificacao-itens")).first();
    await botaoItens.waitFor({ timeout: 15000 });
    await page.waitForTimeout(500);
    await botaoItens.click();
    await expect(page.getByTestId("itens-screen")).toBeVisible();

    // A tela diz o destino e conta só os prontos.
    await expect(page.getByText(/destino: Agente de teste/)).toBeVisible();
    await expect(page.getByTestId("exportar-prontos")).toBeEnabled();

    await page.getByTestId("exportar-prontos").click();
    const resultado = page.getByTestId("resultado-exportacao");
    await expect(resultado).toBeVisible({ timeout: 20000 });
    // O "agente" recusa POST (o /health só faz GET): o motivo REAL do destino
    // chega até a tela, por item, em vez de um erro genérico — e os itens com
    // pendência nem foram tentados.
    await expect(resultado).toContainText("HTTP 404");
    await expect(resultado).toContainText("ficaram de fora por ainda ter pendência");
  } finally {
    await page.request.put(`${API}/config/exportador`, { data: { documento: configOriginal } });
  }
});
