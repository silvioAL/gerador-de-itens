import { test, expect } from "@playwright/test";
import { entrarEmTimeProprio } from "./auth";

/**
 * SPEC-112 fatia A — **o nó opcional, pela tela.**
 *
 * As provas de unidade (`noOpcional.test.ts`) e de rota (`noOpcionalNaRota.test.ts`)
 * cobrem o motor; este spec cobre os dois pedaços que só existem no navegador:
 * a marcação `opcional` no painel do nó (checkbox) e o gesto "rodar esta
 * etapa" (M7 — reusa `ateNo`), que é como se pede a corrida de um nó que não
 * roda sozinho.
 */

const API = "http://localhost:4100";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("gerador:jornada-vista", "1"));
});

test("marcar opcional pelo painel, rodar só até o nó, e ver `pulado` na corrida inteira", async ({ page }) => {
  test.setTimeout(120000);
  const timeId = await entrarEmTimeProprio(page, "no-opcional");
  const FLUXO = "com-opcional-e2e-web";

  await page.request.put(`${API}/config/fluxos`, {
    data: {
      timeId,
      documento: {
        fluxos: [
          {
            id: FLUXO,
            nome: "Com etapa opcional (E2E)",
            nos: [
              { id: "gatilho", tipo: "gatilho", refId: "manual", posicao: { x: 0, y: 0 }, parametros: {} },
              {
                id: "meio",
                tipo: "funcao",
                refId: "pdca-feedback",
                posicao: { x: 240, y: 0 },
                parametros: { texto: "meio" },
              },
              {
                id: "depois",
                tipo: "funcao",
                refId: "pdca-feedback",
                posicao: { x: 480, y: 0 },
                parametros: { texto: "depois" },
              },
            ],
            arestas: [
              { de: "gatilho", para: "meio", mapeamento: [] },
              { de: "meio", para: "depois", mapeamento: [] },
            ],
          },
        ],
      },
    },
  });

  await page.goto(`/#/fluxo/${FLUXO}`);
  await expect(page.getByTestId("fluxo-screen")).toBeVisible();

  // 1) O painel do nó "meio" mostra a marcação, desmarcada por padrão.
  await page.locator('.react-flow__node[data-id="meio"]').click();
  const painel = page.getByTestId("painel-do-no");
  const opcional = painel.getByTestId("no-opcional");
  await expect(opcional).toBeVisible();
  await expect(opcional).not.toBeChecked();

  // 2) Marca opcional e pede SÓ esta etapa (M7) — o gesto reusa `ateNo`, que
  // corta o plano no fecho de ancestrais: gatilho e meio rodam, "depois" não.
  await opcional.check();
  await expect(opcional).toBeChecked();
  await painel.getByTestId("rodar-esta-etapa").click();
  await expect(page.getByTestId("rastro-da-execucao")).toBeVisible({ timeout: 30000 });
  await expect(page.getByTestId("rastro-meio")).toContainText("✓");
  await expect(page.getByTestId("rastro-depois")).toHaveCount(0);

  // 3) A marcação persistiu (o gesto salva o desenho declarado, como o
  // Executar). Recarrega, reabre o nó, confirma o checkbox sem precisar
  // clicar em Salvar de novo.
  await page.reload();
  await expect(page.getByTestId("fluxo-screen")).toBeVisible();
  await page.getByTestId("seletor-de-fluxo").selectOption(FLUXO);
  await page.locator('.react-flow__node[data-id="meio"]').click();
  await expect(page.getByTestId("painel-do-no").getByTestId("no-opcional")).toBeChecked();

  // 4) A corrida LINEAR (sem pedir ninguém) pula o opcional — e não derruba
  // quem vem depois: "meio" aparece PULADO (⤳), "depois" roda de verdade.
  await page.getByTestId("executar-fluxo").click();
  await expect(page.getByTestId("rastro-da-execucao")).toBeVisible({ timeout: 30000 });
  await expect(page.getByTestId("rastro-meio")).toContainText("⤳");
  await expect(page.getByTestId("rastro-meio")).toContainText("opcional, não pedido nesta corrida");
  await expect(page.getByTestId("rastro-depois")).toContainText("✓");
});
