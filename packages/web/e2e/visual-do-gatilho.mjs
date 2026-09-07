// SPEC-110 fatia A — verificação VISUAL do gatilho contra a stack REAL
// (:8080), nos DOIS temas. Roda com `node e2e/visual-do-gatilho.mjs`; não faz
// parte da suíte. O molde é `visual-do-fluxo.mjs` (SPEC-107).
//
// A troca de tema acontece na MESMA sessão de propósito: repetir o login bate
// no rate limit do servidor (achado da SPEC-109).
import { chromium } from "playwright";

const BASE = "http://localhost:8080";

const navegador = await chromium.launch();
const pagina = await navegador.newPage({ viewport: { width: 1440, height: 900 } });
await pagina.addInitScript(() => localStorage.setItem("gerador:jornada-vista", "1"));

await pagina.goto(BASE);
await pagina.getByRole("button", { name: "Entrar" }).first().click();
await pagina.getByPlaceholder("voce@empresa.com").fill("dev@gerador.local");
await pagina.getByRole("button", { name: "Entrar" }).click();
const escolher = pagina.getByRole("button", { name: "time-pagamentos", exact: true });
try {
  await escolher.waitFor({ state: "visible", timeout: 8000 });
  await escolher.click();
} catch {
  // usuário de um time só entra direto
}
await pagina.getByRole("button", { name: "+ Serviço", exact: true }).waitFor({ timeout: 15000 });

// ── 1. A DERIVADA já chega com o gatilho (D18: configuração de fábrica
//       pronta — ninguém configura nada para o que funcionava continuar
//       funcionando, e o recurso novo já nasce demonstrável) ──
await pagina.goto(`${BASE}/#/fluxo/esteira-de-agentes`);
await pagina.getByTestId("fluxo-screen").waitFor({ timeout: 15000 });
await pagina.locator('.react-flow__node[data-id="gatilho"]').waitFor({ timeout: 15000 });
const rotuloDoBotao = await pagina.getByTestId("executar-fluxo").innerText();
if (!rotuloDoBotao.includes("Rodar agora")) throw new Error(`o botão diz "${rotuloDoBotao}", não "▶ Rodar agora"`);
await pagina.locator('.react-flow__node[data-id="gatilho"]').click();
await pagina.getByTestId("proposito-do-gatilho").waitFor({ timeout: 5000 });

for (const tema of ["claro", "escuro"]) {
  await pagina.evaluate((t) => {
    localStorage.setItem("gerador:tema", t);
    document.documentElement.setAttribute("data-tema", t);
  }, tema);
  await pagina.waitForTimeout(400);
  await pagina.screenshot({ path: `test-results/visual-gatilho-derivada-${tema}.png` });
  console.log(`screenshot: test-results/visual-gatilho-derivada-${tema}.png`);
}

// ── 2. O gesto NOVO: o fluxo declarado nasce COM o gatilho (D1), e a paleta
//       recusa o segundo com o motivo à mostra ──
await pagina.goto(`${BASE}/#/fluxo`);
await pagina.getByTestId("fluxo-screen").waitFor({ timeout: 15000 });
await pagina.getByLabel("Nome do fluxo novo").fill(`Visual gatilho ${Date.now()}`);
await pagina.getByTestId("criar-fluxo").click();
await pagina.locator('.react-flow__node[data-id="gatilho"]').waitFor({ timeout: 10000 });
if (!(await pagina.getByTestId("add-gatilho").isDisabled())) {
  throw new Error("o botão + Gatilho devia estar desligado: o fluxo já tem um (D1)");
}
// O agente entra e a aresta do disparo ganha a etiqueta "dispara".
await pagina.getByTestId("add-agente").click();
await pagina.locator('.react-flow__node[data-id="gatilho"]').click();
await pagina.getByTestId("proposito-do-gatilho").waitFor({ timeout: 5000 });

for (const tema of ["claro", "escuro"]) {
  await pagina.evaluate((t) => {
    localStorage.setItem("gerador:tema", t);
    document.documentElement.setAttribute("data-tema", t);
  }, tema);
  await pagina.waitForTimeout(400);
  await pagina.screenshot({ path: `test-results/visual-gatilho-paleta-${tema}.png` });
  console.log(`screenshot: test-results/visual-gatilho-paleta-${tema}.png`);
}

await navegador.close();
console.log("visual do gatilho: ok nos dois temas");
