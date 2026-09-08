import { chromium } from "playwright";
import { execSync } from "node:child_process";

/**
 * SPEC-110 fatia E — prova D18 contra a stack REAL: o relógio sobrevive ao
 * restart do server. Um agendamento que só existisse na memória do processo
 * pararia calado no primeiro deploy, e "parou de rodar" é a falha mais cara de
 * diagnosticar porque nada falha.
 */
const BASE = "http://localhost:8080";
const API = "http://localhost:4000";

const navegador = await chromium.launch();
const page = await (await navegador.newContext()).newPage();
await page.addInitScript(() => localStorage.setItem("gerador:jornada-vista", "1"));
await page.goto(BASE);
await page.getByRole("button", { name: /^entrar$/i }).first().click();
await page.getByPlaceholder("voce@empresa.com").fill("dev@gerador.local");
await page.getByRole("button", { name: "Entrar" }).click();
await page.waitForTimeout(2500);
const escolher = page.getByRole("button", { name: "time-portabilidade", exact: true });
if (await escolher.isVisible().catch(() => false)) await escolher.click();
await page.waitForTimeout(2000);

const timeId = "time-portabilidade";
const chamar = (metodo, caminho, corpo) =>
  page.evaluate(
    async ([m, u, b]) => {
      const r = await fetch(u, {
        method: m,
        credentials: "include",
        headers: { "content-type": "application/json" },
        ...(b ? { body: JSON.stringify(b) } : {}),
      });
      return { status: r.status, corpo: await r.text() };
    },
    [metodo, `${API}${caminho}`, corpo ?? null]
  );

const anterior = JSON.parse((await chamar("GET", `/config/fluxos?timeId=${timeId}`)).corpo).documento;

const desenho = {
  timeId,
  documento: {
    fluxos: [
      {
        id: "d18-agendado",
        nome: "D18 agendado",
        nos: [
          { id: "gatilho", tipo: "gatilho", refId: "agendamento", posicao: { x: 0, y: 0 }, parametros: { expressao: "* * * * *" } },
          {
            id: "molda",
            tipo: "transformacao",
            refId: "transformacao",
            posicao: { x: 280, y: 0 },
            parametros: { campos: [{ chave: "linha", modelo: "sobreviveu ao restart" }] },
          },
        ],
        arestas: [{ de: "gatilho", para: "molda", mapeamento: [] }],
      },
    ],
  },
};

try {
  console.log("PUT fluxos:", (await chamar("PUT", "/config/fluxos", desenho)).status);

  console.log("→ reiniciando o server…");
  execSync("docker compose restart server", { stdio: "ignore" });
  // Espera o server voltar a responder.
  for (let i = 0; i < 60; i++) {
    const r = await chamar("GET", "/saude").catch(() => ({ status: 0 }));
    if (r.status === 200) break;
    await page.waitForTimeout(1000);
  }
  console.log("→ server de volta");

  // O relógio bate a cada 30s; damos duas janelas.
  const alvo = Date.now() + 90000;
  let execucoes = [];
  while (Date.now() < alvo) {
    const r = await chamar("GET", "/fluxos/d18-agendado/execucoes");
    if (r.status === 200) {
      execucoes = JSON.parse(r.corpo).execucoes ?? [];
      if (execucoes.some((e) => (e.nos ?? []).some((n) => n.origem === "agendamento"))) break;
    }
    await page.waitForTimeout(5000);
  }

  const doRelogio = execucoes.find((e) => (e.nos ?? []).some((n) => n.origem === "agendamento"));
  console.log(
    doRelogio
      ? `✅ DEPOIS DO RESTART o relógio disparou sozinho — por "${doRelogio.email}", nós: ${doRelogio.nos.map((n) => `${n.noId}=${n.estado}`).join(", ")}`
      : `❌ nenhuma execução do relógio em 90s (${execucoes.length} execuções no total)`
  );
} finally {
  await chamar("PUT", "/config/fluxos", { timeId, documento: anterior });
  await navegador.close();
}
