import { chromium } from "@playwright/test";
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1280, height: 1000 } });
await p.goto("http://localhost:8080/", { waitUntil: "networkidle" });
await p.evaluate(() => localStorage.setItem("gerador:jornada-vista", "1"));
await p.goto("http://localhost:8080/", { waitUntil: "networkidle" });
await p.getByRole("button", { name: /Entrar/ }).first().click().catch(() => {});
await p.waitForTimeout(1500);
const email = p.getByPlaceholder(/mail/i).first();
if (await email.count()) { await email.fill("silvio@teste.local"); await p.getByRole("button", { name: /Entrar/ }).first().click(); }
await p.waitForTimeout(2500);
await p.getByRole("button", { name: /Como funciona/ }).first().click().catch(() => {});
await p.waitForTimeout(1200);
for (let i = 0; i < 30; i++) {
  if (await p.getByText(/A esteira escreve/).count()) break;
  await p.getByRole("button", { name: /Próximo|Avançar|→/ }).first().click().catch(() => {});
  await p.waitForTimeout(350);
}
await p.screenshot({ path: "./tour.png", fullPage: false });
await b.close(); console.log("ok");
