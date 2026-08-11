import { test, expect } from "@playwright/test";
import { entrar } from "./auth";

/**
 * ACHADO REAL (#302): o usuário selecionou o componente, apertou `Delete`, e
 * não veio nem a confirmação nem a exclusão. A confirmação do #294 estava certa
 * e entregue — o `deleteKeyCode` padrão do React Flow é `"Backspace"` e só, de
 * modo que `Delete` nunca virava um `NodeChange` do tipo `remove`.
 *
 * POR QUE ISTO É E2E, e não vitest: o teste que eu tinha escrito
 * (`PropertiesPanel.exclusao.test.tsx`) passava com o defeito presente. Ele
 * mocka `@xyflow/react`, e é DENTRO do React Flow que a tecla vira mudança —
 * um dublê nunca ia recusar `Delete`, porque não é ele quem escuta o teclado.
 * Só o navegador de verdade, com a lib de verdade, prova essa tecla.
 */
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("gerador:jornada-vista", "1"));
});

const dialogo = "confirmar-exclusao";

for (const tecla of ["Delete", "Backspace"]) {
  test(`${tecla} no componente selecionado pede confirmação — e Cancelar mantém o nó`, async ({ page }) => {
    await entrar(page);
    await page.getByRole("button", { name: "+ Serviço", exact: true }).click();

    const no = page.locator(".react-flow__node");
    await expect(no).toHaveCount(1);
    await no.first().click();
    await page.keyboard.press(tecla);

    // `toBeVisible` e não `toHaveCount`: o dialogo é renderizado DENTRO do
    // `<ReactFlow>`, onde empilhamento e recorte podem escondê-lo sem tirá-lo
    // do DOM — presença sozinha não é prova de que a pessoa vai enxergar.
    await expect(page.getByTestId(dialogo)).toBeVisible();
    await expect(no).toHaveCount(1);

    await page.getByRole("button", { name: "Cancelar" }).click();
    await expect(page.getByTestId(dialogo)).toHaveCount(0);
    await expect(no).toHaveCount(1);
  });
}

test("confirmar a exclusão remove o componente do diagrama", async ({ page }) => {
  await entrar(page);
  await page.getByRole("button", { name: "+ Serviço", exact: true }).click();

  const no = page.locator(".react-flow__node");
  await no.first().click();
  await page.keyboard.press("Delete");

  await page.getByTestId("confirmar-exclusao-ok").click();
  await expect(no).toHaveCount(0);
});

test("botão Excluir nó do painel passa pela mesma confirmação", async ({ page }) => {
  await entrar(page);
  await page.getByRole("button", { name: "+ Serviço", exact: true }).click();

  const no = page.locator(".react-flow__node");
  await no.first().click();
  await page.getByRole("button", { name: /Excluir nó/i }).click();

  await expect(page.getByTestId(dialogo)).toBeVisible();
  await expect(no).toHaveCount(1);

  await page.getByTestId("confirmar-exclusao-ok").click();
  await expect(no).toHaveCount(0);
});

test("excluir uma conexão pelo painel da aresta também confirma antes", async ({ page }) => {
  await entrar(page);
  await page.getByRole("button", { name: "+ Serviço", exact: true }).click();
  await page.getByRole("button", { name: "+ Fila Rabbit", exact: true }).click();

  // Liga os dois arrastando de um handle ao outro — mesmo gesto do usuário.
  // Mesma receita do `fluxo-basico.spec.ts`: espera o fitView acomodar antes de
  // medir, e repete algumas vezes porque o drag de conexão do React Flow é
  // sensível a timing.
  const svc = page.locator(".react-flow__node", { hasText: "Serviço" });
  const fila = page.locator(".react-flow__node", { hasText: "Fila Rabbit" });
  await expect(svc).toBeVisible();
  await expect(fila).toBeVisible();
  await page.waitForTimeout(400);

  const origem = svc.locator(".react-flow__handle-right.source");
  const destino = fila.locator(".react-flow__handle-left.target");
  const aresta = page.locator(".react-flow__edge");

  let criada = false;
  for (let tentativa = 0; tentativa < 3 && !criada; tentativa++) {
    const a = await origem.boundingBox();
    const b = await destino.boundingBox();
    if (!a || !b) throw new Error("handle de conexão não encontrado no DOM");
    await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
    await page.mouse.down();
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 15 });
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await page.mouse.up();
    await page.waitForTimeout(200);
    criada = (await aresta.count()) === 1;
  }
  expect(criada, "conexão via drag não criou a aresta após 3 tentativas").toBe(true);

  // `dispatchEvent` e não `click`: o bounding box da aresta às vezes fica sob a
  // camada de nós mesmo com ela visível (mesmo motivo do fluxo-basico).
  await aresta.dispatchEvent("click");

  await page.getByRole("button", { name: /Excluir aresta/i }).click();
  await expect(page.getByTestId(dialogo)).toBeVisible();
  await expect(aresta).toHaveCount(1);

  await page.getByTestId("confirmar-exclusao-ok").click();
  await expect(aresta).toHaveCount(0);
});
