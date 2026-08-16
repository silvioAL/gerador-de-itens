import { test, expect } from "@playwright/test";
import { entrar } from "./auth";
import { derivarNaMesa } from "./derivar";

const API = "http://localhost:4100";

/**
 * SPEC-53 Fase 1 — o produto existe, guarda contexto e a demanda aponta pra
 * ele. O que se prova aqui é a fundação: sem ela a Fase 2 (o contexto chegando
 * em quem escreve o item) não tem de onde ler.
 *
 * Produto é estado GLOBAL da organização: o teste apaga o que criou no
 * `finally`, mesma disciplina do §162.
 */
test("cadastrar produto com contexto e glossário, e ligar a demanda a ele", async ({ page }) => {
  test.setTimeout(60000);
  await page.addInitScript(() => localStorage.setItem("gerador:jornada-vista", "1"));
  await page.route(
    (url) => url.pathname === "/ia/status",
    (rota) => rota.fulfill({ json: { modelosChat: [], embeddingInstalado: false, capacidades: {} } })
  );
  await entrar(page);

  const nome = `Portabilidade e2e ${Date.now()}`;
  // §262 — um SEGUNDO produto, de propósito, criado antes de abrir a tela.
  //
  // Organização real tem vários produtos, e este teste vinha provando tudo num
  // banco de um produto só — premissa que ele nunca declarou e que o resíduo de
  // uma execução interrompida quebrava. O concorrente traz a situação real para
  // dentro do teste em vez de deixá-la acontecer por acidente.
  const CONCORRENTE = "Aaa concorrente e2e";
  try {
    await page.request.post(`${API}/produtos`, { data: { nome: CONCORRENTE } });
    await page.getByRole("button", { name: "☰ Menu" }).click();
    await page.getByRole("button", { name: "Contexto do produto" }).click();

    await page.getByLabel("Nome do produto novo").fill(nome);
    await page.getByTestId("criar-produto").click();
    // §262 — esperar pelo produto CERTO, não por "o editor está visível".
    //
    // Com outro produto no banco o editor já estava aberto (no primeiro da
    // lista) quando se clicou em criar: a espera por visibilidade passava na
    // hora, no editor ERRADO. O texto era digitado ali, e o recarregar do criar
    // chegava depois e substituía o rascunho — a gravação ia vazia, com 200 e
    // "salvo" na tela. Mesma classe do §250: afirmar sobre um estado que já era
    // verdadeiro antes da ação não espera por nada.
    //
    // `exact` no rótulo porque "Nome do produto" também casa com "Nome do
    // produto novo", o campo de criar — que o próprio criar acabou de limpar.
    await expect(page.getByTestId("editor-do-produto")).toBeVisible();
    await expect(page.getByLabel("Nome do produto", { exact: true })).toHaveValue(nome);

    // As seções do contexto — o que vai junto com toda demanda deste produto.
    await page.getByLabel("O que é").fill("Levar a conta do cliente para outro banco.");
    await page.getByLabel("Restrições").fill("Resolução 4.753 do BACEN.");
    await page.getByTestId("salvar-produto").click();
    await expect(page.getByTestId("produto-salvo")).toBeVisible();

    // O glossário: a seção que faz o item deixar de ser genérico de negócio.
    await page.getByLabel("Termo", { exact: true }).fill("Fatura em aberto");
    await page.getByLabel("Definição").fill("A que venceu e não foi paga");
    await page.getByTestId("salvar-termo").click();
    await expect(page.getByTestId("termo-do-glossario")).toContainText("A que venceu e não foi paga");

    // Sobrevive ao F5 — é banco, não estado de tela.
    //
    // §262 — abrir o produto pelo NOME depois do F5. A tela reabre no primeiro
    // da lista quando não sabe qual estava aberto, então afirmar direto sobre o
    // campo lia outro produto: vazio, ficava vermelho; com o mesmo texto de uma
    // execução anterior, ficava VERDE lendo a linha errada — o pior dos dois.
    await page.reload();
    await page.getByRole("button", { name: nome, exact: true }).click();
    await expect(page.getByLabel("O que é")).toHaveValue("Levar a conta do cliente para outro banco.");

    // E a DEMANDA aponta pro produto, pelo painel de contexto do épico.
    // Cenário pronto primeiro: carregar cenário troca a quebra inteira, então
    // escolher o produto antes seria escolher para uma demanda que morre em
    // seguida — e o botão de derivar só liga com os campos preenchidos.
    await page.getByRole("button", { name: "☰ Menu" }).click();
    await page.getByRole("button", { name: "Nova quebra" }).click();
    await page.getByTestId("abrir-cenarios").click();
    await page.getByRole("button", { name: "Carregar cenário: Dados não-relacionais" }).click();
    await page.getByTestId("assistente-flutuante").click();
    const janela = page.getByTestId("assistente-janela");
    await janela.getByRole("button", { name: "📎 Contexto do épico" }).click();
    await janela.getByLabel("Produto desta demanda").selectOption({ label: nome });
    await janela.getByRole("button", { name: "Salvar" }).click();

    // O vínculo atravessa a persistência — o campo que morria na borda (SPEC-31).
    const salva = page.waitForResponse((r) => r.url().includes("/quebras") && r.request().method() === "POST");
    await derivarNaMesa(page);
    await page.getByLabel("ex.: Fatura mensal em lote").fill(`demanda com produto ${Date.now()}`);
    await page.getByTestId("assistente-balao-confirmar").click();
    const corpo = await (await salva).json();
    expect(corpo.produtoId).toBeTruthy();
  } finally {
    // §262 — varre por PREFIXO, não por nome exato. O nome carrega `Date.now()`,
    // então uma execução interrompida deixa para trás uma linha que nenhuma
    // execução seguinte consegue apagar — foi assim que o resíduo que envenenou
    // este teste chegou ao banco. Limpar só o que se criou nesta rodada é
    // limpeza que não limpa.
    const produtos = (await (await page.request.get(`${API}/produtos`)).json()) as { id: string; nome: string }[];
    const meus = produtos.filter((p) => p.nome.startsWith("Portabilidade e2e ") || p.nome === CONCORRENTE);
    for (const p of meus) {
      await page.request.delete(`${API}/produtos/${p.id}`);
    }
  }
});
