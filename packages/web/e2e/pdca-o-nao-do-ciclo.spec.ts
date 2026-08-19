import { test, expect, type Page } from "@playwright/test";
import { entrar } from "./auth";
import { derivarNaMesa } from "./derivar";

const API = "http://localhost:4100";

/**
 * SPEC-62 — o "não" do ciclo, e a entrada que pulava o Check.
 *
 * RELATO REAL do usuário: *"na parte de sugestões... ali no ciclo pdca, mas só
 * aparece direto para aprovar antes de conseguir ver o pdca (não gerei nenhuma
 * nova), e se rejeito simplesmente some para sempre"*.
 *
 * Três defeitos num relato só, e os três foram medidos contra a stack antes de
 * virar código: o pedido nascia direto na fila de decisão (sem feedback, sem
 * data, sem prévia), a recusa era muda, e o "não" não tinha volta — nem pela
 * API (`409` em qualquer nova decisão).
 */

/** Login de quem tem UM time só — não passa pela EscolherTimeScreen. */
async function entrarComTimeUnico(page: Page, email: string) {
  await page.goto("/");
  await page.getByRole("button", { name: "Entrar" }).first().click();
  await page.getByPlaceholder("voce@empresa.com").fill(email);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByRole("button", { name: "+ Serviço", exact: true })).toBeVisible({ timeout: 15000 });
}

test("§278 — quem decide vê de onde veio, quando, e o efeito; e o 'não' tem motivo e volta", async ({ page }) => {
  test.setTimeout(90000);
  await page.addInitScript(() => localStorage.setItem("gerador:jornada-vista", "1"));
  await entrar(page);

  const texto = `faltou item de DLQ nas filas ${Date.now()}`;
  const feedback = await (await page.request.post(`${API}/pdca/feedback`, { data: { texto, timeId: "time-pagamentos" } })).json();
  const pedido = await (
    await page.request.post(`${API}/ajustes`, {
      data: {
        recurso: "regras",
        descricao: "Adicionar DLQ ao checklist técnico",
        timeId: "time-pagamentos",
        feedbackId: feedback.id,
        operacao: { tipo: "adicionar-checklist", tech: "Backend", contextos: [], texto: "Política de DLQ monitorada" },
      },
    })
  ).json();

  await page.goto("/#/config/pdca");
  const card = page.getByTestId(`ajuste-${pedido.id}`);
  await expect(card).toBeVisible();

  // O que faltava a quem decide: a origem, a data e o efeito.
  await expect(page.getByTestId(`origem-${pedido.id}`)).toContainText(texto);
  await expect(card).toContainText(new Date().toLocaleDateString("pt-BR"));
  await page.getByTestId(`ver-efeito-${pedido.id}`).click();
  await expect(page.getByTestId(`efeito-${pedido.id}`)).toContainText("Política de DLQ monitorada");

  // Recusar deixou de ser mudo.
  await page.getByTestId(`recusar-${pedido.id}`).click();
  await page.getByLabel("Motivo da recusa").fill("já existe um item equivalente em observabilidade");
  await page.getByTestId(`confirmar-recusa-${pedido.id}`).click();
  await expect(page.getByTestId(`motivo-${pedido.id}`)).toContainText("já existe um item equivalente");

  // E deixou de ser beco: reconsiderar devolve a pendente SEM apagar o "não".
  await page.getByTestId(`reconsiderar-${pedido.id}`).click();
  await expect(card).toContainText("pendente");
  await expect(page.getByTestId(`motivo-${pedido.id}`)).toContainText("recusada antes");
  await expect(page.getByTestId(`aprovar-${pedido.id}`)).toBeVisible();
});

test("§278 — o feedback descartado volta a 'sem tratar', em vez de sumir para sempre", async ({ page }) => {
  test.setTimeout(60000);
  await page.addInitScript(() => localStorage.setItem("gerador:jornada-vista", "1"));
  await entrar(page);

  const texto = `sobrou volumetria nos itens ${Date.now()}`;
  const feedback = await (await page.request.post(`${API}/pdca/feedback`, { data: { texto, timeId: "time-pagamentos" } })).json();

  await page.goto("/#/config/pdca");
  await page.getByTestId(`descartar-${feedback.id}`).click();

  // Medido antes da correção: `visível: false` — ele ia para dentro do
  // histórico fechado e não voltava de lá.
  await expect(page.getByTestId(`feedback-${feedback.id}`)).toHaveCount(0);
  await page.getByText(/ver os \d+ tratado/).click();
  await page.getByTestId(`reabrir-${feedback.id}`).click();

  await expect(page.getByTestId(`feedback-${feedback.id}`)).toBeVisible();
  await expect(page.getByTestId(`propor-${feedback.id}`)).toBeVisible();
});

/**
 * A entrada que pulava o Check: o balão da entrevista chamava `criarAjuste`
 * direto, e a tela do ciclo dizia "Ninguém deixou feedback ainda" ao lado de
 * "1 aguardando decisão".
 *
 * O caminho é de quem NÃO é owner — owner recebe o chip "Revisar
 * configurações" no lugar da caixa de texto.
 */
test("§278 — o que se escreve na entrevista entra pelo CHECK, não na fila de decisão", async ({ page, browser }) => {
  test.setTimeout(90000);
  await page.addInitScript(() => localStorage.setItem("gerador:jornada-vista", "1"));
  await entrar(page);

  const timeId = "time-e2e-pdca-entrada";
  const membro = `pdca-${Math.random().toString(36).slice(2, 8)}@gerador.local`;
  expect([201, 409]).toContain((await page.request.post(`${API}/times`, { data: { timeId } })).status());
  // `operar` e não `owner`: é justamente quem NÃO configura que recebe a caixa
  // de texto da entrevista — owner recebe o chip "Revisar configurações".
  expect((await page.request.post(`${API}/times/${timeId}/membros`, { data: { email: membro, nivel: "operar" } })).status()).toBe(201);

  const contexto = await browser.newContext();
  const paginaMembro = await contexto.newPage();
  try {
    await paginaMembro.addInitScript(() => localStorage.setItem("gerador:jornada-vista", "1"));
    await paginaMembro.route(
      (url) => url.pathname === "/ia/status",
      (rota) => rota.fulfill({ json: { modelosChat: [], embeddingInstalado: false, capacidades: {} } })
    );
    await entrarComTimeUnico(paginaMembro, membro);

    /**
     * A cadência NÃO é mexida aqui, e isso é decisão de teste, não preguiça: ela
     * é config GLOBAL, e um segundo spec baixando-a para 1 em paralelo fez três
     * vizinhos quebrarem (medido — balão de feedback aparecendo no meio do
     * fluxo deles). O contador de usos é POR USUÁRIO, então gastar quatro usos
     * deste membro recém-criado faz o quinto — a derivação de verdade, logo
     * abaixo — cair na cadência padrão de 5. Exercita o mecanismo real e não
     * contamina ninguém.
     */
    for (let i = 0; i < 4; i++) {
      await paginaMembro.request.post(`${API}/pdca/uso`, { data: { tipo: "derivacao", timeId } });
    }

    // Cenário pronto: derivar exige o desenho resolvido, e um componente vazio
    // deixa o botão desabilitado ("Faltam resolver: Serviço").
    await paginaMembro.getByTestId("abrir-cenarios").click();
    await paginaMembro.getByRole("button", { name: "Carregar cenário: Dados não-relacionais" }).click();
    await derivarNaMesa(paginaMembro);
    const semTitulo = paginaMembro.getByTestId("assistente-balao-secundaria");
    if (await semTitulo.isVisible().catch(() => false)) await semTitulo.click();
    // A entrevista espera no CANVAS: a revisão precisa ser fechada primeiro.
    await paginaMembro.getByRole("button", { name: "Voltar à mesa de projeto" }).click();
    await expect(paginaMembro.getByTestId("assistente-balao")).toContainText("Sentiu falta", { timeout: 20000 });

    const texto = `faltou campo de SLA no serviço ${Date.now()}`;
    // O que a pessoa escreve tem que virar FEEDBACK — e a resposta 201 do
    // /pdca/feedback é a prova de que foi por essa porta, e não por /ajustes.
    const gravado = paginaMembro.waitForResponse((r) => r.url().includes("/pdca/feedback") && r.request().method() === "POST");
    await paginaMembro.getByLabel("ex.: faltou item de DLQ no checklist").fill(texto);
    await paginaMembro.getByTestId("assistente-balao-confirmar").click();
    expect((await gravado).status()).toBe(201);

    // E do lado de quem configura: ele chega em "O que disseram", com o botão
    // de propor — não na fila de decisão já pedindo assinatura.
    const feedbacks = await (await page.request.get(`${API}/pdca/feedback`)).json();
    const meu = feedbacks.find((f: { texto: string }) => f.texto === texto);
    expect(meu, "o texto da entrevista tem que virar feedback").toBeDefined();
    expect(meu.estado).toBe("novo");

    const ajustes = await (await page.request.get(`${API}/ajustes?timeId=${timeId}`)).json();
    expect(
      ajustes.filter((a: { descricao: string }) => a.descricao === texto),
      "o texto NÃO pode nascer como solicitação pendente — é o defeito do relato"
    ).toHaveLength(0);
  } finally {
    await contexto.close();
  }
});
