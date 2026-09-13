/**
 * SPEC-110 fatia K — **a prova dupla da D18, em rodada integral.**
 *
 * A D19 pede a apresentação em dia; a D18 pede o produto em pé. Cada fatia
 * provou a sua parte; esta é a conferência do conjunto, e ela roda contra um
 * banco RECRIADO (`docker compose down -v`), que é o único jeito de responder à
 * pergunta que a D18 faz: *uma instalação nova funciona sem ninguém configurar
 * nada?*
 *
 * São duas metades, e as duas importam:
 *
 * (a) **banco limpo sobe funcionando** — os fluxos de fábrica existem, a
 *     jornada está no topo da galeria, as telas do sistema estão registradas;
 * (b) **restart preserva** — o que a pessoa configurou sobrevive a
 *     `docker compose restart server`.
 *
 * Rodar só (a) esconderia config que evapora; só (b), config que chega
 * desconfigurada. As duas juntas são a promessa: "nas entregas precisamos ter
 * as configurações já prontas, assim o sistema segue funcionando".
 */
import { chromium } from "playwright";

const BASE = "http://localhost:8080";
const API = "http://localhost:4000";
const fase = process.argv[2] ?? "limpo";

const nav = await chromium.launch();
const page = await (await nav.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
await page.addInitScript(() => localStorage.setItem("gerador:jornada-vista", "1"));

await page.goto(BASE);
await page.getByRole("button", { name: /^entrar$/i }).first().click();
await page.getByPlaceholder("voce@empresa.com").fill("dev@gerador.local");
await page.getByRole("button", { name: "Entrar" }).click();
await page.waitForTimeout(3500);
// Num banco novo pode haver um time só (sem tela de escolha) ou vários.
const escolher = page.getByRole("button", { name: /^time-/ }).first();
if (await escolher.isVisible().catch(() => false)) await escolher.click();
await page.waitForTimeout(2500);

const marcar = (nome, ok, extra = "") => console.log(`[${fase}] ${nome}:`, ok ? "OK" : "x FALHOU", extra);

// ── A galeria de fábrica ──────────────────────────────────────────────────
await page.goto(`${BASE}/#/fluxo`);
await page.getByTestId("galeria-de-fluxos").waitFor({ timeout: 30000 });
await page.waitForTimeout(1200);

const cards = await page.locator('[data-testid^="card-fluxo-"]').allInnerTexts();
marcar("fluxos de fábrica na galeria", cards.length >= 3, `(${cards.length})`);
marcar(
  "a jornada da demanda em destaque",
  (await page.getByTestId("card-fluxo-jornada-da-demanda").count()) > 0 && (await page.getByTestId("etapa-jornada").count()) > 0
);
marcar("a esteira derivada existe", (await page.getByTestId("card-fluxo-esteira-de-agentes").count()) > 0);
marcar("o ensaio existe", (await page.getByTestId("card-fluxo-ensaio-de-cenarios").count()) > 0);
marcar("o PDCA virou desenho", (await page.getByTestId("card-fluxo-pdca-melhoria").count()) > 0);

// ── O mestre abre e tem as etapas como cartões ────────────────────────────
await page.goto(`${BASE}/#/fluxo/jornada-da-demanda`);
await page.locator(".react-flow__node").first().waitFor({ timeout: 30000 });
await page.waitForTimeout(1000);
const nos = await page.locator(".react-flow__node").count();
marcar("o mestre abre com as etapas", nos >= 3, `(${nos} nós)`);

/**
 * ── O ensaio roda, PARA na tela, e a tela é servida ───────────────────────
 *
 * Este é o teste das telas do SISTEMA, e ele é indireto de propósito: elas não
 * moram num documento de configuração (são código, registro fechado), então
 * perguntar a uma rota "quais telas existem?" mediria a coisa errada — foi o
 * que a primeira versão deste medidor fez, e ela acusou um falso vermelho num
 * produto que estava certo. O que prova que a bancada está registrada é a
 * execução PARAR nela e o stage conseguir servi-la.
 */
const demanda = await page.request.post(`${API}/quebras`, {
  data: { titulo: `d18 integral ${Date.now()}`, diagrama: { nodes: [], edges: [] } },
});
const { id: demandaId } = await demanda.json();
const exec = await page.request.post(`${API}/fluxos/ensaio-de-cenarios/executar`, {
  data: { parametrosPorNo: { demanda: { demandaId } } },
});
const corpoExec = exec.ok() ? await exec.json() : null;
marcar(
  "o ensaio de fábrica roda e PARA na tela",
  exec.ok() && Boolean(corpoExec?.aguardandoTela),
  exec.ok() ? "" : `status ${exec.status()}`
);

if (corpoExec?.execucaoId) {
  const stage = await page.request.get(`${API}/fluxos/execucoes/${corpoExec.execucaoId}/tela`);
  const corpoStage = stage.ok() ? await stage.json() : null;
  marcar(
    "a tela do sistema é servida pelo stage",
    stage.ok() && corpoStage?.tela?.id === "bancada-de-ensaios",
    stage.ok() ? `(${corpoStage?.tela?.nome})` : `status ${stage.status()}`
  );
}

await nav.close();
console.log(`[${fase}] fim`);
