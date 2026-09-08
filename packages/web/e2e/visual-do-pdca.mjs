import { chromium } from "playwright";

/**
 * SPEC-110 fatia G — validação visual do ciclo do PDCA, nos DOIS temas: o
 * canvas de fábrica e a tela de revisão desenhada em blocos (a primeira tela
 * do SISTEMA que o renderizador de blocos desenha).
 */
const BASE = "http://localhost:8080";
const API = "http://localhost:4000";

const navegador = await chromium.launch();
const page = await (await navegador.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
await page.addInitScript(() => localStorage.setItem("gerador:jornada-vista", "1"));

await page.goto(BASE);
await page.getByRole("button", { name: /^entrar$/i }).first().click();
await page.getByPlaceholder("voce@empresa.com").fill("dev@gerador.local");
await page.getByRole("button", { name: "Entrar" }).click();
await page.waitForTimeout(3000);
const escolher = page.getByRole("button", { name: "time-portabilidade", exact: true });
if (await escolher.isVisible().catch(() => false)) await escolher.click();
await page.waitForTimeout(2500);

const timeId = "time-portabilidade";
const anterior = (await (await page.request.get(`${API}/config/fluxos?timeId=${timeId}`)).json()).documento;
const marca = `visual-${Date.now()}`;

const put = (caminho, corpo) =>
  page.evaluate(
    async ([api, c, b]) => {
      const r = await fetch(`${api}${c}`, {
        method: "PUT",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(b),
      });
      return r.status;
    },
    [API, caminho, corpo]
  );

console.log(
  "feedback:",
  await page.evaluate(
    async ([api, texto]) => {
      const r = await fetch(`${api}/pdca/feedback`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ texto }),
      });
      return r.status;
    },
    [API, `o checklist não fala de ${marca}`]
  )
);

console.log(
  "PUT fluxos:",
  await put("/config/fluxos", {
    timeId,
    documento: {
      fluxos: [
        {
          id: "pdca-visual",
          nome: "Melhoria (visual)",
          nos: [
            { id: "gatilho", tipo: "gatilho", refId: "manual", posicao: { x: 0, y: 100 }, parametros: {} },
            { id: "le", tipo: "funcao", refId: "pdca-ler-feedbacks", posicao: { x: 280, y: 100 }, parametros: {} },
            { id: "revisao", tipo: "tela", refId: "revisao-do-ajuste", posicao: { x: 560, y: 100 }, parametros: {} },
          ],
          arestas: [
            { de: "gatilho", para: "le", mapeamento: [] },
            { de: "le", para: "revisao", mapeamento: [{ saida: "resumo", entrada: "feedbacks" }] },
          ],
        },
      ],
    },
  })
);

for (const tema of ["claro", "escuro"]) {
  await page.goto(`${BASE}/#/fluxo/pdca-visual`);
  await page.evaluate((t) => localStorage.setItem("gerador:tema", t), tema);
  await page.reload();
  await page.waitForTimeout(2500);
  const aplicado = await page.evaluate(() => document.documentElement.getAttribute("data-tema"));
  console.log(`[${tema}] data-tema: ${aplicado}`, aplicado === tema ? "✅" : "❌ NÃO TROCOU");

  // O CANVAS: os cartões dizem o que cada passo faz, sem sobreposição.
  const cartoes = await page.evaluate(() =>
    ["le", "revisao"].map((id) => {
      const el = document.querySelector(`.react-flow__node[data-id="${id}"]`);
      const r = el.getBoundingClientRect();
      return { id, texto: el.innerText.replace(/\s+/g, " ").trim(), x: Math.round(r.x), direita: Math.round(r.right) };
    })
  );
  for (const c of cartoes) console.log(`[${tema}] ${c.id}: "${c.texto}"`);
  console.log(`[${tema}] sem sobreposição:`, cartoes[0].direita <= cartoes[1].x ? "✅" : "❌ SOBREPÕE");

  // A TELA: rodar e abrir o stage.
  await page.getByTestId("executar-fluxo").click();
  await page.getByTestId("abrir-tela-do-stage").waitFor({ timeout: 30000 });
  await page.getByTestId("abrir-tela-do-stage").click();
  await page.getByTestId("tela-do-stage").waitFor({ timeout: 15000 });
  await page.waitForTimeout(800);

  const stage = await page.evaluate(() => {
    const el = document.querySelector('[data-testid="tela-do-stage"]');
    const r = el.getBoundingClientRect();
    return {
      texto: el.innerText.replace(/\s+/g, " ").trim().slice(0, 160),
      base: Math.round(r.bottom),
      alturaDaJanela: window.innerHeight,
      // O que a fiação NÃO trouxe precisa aparecer dito, não em branco.
      dizOFaltante: el.innerText.includes("não trouxe"),
    };
  });
  console.log(`[${tema}] stage: "${stage.texto}…"`);
  console.log(`[${tema}] cabe na tela:`, stage.base <= stage.alturaDaJanela ? "✅" : "❌ VAZA");
  console.log(`[${tema}] nomeia o dado ausente:`, stage.dizOFaltante ? "✅" : "❌ EM BRANCO");
  console.log(`[${tema}] o feedback está à vista:`, (await page.getByTestId("tela-do-stage").innerText()).includes(marca) ? "✅" : "❌");

  await page.screenshot({ path: `C:/tmp/pdca-${tema}.png` });
  // Encerra a execução para a próxima volta começar limpa.
  await page.getByTestId("tela-retornar").click();
  await page.waitForTimeout(1200);
}

await put("/config/fluxos", { timeId, documento: anterior });
await navegador.close();
console.log("fim");
