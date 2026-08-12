import { test, expect } from "@playwright/test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { entrar } from "./auth";

const AQUI = dirname(fileURLToPath(import.meta.url));

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("gerador:jornada-vista", "1"));
});

/**
 * ACHADO REAL, no primeiro run deste job na CI: este teste apontava pro
 * `graphify-out/graph.json` **deste repositório** — que é gitignored. No runner
 * o arquivo não existe (`ENOENT`), e na máquina de quem tem, ele muda a cada
 * `graphify update`. Um teste que depende de um artefato não versionado e
 * mutável não é um teste de integração, é um teste de sorte.
 *
 * A fixture (`fixtures/graph-exemplo.json`) tem a mesma FORMA do arquivo real e
 * cobre as três vias de casamento do mapeamento — caminho, nome da classe e
 * import — mais dois arquivos que nenhuma regra alcança.
 */
test("importar um graph.json do Graphify: mapeia o que bate, lista o resto, e adiciona ao canvas sem gerar arestas", async ({
  page,
}) => {
  await entrar(page);

  await page.getByRole("button", { name: "☰ Menu" }).click(); // SPEC-40: item do menu
  await page.getByRole("button", { name: "✦ Como funciona & cenários" }).click();
  await page.getByRole("button", { name: "Importar do Graphify" }).click();

  const caminhoGrafo = resolve(AQUI, "fixtures/graph-exemplo.json");
  const [fileChooser] = await Promise.all([
    page.waitForEvent("filechooser"),
    page.getByText("Escolher graph.json").click(),
  ]);
  await fileChooser.setFiles(caminhoGrafo);

  await expect(page.getByText(/nó\(s\) existente\(s\)\/extraído\(s\) encontrado\(s\)/)).toBeVisible({
    timeout: 15000,
  });
  await expect(page.getByText(/arquivo\(s\) sem regra de mapeamento/)).toBeVisible();

  const botaoAdicionar = page.getByRole("button", { name: "+ Adicionar ao canvas" });
  await expect(botaoAdicionar).toBeEnabled();
  await botaoAdicionar.click();
  await expect(page.getByText("✓ Adicionado")).toBeVisible();

  await page.getByRole("button", { name: "Fechar" }).click();

  // Pelo menos um nó "existente" apareceu no canvas real, e nenhuma aresta —
  // o import do Graphify nunca infere conexão (estrutura de código != arquitetura).
  // O texto do badge é "existente" (minúsculo) — o uppercase visual é só CSS.
  await expect(page.locator(".react-flow__node", { hasText: "existente" }).first()).toBeVisible();
  expect(await page.locator(".react-flow__edge").count()).toBe(0);

  await page.screenshot({ path: "e2e/screenshots/importar-graphify.png", fullPage: true });
});
