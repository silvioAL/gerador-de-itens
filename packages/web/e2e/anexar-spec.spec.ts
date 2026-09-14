import { test, expect } from "@playwright/test";
import { entrar } from "./auth";
import { derivarNaMesa } from "./derivar";

const API = "http://localhost:4100";

/**
 * SPEC-114 — a SEGUNDA chamada, pelo caminho real. `exportacao.spec.ts` já
 * prova a primeira ponta a ponta (com o mesmo truque do `/health` só-GET,
 * pra pegar o motivo real sem depender de tracker de ninguém). Este teste
 * prova a dependência ENTRE as duas chamadas: sem `linkExterno` (a primeira
 * falhou de propósito aqui, mesma razão), o botão de anexar nem aparece —
 * não é um estado de erro, é a régua "não há onde anexar ainda" (SPEC-114
 * §2.3) se cumprindo pelo servidor real, com a config real, no navegador
 * real. O caminho de sucesso (spec anexada de verdade) e a recusa por
 * lacuna já têm prova exaustiva na suíte de integração com Postgres real
 * (`anexarSpec.test.ts`, 10 casos) — replicar aqui exigiria um segundo
 * servidor HTTP alcançável de dentro do container, que nenhuma spec deste
 * repositório monta ainda.
 */
test("sem a primeira chamada ter dado link, o botão de anexar spec nem aparece", async ({ page }) => {
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
      data: {
        documento: {
          endpoint: `${API}/health`,
          rotulo: "Tracker de teste",
          cabecalhos: {},
          // §346/§348 — dois destinos, um por operação: itens sobe a
          // história; specDoItem anexaria a spec, se ela não tivesse lacuna.
          destinos: [
            { id: "tracker", operacao: "itens", endpoint: `${API}/health`, rotulo: "Tracker de teste" },
            { id: "agente-spec", operacao: "specDoItem", endpoint: `${API}/health`, rotulo: "Agente de spec" },
          ],
        },
      },
    });

    await page.getByTestId("abrir-cenarios").click();
    await page.getByRole("button", { name: "Carregar cenário: Dados não-relacionais" }).click();
    await derivarNaMesa(page);
    await page.getByLabel("ex.: Fatura mensal em lote").fill(`anexar-spec e2e ${Date.now()}`);
    await page.getByTestId("assistente-balao-confirmar").click();

    await page.locator('[data-testid^="item-"]').first().click();
    for (let i = 0; i < 3; i++) {
      await page.getByRole("button", { name: "✨ Sugerir" }).nth(i).click();
      await page.waitForTimeout(300);
    }
    await page.getByTestId("confirmar-todas").click();
    await expect(page.getByTestId("barra-pendencias")).not.toContainText("aguardando");

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
    await expect(page.getByTestId("secao-dos-itens")).toBeVisible();

    // Primeira chamada: exporta o item pronto — mesmo caminho do exportacao.spec.ts.
    await expect(page.getByTestId("exportar-prontos")).toBeEnabled();
    await page.getByTestId("exportar-prontos").click();
    const resultadoExportacao = page.getByTestId("resultado-exportacao");
    await expect(resultadoExportacao).toBeVisible({ timeout: 20000 });

    // O "tracker" aqui é /health (só GET) — o POST volta 404, então o item
    // continua sem `linkExterno`. Sem link, o botão de anexar nem aparece
    // (correto: não há onde anexar ainda). Isto já prova, pelo caminho real,
    // que a segunda chamada respeita a primeira.
    await expect(page.getByTestId("anexar-spec")).toHaveCount(0);
  } finally {
    await page.request.put(`${API}/config/exportador`, { data: { documento: configOriginal } });
  }
});
