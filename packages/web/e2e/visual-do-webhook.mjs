/**
 * SPEC-110 fatia L — validação visual do painel do webhook, nos DOIS temas.
 *
 * O rito da casa: trocar o tema na MESMA sessão (login repetido bate em rate
 * limit), com `page.reload()` porque `goto` para a mesma URL não remonta, e
 * **asserção sobre `data-tema`** — sem ela, duas capturas idênticas passam por
 * validação e ninguém percebe que o tema nunca mudou.
 */
import { chromium } from "playwright";

const BASE = "http://localhost:8080";
// O servidor da stack de dev fala direto na 4000 (o nginx do :8080 só serve o
// estático — 405 no PUT foi ele recusando o método, não a rota errada).
const API = "http://localhost:4000";
const TIME = "time-portabilidade";

const nav = await chromium.launch();
const ctx = await nav.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

await page.addInitScript(() => localStorage.setItem("gerador:jornada-vista", "1"));
await page.goto(BASE);
await page.getByRole("button", { name: /^entrar$/i }).first().click();
await page.getByPlaceholder("voce@empresa.com").fill("dev@gerador.local");
await page.getByRole("button", { name: "Entrar" }).click();
await page.waitForTimeout(3000);
const escolher = page.getByRole("button", { name: TIME, exact: true });
if (await escolher.isVisible().catch(() => false)) await escolher.click();
await page.waitForTimeout(2000);

// A fiação nasce pela API: o assunto aqui é como o painel SE VÊ, não como se desenha.
const criado = await page.request.put(`${API}/config/fluxos`, {
  data: {
    timeId: TIME,
    documento: {
      fluxos: [
        {
          id: "webhook-visual",
          nome: "Recebe de fora",
          nos: [
            {
              id: "gatilho",
              tipo: "gatilho",
              refId: "webhook",
              posicao: { x: 60, y: 120 },
              parametros: { campos: [{ chave: "pedidoId" }, { chave: "texto", caminho: "$.dados.mensagem" }] },
            },
            { id: "registra", tipo: "funcao", refId: "pdca-feedback", posicao: { x: 420, y: 120 }, parametros: {} },
          ],
          arestas: [{ de: "gatilho", para: "registra", mapeamento: [{ saida: "texto", entrada: "texto" }] }],
        },
      ],
    },
  },
});
// Sem conferir o status, um PUT recusado viraria "o painel não abriu" — e eu
// procuraria o defeito na tela em vez de no dado.
console.log("fiação semeada:", criado.status(), criado.ok() ? "OK" : await criado.text());

for (const tema of ["claro", "escuro"]) {
  await page.evaluate((t) => localStorage.setItem("gerador:tema", t), tema);
  await page.reload();
  await page.waitForTimeout(2500);

  // A asserção que impede duas capturas idênticas de passarem por validação.
  const marcado = await page.evaluate(() => document.documentElement.getAttribute("data-tema"));
  console.log(`[${tema}] data-tema:`, marcado, marcado === tema ? "OK" : "x TEMA NAO TROCOU");

  await page.goto(`${BASE}/#/fluxo/webhook-visual`);
  await page.locator('.react-flow__node[data-id="gatilho"]').waitFor({ timeout: 20000 });
  await page.locator('.react-flow__node[data-id="gatilho"]').click();
  await page.getByTestId("painel-do-webhook").waitFor({ timeout: 10000 });
  await page.waitForTimeout(600);

  const painel = (await page.getByTestId("painel-do-webhook").innerText()).replace(/\s+/g, " ").trim();
  console.log(`[${tema}] painel:`, painel.slice(0, 150));

  // Os campos declarados aparecem para EDITAR, com o caminho aninhado à vista.
  const chave0 = await page.getByTestId("webhook-chave-0").inputValue();
  const caminho1 = await page.getByTestId("webhook-caminho-1").inputValue();
  console.log(`[${tema}] campos:`, chave0, "|", caminho1, chave0 === "pedidoId" && caminho1 === "$.dados.mensagem" ? "OK" : "x");

  // O cartão do gatilho diz o GESTO em rótulo curto (não estica e esconde o vizinho).
  const cartao = await page.locator('.react-flow__node[data-id="gatilho"]').innerText();
  const largura = (await page.locator('.react-flow__node[data-id="gatilho"]').boundingBox()).width;
  console.log(`[${tema}] cartão: "${cartao.replace(/\s+/g, " ").trim()}" (${Math.round(largura)}px)`, largura < 260 ? "OK" : "x LARGO");

  // Contraste do aviso do token: ele é o único texto que a pessoa PRECISA ler
  // antes de sair da tela, e um amarelo que some no tema claro o perde.
  await page.getByTestId("webhook-gerar-token").click();
  await page.getByTestId("webhook-token").waitFor({ timeout: 10000 });
  const cores = await page.evaluate(() => {
    const el = document.querySelector('[data-testid="webhook-token"] span');
    const c = getComputedStyle(el);
    const fundo = getComputedStyle(document.body).backgroundColor;
    return { texto: c.color, fundo };
  });
  console.log(`[${tema}] aviso do token:`, cores.texto, "sobre", cores.fundo);

  const endereco = (await page.getByTestId("webhook-token").locator("code").innerText()).trim();
  console.log(`[${tema}] endereço mostrado:`, endereco.startsWith("http") ? "OK (absoluto, copiável)" : `x ${endereco}`);

  await page.screenshot({ path: `test-results/webhook-${tema}.png`, fullPage: false });
}

await nav.close();
console.log("fim");
