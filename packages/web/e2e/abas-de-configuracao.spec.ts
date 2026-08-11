import { test, expect } from "@playwright/test";
import { entrar } from "./auth";

/**
 * #306 — as abas de Configurações que não tinham NENHUM teste de navegador.
 *
 * A medição que originou este arquivo (JOURNEY §153): das nove abas, quatro
 * estavam descobertas — "Regras de refinamento", "Acessos", "Pipeline de IA" e
 * "Campos por tipo de conexão". A primeira delas **abriu em branco em
 * produção**, e chegou até o usuário exatamente porque nada a clicava num
 * navegador.
 *
 * Ficam três aqui: "Campos por tipo de conexão" só aparecia no modo local, que
 * a SPEC-33 removeu.
 *
 * O `ConfigScreen.test.tsx` já garante, em jsdom, que nenhuma aba abre vazia.
 * Estes vão além do "não está vazio": afirmam que o CONTEÚDO de cada uma
 * chegou — o que depende do servidor responder, da rota existir e da permissão
 * não esconder tudo. Nenhuma dessas três coisas o jsdom vê.
 */
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("gerador:jornada-vista", "1"));
});

async function abrirConfig(page: import("@playwright/test").Page, aba: RegExp) {
  await entrar(page);
  await page.getByRole("button", { name: /Configurações/ }).click();
  await page.getByRole("button", { name: aba }).click();
}

test("Regras de refinamento: carrega o documento do servidor e mostra as seções", async ({ page }) => {
  await abrirConfig(page, /Regras de refinamento/);

  // O defeito real era a aba abrir VAZIA — o corpo estava atrás de um gate de
  // modo local. Aqui se exige o conteúdo, não a ausência de branco.
  await expect(page.getByLabel("Tecnologia")).toBeVisible();
  await expect(page.getByText(/vira o conteúdo dos itens gerados/)).toBeVisible();

  // As seções que a pessoa alterna (checklist técnico, testes, volumetria,
  // processo) — é o que a delegação da SPEC-28 recorta por papel.
  const secoes = page.getByRole("button", { name: /Checklist|Testes|Volumetria|Processo/ });
  expect(await secoes.count()).toBeGreaterThan(1);
});

test("Acessos: a tela da delegação de RBAC abre e diz o estado atual", async ({ page }) => {
  await abrirConfig(page, /^Acessos/);

  // Sem papel nenhum criado, o produto roda em "modo aberto" — e precisa DIZER
  // isso, senão a tela parece quebrada. É a aba que existe por causa do pedido
  // que originou a SPEC-28 inteira ("Agilidade cuida do checklist de processo")
  // e que estava sem nenhuma cobertura de navegador.
  const corpo = page.getByTestId("corpo-da-aba");
  await expect(corpo).toBeVisible();
  expect((await corpo.textContent())?.trim().length ?? 0).toBeGreaterThan(40);
});

test("Pipeline de IA: os papéis, o prompt herdado e a anatomia do prompt", async ({ page }) => {
  await abrirConfig(page, /Pipeline de IA/);

  for (const papel of ["PO", "Arquiteto", "Especialista técnico", "QA"]) {
    await expect(page.getByRole("button", { name: new RegExp(`^${papel}`) }).first()).toBeVisible();
  }

  // #296: papel sem prompt custom mostra o padrão da seção, não um campo em
  // branco. Este é o caso que a aba inteira existia para permitir e que
  // ninguém via.
  await page.getByRole("button", { name: /^PO/ }).first().click();
  const herdado = page.getByTestId("preambulo-herdado-po");
  await expect(herdado).toBeVisible();
  expect((await herdado.textContent())?.length ?? 0).toBeGreaterThan(100);

  // E a anatomia — onde entra o que a pessoa preenche no canvas.
  await expect(page.getByTestId("anatomia-do-prompt")).toBeVisible();
});
