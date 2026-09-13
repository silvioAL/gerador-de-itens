import { test, expect } from "@playwright/test";

/**
 * **Criar um time com o nome que a pessoa tem na cabeça.**
 *
 * Relato real, com print: alguém sem time nenhum digitou "Consignado Público"
 * no campo que pede *"nome do time"* e recebeu *"Não foi possível completar a
 * operação."*. Três defeitos empilhados — a tela mandava o nome CRU como id, o
 * servidor exigia formato de chave de URL de quem digita um NOME, e o cliente
 * engolia o motivo.
 *
 * ## O que só o navegador prova
 *
 * As provas de rota cobrem a derivação e as recusas. O que só aqui se vê é a
 * tela de quem NÃO TEM TIME: que ela mostra o endereço antes do clique, que o
 * nome com acento e maiúscula funciona, e que a pessoa entra no produto em vez
 * de ficar presa numa mensagem que não diz nada.
 */
test.describe.configure({ mode: "serial" });

/** Um e-mail que não pertence a time nenhum — é essa a tela sob teste. */
const semTime = () => `sem-time-${Date.now()}-e2e@gerador.local`;

async function entrarSemTime(page: import("@playwright/test").Page, email: string) {
  await page.addInitScript(() => localStorage.setItem("gerador:jornada-vista", "1"));
  await page.goto("/");
  await page.getByRole("button", { name: /^entrar$/i }).first().click();
  await page.getByPlaceholder("voce@empresa.com").fill(email);
  await page.getByRole("button", { name: "Entrar" }).click();
  // A tela de quem não tem time é o destino de quem entra sem pertencer a nada.
  await expect(page.getByText("Você ainda não pertence a nenhum time")).toBeVisible({ timeout: 20000 });
}

test("“Consignado Público” cria o time — o caso do relato", async ({ page }) => {
  test.setTimeout(120000);
  const email = semTime();
  await entrarSemTime(page, email);

  /**
   * O nome carrega um sufixo único porque o banco é COMPARTILHADO entre rodadas
   * e o time criado sobrevive: sem isso a segunda rodada bate em "já existe" e
   * o teste morre por resíduo, não por defeito. O que importa para a prova são
   * as três características do relato — maiúscula, espaço e acento —, e elas
   * ficam.
   */
  const sufixo = Date.now();
  const nome = page.getByPlaceholder(/nome do time/);
  await nome.fill(`Consignado Público ${sufixo}`);

  // A tela DIZ o endereço que o nome vira, antes de a pessoa clicar: é o que
  // impede a surpresa nos dois sentidos.
  await expect(page.getByTestId("endereco-do-time")).toContainText(`consignado-publico-${sufixo}`);

  await page.getByRole("button", { name: "Criar time" }).click();

  /**
   * O desfecho que faltava: a pessoa ENTRA no produto. Antes ela ficava na
   * mesma tela, olhando "Não foi possível completar a operação."
   */
  await expect(page.getByText("Você ainda não pertence a nenhum time")).toHaveCount(0, { timeout: 20000 });

  /**
   * E o time GRUDOU: recarregar não devolve a pessoa para a tela de quem não
   * tem time. É o que prova que a sessão foi reemitida com o time dentro — sem
   * isso ela criaria o time e voltaria ao mesmo lugar no F5 seguinte.
   *
   * Que o NOME digitado fica guardado como ela escreveu é prova de ROTA
   * (`criarTime.test.ts`): aqui não há endpoint de listagem para conferir, e
   * inventar um só para o teste seria testar o teste.
   */
  await page.reload();
  await expect(page.getByText("Você ainda não pertence a nenhum time")).toHaveCount(0, { timeout: 20000 });
});

test("um nome sem letras nem números é recusado NA TELA, com o motivo", async ({ page }) => {
  test.setTimeout(120000);
  await entrarSemTime(page, semTime());

  await page.getByPlaceholder(/nome do time/).fill("🙂");
  // O aviso chega antes do clique — a tela não deixa a pessoa tentar e falhar.
  await expect(page.getByTestId("endereco-do-time")).toContainText("não vira um endereço");

  await page.getByRole("button", { name: "Criar time" }).click();
  /**
   * E se ela clicar mesmo assim, o motivo é uma FRASE — não o genérico "não foi
   * possível completar a operação", que foi a queixa.
   */
  /**
   * Duas frases dizem a mesma coisa aqui — o aviso da tela (antes do clique) e
   * a recusa do servidor (depois). Mirar o texto solto casaria com as duas e o
   * Playwright recusaria a ambiguidade; a recusa do servidor se distingue por
   * CITAR o que foi digitado.
   */
  await expect(page.getByText(/"🙂" não vira um endereço válido/)).toBeVisible({ timeout: 20000 });
  // E o genérico que originou a queixa não aparece em lugar nenhum.
  await expect(page.getByText("Não foi possível completar a operação.")).toHaveCount(0);
});
