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
   * "resposta ≥ 3,0 s".
   *
   * O único tempo declarado no cenário é o `timeoutMs: 3000` do **nó**
   * `bureau-credito-nacional`; a conexão `http` que leva até ele está vazia.
   * O `≥` é o §248 na largura de um caractere: a soma é **piso**, nunca total.
   * Quantos elementos faltam fica no detalhe, com o endereço de cada um — no
   * chip isso dobrava o comprimento para dizer a mesma coisa duas vezes (§294).
   *
   * Este mesmo desenho dizia "VERDE 8 — pronta para derivar" e mais nada.
   */
  await expect(chip).toContainText("resposta ≥ 3,0 s");
  // E os caminhos seguem por confirmar — a leitura não esperou por eles.
  await expect(page.getByTestId("percursos-resumo")).toContainText("a confirmar");

  // ── O detalhe, atrás do clique ──
  await chip.click();
  const lista = page.getByTestId("leitura-lista");
  // A frase que impede ler a leitura como cobrança (SPEC-65 §3).
  // §294 — a frase inteira virou o título do rótulo; o rótulo é o resumo dela.
  await expect(lista).toContainText("leitura, não régua");

  // O fan-out do relato: o serviço de entrada faz três chamadas que esperam.
  await expect(page.getByTestId("leitura-fanout-n1")).toContainText("srv-credito-api");
  await expect(page.getByTestId("leitura-fanout-n1")).toContainText("3");

  // O terceiro dentro do trecho que espera — o que o "VERDE 8" não dizia.
  await expect(page.getByTestId("leitura-terceiros")).toContainText("bureau-credito-nacional");

  // ── O endereço leva ao elemento que fecha a conta ──
  const falta = page.locator('[data-testid^="leitura-falta-"]').first();
  await expect(falta).toBeVisible();
  await falta.click();
  // Selecionar a conexão abre o painel dela, que é onde o timeout se preenche.
  await expect(page.getByText("Timeout (ms)")).toBeVisible();
});

test("§292 — a marca nasce no nó, acende as conexões, e cala com volta", async ({ page }) => {
  test.setTimeout(120000);
  await page.addInitScript(() => localStorage.setItem("gerador:jornada-vista", "1"));
  await page.route(
    (url) => url.pathname === "/ia/status",
    (rota) => rota.fulfill({ json: { modelosChat: [], embeddingInstalado: false, capacidades: {} } })
  );
  await entrar(page);

  await page.getByTestId("abrir-cenarios").click();
  await page.getByRole("button", { name: "Carregar cenário: Fluxo completo: aprovação de crédito" }).click();

  // ── A marca no CANVAS, sem abrir nada ──
  // O nó do relato faz três chamadas que esperam, e diz isso no próprio card.
  const marca = page.locator('[data-testid^="marca-leitura-"]').first();
  await expect(marca).toBeVisible();
  await expect(marca).toContainText("3");
  await expect(marca).toHaveAttribute("title", /chamadas que esperam|saltos que esperam/);

  // ── Olhar a marca acende as conexões dela ──
  // O realce é visual, e o que dá para afirmar sem medir pixel é que as
  // conexões passaram a se distinguir: as de fora esmaecem.
  const opacidadeAntes = await page.evaluate(
    () => [...document.querySelectorAll(".react-flow__edge-path")].map((e) => (e as SVGElement).style.opacity)
  );
  expect(opacidadeAntes.every((o) => o === "")).toBe(true);

  await marca.hover();
  await expect
    .poll(async () =>
      page.evaluate(
        () =>
          [...document.querySelectorAll(".react-flow__edge-path")].filter(
            (e) => (e as SVGElement).style.opacity !== ""
          ).length
      )
    )
    .toBeGreaterThan(0);

  // ── Calar, e ouvir de novo (§283) ──
  await page.getByTestId("leitura-resumo").click();
  const dispensar = page.locator('[data-testid^="dispensar-leitura-"]').first();
  const idDaMarca = (await dispensar.getAttribute("data-testid"))!.replace("dispensar-leitura-", "");
  await dispensar.click();

  // A marca some do canvas — é o efeito de calar, e ele é imediato.
  await expect(page.getByTestId(`marca-leitura-${idDaMarca.split("-")[0]}`)).toHaveCount(0);

  // E não some do histórico: a lista de caladas a devolve. O popover segue
  // aberto — o clique em "não me mostre aqui" foi dentro dele.
  await page.getByTestId("leitura-caladas").click();
  await page.getByTestId(`restaurar-leitura-${idDaMarca}`).click();
  await expect(page.locator('[data-testid^="marca-leitura-"]').first()).toBeVisible();
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
