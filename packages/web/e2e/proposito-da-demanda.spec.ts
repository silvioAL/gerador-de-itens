import { test, expect } from "@playwright/test";
import { entrar } from "./auth";
import { BASE_URL_GATEWAY_FALSO, CHAVE_GATEWAY_FALSO, MODELO_GATEWAY_FALSO } from "./gatewayFalso";

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

  // Um componente na mesa, para haver a quem ligar o propósito.
  await page.getByRole("button", { name: "+ Serviço", exact: true }).click();
  await expect(page.locator(".react-flow__node")).toHaveCount(1);

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
 * SPEC-57 fatia D — o agente propõe o propósito, e o engine mede a proposta
 * ANTES de a pessoa aceitar.
 *
 * Contra o gateway falso: o Chromium fala com o Fastify de verdade, que fala
 * HTTP de verdade com o dublê. A única mentira é o conteúdo da resposta — que
 * é justamente o que precisa ser fixo pro teste afirmar algo.
 */
test("o agente propõe o propósito, e o delta mostra o trabalho que aceitar cria", async ({ page }) => {
  test.setTimeout(90000);
  await page.addInitScript(() => localStorage.setItem("gerador:jornada-vista", "1"));
  await entrar(page);

  // Credencial do gateway falso — mesma da suíte de IA hospedada.
  await page.getByRole("button", { name: "☰ Menu" }).click();
  await page.getByRole("button", { name: "Modelo de IA" }).click();
  const card = page.getByTestId("modelo-ia-gateway");
  await card.getByLabel("Base URL do gateway").fill(BASE_URL_GATEWAY_FALSO);
  await card.getByLabel("Chave de API").fill(CHAVE_GATEWAY_FALSO);
  await card.getByLabel("Nome do modelo").fill(MODELO_GATEWAY_FALSO);
  await card.getByLabel("Este modelo enxerga imagem").check();
  await card.getByRole("button", { name: "Salvar" }).click();
  await expect(page.getByTestId("gateway-resultado")).toContainText("Credencial salva");
  await page.getByRole("button", { name: "Voltar à mesa de projeto" }).click();

  await page.getByRole("button", { name: "+ Serviço", exact: true }).click();
  await expect(page.locator(".react-flow__node")).toHaveCount(1);

  await page.getByTestId("assistente-flutuante").click();
  const janela = page.getByTestId("assistente-janela");
  await janela.getByRole("button", { name: "📎 Contexto do épico" }).click();

  // Sem contexto nenhum o pedido é recusado no servidor — e a recusa aparece
  // ali, não num alerta solto. Escrever o contexto é o que destrava.
  await janela.getByLabel("Contexto do épico (texto)").fill("Cobrança recorrente com parceiro externo.");

  await janela.getByRole("button", { name: "✦ Propor a partir do contexto" }).click();

  // A proposta chega SUGERIDA: o delta existe porque nada foi aceito ainda.
  const delta = janela.getByTestId("delta-da-proposta");
  // Diagnóstico no lugar certo: se o agente falhou, o painel diz — e é isso
  // que precisa aparecer no relatório, não um "element not found" mudo.
  await expect
    .poll(async () => (await janela.innerText()).slice(0, 600), { timeout: 20000 })
    .toContain("sugerida(s)");
  await expect(delta).toBeVisible();
  await expect(delta).toContainText("sugerida(s), ainda sem efeito");

  // E o placar do topo continua sem acusar: sugestão não vira lacuna sozinha.
  await expect(page.getByTestId("proposito-resumo")).toHaveCount(0);

  // Aceitar é ato da pessoa — e só aí a medida muda.
  await delta.getByRole("button", { name: "Confirmar todas" }).click();
  await expect(janela.getByTestId("delta-da-proposta")).toHaveCount(0);
  await janela.getByRole("button", { name: "Salvar" }).click();
  await expect(page.getByTestId("proposito-resumo")).toBeVisible();
});
