import { chromium } from "playwright";

/**
 * SPEC-110 fatia E — validação visual do painel do agendamento, nos DOIS temas,
 * contra a stack real (:8080). Troca o tema na MESMA sessão: sair e entrar de
 * novo bate no limite de tentativas do login.
 */
const BASE = "http://localhost:8080";
const API = "http://localhost:4000";

const navegador = await chromium.launch();
const ctx = await navegador.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

// O modal "Como usar" abre sozinho na primeira visita e come os cliques.
await page.addInitScript(() => localStorage.setItem("gerador:jornada-vista", "1"));

await page.goto(BASE);
// A raiz é a CAPA pública; o login mora atrás do "Entrar".
await page.getByRole("button", { name: /^entrar$/i }).first().click();
await page.waitForTimeout(2000);
await page.getByPlaceholder("voce@empresa.com").fill("dev@gerador.local");
await page.getByRole("button", { name: "Entrar" }).click();
await page.waitForTimeout(3000);
const escolher = page.getByRole("button", { name: "time-portabilidade", exact: true });
if (await escolher.isVisible().catch(() => false)) await escolher.click();
await page.waitForTimeout(2500);

// Um fluxo agendado, escrito pela porta da frente (a mesma que a tela usa).
const time = await page.evaluate(() => localStorage.getItem("gerador:time"));
console.log("time ativo:", time, "· url:", page.url());
const timeId = time || "time-portabilidade";

const anterior = await page.evaluate(
  async ([api, t]) => (await (await fetch(`${api}/config/fluxos?timeId=${t}`, { credentials: "include" })).json()).documento,
  [API, timeId]
);

await page.evaluate(
  async ([api, t]) => {
    const r = await fetch(`${api}/config/fluxos`, {
      method: "PUT",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        timeId: t,
        documento: {
          fluxos: [
            {
              id: "visual-agendado",
              nome: "Relatório da madrugada",
              nos: [
                { id: "gatilho", tipo: "gatilho", refId: "agendamento", posicao: { x: 40, y: 60 }, parametros: { expressao: "0 9 * * 1-5" } },
                {
                  id: "molda",
                  tipo: "transformacao",
                  refId: "transformacao",
                  posicao: { x: 340, y: 60 },
                  parametros: { campos: [{ chave: "linha", modelo: "relatório do dia" }] },
                },
              ],
              arestas: [{ de: "gatilho", para: "molda", mapeamento: [] }],
            },
          ],
        },
      }),
    });
    if (!r.ok) throw new Error(`PUT fluxos: ${r.status} ${await r.text()}`);
  },
  [API, timeId]
);

for (const tema of ["claro", "escuro"]) {
  await page.goto(`${BASE}/#/fluxo/visual-agendado`);
  await page.evaluate((t) => localStorage.setItem("gerador:tema", t), tema);
  // `goto` para a MESMA URL não recarrega — sem este reload a segunda volta
  // fotografava o tema da primeira e a validação seria uma mentira.
  await page.reload();
  await page.waitForTimeout(2500);
  await page.locator('.react-flow__node[data-id="gatilho"]').click();
  await page.waitForTimeout(800);

  // Confere que o tema REALMENTE trocou: a primeira rodada desta validação
  // gerou duas capturas idênticas, e "validei nos dois temas" teria sido
  // afirmação falsa.
  const aplicado = await page.evaluate(() => document.documentElement.getAttribute("data-tema"));
  console.log(`[${tema}] data-tema aplicado: ${aplicado}`, aplicado === tema ? "✅" : "❌ NÃO TROCOU");

  const previsao = await page.getByTestId("proxima-ocorrencia").textContent();
  const expressao = await page.getByTestId("expressao-do-agendamento").inputValue();
  console.log(`[${tema}] expressão="${expressao}" · ${previsao}`);

  // O cartão do gatilho não pode cobrir o vizinho (a lição da fatia A).
  const caixas = await page.evaluate(() =>
    ["gatilho", "molda"].map((id) => {
      const el = document.querySelector(`.react-flow__node[data-id="${id}"]`);
      const r = el.getBoundingClientRect();
      return { id, x: Math.round(r.x), direita: Math.round(r.right), largura: Math.round(r.width) };
    })
  );
  const sobrepoe = caixas[0].direita > caixas[1].x;
  console.log(`[${tema}] cartões:`, JSON.stringify(caixas), sobrepoe ? "❌ SOBREPÕE" : "✅ sem sobreposição");

  // O painel inteiro precisa caber: a previsão não pode ficar fora da tela.
  const cabe = await page.evaluate(() => {
    const el = document.querySelector('[data-testid="proxima-ocorrencia"]');
    const r = el.getBoundingClientRect();
    return { topo: Math.round(r.top), base: Math.round(r.bottom), alturaDaJanela: window.innerHeight };
  });
  console.log(`[${tema}] previsão visível:`, JSON.stringify(cabe), cabe.base <= cabe.alturaDaJanela ? "✅" : "❌ FORA DA TELA");

  await page.screenshot({ path: `/tmp/agendamento-${tema}.png`, fullPage: false });
}

await page.evaluate(
  async ([api, t, doc]) => {
    await fetch(`${api}/config/fluxos`, {
      method: "PUT",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ timeId: t, documento: doc }),
    });
  },
  [API, timeId, anterior]
);

await navegador.close();
console.log("fim");
