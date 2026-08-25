import { test, expect } from "@playwright/test";
import { entrar } from "./auth";

/**
 * SPEC-64 fatias B e C — o caminho que o desenho não deixa ler, e o que o motor
 * leu errado.
 *
 * ## Por que a fatia A (a medição) NÃO tem teste aqui
 *
 * Medido: o documento de regras deste deploy vem **vazio** (`percursos: null`),
 * então a régua de caminho não roda. Para exercitá-la ponta a ponta eu teria de
 * gravar uma régua **global**, e o §281 custou três specs vizinhos ensinando
 * que config global em suíte paralela é estado compartilhado — a janela entre
 * mexer e restaurar é o teste do vizinho. Pior: uma régua de percurso ligada
 * faria violação aparecer, e o `caminho-tem-volta` (§283) espera a lista de
 * confirmados, que a tela esconde quando há violação.
 *
 * A fatia A é função pura e está coberta onde ela mora — `avaliarPercursos`, no
 * engine, com o caminho ligado por HTTP somando o que as conexões declaram.
 * Este arquivo cobre o que só o navegador prova: o modo de declaração
 * atravessando painel, canvas e estado da quebra.
 */
test("§286 — declarar um caminho à mão, e corrigir o que o motor sugeriu", async ({ page }) => {
  test.setTimeout(90000);
  await page.addInitScript(() => localStorage.setItem("gerador:jornada-vista", "1"));
  await page.route(
    (url) => url.pathname === "/ia/status",
    (rota) => rota.fulfill({ json: { modelosChat: [], embeddingInstalado: false, capacidades: {} } })
  );
  await entrar(page);

  await page.getByTestId("abrir-cenarios").click();
  await page.getByRole("button", { name: "Carregar cenário: Dados não-relacionais" }).click();

  // ── Fatia C: corrigir o que o motor leu ──
  const chip = page.getByTestId("percursos-resumo");
  await chip.click();
  await page.locator('[data-testid^="ajustar-pc::"]').first().click();

  // A barra do modo vive FORA do popover — o gesto é clicar nós no canvas, e o
  // popover fecha no primeiro clique fora dele. Uma barra que sumisse no
  // primeiro nó seria uma barra inútil.
  const barra = page.getByTestId("declaracao-de-caminho");
  await expect(barra).toContainText("Corrigindo o caminho");
  // A sequência do inferido veio como PONTO DE PARTIDA — é o que separa
  // "ajustar" de "declarar do zero". O E2E pegou isto quebrado: o App procurava
  // o inferido em `quebra.percursos`, onde ele não está.
  await expect(barra).toContainText("→");

  await page.getByTestId("declaracao-cancelar").click();
  await expect(barra).toHaveCount(0);

  // ── Fatia B: declarar do zero ──
  await chip.click();
  await page.getByTestId("declarar-caminho").click();
  await expect(page.getByTestId("declaracao-de-caminho")).toContainText("Declarando um caminho");
  // Um caminho precisa de dois componentes — com nenhum, concluir não pode.
  await expect(page.getByTestId("declaracao-concluir")).toBeDisabled();

  const nos = page.locator(".react-flow__node");
  await nos.nth(0).click();
  await nos.nth(1).click();
  await expect(page.getByTestId("declaracao-de-caminho")).toContainText("→");
  await expect(page.getByTestId("declaracao-concluir")).toBeEnabled();
  await page.getByTestId("declaracao-concluir").click();

  // O modo fecha, e o caminho declarado à mão CONTA sem pedir confirmação —
  // quem o desenhou já disse que ele existe.
  await expect(page.getByTestId("declaracao-de-caminho")).toHaveCount(0);
  await chip.click();
  await expect(page.getByTestId("percurso-confirmado").first()).toBeVisible();
});
