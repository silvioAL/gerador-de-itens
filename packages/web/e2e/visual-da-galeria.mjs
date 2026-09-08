import { chromium } from "playwright";

/**
 * SPEC-110 fatia H — validação visual da galeria, nos DOIS temas, contra a
 * stack real (:8080).
 *
 * A pergunta que ela faz: olhando a vitrine sem abrir nada, dá para saber o
 * que este time tem e de onde cada coisa nasce?
 */
const BASE = "http://localhost:8080";

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

for (const tema of ["claro", "escuro"]) {
  await page.goto(`${BASE}/#/fluxo`);
  await page.evaluate((t) => localStorage.setItem("gerador:tema", t), tema);
  // `goto` para a MESMA URL não recarrega — a lição da fatia E.
  await page.reload();
  await page.waitForTimeout(2500);
  const aplicado = await page.evaluate(() => document.documentElement.getAttribute("data-tema"));
  console.log(`[${tema}] data-tema: ${aplicado}`, aplicado === tema ? "✅" : "❌ NÃO TROCOU");

  await page.getByTestId("galeria-de-fluxos").waitFor({ timeout: 15000 });

  // Os cards: rosto, nome, selos e a frase "nasce de" — tudo legível.
  const cards = await page.evaluate(() =>
    [...document.querySelectorAll('[data-testid^="card-fluxo-"]')].map((el) => {
      const r = el.getBoundingClientRect();
      return {
        id: el.getAttribute("data-testid").replace("card-fluxo-", ""),
        texto: el.innerText.replace(/\s+/g, " ").trim().slice(0, 90),
        largura: Math.round(r.width),
        base: Math.round(r.bottom),
      };
    })
  );
  for (const c of cards) console.log(`[${tema}] ${c.id}: "${c.texto}" (${c.largura}px)`);
  console.log(`[${tema}] cards:`, cards.length, cards.length >= 3 ? "✅" : "❌ POUCOS");
  // A grade tem de USAR a largura: uma coluna numa tela de 1440 é vitrine que
  // não mostra (achado desta validação).
  const larguraDaVitrine = await page.evaluate(() => Math.round(document.querySelector('[data-testid="galeria-de-fluxos"]').getBoundingClientRect().width));
  const colunas = await page.evaluate(() => {
    const grade = document.querySelector('[data-testid="etapa-sair"] > div:last-child');
    return grade ? getComputedStyle(grade).gridTemplateColumns.split(" ").length : 0;
  });
  console.log(`[${tema}] vitrine: ${larguraDaVitrine}px, colunas na grade: ${colunas}`, larguraDaVitrine > 1000 && colunas >= 3 ? "✅" : "❌ ESTREITA");

  // Todo derivado DIZ de onde nasce — é a promessa da D16b.
  const semOrigem = cards.filter((c) => c.texto.includes("derivado") && !c.texto.includes("nasce de"));
  console.log(`[${tema}] derivados sem "nasce de":`, semOrigem.length, semOrigem.length === 0 ? "✅" : `❌ ${semOrigem.map((c) => c.id)}`);

  // Nenhum card pode vazar da janela.
  const alturaDaJanela = await page.evaluate(() => window.innerHeight);
  const vazando = cards.filter((c) => c.base > alturaDaJanela + 2000);
  console.log(`[${tema}] cards fora do alcance de rolagem:`, vazando.length === 0 ? "✅" : "❌");

  // O contraste do selo: ele não pode ser um texto que ninguém enxerga.
  const cor = await page.evaluate(() => {
    const el = document.querySelector('[data-testid^="card-fluxo-"] span');
    return el ? getComputedStyle(el).color : "(sem selo)";
  });
  console.log(`[${tema}] cor do selo:`, cor);

  await page.screenshot({ path: `C:/tmp/galeria-${tema}.png`, fullPage: false });
}

await navegador.close();
console.log("fim");
