import { test, expect } from "@playwright/test";
import { entrar } from "./auth";

/**
 * SPEC-65 — o desenho lido em voz alta.
 *
 * O que só o navegador prova: a leitura aparece **sem preparo nenhum**. Nenhum
 * caminho confirmado, nenhuma régua no documento de regras do deploy (que vem
 * vazio, medido no §286), nenhum campo preenchido — e mesmo assim o número
 * está na faixa, legível sem clicar.
 *
 * É a diferença entre esta SPEC e todas as réguas: elas exigem que alguém
 * prepare o terreno, e por isso ficam mudas para quem está desenhando agora.
 *
 * ## Sobre config global
 *
 * Nada aqui grava configuração — o §281 custou três specs vizinhos ensinando
 * que config global em suíte paralela é estado compartilhado. Esta leitura não
 * depende de config de regras, o que é exatamente o ponto dela.
 */
test("§291 — a leitura aparece sem confirmar caminho nem configurar régua", async ({ page }) => {
  test.setTimeout(120000);
  await page.addInitScript(() => localStorage.setItem("gerador:jornada-vista", "1"));
  await page.route(
    (url) => url.pathname === "/ia/status",
    (rota) => rota.fulfill({ json: { modelosChat: [], embeddingInstalado: false, capacidades: {} } })
  );
  await entrar(page);

  // O cenário do relato: um serviço que dispara várias chamadas antes de
  // responder, e uma cadeia até um bureau de terceiro.
  await page.getByTestId("abrir-cenarios").click();
  await page.getByRole("button", { name: "Carregar cenário: Fluxo completo: aprovação de crédito" }).click();

  // ── Sem abrir nada: o número já está lá ──
  const chip = page.getByTestId("leitura-resumo");
  await expect(chip).toBeVisible();
  /**
   * "≥ 3,0 s de resposta · 1 por preencher".
   *
   * O único tempo declarado no cenário é o `timeoutMs: 3000` do **nó**
   * `bureau-credito-nacional`; a conexão `http` que leva até ele está vazia.
   * Então a leitura diz as duas coisas ao mesmo tempo, e é o §248 na tela: a
   * soma é **piso** (`≥`), nunca total, e a pessoa sabe quantos elementos
   * faltam para fechar a conta.
   *
   * Este mesmo desenho dizia "VERDE 8 — pronta para derivar" e mais nada.
   */
  await expect(chip).toContainText("≥ 3,0 s de resposta");
  await expect(chip).toContainText("1 por preencher");
  // E os caminhos seguem por confirmar — a leitura não esperou por eles.
  await expect(page.getByTestId("percursos-resumo")).toContainText("a confirmar");

  // ── O detalhe, atrás do clique ──
  await chip.click();
  const lista = page.getByTestId("leitura-lista");
  // A frase que impede ler a leitura como cobrança (SPEC-65 §3).
  await expect(lista).toContainText("sem nada a corrigir");

  // O fan-out do relato: o serviço de entrada faz três chamadas que esperam.
  await expect(page.getByTestId("leitura-fanout")).toContainText("srv-credito-api");
  await expect(page.getByTestId("leitura-fanout")).toContainText("3");

  // O terceiro dentro do trecho que espera — o que o "VERDE 8" não dizia.
  await expect(page.getByTestId("leitura-terceiros")).toContainText("bureau-credito-nacional");

  // ── O endereço leva ao elemento que fecha a conta ──
  const falta = page.locator('[data-testid^="leitura-falta-"]').first();
  await expect(falta).toBeVisible();
  await falta.click();
  // Selecionar a conexão abre o painel dela, que é onde o timeout se preenche.
  await expect(page.getByText("Timeout (ms)")).toBeVisible();
});

test("§291 — desenho que não espera por ninguém não ganha chip", async ({ page }) => {
  test.setTimeout(90000);
  await page.addInitScript(() => localStorage.setItem("gerador:jornada-vista", "1"));
  await page.route(
    (url) => url.pathname === "/ia/status",
    (rota) => rota.fulfill({ json: { modelosChat: [], embeddingInstalado: false, capacidades: {} } })
  );
  await entrar(page);

  // Mensageria pura: quem publica não espera, então não há tempo de resposta,
  // nem cadeia, nem fan-out. Um chip aqui seria moldura — apareceria sempre e
  // por isso deixaria de ser lido quando tivesse algo a dizer.
  await page.getByTestId("abrir-cenarios").click();
  await page.getByRole("button", { name: "Carregar cenário: Mensageria RabbitMQ" }).click();
  await expect(page.locator(".react-flow__node").first()).toBeVisible();

  await expect(page.getByTestId("leitura-resumo")).toHaveCount(0);
});
