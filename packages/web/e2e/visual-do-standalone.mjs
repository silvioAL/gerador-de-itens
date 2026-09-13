/**
 * SPEC-111 fatia A — validação visual da tela aberta SOZINHA, nos dois temas.
 *
 * O rito: trocar o tema na MESMA sessão (login repetido bate em rate limit),
 * com `reload` (o `goto` para a mesma URL não remonta) e **asserção sobre
 * `data-tema`** — sem ela, duas capturas idênticas passam por validação.
 */
import { chromium } from "playwright";

const BASE = "http://localhost:8080";
// A stack de dev serve a API na 4000; o nginx do :8080 só serve o estático.
const API = "http://localhost:4000";
const TIME = "time-portabilidade";
const TELA = {
  id: "aprovacao-visual",
  nome: "Aprovação de despesa",
  icone: "🧾",
  blocos: [
    { tipo: "texto", markdown: "Confira o valor e aprove." },
    { tipo: "campo", chave: "valor", rotulo: "Valor", entrada: "numero", obrigatorio: true },
  ],
};

const nav = await chromium.launch();
const page = await (await nav.newContext({ viewport: { width: 1440, height: 900 } })).newPage();

await page.addInitScript(() => localStorage.setItem("gerador:jornada-vista", "1"));
await page.goto(BASE);
await page.getByRole("button", { name: /^entrar$/i }).first().click();
await page.getByPlaceholder("voce@empresa.com").fill("dev@gerador.local");
await page.getByRole("button", { name: "Entrar" }).click();
await page.waitForTimeout(3000);
const escolher = page.getByRole("button", { name: TIME, exact: true });
if (await escolher.isVisible().catch(() => false)) await escolher.click();
await page.waitForTimeout(2000);

const criada = await page.request.put(`${API}/config/telas`, {
  data: { timeId: TIME, documento: { telas: [TELA] } },
});
console.log("tela semeada:", criada.status(), criada.ok() ? "OK" : await criada.text());

for (const tema of ["claro", "escuro"]) {
  await page.evaluate((t) => localStorage.setItem("gerador:tema", t), tema);
  await page.reload();
  await page.waitForTimeout(2500);
  const marcado = await page.evaluate(() => document.documentElement.getAttribute("data-tema"));
  console.log(`[${tema}] data-tema:`, marcado, marcado === tema ? "OK" : "x TEMA NAO TROCOU");

  // ── A galeria: o card da tela tem o botão, e o implícito NÃO vira card de fluxo
  await page.goto(`${BASE}/#/fluxo`);
  await page.getByTestId("galeria-de-fluxos").waitFor({ timeout: 20000 });
  await page.waitForTimeout(800);
  const temBotao = await page.getByTestId(`abrir-tela-${TELA.id}`).isVisible();
  const implicitoComoFluxo = await page.getByTestId(`card-fluxo-tela-standalone:${TELA.id}`).count();
  console.log(`[${tema}] card da tela com "abrir →":`, temBotao ? "OK" : "x SUMIU");
  console.log(`[${tema}] implícito escondido da seção de fluxos:`, implicitoComoFluxo === 0 ? "OK" : "x DUPLICADO");

  // ── A tela aberta sozinha
  await page.getByTestId(`abrir-tela-${TELA.id}`).click();
  await page.getByTestId("tela-do-stage-titulo").waitFor({ timeout: 20000 });
  await page.waitForTimeout(600);

  const titulo = (await page.getByTestId("tela-do-stage-titulo").innerText()).trim();
  const aviso = (await page.getByTestId("tela-sem-destino").innerText()).replace(/\s+/g, " ").trim();
  console.log(`[${tema}] título:`, titulo);
  console.log(`[${tema}] aviso (D4):`, aviso.slice(0, 90));

  /**
   * O contraste do aviso é o que importa aqui: ele é a frase que impede a tela
   * de FINGIR entrega, e um âmbar que some no fundo claro a perderia.
   */
  const cores = await page.evaluate(() => {
    const el = document.querySelector('[data-testid="tela-sem-destino"]');
    return { texto: getComputedStyle(el).color, fundo: getComputedStyle(document.body).backgroundColor };
  });
  const rgb = (s) => s.match(/\d+/g).slice(0, 3).map(Number);
  const lum = ([r, g, b]) => {
    const c = [r, g, b].map((v) => {
      const x = v / 255;
      return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  };
  const a = lum(rgb(cores.texto));
  const b2 = lum(rgb(cores.fundo));
  const razao = (Math.max(a, b2) + 0.05) / (Math.min(a, b2) + 0.05);
  console.log(`[${tema}] contraste do aviso: ${razao.toFixed(2)}:1`, razao >= 4.5 ? "OK" : "x BAIXO");

  // O obrigatório trava, e a trava é legível.
  const travado = await page.getByTestId("tela-avancar-travado").isVisible();
  console.log(`[${tema}] Avançar travado pelo obrigatório:`, travado ? "OK" : "x DESTRAVADO");

  await page.screenshot({ path: `test-results/standalone-${tema}.png`, fullPage: false });
}

await nav.close();
console.log("fim");
