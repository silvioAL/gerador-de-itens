// SPEC-110 fatia B — verificação VISUAL da TELA em modo stage contra a stack
// REAL (:8080), nos DOIS temas. Roda com `node e2e/visual-da-tela.mjs`.
//
// A troca de tema acontece na MESMA sessão de propósito: repetir o login bate
// no rate limit do servidor (achado da SPEC-109).
import { readFileSync } from "node:fs";
import { chromium } from "playwright";

// O desenho vem do cenário de demonstração, lido como JSON: este script roda
// em node puro (sem o esbuild do Playwright), então importar o pacote do
// gateway falso — que é TypeScript — não resolve.
const DIAGRAMA = JSON.parse(readFileSync(new URL("../../../config/cenarios/credito-completo.json", import.meta.url), "utf-8"))
  .quebra.diagrama;

const BASE = "http://localhost:8080";
const API = "http://localhost:4000";

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

// ── 1. O canvas: a fiação do ensaio ATRAVESSA a tela (D18 — a fábrica já
//       chega assim; ninguém configurou nada) ──
await pagina.goto(`${BASE}/#/fluxo/ensaio-de-cenarios`);
await pagina.getByTestId("fluxo-screen").waitFor({ timeout: 15000 });
for (const no of ["gatilho", "demanda", "ensaio", "bancada", "derivacao"]) {
  await pagina.locator(`.react-flow__node[data-id="${no}"]`).waitFor({ timeout: 15000 });
}
await pagina.locator('.react-flow__node[data-id="bancada"]').click();
await pagina.getByTestId("proposito-da-tela").waitFor({ timeout: 5000 });

for (const tema of ["claro", "escuro"]) {
  await pagina.evaluate((t) => {
    localStorage.setItem("gerador:tema", t);
    document.documentElement.setAttribute("data-tema", t);
  }, tema);
  await pagina.waitForTimeout(400);
  await pagina.screenshot({ path: `test-results/visual-tela-canvas-${tema}.png` });
  console.log(`screenshot: test-results/visual-tela-canvas-${tema}.png`);
}

// ── 2. O STAGE: a bancada como corpo, a moldura Retornar/Avançar por cima ──
const criada = await pagina.request.post(`${API}/quebras`, {
  // Desenho de verdade: o ensaio mede a demanda, e uma demanda sem diagrama
  // não tem o que medir (a rota recusa, com o nome do campo).
  data: { titulo: `visual da tela ${Date.now()}`, time: "time-pagamentos", diagrama: DIAGRAMA },
});
if (criada.status() !== 201) throw new Error(`POST /quebras: ${criada.status()} ${await criada.text()}`);
const { id: demandaId } = await criada.json();

const exec = await pagina.request.post(`${API}/fluxos/ensaio-de-cenarios/executar`, {
  data: { timeId: "time-pagamentos", parametrosPorNo: { demanda: { demandaId } } },
});
const corpo = await exec.json();
if (!corpo.aguardandoTela) {
  const falha = (corpo.nos ?? []).find((n) => n.erro);
  throw new Error(`a execução não parou na tela${falha ? `: ${falha.noId} — ${falha.erro}` : ""}`);
}

await pagina.goto(`${BASE}/#/tela/${corpo.execucaoId}`);
await pagina.getByTestId("tela-do-stage").waitFor({ timeout: 20000 });
await pagina.getByTestId("tela-ensaios").waitFor({ timeout: 20000 });
// A moldura precisa estar CLICÁVEL, não só presente: a gaveta a cobria (o
// defeito que só o navegador contou).
if (!(await pagina.getByTestId("tela-avancar").isEnabled())) throw new Error("o Avançar da moldura está inerte");

for (const tema of ["claro", "escuro"]) {
  await pagina.evaluate((t) => {
    localStorage.setItem("gerador:tema", t);
    document.documentElement.setAttribute("data-tema", t);
  }, tema);
  await pagina.waitForTimeout(400);
  await pagina.screenshot({ path: `test-results/visual-tela-stage-${tema}.png` });
  console.log(`screenshot: test-results/visual-tela-stage-${tema}.png`);
}

// ── 3. A porta no canvas: "aguardando uma tela — abrir →" ──
await pagina.goto(`${BASE}/#/fluxo/ensaio-de-cenarios`);
await pagina.getByTestId("aguardando-tela").waitFor({ timeout: 20000 });
for (const tema of ["claro", "escuro"]) {
  await pagina.evaluate((t) => {
    localStorage.setItem("gerador:tema", t);
    document.documentElement.setAttribute("data-tema", t);
  }, tema);
  await pagina.waitForTimeout(400);
  await pagina.screenshot({ path: `test-results/visual-tela-porta-${tema}.png` });
  console.log(`screenshot: test-results/visual-tela-porta-${tema}.png`);
}

await navegador.close();
console.log("visual da tela: ok nos dois temas");
