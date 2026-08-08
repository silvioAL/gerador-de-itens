import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
const chamadas = [];
p.on('request', (r) => {
  const m = r.url().match(/\/ia\/pipeline\/([^/?]+)/);
  if (m) {
    chamadas.push(decodeURIComponent(m[1]));
    console.log('CHAMADA papel:', decodeURIComponent(m[1]));
  }
});
await p.goto('http://localhost:4321');
await p.waitForTimeout(2000);
try { await p.locator('button:has-text("×")').first().click({ timeout: 3000 }); } catch {}
await p.click('text=Como funciona');
await p.waitForTimeout(400);
await p.click('text=Cenários prontos (18)');
const botoes = p.locator('button:has-text("Carregar no canvas")');
const n = await botoes.count();
for (let i = 0; i < n; i++) {
  const t = await botoes.nth(i).evaluate((el) => el.closest('div')?.parentElement?.textContent ?? '');
  if (t.includes('Integração interna entre serviços')) { await botoes.nth(i).click(); break; }
}
await p.waitForTimeout(800);
await p.click('button:has-text("Derivar Quebra")');
await p.waitForTimeout(2500);
// Faixa: papéis configurados (QA fora, nome custom do PO)
console.log('FAIXA handoff-po existe:', await p.locator('[data-testid="handoff-po"]').count());
console.log('FAIXA handoff-qa existe (deve ser 0):', await p.locator('[data-testid="handoff-qa"]').count());
console.log('FAIXA nome custom "PO do squad":', await p.locator('text=PO do squad').count());
await p.screenshot({ path: '_tmp-f1-esteira-custom.png' });
// espera terminar (3 papéis × 4 itens em 1 lote = 3 chamadas)
for (let i = 0; i < 40; i++) {
  await p.waitForTimeout(20000);
  if (i % 3 === 0) await p.screenshot({ path: `_tmp-f2-rodando-${String(i).padStart(2, '0')}.png` });
  if (await p.locator('button:has-text("Gerar de novo")').count() > 0) break;
}
console.log('TERMINOU. Chamadas:', JSON.stringify(chamadas));
// confirmacaoObrigatoria:false → tudo aplicado direto: contadores refinados
const contadores = await p.locator('header').first().textContent();
console.log('CONTADORES:', JSON.stringify(contadores?.match(/\d+ rascunho.*?refinado/)?.[0] ?? contadores?.slice(0, 120)));
await p.locator('[data-testid^="item-"]').first().click();
await p.click('button:has-text("Refinamento")');
await p.waitForTimeout(500);
const ticks = await p.locator('[data-testid^="placeholder-"] span').filter({ hasText: '✓' }).count();
console.log('CAMPOS CONFIRMADOS (✓) no item 1:', ticks);
await p.screenshot({ path: '_tmp-f3-fim.png' });
await b.close();
