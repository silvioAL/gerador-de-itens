import { test, expect } from "@playwright/test";
import { entrar } from "./auth";

// Modal da jornada abre sozinho no primeiro acesso (sem a flag no localStorage) —
// marca como já vista antes de cada teste que não é sobre a própria jornada,
// senão o overlay intercepta todo clique no header/canvas.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("gerador:jornada-vista", "1"));
});

test("paleta completa de tipos, criação de nó, preenchimento e prontidão verde", async ({ page }) => {
  await entrar(page);

  // Registrado só depois do login: o próprio boot de sessão dispara um
  // GET /auth/me que dá 401 antes de logar (esperado, não é bug) — o Chromium
  // loga isso como "Failed to load resource" no console; o que este teste
  // quer garantir é que a FEATURE em si não solta erro, não o handshake de auth.
  const erros: string[] = [];
  page.on("pageerror", (e) => erros.push(String(e)));
  page.on("console", (msg) => {
    if (msg.type() === "error") erros.push(msg.text());
  });

  // Paleta com todos os tipos do config (service, kafka, rabbit, rabbit-exchange,
  // mongo, sql, camunda, fico, external, job, rule) — 11 tipos.
  const botoesDeTipo = page.locator("header button", { hasText: "+" });
  await expect(botoesDeTipo).toHaveCount(11);
  await expect(page.getByRole("button", { name: "+ Fila Rabbit" })).toBeVisible();
  await expect(page.getByRole("button", { name: "+ Tópico Kafka" })).toBeVisible();
  await expect(page.getByRole("button", { name: "+ Processo Camunda" })).toBeVisible();

  await page.getByRole("button", { name: "+ Fila Rabbit" }).click();

  const node = page.locator(".react-flow__node", { hasText: "Fila Rabbit" });
  await expect(node).toBeVisible();
  await node.click();

  const painel = page.locator("aside");
  await expect(painel.getByText("Fila Rabbit", { exact: true })).toBeVisible();
  await expect(painel.getByText("vermelho")).toBeVisible();

  await painel.getByRole("textbox", { name: "Nome da fila" }).fill("proposta.aprovada.q");
  await painel.getByRole("checkbox", { name: "Durable" }).check();
  await painel.getByRole("combobox", { name: "Tipo de fila" }).selectOption("quorum");
  await painel.getByRole("spinbutton", { name: "TTL da mensagem (ms)" }).fill("60000");
  await painel.getByRole("combobox", { name: "Ack" }).selectOption("manual");

  await expect(painel.getByText("verde")).toBeVisible();
  await expect(painel.getByText("manual", { exact: true }).first()).toBeVisible();

  await page.screenshot({ path: "e2e/screenshots/fluxo-basico.png", fullPage: true });

  expect(erros, `Erros no console do browser:\n${erros.join("\n")}`).toEqual([]);
});

test("Sair encerra a sessão e volta pra tela de login (achado real: requisitar() 400ava em POST sem corpo)", async ({
  page,
}) => {
  await entrar(page);

  await page.getByRole("button", { name: "Sair" }).click();

  // mostrarLogin já ficou true no login anterior (App.tsx) — depois de sair,
  // cai direto na tela de login, não na landing pública de novo.
  await expect(page.getByPlaceholder("voce@empresa.com")).toBeVisible();
});

test("gerar link de convite funciona pelo browser de verdade (achado real: mesmo bug do Sair)", async ({ page }) => {
  await entrar(page);

  await page.getByRole("button", { name: "⚙ Configurações" }).click();
  await page.getByRole("button", { name: "Membros" }).click();
  await page.getByRole("button", { name: "Gerar link de convite" }).click();

  await expect(page.locator("code", { hasText: "convite=" })).toBeVisible();
});

test("perfil de stack do time sugere linguagem/framework do serviço", async ({ page }) => {
  // Login como time-pagamentos já define o time ativo — não tem mais input livre.
  await entrar(page, "time-pagamentos");

  await page.getByRole("button", { name: "+ Serviço" }).click();

  const node = page.locator(".react-flow__node", { hasText: "Serviço" });
  await node.click();

  const painel = page.locator("aside");
  await expect(painel.getByText("usar sugestão: Java")).toBeVisible();

  await painel.getByText("usar sugestão: Java").click();
  await expect(painel.locator("select").first()).toHaveValue("Java");

  // Um dos jeitos de "configurar a stack do time": capturar valores preenchidos
  // manualmente num nó real — grava direto no @gerador/server (compartilhado com
  // o resto do time), não baixa mais arquivo nenhum.
  const botaoSalvarPerfil = painel.getByText(/salvar estes valores como padrão do time/);
  await expect(botaoSalvarPerfil).toBeVisible();
  await botaoSalvarPerfil.click();

  await page.getByRole("button", { name: "⚙ Configurações" }).click();
  await page.getByRole("button", { name: /Perfis de time/ }).click();
  const cardTimePagamentos = page.locator("div", { has: page.getByText("time-pagamentos", { exact: true }) }).last();
  await expect(cardTimePagamentos).toBeVisible();
  await expect(cardTimePagamentos.getByText("linguagem:", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Voltar ao canvas" }).click();

  await page.screenshot({ path: "e2e/screenshots/perfil-time.png", fullPage: true });
});

test("kafka: aresta de consumo (arrastada de verdade) revela consumerGroup, e idempotencia=false revela chaveDedupe", async ({
  page,
}) => {
  await entrar(page);

  await page.getByRole("button", { name: "+ Serviço" }).click();
  await page.getByRole("button", { name: "+ Tópico Kafka" }).click();

  const svc = page.locator(".react-flow__node", { hasText: "Serviço" });
  const kafka = page.locator(".react-flow__node", { hasText: "Tópico Kafka" });
  await expect(svc).toBeVisible();
  await expect(kafka).toBeVisible();
  // Nós nascem em posição aleatória e o fitView anima o viewport até acomodar
  // os dois — espera acomodar antes de medir coordenadas de handle na tela.
  await page.waitForTimeout(400);

  const origem = svc.locator(".react-flow__handle-right.source");
  const destino = kafka.locator(".react-flow__handle-left.target");

  // Drag-and-drop de conexão do React Flow é sensível a timing; tenta algumas
  // vezes antes de desistir, em vez de um teste flaky por natureza da lib.
  let arestaCriada = false;
  for (let tentativa = 0; tentativa < 3 && !arestaCriada; tentativa++) {
    const origemBox = await origem.boundingBox();
    const destinoBox = await destino.boundingBox();
    if (!origemBox || !destinoBox) throw new Error("handle de conexão não encontrado no DOM");

    await page.mouse.move(origemBox.x + origemBox.width / 2, origemBox.y + origemBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(destinoBox.x + destinoBox.width / 2, destinoBox.y + destinoBox.height / 2, { steps: 15 });
    await page.mouse.move(destinoBox.x + destinoBox.width / 2, destinoBox.y + destinoBox.height / 2);
    await page.mouse.up();
    await page.waitForTimeout(200);

    arestaCriada = (await page.locator(".react-flow__edge").count()) === 1;
  }
  expect(arestaCriada, "conexão via drag não criou a aresta após 3 tentativas").toBe(true);

  // Nova aresta nasce com o tipo default da regra (publica) — precisa trocar
  // para "consome" explicitamente para o serviço aparecer como consumidor.
  // O bounding box da aresta às vezes fica geometricamente sob a camada de nós
  // mesmo a aresta estando visível; dispatchEvent dispara o click direto no
  // elemento (sem depender de hit-testing por coordenada da tela).
  await page.locator(".react-flow__edge").dispatchEvent("click");
  const painelAresta = page.locator("aside");
  await expect(painelAresta.getByRole("heading", { name: "Aresta" })).toBeVisible();
  await painelAresta.locator("select").selectOption("consumes");

  await kafka.click();
  const painel = page.locator("aside");
  await expect(painel.getByText("Consumer group")).toBeVisible();
  await expect(painel.getByText("Consumo é idempotente?")).toBeVisible();
  await expect(painel.getByText("Chave de deduplicação")).not.toBeVisible();

  const idempotenciaCheckbox = painel.getByRole("checkbox", { name: "Consumo é idempotente?" });
  await idempotenciaCheckbox.click();
  await idempotenciaCheckbox.click();
  await expect(painel.getByText("Chave de deduplicação")).toBeVisible();

  await page.screenshot({ path: "e2e/screenshots/kafka-cadeia.png", fullPage: true });
});
