/**
 * Sonda de medição da landing contra a stack real (:8080).
 * Temporária — a rodada §341 a usa para remedir o §0 da SPEC-92.
 */
import { chromium } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";

const ALVO = process.env.ALVO ?? "http://localhost:8080";
const SAIDA = "test-results/sonda-landing";
mkdirSync(SAIDA, { recursive: true });

const navegador = await chromium.launch();

for (const esquema of ["dark", "light"]) {
  const ctx = await navegador.newContext({
    viewport: { width: 1440, height: 900 },
    colorScheme: esquema,
    deviceScaleFactor: 1,
  });
  const pagina = await ctx.newPage();
  await pagina.goto(ALVO, { waitUntil: "networkidle" });
  // Espera o React pintar (a lição do §336: sem isto se mede página vazia).
  await pagina.waitForSelector('[data-testid="ciclo-do-produto"]', { timeout: 20000 });
  await pagina.waitForTimeout(600);

  const m = await pagina.evaluate(() => {
    const conta = (t) => (t ?? "").split(/\s+/).filter((p) => /[\p{L}\p{N}]/u.test(p)).length;
    const corpo = document.body;
    const secoes = [...document.querySelectorAll("section")];
    // As peças, pelo testid: quanto texto cada uma traz sozinha.
    // As MOLDURAS dos atos também são `section[data-testid]`, e contá-las
    // descontaria a página inteira de si mesma — o `foraDasPecas` deu -1973.
    const pecas = secoes
      .filter((s) => s.dataset.testid && !s.dataset.testid.startsWith("ato-"))
      .map((s) => ({ id: s.dataset.testid, palavras: conta(s.innerText), altura: Math.round(s.getBoundingClientRect().height) }));
    const somaDasPecas = pecas.reduce((a, p) => a + p.palavras, 0);
    return {
      altura: corpo.scrollHeight,
      telas: +(corpo.scrollHeight / 900).toFixed(1),
      secoes: secoes.length,
      palavras: conta(corpo.innerText),
      palavrasNasPecas: somaDasPecas,
      palavrasForaDasPecas: conta(corpo.innerText) - somaDasPecas,
      pecas,
      svgs: document.querySelectorAll("svg").length,
      imagens: document.querySelectorAll("img").length,
      ancoras: document.querySelectorAll('a[href^="#"]').length,
      links: document.querySelectorAll("a").length,
      botoesEntrar: [...document.querySelectorAll("button")].filter((b) => /entrar/i.test(b.textContent ?? "")).length,
      titulos: document.querySelectorAll("h1, h2").length,
      fundo: getComputedStyle(corpo).backgroundColor,
      rolagemHorizontal: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    };
  });

  console.log(`\n=== ${esquema} ===`);
  console.log(JSON.stringify(m, null, 1));
  writeFileSync(`${SAIDA}/medida-${esquema}.json`, JSON.stringify(m, null, 2));

  await pagina.screenshot({ path: `${SAIDA}/landing-${esquema}.png`, fullPage: true });
  await ctx.close();
}

await navegador.close();
