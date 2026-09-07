import { test, expect, type Page } from "@playwright/test";
import { entrar } from "./auth";
import {
  BASE_URL_GATEWAY_FALSO,
  CHAVE_GATEWAY_FALSO,
  MODELO_GATEWAY_FALSO,
  PEDIR_FALHA_AO_GATEWAY,
} from "@gerador/gateway-falso";

const API = "http://localhost:4100";

/**
 * ~~SPEC-59/60 — o mapa do sistema.~~ **SPEC-109 C — a tela morreu; as provas
 * ficam.**
 *
 * A SistemaScreen narrava o encanamento que o canvas de fluxos mostra VIVO
 * ("por vezes parece ter coisas repetidas", queixa literal do usuário), e o
 * que só ela tinha migrou para o painel do nó agente: ligar/desligar,
 * reordenar e a última corrida (§260/§265). Estes testes provam O MESMO que
 * os antigos — a edição feita de onde se vê chega ao servidor, e a falha
 * acende (e apaga) — na casa nova.
 */

// Em série: os dois testes mexem na MESMA esteira (estado da organização,
// não da aba) — a razão do §265 continua valendo na casa nova.
test.describe.configure({ mode: "serial" });

async function abrirNoDaEsteira(page: Page, papelId: string) {
  await page.goto("/#/fluxo/esteira-de-agentes");
  // O rastro é lido quando a tela MONTA — e `goto` para o mesmo hash não
  // remonta nada. Sem o reload, a segunda visita mostraria a corrida velha.
  await page.reload();
  await expect(page.getByTestId("seletor-de-fluxo")).toHaveValue("esteira-de-agentes", { timeout: 15000 });
  await page.locator(`.react-flow__node[data-id="${papelId}"]`).click();
  await expect(page.getByTestId("papel-ativo")).toBeVisible();
}

/** O teste desliga o papel no meio — uma rodada que morra ali deixaria o
 * banco com o `po` fora da esteira para TODAS as rodadas seguintes (foi o
 * que aconteceu na primeira). Garantir o ponto de partida é do teste. */
async function garantirPapelAtivo(page: Page, papelId: string) {
  const cfg = (await (await page.request.get(`${API}/config/pipeline-agentes?timeId=time-pagamentos`)).json()).documento;
  if (cfg?.papeis?.some((p: { id: string; ativo: boolean }) => p.id === papelId && !p.ativo)) {
    await page.request.put(`${API}/config/pipeline-agentes`, {
      data: {
        documento: {
          ...cfg,
          papeis: cfg.papeis.map((p: { id: string }) => (p.id === papelId ? { ...p, ativo: true } : p)),
        },
        timeId: "time-pagamentos",
      },
    });
  }
}

test("desligar um papel pelo nó grava de verdade — e o nó sai da derivada", async ({ page }) => {
  test.setTimeout(90000);
  await page.addInitScript(() => localStorage.setItem("gerador:jornada-vista", "1"));
  await entrar(page);
  await garantirPapelAtivo(page, "po");

  await abrirNoDaEsteira(page, "po");
  await expect(page.getByTestId("papel-ativo")).toBeChecked();

  // Desligar de onde se vê (§260). O efeito é DUPLO e imediato: o servidor
  // grava, e a esteira derivada re-deriva sem o papel — o nó some do canvas.
  await page.getByTestId("papel-ativo").click();
  await expect(page.locator('.react-flow__node[data-id="po"]')).toHaveCount(0, { timeout: 15000 });

  // O que importa não é a tela ter pintado: é o servidor ter recebido — no
  // documento DO TIME, que é o escopo em que a tela do fluxo grava (§369).
  await expect
    .poll(
      async () => {
        const cfg = await (await page.request.get(`${API}/config/pipeline-agentes?timeId=time-pagamentos`)).json();
        return cfg.documento.papeis.find((p: { id: string }) => p.id === "po")?.ativo;
      },
      { timeout: 15000 }
    )
    .toBe(false);

  // A volta de quem desligou: o nó sumiu, então religar tem porta no BANNER
  // da derivada (apontando o catálogo completo — deep-link vivo, menu não).
  await expect(page.getByTestId("abrir-config-dos-papeis-banner")).toBeVisible();

  // Religa pela API (RMW — o catálogo completo é tela de outro teste) e o
  // canvas re-deriva com o papel de volta.
  const cfg = (await (await page.request.get(`${API}/config/pipeline-agentes?timeId=time-pagamentos`)).json()).documento;
  await page.request.put(`${API}/config/pipeline-agentes`, {
    data: {
      documento: {
        ...cfg,
        papeis: cfg.papeis.map((p: { id: string }) => (p.id === "po" ? { ...p, ativo: true } : p)),
      },
      timeId: "time-pagamentos",
    },
  });
  await page.reload();
  await expect(page.getByTestId("seletor-de-fluxo")).toHaveValue("esteira-de-agentes", { timeout: 15000 });
  await expect(page.locator('.react-flow__node[data-id="po"]')).toBeVisible();
});

/**
 * §265 na casa nova — a falha de um papel é notícia no PAINEL DO NÓ, e a
 * execução boa a apaga. A falha viaja no PEDIDO (`PEDIR_FALHA_AO_GATEWAY`),
 * não numa credencial sabotada — credencial é estado da organização inteira.
 */
test("falha de um papel aparece no painel do nó, e a execução seguinte a apaga", async ({ page }) => {
  test.setTimeout(90000);
  await page.addInitScript(() => localStorage.setItem("gerador:jornada-vista", "1"));
  await entrar(page);

  await page.getByRole("button", { name: "☰ Menu" }).click();
  await page.getByRole("button", { name: "Modelo de IA" }).click();
  const card = page.getByTestId("modelo-ia-gateway");
  await card.getByLabel("Base URL do gateway").fill(BASE_URL_GATEWAY_FALSO);
  await card.getByLabel("Chave de API").fill(CHAVE_GATEWAY_FALSO);
  await card.getByLabel("Nome do modelo").fill(MODELO_GATEWAY_FALSO);
  await card.getByRole("button", { name: "Salvar" }).click();
  await expect(page.getByTestId("gateway-resultado")).toContainText("Credencial salva");

  const pedirAoPapel = (texto: string) =>
    page.request.post(`${API}/ia/pipeline/po`, {
      data: {
        itens: [
          {
            chave: "item-1",
            rotulo: texto,
            contextoNo: "Backend",
            placeholders: [{ chave: "regra", tech: "Backend", rotulo: "regra de negócio" }],
          },
        ],
      },
    });

  const falha = await pedirAoPapel(PEDIR_FALHA_AO_GATEWAY);
  expect(falha.status()).toBe(502);

  // O rastro é lido quando a tela monta — abrir o nó depois da falha a mostra.
  await abrirNoDaEsteira(page, "po");
  await expect(page.getByTestId("papel-ultima-corrida")).toContainText("falhou");

  // A execução seguinte, boa, APAGA o vermelho. Um estado que só acende é um
  // alarme que se aprende a ignorar.
  const ok = await pedirAoPapel("um item comum");
  expect(ok.status()).toBe(200);

  await abrirNoDaEsteira(page, "po");
  await expect(page.getByTestId("papel-ultima-corrida")).toContainText("ok");
});
