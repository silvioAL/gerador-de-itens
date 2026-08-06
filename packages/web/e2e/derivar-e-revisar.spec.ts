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

  await expect(page.getByText("1 atividades")).toBeVisible();
  await expect(page.getByRole("cell", { name: "01" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "Task" })).toBeVisible();
  await expect(page.getByText("Não é possível derivar ainda")).not.toBeVisible();

  await page.screenshot({ path: "e2e/screenshots/revisao.png", fullPage: true });

  // Pacote de implementação: a especificação completa do nó (não só o
  // specResumo da linha), pronta pra copiar numa sessão de dev.
  await page.getByRole("button", { name: "pacote de implementação" }).click();
  await expect(page.getByText("## Especificação")).toBeVisible();
  await expect(page.getByText(/Nome da fila.*proposta\.aprovada\.q.*manual/)).toBeVisible();
  await expect(page.getByRole("button", { name: "fechar" })).toBeVisible();

  const downloadMd = page.waitForEvent("download");
  await page.getByRole("button", { name: "Exportar .md" }).click();
  const md = await downloadMd;
  expect(md.suggestedFilename()).toBe("backlog.md");

  await page.getByRole("button", { name: "Voltar ao canvas" }).click();
  await expect(page.getByText("1 atividades")).not.toBeVisible();
  await expect(page.locator(".react-flow__node")).toBeVisible();

  expect(erros, `Erros no console do browser:\n${erros.join("\n")}`).toEqual([]);
});
