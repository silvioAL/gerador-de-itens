import { chromium } from "playwright";

/**
 * SPEC-110 fatia J — validação visual do subfluxo e da jornada, nos DOIS temas,
 * contra a stack real (:8080).
 *
 * A pergunta que ela faz: olhando o mestre sem abrir nada, dá para saber que
 * cada cartão ali é um FLUXO inteiro — e qual?
 *
 * A asserção sobre `data-tema` não é decoração: sem ela, duas capturas
 * idênticas passam por "validado nos dois temas" (a lição da fatia E).
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
  await page.goto(`${BASE}/#/fluxo/jornada-da-demanda`);
  await page.evaluate((t) => localStorage.setItem("gerador:tema", t), tema);
  // `goto` para a MESMA URL não recarrega — a lição da fatia E.
  await page.reload();
  await page.waitForTimeout(3000);
  const aplicado = await page.evaluate(() => document.documentElement.getAttribute("data-tema"));
  console.log(`[${tema}] data-tema: ${aplicado}`, aplicado === tema ? "✅" : "❌ NÃO TROCOU");

  await page.getByTestId("fluxo-screen").waitFor({ timeout: 15000 });

  // Os cartões do mestre: cada um é um fluxo, e diz QUAL.
  const cartoes = await page.evaluate(() =>
    [...document.querySelectorAll(".react-flow__node")].map((el) => {
      const r = el.getBoundingClientRect();
      return {
        id: el.getAttribute("data-id"),
        texto: el.innerText.replace(/\s+/g, " ").trim().slice(0, 70),
        largura: Math.round(r.width),
        esquerda: Math.round(r.left),
        direita: Math.round(r.right),
        topo: Math.round(r.top),
        base: Math.round(r.bottom),
      };
    })
  );
  for (const c of cartoes) console.log(`[${tema}] ${c.id}: "${c.texto}" (${c.largura}px)`);

  // O cabeçalho de família vem em CAIXA ALTA no cartão (`text-transform`) — a
  // primeira versão desta régua procurava "Subfluxo" e contava zero em tudo:
  // um ❌ que era do medidor, não do produto.
  const subfluxos = cartoes.filter((c) => /subfluxo/i.test(c.texto));
  console.log(`[${tema}] cartões de subfluxo:`, subfluxos.length, subfluxos.length >= 2 ? "✅" : "❌ POUCOS");
  // O cartão tem de nomear o fluxo de dentro: "Subfluxo" sozinho não responde
  // "qual?", que é a pergunta inteira desta fatia.
  const mudos = subfluxos.filter((c) => c.texto.replace(/subfluxo/i, "").trim().length < 3);
  console.log(`[${tema}] subfluxos sem o nome do fluxo:`, mudos.length === 0 ? "✅" : `❌ ${mudos.map((c) => c.id)}`);

  /**
   * Cartões ENCAVALADOS — a lição da SPEC-109 (cartão largo esconde o handle
   * do vizinho), e o achado desta validação: com o passo de 280px das outras
   * fábricas, o cartão da esteira (348px) invadia o da exportação.
   */
  const encavalados = [];
  for (let i = 0; i < cartoes.length; i++)
    for (let j = i + 1; j < cartoes.length; j++) {
      const a = cartoes[i];
      const b = cartoes[j];
      if (a.esquerda < b.direita && b.esquerda < a.direita && a.topo < b.base && b.topo < a.base)
        encavalados.push(`${a.id}×${b.id}`);
    }
  console.log(`[${tema}] cartões encavalados:`, encavalados.length === 0 ? "✅" : `❌ ${encavalados}`);

  // A cor da família nova, medida na tela e não no código: o índigo do
  // subfluxo tem de se distinguir do roxo do agente e do azul da tela.
  const cor = await page.evaluate(() => {
    const el = document.querySelector('.react-flow__node[data-id="ensaio-de-cenarios"]');
    if (!el) return "(sem cartão)";
    const marca = el.querySelector("svg") ?? el;
    return getComputedStyle(marca).color;
  });
  console.log(`[${tema}] cor do cartão de subfluxo:`, cor);

  /**
   * Quantos cartões cabem INTEIROS na área — a régua geométrica do §300.
   *
   * **Dívida medida, não falha desta fatia:** o React Flow calcula os limites
   * do `fitView` pelas POSIÇÕES dos nós, ignorando a largura dos cartões (o
   * botão "Fit View" dele dá o mesmo resultado que o nosso enquadramento). Com
   * cartões de ~190px isso nunca apareceu; os do mestre chegam a 348. O
   * conserto pede mexer no ciclo de medida do canvas, que atinge todos os
   * fluxos — rodada própria. Aqui a régua fica REGISTRANDO o número, para a
   * próxima rodada saber de onde partiu.
   */
  const larguraDaArea = await page.evaluate(() => Math.round(document.querySelector(".react-flow").getBoundingClientRect().right));
  const inteiros = cartoes.filter((c) => c.direita <= larguraDaArea + 2).length;
  console.log(`[${tema}] cartões inteiros na área: ${inteiros}/${cartoes.length}`, inteiros >= 3 ? "✅ (dívida conhecida)" : "❌ PIOROU");

  await page.screenshot({ path: `C:/tmp/jornada-${tema}.png`, fullPage: false });

  // O PAINEL do subfluxo: o propósito, o seletor e a porta.
  await page.locator('.react-flow__node[data-id="ensaio-de-cenarios"]').click();
  await page.waitForTimeout(800);
  const painel = await page.evaluate(() => {
    const el = document.querySelector('[data-testid="painel-do-no"]');
    return el ? el.innerText.replace(/\s+/g, " ").trim().slice(0, 200) : "(sem painel)";
  });
  console.log(`[${tema}] painel: "${painel}"`);
  const temPorta = await page.getByTestId("abrir-o-subfluxo").isVisible().catch(() => false);
  const temSeletor = await page.getByTestId("fluxo-do-subfluxo").isVisible().catch(() => false);
  console.log(`[${tema}] porta e seletor no painel:`, temPorta && temSeletor ? "✅" : "❌ FALTA");
  await page.screenshot({ path: `C:/tmp/jornada-painel-${tema}.png`, fullPage: false });

  // E a GALERIA, onde o mestre aparece em destaque.
  await page.goto(`${BASE}/#/fluxo`);
  await page.waitForTimeout(2000);
  await page.getByTestId("galeria-de-fluxos").waitFor({ timeout: 15000 });
  const destaque = await page.evaluate(() => {
    const el = document.querySelector('[data-testid="card-fluxo-jornada-da-demanda"]');
    if (!el) return "(sem card)";
    const r = el.getBoundingClientRect();
    return `${el.innerText.replace(/\s+/g, " ").trim().slice(0, 90)} | topo=${Math.round(r.top)}`;
  });
  console.log(`[${tema}] card da jornada: ${destaque}`);
  await page.screenshot({ path: `C:/tmp/jornada-galeria-${tema}.png`, fullPage: false });
}

await navegador.close();
console.log("fim");
