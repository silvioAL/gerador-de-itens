import { test, expect } from "@playwright/test";
import { entrar } from "./auth";

/**
 * §300 — RELATO REAL: *"carreguei um cenário pronto, os componentes do novo
 * desenho apareceram, mas sumiram do nada do canvas em seguida"*.
 *
 * Eles não sumiram: ficaram **fora da vista**. A câmera guardava o
 * enquadramento do desenho anterior — dois nós cabem com zoom 2×, oito não —, e
 * metade do desenho novo nascia fora da área visível.
 *
 * ## Por que só o navegador prova isto
 *
 * O estado sempre esteve certo: os oito nós existiam, com id e posição. Contar
 * `.react-flow__node` passaria com folga, porque o DOM os tem mesmo quando a
 * câmera aponta para outro lugar. **A régua tem que ser geométrica** — quantos
 * nós caem dentro do retângulo visível —, e isso não existe em JSDOM.
 */
async function noCanvas(page: import("@playwright/test").Page) {
  return await page.evaluate(() => {
    const painel = document.querySelector(".react-flow");
    if (!painel) return { total: 0, dentro: 0 };
    const r = painel.getBoundingClientRect();
    const nos = [...document.querySelectorAll(".react-flow__node")];
    const dentro = nos.filter((n) => {
      const b = n.getBoundingClientRect();
      return b.right > r.left && b.left < r.right && b.bottom > r.top && b.top < r.bottom;
    }).length;
    return { total: nos.length, dentro };
  });
}

async function abrirCenariosProntos(page: import("@playwright/test").Page) {
  await page.getByRole("button", { name: /Como funciona/ }).click();
  // O regex ancorado separa a ABA ("Cenários prontos (18)") do botão de atalho
  // no header ("✦ Cenários prontos"), que casaria com um regex solto.
  await page.getByRole("button", { name: /^Cenários prontos \(/ }).click();
}

test("§300 — trocar de desenho reenquadra a câmera; o segundo cenário não nasce fora da tela", async ({ page }) => {
  test.setTimeout(120000);
  await page.setViewportSize({ width: 1500, height: 900 });
  await page.addInitScript(() => localStorage.setItem("gerador:jornada-vista", "1"));
  await page.route(
    (url) => url.pathname === "/ia/status",
    (rota) => rota.fulfill({ json: { modelosChat: [], embeddingInstalado: false, capacidades: {} } })
  );
  await entrar(page);

  // Um desenho PEQUENO primeiro: dois nós enquadram com zoom alto, e é esse
  // zoom que o desenho seguinte herdava.
  await abrirCenariosProntos(page);
  await page.getByRole("button", { name: "Carregar cenário: Integração externa" }).click();
  await expect.poll(async () => (await noCanvas(page)).total).toBe(2);
  await page.waitForTimeout(900);

  // Um desenho GRANDE por cima.
  await abrirCenariosProntos(page);
  await page.getByRole("button", { name: "Carregar cenário: Fluxo completo: aprovação de crédito" }).click();

  // Todos os oito visíveis — a régua é geométrica, não a contagem do DOM.
  await expect
    .poll(async () => await noCanvas(page), { timeout: 10000 })
    .toEqual({ total: 8, dentro: 8 });
});

test("§300 — o mesmo vale ao voltar de outra tela: a câmera não herda o desenho anterior", async ({ page }) => {
  test.setTimeout(120000);
  await page.setViewportSize({ width: 1500, height: 900 });
  await page.addInitScript(() => localStorage.setItem("gerador:jornada-vista", "1"));
  await page.route(
    (url) => url.pathname === "/ia/status",
    (rota) => rota.fulfill({ json: { modelosChat: [], embeddingInstalado: false, capacidades: {} } })
  );
  await entrar(page);

  await abrirCenariosProntos(page);
  await page.getByRole("button", { name: "Carregar cenário: Integração externa" }).click();
  await expect.poll(async () => (await noCanvas(page)).total).toBe(2);

  // O caminho do relato passava pelos Ensaios. Medido: ele não era a causa —
  // o defeito estava na troca de desenho, e acontecia igual sem sair da mesa.
  // O spec cobre os dois porque foi assim que o usuário chegou nele.
  await page.getByTestId("leitura-resumo").click();
  await page.getByTestId("abrir-simulacao").click();
  await expect(page.getByTestId("tela-ensaios")).toBeVisible();
  await page.getByTestId("ensaios-voltar").click();

  await abrirCenariosProntos(page);
  await page.getByRole("button", { name: "Carregar cenário: Fluxo completo: aprovação de crédito" }).click();

  await expect
    .poll(async () => await noCanvas(page), { timeout: 10000 })
    .toEqual({ total: 8, dentro: 8 });
});
