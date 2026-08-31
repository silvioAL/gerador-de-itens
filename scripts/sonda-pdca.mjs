/**
 * Verificação visual do painel da análise (SPEC-94 fatia Z) contra a stack real,
 * nos dois temas — a tela do PDCA exige sessão, então esta sonda entra.
 *
 * Existe porque `textContent` não sabe de pixel, e três defeitos desta série de
 * rodadas passaram por suítes verdes.
 */
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

const WEB = process.env.WEB ?? "http://localhost:8080";
const SAIDA = "test-results/sonda-pdca";
mkdirSync(SAIDA, { recursive: true });

const navegador = await chromium.launch();

for (const esquema of ["dark", "light"]) {
  const ctx = await navegador.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: esquema });
  const p = await ctx.newPage();
  await p.addInitScript(() => localStorage.setItem("gerador:jornada-vista", "1"));

  // O mesmo caminho do helper `e2e/auth.ts`: a capa pública vem primeiro, o
  // "Entrar" dela leva ao formulário, e `dev@` tem vários times — então há a
  // tela de escolha depois.
  await p.goto(WEB, { waitUntil: "networkidle" });
  await p.getByRole("button", { name: "Entrar" }).first().click();
  await p.getByPlaceholder("voce@empresa.com").fill("dev@gerador.local");
  await p.getByRole("button", { name: "Entrar" }).click();
  const escolherTime = p.getByRole("button", { name: "time-pagamentos", exact: true });
  await escolherTime.waitFor({ state: "visible", timeout: 15000 }).catch(() => {});
  if (await escolherTime.isVisible().catch(() => false)) await escolherTime.click();
  await p.getByRole("button", { name: "+ Serviço", exact: true }).waitFor({ timeout: 15000 });

  await p.getByRole("button", { name: "☰ Menu" }).click();
  await p.getByRole("button", { name: /PDCA/ }).click();
  await p.waitForSelector('[data-testid="analise-do-ciclo"]', { timeout: 15000 });
  await p.waitForTimeout(600);

  const m = await p.evaluate(() => {
    const painel = document.querySelector('[data-testid="analise-do-ciclo"]');
    const cartoes = [...painel.querySelectorAll('[data-testid^="medida-"]')].map((c) => ({
      id: c.dataset.testid,
      texto: (c.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 60),
      // A cor precisa sair da paleta: nenhum cartão pode herdar tinta do browser.
      cor: getComputedStyle(c.querySelector("div:nth-child(2)")).color,
    }));
    const listas = document.querySelector('[data-testid="feedbacks-do-ciclo"]');
    return {
      alturaDoPainel: Math.round(painel.getBoundingClientRect().height),
      yDoPainel: Math.round(painel.getBoundingClientRect().top + window.scrollY),
      yDasListas: listas ? Math.round(listas.getBoundingClientRect().top + window.scrollY) : null,
      cartoes,
      semDado: !!document.querySelector('[data-testid="analise-sem-dado"]'),
      sinalQueMorre: document.querySelector('[data-testid="sinal-que-morre"]')?.textContent?.trim().slice(0, 70) ?? null,
      rolagemHorizontal: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    };
  });

  console.log(`\n=== ${esquema} ===`);
  console.log(JSON.stringify(m, null, 1));

  await p.locator('[data-testid="analise-do-ciclo"]').screenshot({ path: `${SAIDA}/painel-${esquema}.png` });
  await ctx.close();
}

await navegador.close();
