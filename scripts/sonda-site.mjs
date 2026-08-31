/**
 * Sonda do site público contra a stack real (:8080).
 *
 * Nasceu no §341 para remedir a landing e sobreviveu ao §342, quando ela virou
 * site em páginas: agora percorre as seis e mede cada uma, nos dois temas.
 *
 * Existe porque três defeitos desta série passaram por suítes verdes —
 * `textContent` não sabe de pixel.
 */
import { chromium } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";

const ALVO = process.env.ALVO ?? "http://localhost:8080";
const SAIDA = "test-results/sonda-landing";
mkdirSync(SAIDA, { recursive: true });

/** Cada página com a peça que prova que ela pintou — a lição do §336: sem
 *  esperar o React, mede-se uma página vazia e passa sempre. */
const PAGINAS = [
  { rota: "/", nome: "capa", espera: "capa" },
  { rota: "/#/site/o-problema", nome: "o-problema", espera: "evolucao-do-trabalho" },
  { rota: "/#/site/o-conceito", nome: "o-conceito", espera: "as-camadas" },
  { rota: "/#/site/o-ciclo", nome: "o-ciclo", espera: "ciclo-do-produto" },
  { rota: "/#/site/o-percurso", nome: "o-percurso", espera: "fluxo-do-processo" },
  { rota: "/#/site/arquitetura", nome: "arquitetura", espera: "arquitetura-provas" },
];

const navegador = await chromium.launch();
const resumo = {};

for (const esquema of ["dark", "light"]) {
  const ctx = await navegador.newContext({
    viewport: { width: 1440, height: 900 },
    colorScheme: esquema,
    deviceScaleFactor: 1,
  });
  const pagina = await ctx.newPage();
  resumo[esquema] = [];

  for (const p of PAGINAS) {
    await pagina.goto(ALVO + p.rota, { waitUntil: "networkidle" });
    await pagina.waitForSelector(`[data-testid="${p.espera}"]`, { timeout: 20000 });
    await pagina.waitForTimeout(500);

    const m = await pagina.evaluate(() => {
      const conta = (t) => (t ?? "").split(/\s+/).filter((x) => /[\p{L}\p{N}]/u.test(x)).length;
      return {
        altura: document.body.scrollHeight,
        telas: +(document.body.scrollHeight / 900).toFixed(1),
        palavras: conta(document.body.innerText),
        links: document.querySelectorAll("a").length,
        rolagemHorizontal: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        cabecalho: Math.round(document.querySelector(".landing-cabecalho")?.getBoundingClientRect().height ?? 0),
      };
    });

    resumo[esquema].push({ pagina: p.nome, ...m });
    await pagina.screenshot({ path: `${SAIDA}/${esquema}-${p.nome}.png`, fullPage: true });
  }

  await ctx.close();
}

writeFileSync(`${SAIDA}/medidas.json`, JSON.stringify(resumo, null, 2));
for (const esquema of Object.keys(resumo)) {
  console.log(`\n=== ${esquema} ===`);
  for (const p of resumo[esquema]) {
    console.log(
      `${p.pagina.padEnd(12)} ${String(p.altura).padStart(5)}px  ${String(p.telas).padStart(4)} telas  ` +
        `${String(p.palavras).padStart(5)} palavras  cabeçalho ${p.cabecalho}px  ` +
        `rolagemH:${p.rolagemHorizontal}`,
    );
  }
}

await navegador.close();
