// Verificação visual da SPEC-107 fatia A contra a stack REAL (:8080), nos
// dois temas — roda com `node e2e/visual-fatia-a.mjs`, não faz parte da suíte.
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

await pagina.goto(`${BASE}/#/fluxo`);
await pagina.getByTestId("fluxo-screen").waitFor({ timeout: 15000 });
// Um rascunho com a função na tela — é a superfície nova da fatia.
await pagina.getByLabel("Nome do fluxo novo").fill("Visual fatia A");
await pagina.getByTestId("criar-fluxo").click();
await pagina.getByTestId("add-funcao-derivacao").click();
await pagina.getByTestId("add-funcao-ensaio").click();
// SPEC-107 fatia B — o projeto na paleta, com o painel das duas direções.
await pagina.getByTestId("add-projeto").click();
await pagina.getByTestId("contrato-do-projeto").waitFor({ timeout: 5000 });

for (const tema of ["claro", "escuro"]) {
  await pagina.evaluate((t) => {
    localStorage.setItem("gerador:tema", t);
    document.documentElement.setAttribute("data-tema", t);
  }, tema);
  await pagina.waitForTimeout(400);
  await pagina.screenshot({ path: `test-results/visual-fatia-a-${tema}.png`, fullPage: false });
  console.log(`screenshot: test-results/visual-fatia-a-${tema}.png`);
}

await navegador.close();
