import { test, expect } from "@playwright/test";
import { entrar } from "./auth";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("gerador:jornada-vista", "1"));
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

  await page.getByRole("button", { name: "+ Fila Rabbit" }).click();

  const node = page.locator(".react-flow__node", { hasText: "Fila Rabbit" });
  await node.click();

  // Nó recém-criado é vermelho (campos obrigatórios em aberto) — gate bloqueia.
  const botaoDerivar = page.getByRole("button", { name: "Derivar Quebra" });
  await expect(botaoDerivar).toBeDisabled();

  const painel = page.locator("aside");
  await painel.getByRole("textbox", { name: "Nome da fila" }).fill("proposta.aprovada.q");
  await painel.getByRole("checkbox", { name: "Durable" }).check();
  await painel.getByRole("combobox", { name: "Tipo de fila" }).selectOption("quorum");
  await painel.getByRole("spinbutton", { name: "TTL da mensagem (ms)" }).fill("60000");
  await painel.getByRole("combobox", { name: "Ack" }).selectOption("manual");

  await expect(botaoDerivar).toBeEnabled();
  await botaoDerivar.click();

  await expect(page.getByText("1 itens")).toBeVisible();
  await expect(page.getByRole("button", { name: "01" })).toBeVisible();
  await expect(page.getByText("Não é possível derivar ainda")).not.toBeVisible();

  await page.screenshot({ path: "e2e/screenshots/revisao.png", fullPage: true });

  // Selecionar o item mostra a ficha técnica ao lado — revisão e especificação
  // continuam sendo uma coisa só, mas o "expandir inline" virou lista à
  // esquerda + ficha à direita (SPEC-24). O texto de vazio é o que prova que a
  // ficha só aparece depois da escolha.
  await expect(page.getByText("Selecione um item na lista")).toBeVisible();

  // O chat de refinamento abre pelo bubble flutuante (mesmo esquema do #298),
  // que substituiu o botão "✦ Refinar conversando" do header — e sem item
  // selecionado o clique seleciona o primeiro, porque a conversa é POR item.
  await page.getByTestId("abrir-conversa-especificacao").click();
  await expect(page.getByTestId("conversa-especificacao")).toBeVisible();
  await expect(page.getByText("Selecione um item na lista")).not.toBeVisible();
  // O mesmo bubble fecha (vira ×) — e devolve a tela como estava.
  await page.getByTestId("abrir-conversa-especificacao").click();
  await expect(page.getByTestId("conversa-especificacao")).toHaveCount(0);

  await page.locator('[data-testid^="item-"]').first().click();
  // O que o nó era no canvas chega classificado na ficha: o tipo virou tech e
  // contexto, e é isso que depois seleciona as regras de refinamento. Sem este
  // elo a ficha seria um formulário vazio com um número em cima.
  await expect(page.getByText("Backend-mensagens rabbitmq")).toBeVisible();
  await expect(page.getByText("Criar Fila Rabbit.")).toBeVisible();

  const downloadMd = page.waitForEvent("download");
  await page.getByRole("button", { name: "Gerar especificação de solução" }).click();
  const md = await downloadMd;
  expect(md.suggestedFilename()).toBe("especificacao-de-solucao.md");

  await page.getByRole("button", { name: "Voltar ao canvas" }).click();
  await expect(page.getByText("1 itens")).not.toBeVisible();
  await expect(page.locator(".react-flow__node")).toBeVisible();

  expect(erros, `Erros no console do browser:\n${erros.join("\n")}`).toEqual([]);
});
