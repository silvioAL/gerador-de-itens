import { test, expect } from "@playwright/test";
import { entrar } from "./auth";

const API = "http://localhost:4100";

/**
 * SPEC-110 fatia G (D13) — **o ciclo de melhoria fechando PELA TELA.**
 *
 * A prova é ponta a ponta de propósito: um feedback entra, o fluxo o lê, a
 * execução PARA numa tela, alguém decide, e a configuração muda. Cada metade
 * disso já tinha teste; nenhum deles prova a costura, que é onde as três
 * features "prontas e verdes" da retrospectiva morreram.
 *
 * Time próprio: este spec escreve o documento `fluxos` e mexe em regras.
 */
test.describe.configure({ mode: "serial" });

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("gerador:jornada-vista", "1"));
  await page.route(
    (url) => url.pathname === "/ia/status",
    (rota) => rota.fulfill({ json: { modelosChat: [], embeddingInstalado: false, capacidades: {} } })
  );
  await entrar(page, "time-checkout");
});

test("o ajuste para na TELA, e só o Avançar aplica na configuração", async ({ page }) => {
  test.setTimeout(180000);
  const original = (await (await page.request.get(`${API}/config/fluxos?timeId=time-checkout`)).json()).documento;
  const marca = `timeout-${Date.now()}`;

  try {
    // ── 1. Um feedback do time, pela porta de sempre ──
    const feedback = await page.request.post(`${API}/pdca/feedback`, {
      data: { texto: `o checklist de node não fala de ${marca}` },
    });
    expect(feedback.status()).toBe(201);

    /**
     * ── 2. O ciclo desenhado: ler → revisar (TELA) → propor → aplicar ──
     *
     * Sem agente aqui de propósito: a proposta vem por parâmetro. O que este
     * spec prova é a COSTURA (a tela no meio, e o efeito na config); o agente
     * já tem prova própria contra o dublê, e uma IA no caminho tornaria a
     * asserção sobre o conteúdo da regra dependente do que ela escrevesse.
     */
    await page.request.put(`${API}/config/fluxos`, {
      data: {
        timeId: "time-checkout",
        documento: {
          fluxos: [
            {
              id: "pdca-e2e",
              nome: "Melhoria (E2E)",
              nos: [
                { id: "gatilho", tipo: "gatilho", refId: "manual", posicao: { x: 0, y: 100 }, parametros: {} },
                { id: "le", tipo: "funcao", refId: "pdca-ler-feedbacks", posicao: { x: 240, y: 100 }, parametros: {} },
                { id: "revisao", tipo: "tela", refId: "revisao-do-ajuste", posicao: { x: 480, y: 100 }, parametros: {} },
                {
                  id: "propoe",
                  tipo: "funcao",
                  refId: "config-propor-ajuste",
                  posicao: { x: 720, y: 100 },
                  parametros: {
                    descricao: `o checklist de node precisa citar ${marca}`,
                    operacao: {
                      tipo: "adicionar-checklist",
                      secao: "checklistTecnico",
                      tech: "node",
                      contextos: [],
                      texto: `declarar ${marca} em toda chamada externa`,
                    },
                  },
                },
                { id: "aplica", tipo: "funcao", refId: "config-aplicar-ajuste", posicao: { x: 960, y: 100 }, parametros: {} },
              ],
              arestas: [
                { de: "gatilho", para: "le", mapeamento: [] },
                { de: "le", para: "revisao", mapeamento: [{ saida: "resumo", entrada: "feedbacks" }] },
                { de: "revisao", para: "propoe", mapeamento: [] },
                { de: "propoe", para: "aplica", mapeamento: [{ saida: "solicitacaoId", entrada: "solicitacaoId" }] },
              ],
            },
          ],
        },
      },
    });

    // ── 3. Rodar: a execução PARA na tela ──
    await page.goto("/#/fluxo/pdca-e2e");
    await expect(page.getByTestId("fluxo-screen")).toBeVisible();
    await page.getByTestId("executar-fluxo").click();

    const abrir = page.getByTestId("abrir-tela-do-stage");
    await expect(abrir).toBeVisible({ timeout: 30000 });
    // A configuração ainda NÃO mudou: a tela é um gate, não um aviso.
    const antes = await page.request.get(`${API}/config/regras?timeId=time-checkout`);
    expect(JSON.stringify(await antes.json())).not.toContain(marca);

    // ── 4. A tela mostra o que motivou, desenhada em blocos ──
    await abrir.click();
    await expect(page.getByTestId("tela-do-stage")).toBeVisible({ timeout: 15000 });
    const stage = page.getByTestId("tela-do-stage");
    // Dentro do stage e com `.first()`: o rótulo de um bloco casa no `<label>`
    // e no contêiner, e o modo estrito do Playwright recusa os dois.
    await expect(stage.getByText(marca).first()).toBeVisible();
    await expect(stage.getByText(/O que o time registrou/i).first()).toBeVisible();
    /**
     * D17c — o rótulo que a tela DECLARA está no BOTÃO, não numa legenda.
     *
     * A validação visual desta fatia pegou o contrário: a frase escrita
     * aparecia como texto inerte no corpo ("botão de avançar: …") enquanto o
     * botão de verdade dizia "Avançar →". Quem escreveu "Aplicar o ajuste"
     * lia a própria frase e clicava noutra coisa.
     */
    await expect(page.getByTestId("tela-avancar")).toHaveText(/Aplicar o ajuste/i);
    await expect(page.getByTestId("tela-retornar")).toHaveText(/Não aplicar/i);
    // E ela NÃO se repete como legenda no corpo.
    await expect(stage.getByTestId("bloco-acao-avancar")).toHaveCount(0);

    // ── 5. Avançar aplica — e a REGRA muda de verdade ──
    await page.getByTestId("tela-avancar").click();
    await expect
      .poll(
        async () => JSON.stringify(await (await page.request.get(`${API}/config/regras?timeId=time-checkout`)).json()),
        { timeout: 30000 }
      )
      .toContain(marca);

    // ── 6. E a aba PDCA conta a mesma história: o pedido está aplicado ──
    const ajustes = (await (await page.request.get(`${API}/ajustes`)).json()) as { descricao: string; estado: string }[];
    const daFiacao = ajustes.find((a) => a.descricao.includes(marca));
    expect(daFiacao).toBeDefined();
    expect(daFiacao!.estado).toBe("aplicada");
  } finally {
    await page.request.put(`${API}/config/fluxos`, { data: { documento: original, timeId: "time-checkout" } });
  }
});

test("Retornar na revisão NÃO aplica — e o pedido nem chega a existir", async ({ page }) => {
  test.setTimeout(120000);
  const original = (await (await page.request.get(`${API}/config/fluxos?timeId=time-checkout`)).json()).documento;
  const marca = `recusado-${Date.now()}`;
  try {
    await page.request.put(`${API}/config/fluxos`, {
      data: {
        timeId: "time-checkout",
        documento: {
          fluxos: [
            {
              id: "pdca-recusa-e2e",
              nome: "Melhoria recusada (E2E)",
              nos: [
                { id: "gatilho", tipo: "gatilho", refId: "manual", posicao: { x: 0, y: 100 }, parametros: {} },
                { id: "revisao", tipo: "tela", refId: "revisao-do-ajuste", posicao: { x: 240, y: 100 }, parametros: {} },
                {
                  id: "propoe",
                  tipo: "funcao",
                  refId: "config-propor-ajuste",
                  posicao: { x: 480, y: 100 },
                  parametros: {
                    descricao: `nunca deveria existir ${marca}`,
                    operacao: {
                      tipo: "adicionar-checklist",
                      secao: "checklistTecnico",
                      tech: "node",
                      contextos: [],
                      texto: marca,
                    },
                  },
                },
              ],
              arestas: [
                { de: "gatilho", para: "revisao", mapeamento: [] },
                { de: "revisao", para: "propoe", mapeamento: [] },
              ],
            },
          ],
        },
      },
    });

    await page.goto("/#/fluxo/pdca-recusa-e2e");
    await expect(page.getByTestId("fluxo-screen")).toBeVisible();
    await page.getByTestId("executar-fluxo").click();
    await page.getByTestId("abrir-tela-do-stage").click();
    await expect(page.getByTestId("tela-do-stage")).toBeVisible({ timeout: 15000 });

    await page.getByTestId("tela-retornar").click();
    await expect(page.getByTestId("tela-do-stage")).toHaveCount(0, { timeout: 15000 });

    // Nem a regra mudou, nem sobrou pedido pendente: retornar ENCERRA (D2), e
    // um pedido fantasma na aba seria pior que não ter proposto.
    const regras = await page.request.get(`${API}/config/regras?timeId=time-checkout`);
    expect(JSON.stringify(await regras.json())).not.toContain(marca);
    const ajustes = (await (await page.request.get(`${API}/ajustes`)).json()) as { descricao: string }[];
    expect(ajustes.some((a) => a.descricao.includes(marca))).toBe(false);
  } finally {
    await page.request.put(`${API}/config/fluxos`, { data: { documento: original, timeId: "time-checkout" } });
  }
});

test("o ciclo do PDCA vem de fábrica no catálogo, com a tela no meio", async ({ page }) => {
  await page.goto("/#/fluxo/pdca-melhoria");
  await expect(page.getByTestId("fluxo-screen")).toBeVisible();
  await expect(page.getByTestId("seletor-de-fluxo")).toHaveValue("pdca-melhoria", { timeout: 15000 });
  // O desenho responde sozinho o que o ciclo faz — sem ler documentação.
  await expect(page.locator('.react-flow__node[data-id="feedbacks"]')).toContainText("Ler feedbacks");
  await expect(page.locator('.react-flow__node[data-id="revisao"]')).toContainText("Revisar ajuste");
  await expect(page.locator('.react-flow__node[data-id="propoe"]')).toContainText("Propor ajuste");
  await expect(page.locator('.react-flow__node[data-id="aplica"]')).toContainText("Aplicar ajuste");
});
