import { chromium } from "playwright";

/**
 * SPEC-110 fatia F — validação visual da demanda desdobrada, nos DOIS temas,
 * contra a stack real (:8080).
 *
 * A pergunta que esta validação faz é a da queixa M9: olhando o canvas sem
 * seguir aresta nenhuma, dá para dizer qual nó lê e qual grava?
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

const salvar = (doc) =>
  page.evaluate(
    async ([api, t, d]) => {
      const r = await fetch(`${api}/config/fluxos`, {
        method: "PUT",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ timeId: t, documento: d }),
      });
      return { status: r.status, corpo: await r.text() };
    },
    [API, timeId, doc]
  );

// Um fluxo com os TRÊS: ler, gravar e o legado — para a validação mostrar os
// três cartões lado a lado, que é como alguém os encontraria na vida real.
console.log(
  "PUT:",
  (
    await salvar({
      fluxos: [
        {
          id: "visual-desdobrada",
          nome: "Ler, gravar e o legado",
          nos: [
            { id: "gatilho", tipo: "gatilho", refId: "manual", posicao: { x: 20, y: 40 }, parametros: {} },
            { id: "demanda", tipo: "projeto", refId: "demanda-ler", posicao: { x: 300, y: 40 }, parametros: {} },
            { id: "grava", tipo: "projeto", refId: "demanda-gravar", posicao: { x: 580, y: 40 }, parametros: {} },
            { id: "antigo", tipo: "projeto", refId: "projeto", posicao: { x: 300, y: 260 }, parametros: {} },
          ],
          arestas: [
            { de: "gatilho", para: "demanda", mapeamento: [] },
            { de: "demanda", para: "grava", mapeamento: [{ saida: "desenho", entrada: "desenho" }] },
          ],
        },
      ],
    })
  ).status
);

for (const tema of ["claro", "escuro"]) {
  await page.goto(`${BASE}/#/fluxo/visual-desdobrada`);
  await page.evaluate((t) => localStorage.setItem("gerador:tema", t), tema);
  // `goto` para a MESMA URL não recarrega — a lição da fatia E.
  await page.reload();
  await page.waitForTimeout(2500);
  const aplicado = await page.evaluate(() => document.documentElement.getAttribute("data-tema"));
  console.log(`[${tema}] data-tema: ${aplicado}`, aplicado === tema ? "✅" : "❌ NÃO TROCOU");

  // A pergunta da M9: o cartão diz a direção sem seguir aresta?
  const cartoes = await page.evaluate(() =>
    ["demanda", "grava", "antigo"].map((id) => {
      const el = document.querySelector(`.react-flow__node[data-id="${id}"]`);
      const r = el.getBoundingClientRect();
      return { id, texto: el.innerText.replace(/\s+/g, " ").trim(), largura: Math.round(r.width), direita: Math.round(r.right), x: Math.round(r.x) };
    })
  );
  for (const c of cartoes) console.log(`[${tema}] ${c.id}: "${c.texto}" (${c.largura}px)`);
  // Sem distinguir maiúsculas: o cartão diz "DEMANDA Ler", e a primeira
  // versão desta checagem comparava minúsculas e acusava um falso ❌.
  const leGrava = /ler/i.test(cartoes[0].texto) && /gravar/i.test(cartoes[1].texto);
  console.log(`[${tema}] direção legível no cartão:`, leGrava ? "✅" : "❌");
  console.log(`[${tema}] sem sobreposição:`, cartoes[0].direita <= cartoes[1].x ? "✅" : "❌ SOBREPÕE");

  // O painel do LEGADO precisa avisar, e o do novo não.
  await page.locator('.react-flow__node[data-id="antigo"]').click();
  await page.waitForTimeout(600);
  const aviso = await page.getByTestId("aviso-do-projeto-legado").textContent();
  const avisoVisivel = await page.getByTestId("aviso-do-projeto-legado").isVisible();
  console.log(`[${tema}] aviso do legado:`, avisoVisivel ? `✅ "${aviso.slice(0, 60)}…"` : "❌ AUSENTE");
  // Contraste do aviso: ele não pode ser um texto que ninguém enxerga.
  const cor = await page.evaluate(() => {
    const el = document.querySelector('[data-testid="aviso-do-projeto-legado"]');
    const s = getComputedStyle(el);
    return { cor: s.color, fundo: getComputedStyle(el.closest("[data-testid=painel-do-no]") ?? document.body).backgroundColor };
  });
  console.log(`[${tema}] cor do aviso:`, JSON.stringify(cor));

  await page.locator('.react-flow__node[data-id="demanda"]').click();
  await page.waitForTimeout(500);
  console.log(`[${tema}] aviso no nó NOVO:`, (await page.getByTestId("aviso-do-projeto-legado").count()) === 0 ? "✅ ausente" : "❌ presente");

  // A descrição não pode aparecer duas vezes no painel — o cabeçalho diz o
  // NOME, o bloco de contrato diz a descrição (achado desta validação).
  const repetido = await page.evaluate(() => {
    const painel = document.querySelector('[data-testid="painel-do-no"]');
    const frase = "Lê a demanda e emite";
    return (painel.innerText.split(frase).length - 1);
  });
  console.log(`[${tema}] descrição no painel: ${repetido}x`, repetido === 1 ? "✅" : "❌ REPETIDA");

  await page.screenshot({ path: `C:/tmp/desdobrada-${tema}.png` });
}

await salvar(anterior);
await navegador.close();
console.log("fim");
