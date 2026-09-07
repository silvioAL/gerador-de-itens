// SPEC-110 fatia D — verificação VISUAL do formulário do conector de BANCO
// contra a stack REAL (:8080), nos DOIS temas.
// Roda com `node e2e/visual-do-conector-de-banco.mjs`.
//
// A troca de tema acontece na MESMA sessão: repetir o login bate no rate
// limit do servidor (achado da SPEC-109).
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

await pagina.goto(`${BASE}/#/config/conectores`);
await pagina.getByTestId("conectores-tab").waitFor({ timeout: 20000 });
await pagina.getByTestId("adicionar-conector").click();

// ── O formulário HTTP (o de sempre) tem endereço, método e cabeçalhos ──
await pagina.getByTestId("tipo-do-conector").waitFor({ timeout: 10000 });
for (const tema of ["claro", "escuro"]) {
  await pagina.evaluate((t) => {
    localStorage.setItem("gerador:tema", t);
    document.documentElement.setAttribute("data-tema", t);
  }, tema);
  await pagina.waitForTimeout(400);
  await pagina.screenshot({ path: `test-results/visual-conector-http-${tema}.png` });
  console.log(`screenshot: test-results/visual-conector-http-${tema}.png`);
}

// ── Trocar para BANCO troca as perguntas: some o endereço, entram conexão,
//    SQL e limite (§2.4-10 — pergunta que não se aplica não se faz) ──
await pagina.getByTestId("tipo-do-conector").selectOption("banco");
await pagina.getByTestId("sql-do-conector").waitFor({ timeout: 10000 });
if (await pagina.getByPlaceholder("https://gateway.empresa/volumetria").isVisible().catch(() => false)) {
  throw new Error("o campo de endereço continua na tela num conector de banco");
}
await pagina.getByTestId("segredo-da-conexao").fill("PG_VENDAS");
await pagina.getByTestId("sql-do-conector").fill("select cliente, total from pedidos where cliente = :cliente");
await pagina.getByTestId("limite-da-consulta").fill("50");

for (const tema of ["claro", "escuro"]) {
  await pagina.evaluate((t) => {
    localStorage.setItem("gerador:tema", t);
    document.documentElement.setAttribute("data-tema", t);
  }, tema);
  await pagina.waitForTimeout(400);
  await pagina.screenshot({ path: `test-results/visual-conector-banco-${tema}.png` });
  console.log(`screenshot: test-results/visual-conector-banco-${tema}.png`);
}

await navegador.close();
console.log("visual do conector de banco: ok nos dois temas");
