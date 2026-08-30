import { test, expect } from "@playwright/test";
import { entrar } from "./auth";

const API = "http://localhost:4100";

/**
 * SPEC-88 (P6) — **a variante, ponta a ponta.**
 *
 * ## O que só o navegador prova
 *
 * Os unitários provam a troca (engine) e a tela (React) em separado. O que eles
 * não podem provar é a costura: que a alternativa **sobrevive ao F5** — ela é um
 * diagrama inteiro dentro da linha da quebra, e é exatamente o tipo de campo que
 * o §250 mediu ficando para trás na reidratação —, e que adotar troca os dois de
 * lugar **no servidor**, com a decisão registrada.
 */
test("guardar uma alternativa, compará-la, adotar — e tudo sobrevive ao F5", async ({ page }) => {
  test.setTimeout(90000);
  await page.addInitScript(() => localStorage.setItem("gerador:jornada-vista", "1"));
  await page.route(
    (url) => url.pathname === "/ia/status",
    (rota) => rota.fulfill({ json: { modelosChat: [], embeddingInstalado: false, capacidades: {} } })
  );
  await entrar(page);

  const titulo = `variantes ${Date.now()}`;
  const criada = await page.request.post(`${API}/quebras`, {
    data: {
      titulo,
      time: "time-pagamentos",
      demandInfo: "Fechar o pedido com análise de crédito.",
      diagrama: {
        nodes: [
          { id: "n1", type: "service", x: 120, y: 120, label: "srv-checkout", status: "novo", spec: {}, specNA: {} },
        ],
        edges: [],
      },
    },
  });
  expect(criada.status()).toBe(201);

  /**
   * SPEC-88 fatia C — a BORDA carrega a variante.
   *
   * Antes de exercitar a tela: se este trecho falha, o defeito é do Zod, da
   * coluna ou do normalizador, e não adianta procurar no React. Foi exatamente
   * assim que este teste separou as duas causas na primeira rodada vermelha.
   */
  const comVariante = await page.request.post(`${API}/quebras`, {
    data: {
      titulo: `borda-so ${Date.now()}`,
      diagrama: { nodes: [], edges: [] },
      variantes: [
        { id: "v-borda", titulo: "Só para a borda", diagrama: { nodes: [], edges: [] }, criadaEm: "2026-08-30T10:00:00.000Z" },
      ],
    },
  });
  expect(comVariante.status()).toBe(201);
  expect((await comVariante.json()).variantes?.[0]?.titulo).toBe("Só para a borda");
  const idDaQuebra = (await criada.json()).id as string;

  // E o PUT também — é ele que o autosave usa, e POST funcionando não garante
  // PUT funcionando: são dois caminhos com dois Zods de entrada.
  // Numa quebra DESCARTÁVEL, e não na do teste: a primeira escrita sondou a
  // própria demanda e deixou uma variante nela, derrubando a asserção de
  // "nenhuma alternativa guardada" três passos adiante. Sonda que suja a
  // fixture é sonda que inventa um defeito.
  const descartavel = (await comVariante.json()).id as string;
  const porPut = await page.request.put(`${API}/quebras/${descartavel}`, {
    data: {
      titulo: `borda-put ${Date.now()}`,
      diagrama: { nodes: [], edges: [] },
      variantes: [
        { id: "v-put", titulo: "Pelo PUT", diagrama: { nodes: [], edges: [] }, criadaEm: "2026-08-30T10:00:00.000Z" },
      ],
    },
  });
  expect(porPut.status(), await porPut.text()).toBe(200);
  expect((await porPut.json()).variantes?.[0]?.titulo).toBe("Pelo PUT");
  await page.reload();

  await page.getByRole("button", { name: "☰ Menu" }).click();
  await page.getByRole("button", { name: "Abrir…" }).click();
  await page.getByPlaceholder("ex.: aprovação de crédito").fill(titulo);
  await page.getByRole("button", { name: new RegExp(titulo) }).click();
  await expect(page.getByTestId("titulo-da-quebra")).toContainText(titulo);

  // A aba nova do assistente — é para isso que o invólucro existe (SPEC-34 §3.1).
  await page.getByTestId("assistente-flutuante").click();
  await page.getByRole("button", { name: /Alternativas/ }).click();
  await expect(page.getByTestId("painel-de-variantes")).toBeVisible();

  // Demanda com um desenho só DIZ que isso é normal, em vez de tabela vazia.
  await expect(page.getByTestId("sem-variantes")).toContainText("um desenho só");

  await page.getByLabel("Nome da alternativa").fill("Vitrine com fila");
  await page.getByTestId("guardar-variante").click();
  await expect(page.getByTestId("comparacao-de-variantes")).toBeVisible();

  // A pergunta que importa não é "o DOM pintou?", é "SOBREVIVEU?" — 15s por
  // causa do debounce de 2s do autosave.
  await expect
    .poll(
      async () => {
        const r = await page.request.get(`${API}/quebras/${idDaQuebra}`);
        return ((await r.json()) as { variantes?: { titulo: string }[] }).variantes?.[0]?.titulo;
      },
      { timeout: 15000 }
    )
    .toBe("Vitrine com fila");

  // Adotar sem o porquê não é oferecido: o motor recusa, e deixar clicar para
  // receber erro é ensinar a ignorar o campo.
  await expect(page.getByTestId("adotar-variante")).toBeDisabled();

  await page.getByLabel("por que adotar esta").fill("a fila tira o parceiro do caminho da resposta");
  await page.getByTestId("adotar-variante").click();

  /**
   * A troca no servidor: a alternativa virou o desenho, o desenho de antes virou
   * alternativa, e a decisão nasceu com as duas na lista.
   */
  await expect
    .poll(
      async () => {
        const r = await page.request.get(`${API}/quebras/${idDaQuebra}`);
        const q = (await r.json()) as { variantes?: { titulo: string }[]; decisoes?: { porque: string }[] };
        return { variante: q.variantes?.[0]?.titulo, porque: q.decisoes?.[0]?.porque };
      },
      { timeout: 15000 }
    )
    .toEqual({ variante: titulo, porque: "a fila tira o parceiro do caminho da resposta" });

  // REABRIR é o teste de verdade da regra 3 (SPEC-58): o F5 preserva a rota, mas
  // não a demanda aberta — reabrir pelo menu é o que uma pessoa faria.
  await page.reload();
  await page.getByRole("button", { name: "☰ Menu" }).click();
  await page.getByRole("button", { name: "Abrir…" }).click();
  await page.getByPlaceholder("ex.: aprovação de crédito").fill(titulo);
  await page.getByRole("button", { name: new RegExp(titulo) }).click();

  await page.getByTestId("assistente-flutuante").click();
  await page.getByRole("button", { name: /Alternativas/ }).click();
  await expect(page.getByTestId("comparacao-de-variantes")).toContainText(titulo);
});
