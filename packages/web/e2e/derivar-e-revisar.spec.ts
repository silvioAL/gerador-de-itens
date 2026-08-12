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

test("derivar quebra abre a revisão com a atividade esperada e exporta", async ({ page }) => {
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

  await expect(page.getByTestId("contagem-itens")).toHaveText("1 itens");

  // SPEC-37 M4 — este spec declara "sem gateway" no /ia/status: o balão mais
  // bloqueante da revisão aparece, com o chip da aba certa.
  await expect(page.getByTestId("balao-sem-ia")).toContainText("sem credencial de gateway");
  await page.getByTestId("balao-sem-ia").getByRole("button", { name: "Dispensar sugestão" }).click();
  await expect(page.getByRole("button", { name: "01" })).toBeVisible();
  await expect(page.getByText("Não é possível derivar ainda")).not.toBeVisible();

  await page.screenshot({ path: "e2e/screenshots/revisao.png", fullPage: true });

  // Selecionar o item mostra a ficha técnica ao lado — revisão e especificação
  // continuam sendo uma coisa só, mas o "expandir inline" virou lista à
  // esquerda + ficha à direita (SPEC-24). O texto de vazio é o que prova que a
  // ficha só aparece depois da escolha. (Sem IA — o route do beforeEach — o
  // M1 não abre nada sozinho, e este fluxo manual é determinístico.)
  await expect(page.getByText("Selecione um item na lista")).toBeVisible();

  // O chat de refinamento abre pelo bubble flutuante (mesmo esquema do #298),
  // que substituiu o botão "✦ Refinar conversando" do header — e sem item
  // selecionado o clique seleciona o primeiro, porque a conversa é POR item.
  await page.getByTestId("abrir-conversa-especificacao").click();
  await expect(page.getByTestId("conversa-especificacao")).toBeVisible();
  await expect(page.getByText("Selecione um item na lista")).not.toBeVisible();
  await page.getByTestId("abrir-conversa-especificacao").click();
  await expect(page.getByTestId("conversa-especificacao")).toHaveCount(0);

  await page.locator('[data-testid^="item-"]').first().click();
  // O que o nó era no canvas chega classificado na ficha: o tipo virou tech e
  // contexto, e é isso que depois seleciona as regras de refinamento. Sem este
  // elo a ficha seria um formulário vazio com um número em cima.
  // Exato: com as regras vindas do DOCUMENTO (SPEC-36/§179), a mensagem de
  // "nada a escrever" do especialista também cita o contexto.
  await expect(page.getByText("Backend-mensagens rabbitmq", { exact: true })).toBeVisible();
  await expect(page.getByText("Criar Fila Rabbit.")).toBeVisible();

  const downloadMd = page.waitForEvent("download");
  await page.getByRole("button", { name: "Gerar especificação de solução" }).click();
  const md = await downloadMd;
  expect(md.suggestedFilename()).toBe("especificacao-de-solucao.md");

  await page.getByRole("button", { name: "Voltar ao canvas" }).click();
  await expect(page.getByTestId("contagem-itens")).not.toBeVisible();
  await expect(page.locator(".react-flow__node")).toBeVisible();

  // O nome respondido no balão virou o título, e o auto-save aconteceu de
  // verdade: o indicador do header diz "salva" (não "dê um título antes").
  await expect(page.getByLabel("Título da quebra")).toHaveValue("Fila de propostas aprovadas");
  await expect(page.getByText(/· salva$/)).toBeVisible();

  expect(erros, `Erros no console do browser:\n${erros.join("\n")}`).toEqual([]);
});
