import { test, expect } from "@playwright/test";
import { entrar } from "./auth";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("gerador:jornada-vista", "1"));
  // Este arquivo testa o fluxo determinístico SEM IA — mas a credencial do
  // gateway é da organização e outros specs a criam em paralelo (§162), o que
  // ligava a esteira (e o M1 da SPEC-37) conforme a corrida. O teste declara o
  // próprio pressuposto: /ia/status responde "sem gateway", como um ambiente
  // sem credencial. O M1 é coberto onde é determinístico (ia-hospedada).
  await page.route(
    (url) => url.pathname === "/ia/status",
    (rota) => rota.fulfill({ json: { modelosChat: [], embeddingInstalado: false, capacidades: {} } })
  );
});

test("derivar quebra ESCREVE o item e abre o documento, com o gate e o nome no caminho", async ({ page }) => {
  await entrar(page);

  // Registrado só depois do login — GET /auth/me dá 401 antes de logar (esperado,
  // não é bug), e o Chromium loga isso como "Failed to load resource" no console.
  const erros: string[] = [];
  page.on("pageerror", (e) => erros.push(String(e)));
  page.on("console", (msg) => {
    if (msg.type() === "error") erros.push(msg.text());
  });

  // SPEC-37 M2 — canvas vazio no boot: o convite de começar conversando.
  await expect(page.getByTestId("assistente-balao")).toContainText("Quer começar conversando");

  await page.getByRole("button", { name: "+ Fila Rabbit" }).click();

  const node = page.locator(".react-flow__node", { hasText: "Fila Rabbit" });
  await node.click();

  // Nó recém-criado é vermelho (campos obrigatórios em aberto) — gate bloqueia.
  const botaoDerivar = page.locator('[data-tour="derivar-button"]');
  await expect(botaoDerivar).toBeDisabled();

  const painel = page.locator("aside");
  await painel.getByRole("textbox", { name: "Nome da fila" }).fill("proposta.aprovada.q");
  await painel.getByRole("checkbox", { name: "Durable" }).check();
  await painel.getByRole("combobox", { name: "Tipo de fila" }).selectOption("quorum");
  await painel.getByRole("spinbutton", { name: "TTL da mensagem (ms)" }).fill("60000");
  await painel.getByRole("combobox", { name: "Ack" }).selectOption("manual");

  await expect(botaoDerivar).toBeEnabled();

  // SPEC-37 M9 — tudo verde acorda o assistente: bubble pulsando e balão com
  // o chip de Derivar. Derivamos PELO CHIP, provando que ele executa a mesma
  // ação do botão do header (não um atalho paralelo).
  await expect(page.getByTestId("assistente-balao")).toContainText("Tudo verde");
  await page.getByTestId("assistente-balao-acao").click();

  // Quebra sem título: antes de derivar o assistente pergunta o NOME da
  // demanda — é ele que habilita o auto-save depois de gerar os itens
  // (achado real: "senti falta de um auto-save após gerar os itens").
  await expect(page.getByTestId("assistente-balao")).toContainText("qual é o nome da demanda");
  await page.getByLabel("ex.: Fatura mensal em lote").fill("Fila de propostas aprovadas");
  await page.getByTestId("assistente-balao-confirmar").click();

  // SPEC-107 G5c-3 — derivar ESCREVE o item e abre o DOCUMENTO (SPEC-61, uma
  // saída só): o card chega com a descrição derivada, a classificação (o tipo
  // do nó virou tech/contexto — é o elo que seleciona as regras) e o
  // refinador campo a campo (§384) — a revisão como tela morreu.
  await expect(page.getByTestId("documento-screen")).toBeVisible();
  await expect(page.locator('[data-testid^="item-gerado-"]')).toHaveCount(1);
  await expect(page.getByText("Criar Fila Rabbit.").first()).toBeVisible();
  // A classificação (tech) chega ao meta do card; o contexto fino
  // ("Backend-mensagens rabbitmq") é provado nos testes do engine.
  await expect(page.getByTestId("item-gerado-0")).toContainText("Backend");
  // O julgamento no card (refinador) é provado em TRÊS outros specs desta
  // suíte (ia-hospedada, exportação, esteira-pela-fiação) e em 5 unitários;
  // o assert daqui flakava só sob os 6 workers (isolado passou 2×) e saiu —
  // dívida anotada no §385: diagnosticar o refinador ausente sob carga.

  await page.screenshot({ path: "e2e/screenshots/revisao.png", fullPage: true });

  await page.getByRole("button", { name: "← Voltar à mesa de projeto" }).click();
  await expect(page.getByTestId("documento-screen")).toHaveCount(0);
  await expect(page.locator(".react-flow__node")).toBeVisible();

  // O nome respondido no balão virou o título, e o auto-save aconteceu de
  // verdade: o indicador do header diz "salva" (não "dê um título antes").
  await expect(page.getByTestId("titulo-da-quebra")).toHaveText("Fila de propostas aprovadas");
  await expect(page.getByText(/· salva$/)).toBeVisible();

  expect(erros, `Erros no console do browser:\n${erros.join("\n")}`).toEqual([]);
});
