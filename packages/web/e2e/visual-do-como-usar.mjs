/**
 * SPEC-110 fatia K — validação visual do "Como usar" reestruturado.
 *
 * O que se olha aqui não é cor: é se a REESTRUTURAÇÃO cumpriu o que prometeu.
 * O manual tinha quinze passos numerados em fila, e o gesto mais comum do dia
 * ("Confirme o que a IA escreveu") caía em décimo segundo. A régua é simples e
 * dura: o caminho tem cinco passos, e o Confirme está dentro dele.
 *
 * O rito de sempre: os dois temas na MESMA sessão, com `reload` e asserção
 * sobre `data-tema` — sem ela, duas capturas idênticas passam por validação.
 */
import { chromium } from "playwright";

const BASE = "http://localhost:8080";
const nav = await chromium.launch();
const page = await (await nav.newContext({ viewport: { width: 1440, height: 900 } })).newPage();

await page.addInitScript(() => localStorage.setItem("gerador:jornada-vista", "1"));
await page.goto(BASE);
await page.getByRole("button", { name: /^entrar$/i }).first().click();
await page.getByPlaceholder("voce@empresa.com").fill("dev@gerador.local");
await page.getByRole("button", { name: "Entrar" }).click();
await page.waitForTimeout(3500);
const escolher = page.getByRole("button", { name: /^time-/ }).first();
if (await escolher.isVisible().catch(() => false)) await escolher.click();
await page.waitForTimeout(2000);

for (const tema of ["claro", "escuro"]) {
  await page.evaluate((t) => localStorage.setItem("gerador:tema", t), tema);
  await page.reload();
  await page.waitForTimeout(2500);

  const marcado = await page.evaluate(() => document.documentElement.getAttribute("data-tema"));
  console.log(`[${tema}] data-tema:`, marcado, marcado === tema ? "OK" : "x TEMA NAO TROCOU");

  await page.getByTestId("abrir-como-funciona").click();
  await page.getByTestId("como-usar").waitFor({ timeout: 15000 });
  await page.waitForTimeout(500);

  const secoes = await page.locator('[data-testid="como-usar"] section h3').allInnerTexts();
  console.log(`[${tema}] seções: ${secoes.length}`, secoes.join(" | "));

  // A régua da fatia: o caminho é curto, e o gesto do dia está NELE.
  const doCaminho = await page
    .locator('[data-testid="como-usar"] section')
    .first()
    .locator("li strong")
    .allInnerTexts();
  console.log(`[${tema}] passos do caminho: ${doCaminho.length}`, doCaminho.length === 5 ? "OK" : "x");
  console.log(
    `[${tema}] "Confirme" está no caminho:`,
    doCaminho.some((t) => t.includes("Confirme")) ? "OK" : "x AINDA PERDIDO"
  );

  // Todos os quinze passos continuam lá — reestruturar não é apagar.
  const total = await page.locator('[data-testid="como-usar"] li').count();
  console.log(`[${tema}] passos no total: ${total}`, total === 15 ? "OK" : "x PERDEU PASSO");

  // A chamada de cada seção precisa ser legível: ela usa `--texto-mudo`, que é
  // a cor mais fraca da casa — o lugar onde um tema quebra primeiro.
  const cores = await page.evaluate(() => {
    const p = document.querySelector('[data-testid="como-usar"] section p');
    return { texto: getComputedStyle(p).color, fundo: getComputedStyle(document.body).backgroundColor };
  });
  console.log(`[${tema}] chamada da seção:`, cores.texto, "sobre", cores.fundo);

  await page.screenshot({ path: `test-results/como-usar-${tema}.png`, fullPage: false });
  await page.keyboard.press("Escape");
}

await nav.close();
console.log("fim");
