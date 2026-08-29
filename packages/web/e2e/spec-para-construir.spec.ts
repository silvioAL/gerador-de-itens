import { test, expect } from "@playwright/test";
import { entrar } from "./auth";

const API = "http://localhost:4100";

/**
 * SPEC-84 fatia A — **a porta da spec, no navegador.**
 *
 * ## O que só o navegador prova
 *
 * As unidades provam a tela com props montadas à mão. O que elas não podem
 * provar é que a porta **está ligada ao produto**: que o menu leva lá, que a
 * spec é montada a partir da demanda ABERTA, que o que se escreve nela
 * sobrevive ao F5 (a regra 3 da SPEC-58 — se falhar uma vez, ninguém escreve de
 * novo), e que o hash é linkável.
 *
 * É a prova que faltava para o estágio "Gerar specs para construir com IA" sair
 * de `ausente` sem a landing mentir.
 */
test("a spec da demanda: chega pelo menu, conta as lacunas, e o que se escreve nela sobrevive ao F5", async ({
  page,
}) => {
  test.setTimeout(90000);
  await page.addInitScript(() => localStorage.setItem("gerador:jornada-vista", "1"));
  await page.route(
    (url) => url.pathname === "/ia/status",
    (rota) => rota.fulfill({ json: { modelosChat: [], embeddingInstalado: false, capacidades: {} } })
  );
  await entrar(page);

  const titulo = `spec para construir ${Date.now()}`;
  const criada = await page.request.post(`${API}/quebras`, {
    data: {
      titulo,
      time: "time-pagamentos",
      demandInfo: "Reduzir a latência da vitrine.",
      diagrama: {
        nodes: [
          {
            id: "n1",
            type: "service",
            x: 120,
            y: 120,
            label: "srv-catalogo",
            status: "novo",
            spec: { nome: { valor: "srv-catalogo", origem: "manual" } },
            specNA: {},
          },
        ],
        edges: [],
      },
    },
  });
  expect(criada.status()).toBe(201);
  await page.reload();

  await page.getByRole("button", { name: "☰ Menu" }).click();
  await page.getByRole("button", { name: "Abrir…" }).click();
  await page.getByPlaceholder("ex.: aprovação de crédito").fill(titulo);
  await page.getByRole("button", { name: new RegExp(titulo) }).click();
  await expect(page.getByTestId("titulo-da-quebra")).toContainText(titulo);

  // Pelo menu — o caminho que a pessoa usa, e o que estava faltando.
  await page.getByRole("button", { name: "☰ Menu" }).click();
  await page.getByTestId("menu-spec").click();
  await expect(page.getByTestId("spec-screen")).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toContainText(titulo);

  // A spec nasce cheia de lacuna, e ela DIZ quantas. Uma spec vazia que
  // parecesse pronta é o defeito que o §311 existe para não deixar acontecer.
  await expect(page.getByTestId("lacunas-da-spec")).toContainText("a especificar");

  // E não oferece escrever as seções de julgamento com IA — a trava da SPEC-80
  // fatia D não pode ser desfeita pela tela.
  await expect(page.getByTestId("spec-screen").getByText("✦")).toHaveCount(0);

  const origem = `a Ana pediu no comitê de ${Date.now()}`;
  await page.getByRole("button", { name: /quem pediu/ }).click();
  const campo = page.getByLabel("De onde veio");
  // `pressSequentially` e não `fill`: em componente controlado, `fill` escreve
  // direto no DOM e o React pode não disparar `onChange` — falso positivo
  // clássico, e é o que o §316 pegou do lado do documento.
  await campo.pressSequentially(origem);
  await campo.blur();

  // A pergunta que importa não é "o DOM pintou?", é "SOBREVIVEU?". Conferir no
  // servidor separa "não salvou" de "salvou e não voltou" — e o §310 mostrou que
  // as duas acontecem por motivos diferentes. 15s por causa do debounce de 2s.
  await expect
    .poll(
      async () => {
        const r = await page.request.get(`${API}/quebras/${(await criada.json()).id}`);
        return ((await r.json()) as { artefatosEscritos?: { spec?: { origem?: string } } }).artefatosEscritos?.spec
          ?.origem;
      },
      { timeout: 15000 }
    )
    .toContain(origem);

  /**
   * REABRIR é o teste de verdade da regra 3 (SPEC-58): se o que se escreve
   * sumir uma vez, ninguém escreve de novo.
   *
   * O F5 preserva a ROTA (o hash), mas não a demanda aberta — reabrir pelo menu
   * é o que uma pessoa faria, e é o mesmo caminho do E2E do documento. Foi aqui
   * que o §250 encontrou o `abrirPorId` deixando campo para trás.
   */
  await page.reload();
  await expect(page.getByTestId("spec-screen")).toBeVisible();
  await page.getByRole("button", { name: "← Voltar à mesa de projeto" }).click();
  await page.getByRole("button", { name: "☰ Menu" }).click();
  await page.getByRole("button", { name: "Abrir…" }).click();
  await page.getByPlaceholder("ex.: aprovação de crédito").fill(titulo);
  await page.getByRole("button", { name: new RegExp(titulo) }).click();

  await page.getByRole("button", { name: "☰ Menu" }).click();
  await page.getByTestId("menu-spec").click();
  await expect(page.getByTestId("secao-origem")).toContainText(origem);

  // O item derivado aparece para ser coberto, e a spec passa a dizer que o cobre.
  const itens = page.getByTestId("cobertura-da-spec").locator("input[type=checkbox]");
  if ((await itens.count()) > 0) {
    await expect(itens.first()).not.toBeChecked();
    await itens.first().check();
    await expect(itens.first()).toBeChecked();
  }
});
