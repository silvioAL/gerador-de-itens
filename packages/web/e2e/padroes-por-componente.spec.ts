import { test, expect } from "@playwright/test";
import { entrar } from "./auth";

/**
 * #301 — a massa de "Padrões por componente", e a prova de que ela CHEGA no
 * formulário do componente.
 *
 * `campos_no` nasceu vazia em 0001 e nenhuma migração jamais inseriu uma linha,
 * então a aba mostrava "(0)" e o usuário perguntou se estava certo (#300). A
 * migração 0016 semeia seis padrões de `time-pagamentos`.
 *
 * O teste que importa não é o da aba — é o segundo: um padrão declarado pelo
 * time precisa aparecer no painel do nó e contar na prontidão. Sem isso a
 * feature é um editor que escreve num lugar que ninguém lê, que é exatamente a
 * dúvida que o usuário levantou.
 */
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("gerador:jornada-vista", "1"));
});

test("a aba lista os padrões semeados do time, com o contador batendo", async ({ page }) => {
  await entrar(page, "time-portabilidade");
  await page.getByRole("button", { name: "☰ Menu" }).click();

  // O rótulo carrega o número: "(N do time)". Se a seed sumir, some o número.
  // SPEC-40 — o item do menu não carrega contagem; ela vive no TÍTULO da
  // tela ("Padrões por componente (6 do time)"), asserido após navegar.
  await page.getByRole("button", { name: /Padrões por componente/ }).click();
  await expect(page.getByText(/Padrões por componente \(6 do time\)/)).toBeVisible();

  for (const rotulo of [
    "Runbook de plantão (URL)",
    "Classificação do dado que trafega",
    "Schema registrado no Schema Registry",
    "Prazo de retenção (LGPD)",
    "Homologação com o fornecedor",
    "SLAs acordados por operação",
  ]) {
    await expect(page.getByText(rotulo, { exact: false }).first()).toBeVisible();
  }
});

test("um padrão do time aparece no painel do componente e conta na prontidão", async ({ page }) => {
  await entrar(page, "time-portabilidade");
  await page.getByRole("button", { name: "+ Serviço", exact: true }).click();
  await page.locator(".react-flow__node").first().click();

  const painel = page.locator("aside");
  // Campo do TIME, não do produto: não existe em `config/diagrama.json`.
  await expect(painel.getByText("Runbook de plantão (URL)")).toBeVisible();
  await expect(painel.getByText("Classificação do dado que trafega")).toBeVisible();

  // `required: true` — um nó recém-criado tem que estar vermelho por causa
  // deles também, não só pelos campos de fábrica. ("VERMELHO" aparece duas
  // vezes: no contador do topo e no badge do painel — o do painel é o do NÓ.)
  await expect(painel.getByText("VERMELHO")).toBeVisible();

  // O select traz as opções que o time declarou, incluindo a que dispara
  // revisão de Segurança.
  // Varre TODOS os selects do painel: o primeiro é "Linguagem/Stack" (sugestão
  // do perfil de time), não o do padrão — depender da ordem faria o teste
  // quebrar quando alguém reordenar a ficha.
  const opcoes = await painel.locator("select option").allInnerTexts();
  expect(opcoes.join("|")).toContain("PCI-DSS");
});

test("o padrão do tipo lista é editável item a item no componente", async ({ page }) => {
  await entrar(page, "time-portabilidade");
  await page.getByRole("button", { name: "+ API Externa", exact: true }).click();
  await page.locator(".react-flow__node").first().click();

  const painel = page.locator("aside");
  await expect(painel.getByText("SLAs acordados por operação")).toBeVisible();
  await painel.getByRole("button", { name: "+ item" }).first().click();

  // As três colunas do `item_spec` da migração.
  for (const rotulo of ["Operação", "p95 acordado (ms)", "O que fazer quando estoura"]) {
    await expect(painel.getByText(rotulo, { exact: false }).first()).toBeVisible();
  }
});
