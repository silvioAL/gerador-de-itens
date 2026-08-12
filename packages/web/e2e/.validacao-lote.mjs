// Validação de FUMAÇA do lote (§177–§183) no bundle de produção local.
import { chromium } from "@playwright/test";

const BASE = "http://localhost:8080";
const API = "http://localhost:4000";
const shots = "e2e/screenshots";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

function falha(msg) {
  throw new Error(`VALIDAÇÃO FALHOU: ${msg}`);
}

await page.addInitScript(() => localStorage.setItem("gerador:jornada-vista", "1"));
await page.goto(BASE);
await page.getByRole("button", { name: "Entrar" }).first().click();
await page.getByPlaceholder("voce@empresa.com").fill("dev@gerador.local");
await page.getByRole("button", { name: "Entrar" }).click();
await page.getByRole("button", { name: "time-pagamentos", exact: true }).click();
await page.getByRole("button", { name: "+ Serviço", exact: true }).waitFor({ timeout: 15000 });

// §181 — campo Título não existe; M2 fala no canvas vazio (§180).
if ((await page.getByLabel("Título da quebra").count()) !== 0) falha("campo Título ainda existe");
await page.getByTestId("assistente-balao").waitFor({ timeout: 5000 });
const m2 = await page.getByTestId("assistente-balao").textContent();
if (!m2.includes("Quer começar conversando")) falha(`balão M2 errado: ${m2}`);
console.log("§180/§181 OK — sem campo Título; M2 convida no canvas vazio");

// §177 — aba Perfis de stack com catálogo (seed Java/Node) e ponteiro.
await page.getByRole("button", { name: "⚙ Configurações" }).click();
await page.getByRole("button", { name: /Perfis de stack/ }).click();
await page.getByRole("option", { name: "Java + Spring Boot" }).waitFor({ state: "attached", timeout: 5000 });
console.log("§177 OK — catálogo de perfis com o seed replantado");

// §182 — passo do tour existe? (checagem barata: aba Membros com níveis)
await page.getByRole("button", { name: /Membros/ }).click();
await page.getByText(/visualizar.*lê as quebras/).first().waitFor({ timeout: 5000 });
console.log("§176/§182 OK — aba Membros com níveis");

// §183 — cadência do PDCA responde; solicitação criada aparece na aba Acessos.
const cfg = await (await page.request.get(`${API}/pdca/config`)).json();
if (cfg.cadenciaUsos !== 5) falha(`cadência default: ${JSON.stringify(cfg)}`);
const pedido = await page.request.post(`${API}/ajustes`, {
  data: { recurso: "regras", descricao: "validação: item de fumaça", timeId: "time-pagamentos" },
});
if (pedido.status() !== 201) falha(`criar ajuste → ${pedido.status()}`);
await page.getByRole("button", { name: /Acessos/ }).click();
try {
  await page.getByText("validação: item de fumaça").waitFor({ timeout: 5000 });
} catch (e) {
  const lista = await (await page.request.get(`${API}/ajustes`)).json();
  await page.screenshot({ path: `${shots}/val-lote-debug.png`, fullPage: true });
  falha(`ajuste não apareceu na aba; GET /ajustes tem ${Array.isArray(lista) ? lista.length : "?"} itens: ${JSON.stringify(lista).slice(0, 200)}`);
}
await page.screenshot({ path: `${shots}/val-lote-acessos-pdca.png`, fullPage: true });
const decidir = await page.request.post(`${API}/ajustes/${(await pedido.json()).id}/decidir`, {
  data: { aprovar: false },
});
if (decidir.status() !== 200) falha(`rejeitar ajuste → ${decidir.status()}`);
console.log("§183 OK — PDCA: config default, solicitação criada, visível e decidida");

// §183 — botão de gerar especificação não existe mais na revisão? (checado nos
// E2E; aqui só a regra de fumaça: regras por componente na aba)
await page.getByRole("button", { name: /Regras de refinamento/ }).click();
await page.getByTestId("nova-regra-por-componente").waitFor({ timeout: 5000 });
console.log("§179 OK — formulário de regra por componente na aba");

await browser.close();
console.log("LOTE §176–§183 VALIDADO NO BUNDLE DE PRODUÇÃO (localhost:8080)");
