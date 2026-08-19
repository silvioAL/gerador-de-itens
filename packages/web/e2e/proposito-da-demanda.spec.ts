import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { entrar } from "./auth";
import { derivarNaMesa } from "./derivar";

/**
 * SPEC-57 fatia A — a cadeia PROPÓSITO → ELEMENTO → ITEM → SPEC, ponta a ponta
 * no navegador.
 *
 * As unidades provam cada elo em separado; o que só o navegador prova é a
 * costura: a necessidade digitada no painel do assistente chega ao placar do
 * topo, o vínculo feito ali fecha a lacuna, e o texto reaparece no documento
 * gerado. Foi exatamente esse vão — entre camadas verdes — que o §123 pagou
 * caro para descobrir.
 */
test("declarar propósito, ligar ao componente e ver a citação chegar no documento", async ({ page }) => {
  test.setTimeout(90000);
  await page.addInitScript(() => localStorage.setItem("gerador:jornada-vista", "1"));
  await page.route(
    (url) => url.pathname === "/ia/status",
    (rota) => rota.fulfill({ json: { modelosChat: [], embeddingInstalado: false, capacidades: {} } })
  );
  await entrar(page);

  const proposito = `o pedido não pode ser cobrado duas vezes ${Date.now()}`;

  // Um componente na mesa, para haver a quem ligar o propósito. Fila Rabbit e
  // não Serviço porque este teste vai até DERIVAR, e o portão de prontidão só
  // abre com os obrigatórios preenchidos — os da fila são conhecidos e
  // estáveis (mesma sequência de `derivar-e-revisar`).
  await page.getByRole("button", { name: "+ Fila Rabbit" }).click();
  await expect(page.locator(".react-flow__node")).toHaveCount(1);
  await page.locator(".react-flow__node", { hasText: "Fila Rabbit" }).click();
  const painel = page.locator("aside");
  await painel.getByRole("textbox", { name: "Nome da fila" }).fill("proposta.aprovada.q");
  await painel.getByRole("checkbox", { name: "Durable" }).check();
  await painel.getByRole("combobox", { name: "Tipo de fila" }).selectOption("quorum");
  await painel.getByRole("spinbutton", { name: "TTL da mensagem (ms)" }).fill("60000");
  await painel.getByRole("combobox", { name: "Ack" }).selectOption("manual");
  await expect(page.locator('[data-tour="derivar-button"]')).toBeEnabled();

  // Sem necessidade declarada, a dimensão nem aparece: a régua nova não pode
  // acusar quem nunca a usou.
  await expect(page.getByTestId("proposito-resumo")).toHaveCount(0);

  // M1 — o propósito, no mesmo painel onde o contexto da demanda já vive.
  await page.getByTestId("assistente-flutuante").click();
  const janela = page.getByTestId("assistente-janela");
  await janela.getByRole("button", { name: "📎 Contexto do épico" }).click();
  await janela.getByLabel("Nova necessidade", { exact: true }).fill(proposito);
  await janela.getByRole("button", { name: "+ Adicionar" }).click();

  // Ainda sem ninguém que responda por ela — a lacuna é visível ali mesmo.
  await expect(janela.getByTestId(/^necessidade-/)).toHaveAttribute("data-lacuna", "sim");

  // M6 — ligar ao componente fecha a lacuna, na mesma tela.
  await janela.getByLabel(`Vincular componente a: ${proposito}`).selectOption({ index: 1 });
  await expect(janela.getByTestId(/^necessidade-/)).not.toHaveAttribute("data-lacuna", "sim");

  await janela.getByRole("button", { name: "Salvar" }).click();

  // M3 — a medida aparece no placar do topo, onde a decisão é tomada.
  await expect(page.getByTestId("proposito-resumo")).toContainText("propósito coberto");

  // M8 — o elo final: o documento que SAI da ferramenta cita o propósito.
  //
  // Este pedaço existe por um buraco real: o `ReviewScreen` montava o
  // documento sem passar as necessidades, então a citação funcionava numa
  // chamada direta ao engine e NÃO no artefato que a pessoa baixa. Teste de
  // unidade do gerador não pegaria — ele testa o gerador, não quem o chama.
  // Fecha o assistente antes de derivar: a janela flutuante fica por cima do
  // header e intercepta o clique (mesma armadilha do §221 com o menu).
  if (await page.getByTestId("assistente-janela").count()) {
    await page.getByTestId("assistente-flutuante").click();
    await expect(page.getByTestId("assistente-janela")).toHaveCount(0);
  }

  await derivarNaMesa(page);
  // Quebra sem título: o assistente pergunta o nome antes de derivar.
  const perguntaNome = page.getByLabel("ex.: Fatura mensal em lote");
  if (await perguntaNome.count()) {
    await perguntaNome.fill("Demanda com propósito");
    await page.getByTestId("assistente-balao-confirmar").click();
  }
  await expect(page.getByTestId("contagem-itens")).toBeVisible();
  // Os balões da condução proativa aparecem em SEQUÊNCIA — o seguinte só nasce
  // depois de o anterior ser dispensado. Checar os dois de uma vez (o que eu
  // tinha feito) só dispensa o primeiro e trava esperando a ação de geração.
  for (let i = 0; i < 4; i++) {
    if (await page.getByTestId("ir-ao-documento").count()) break;
    const dispensar = page.getByRole("button", { name: "Dispensar sugestão" });
    if (await dispensar.count()) await dispensar.first().click();
    else await page.waitForTimeout(300);
  }

  // §270 — o markdown vem do DOCUMENTO agora. Era baixado por um botão do
  // balão que montava o mesmo texto com outro nome de arquivo; o que este
  // teste sempre quis provar (a citação do propósito chega ao markdown)
  // continua igual, e agora pelo caminho que existe.
  await page.getByTestId("ir-ao-documento").click();
  const baixando = page.waitForEvent("download");
  await page.getByTestId("baixar-markdown").click();
  const md = await baixando;
  const conteudo = await readFile(await md.path(), "utf-8");

  expect(conteudo).toContain("Necessidades atendidas");
  expect(conteudo).toContain(proposito);
});

/**
 * O caminho de volta: a lacuna precisa REAPARECER quando o componente que
 * respondia por ela some. É a decisão de não cascatear (`analisarLacunas`) —
 * limpar o vínculo em silêncio esconderia justamente o evento que interessa.
 */
test("apagar o componente devolve a necessidade à condição de lacuna", async ({ page }) => {
  test.setTimeout(90000);
  await page.addInitScript(() => localStorage.setItem("gerador:jornada-vista", "1"));
  await page.route(
    (url) => url.pathname === "/ia/status",
    (rota) => rota.fulfill({ json: { modelosChat: [], embeddingInstalado: false, capacidades: {} } })
  );
  await entrar(page);

  const proposito = `propósito órfão ${Date.now()}`;

  await page.getByRole("button", { name: "+ Serviço", exact: true }).click();
  await expect(page.locator(".react-flow__node")).toHaveCount(1);

  await page.getByTestId("assistente-flutuante").click();
  const janela = page.getByTestId("assistente-janela");
  await janela.getByRole("button", { name: "📎 Contexto do épico" }).click();
  await janela.getByLabel("Nova necessidade", { exact: true }).fill(proposito);
  await janela.getByRole("button", { name: "+ Adicionar" }).click();
  await janela.getByLabel(`Vincular componente a: ${proposito}`).selectOption({ index: 1 });
  await janela.getByRole("button", { name: "Salvar" }).click();
  await expect(page.getByTestId("proposito-resumo")).toContainText("propósito coberto");

  // Apaga o componente pelo canvas.
  await page.locator(".react-flow__node").first().click();
  await page.keyboard.press("Delete");
  const confirmar = page.getByRole("button", { name: /Excluir|Confirmar/ });
  if (await confirmar.count()) await confirmar.first().click();
  await expect(page.locator(".react-flow__node")).toHaveCount(0);

  // O placar volta a acusar: o vínculo apontando para nó morto não conta.
  await expect(page.getByTestId("proposito-resumo")).toContainText("1 sem componente");
});

/**
 * §253 — o campo de contexto não pode ser espremido pelo que está acima dele.
 *
 * Achado por print do usuário: com várias necessidades na lista, o campo do
 * contexto do épico aparecia com UMA linha e o texto cortado ao meio. Não era
 * o rodapé cobrindo — o `textarea` é item de um flex column com altura
 * definida, e item flex encolhe por padrão. Em vez de o container rolar (para
 * isso ele tem `overflow: auto`), o campo é que sumia.
 *
 * Só o navegador prova isto: `rows={8}` está lá no código, e continuaria lá
 * com o campo medindo 30 pixels. Teste de unidade em jsdom não faz layout, e
 * conferir o estilo diria "flexShrink está escrito" — não "o campo tem
 * tamanho".
 */
test("§253 — o campo do contexto mantém altura mesmo com a lista cheia acima", async ({ page }) => {
  test.setTimeout(90000);
  await page.addInitScript(() => localStorage.setItem("gerador:jornada-vista", "1"));
  await page.route(
    (url) => url.pathname === "/ia/status",
    (rota) => rota.fulfill({ json: { modelosChat: [], embeddingInstalado: false, capacidades: {} } })
  );
  await entrar(page);

  await page.getByTestId("assistente-flutuante").click();
  const janela = page.getByTestId("assistente-janela");
  await janela.getByRole("button", { name: "📎 Contexto do épico" }).click();

  const campo = janela.getByLabel("Contexto do épico (texto)");
  const alturaVazia = (await campo.boundingBox())?.height ?? 0;
  expect(alturaVazia).toBeGreaterThan(100);

  // Enche a lista acima até o painel precisar rolar — que é a condição exata
  // do print.
  for (let i = 0; i < 6; i++) {
    await janela.getByLabel("Nova necessidade", { exact: true }).fill(`necessidade de teste número ${i} com texto longo o bastante para ocupar duas linhas`);
    await janela.getByRole("button", { name: "+ Adicionar" }).click();
  }
  await expect(janela.getByTestId(/^necessidade-/)).toHaveCount(6);

  // O campo continua com tamanho de campo, não de linha.
  const alturaCheia = (await campo.boundingBox())?.height ?? 0;
  expect(alturaCheia).toBeGreaterThan(100);
});
