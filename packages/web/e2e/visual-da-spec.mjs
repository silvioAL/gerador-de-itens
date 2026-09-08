import { chromium } from "playwright";
const BASE = "http://localhost:8080";
const nav = await chromium.launch();
const page = await (await nav.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
await page.addInitScript(() => localStorage.setItem("gerador:jornada-vista", "1"));
await page.goto(BASE);
await page.getByRole("button", { name: /^entrar$/i }).first().click();
await page.getByPlaceholder("voce@empresa.com").fill("dev@gerador.local");
await page.getByRole("button", { name: "Entrar" }).click();
await page.waitForTimeout(3000);
const t = page.getByRole("button", { name: "time-portabilidade", exact: true });
if (await t.isVisible().catch(() => false)) await t.click();
await page.waitForTimeout(2500);
for (const tema of ["claro", "escuro"]) {
  await page.goto(`${BASE}/#/fluxo/ensaio-de-cenarios`);
  await page.evaluate((x) => localStorage.setItem("gerador:tema", x), tema);
  await page.reload();
  await page.waitForTimeout(2500);
  const aplicado = await page.evaluate(() => document.documentElement.getAttribute("data-tema"));
  const botao = page.getByTestId("add-funcao-gerar-spec");
  const visivel = await botao.isVisible().catch(() => false);
  const texto = visivel ? (await botao.innerText()).trim() : "(ausente)";
  const caixa = visivel ? await botao.boundingBox() : null;
  console.log(`[${tema}] data-tema:${aplicado}`, aplicado === tema ? "✅" : "❌",
    `| paleta: "${texto}"`, visivel ? "✅" : "❌",
    `| cabe: ${caixa ? Math.round(caixa.x + caixa.width) : "-"}/${await page.evaluate(() => window.innerWidth)}`,
    caixa && caixa.x + caixa.width <= 1440 ? "✅" : "❌");
  await page.screenshot({ path: `C:/tmp/spec-${tema}.png` });
}
await nav.close();
console.log("fim");
