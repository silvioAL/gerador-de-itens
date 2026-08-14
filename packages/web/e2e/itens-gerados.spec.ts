import { test, expect } from "@playwright/test";
import { entrar } from "./auth";

/**
 * SPEC-41 Parte B — o ciclo dos itens de trabalho visto no navegador: derivar,
 * pedir "Gerar itens de trabalho" ao agente da revisão e cair na tela
 * `#/itens` com os cards e a régua de completude. A IA fica desligada de
 * propósito (mock do /ia/status): o caminho passa pelos balões M4→M5→M12, que
 * é exatamente a condução de quem abre a revisão sem esteira.
 */
test("gerar itens na revisão abre a tela #/itens com cards e completude", async ({ page }) => {
  test.setTimeout(60000);
  await page.addInitScript(() => localStorage.setItem("gerador:jornada-vista", "1"));
  await page.route(
    (url) => url.pathname === "/ia/status",
    (rota) => rota.fulfill({ json: { modelosChat: [], embeddingInstalado: false, capacidades: {} } })
  );
  await entrar(page);

  await page.getByTestId("abrir-cenarios").click();
  await page.getByRole("button", { name: "Carregar cenário: Dados não-relacionais" }).click();
  await page.locator('[data-tour="derivar-button"]').click();
  // Sem título: derivar sem salvar (exploração) — os itens ficam locais.
  await page.getByTestId("assistente-balao-secundaria").click();

  // A condução até o M12: dispensa "sem IA" (M4) e, se vier, "sem contexto"
  // (M5 — cenário pronto pode chegar já tocado, e aí o M5 é pulado).
  await page.getByTestId("balao-sem-ia").getByRole("button", { name: "Dispensar sugestão" }).click();
  await expect(page.getByTestId("balao-sem-contexto").or(page.getByTestId("balao-gerar"))).toBeVisible();
  if (await page.getByTestId("balao-sem-contexto").isVisible()) {
    await page.getByTestId("balao-sem-contexto").getByRole("button", { name: "Dispensar sugestão" }).click();
  }
  await expect(page.getByTestId("balao-gerar")).toBeVisible();
  await page.getByTestId("balao-gerar-itens").click();

  // A tela dos itens, na rota própria.
  await expect(page.getByTestId("itens-screen")).toBeVisible();
  expect(page.url()).toContain("#/itens");
  // §197 — UM ☰ só no DOM: o do canvas se esconde atrás da tela (a SPEC-40
  // corrigiu isso pra config e a tela nova tinha repetido o defeito).
  await expect(page.getByRole("button", { name: "☰ Menu" })).toHaveCount(1);
  await expect(page.getByTestId("itens-resumo")).toContainText(/de \d+ itens? prontos? pra exportar/);

  // Cards com a régua de completude — material recém-derivado tem ✍️ pendentes.
  const primeiro = page.getByTestId("item-gerado-0");
  await expect(primeiro).toBeVisible();
  await expect(page.getByTestId("item-completude-0")).toContainText(/especificar|confirmar|Pronto/);

  // SPEC-47 — a escrita do item está À VISTA (era "Ver corpo" colapsado), e
  // termina na entrega final.
  await expect(page.getByTestId("item-corpo-0")).toContainText("História de usuário");
  await expect(page.getByTestId("item-corpo-0")).toContainText("Entrega final");
  await page.getByTestId("item-expandir-0").click(); // recolher é o que é sob demanda
  await expect(page.getByTestId("item-corpo-0")).toHaveCount(0);

  // Voltar ao canvas devolve a revisão (escondida, não desmontada).
  await page.getByRole("button", { name: "Voltar ao canvas" }).click();
  await expect(page.getByTestId("itens-screen")).not.toBeVisible();
});

test("menu ☰ leva à tela de itens; sem geração, o vazio conduz", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("gerador:jornada-vista", "1"));
  await page.route(
    (url) => url.pathname === "/ia/status",
    (rota) => rota.fulfill({ json: { modelosChat: [], embeddingInstalado: false, capacidades: {} } })
  );
  await entrar(page);

  await page.getByRole("button", { name: "☰ Menu" }).click();
  await page.getByRole("button", { name: "Itens escritos" }).click();

  await expect(page.getByTestId("itens-screen")).toBeVisible();
  await expect(page.getByTestId("itens-vazio")).toContainText("Nenhum item escrito ainda");
  await page.getByRole("button", { name: "Ir para a demanda" }).click();
  await expect(page.getByTestId("itens-screen")).not.toBeVisible();
});

/**
 * §210 — RELATO REAL do usuário: "fui em abrir, escolhi uma demanda com 2
 * itens, depois abri o menu e fui em itens escritos, e apareceu os itens
 * escritos da demanda ANTERIOR".
 *
 * O item pertence a uma quebra (é o que a rota `/quebras/:id/itens` diz), mas
 * a lista vivia no estado do App e sobrevivia à troca de demanda. Quem abre
 * outra demanda e vê o trabalho da anterior não conclui "a tela está velha" —
 * conclui que a ferramenta misturou o material de duas coisas diferentes, que
 * é o pior que uma ferramenta de especificação pode fazer.
 */
test("§210 — trocar de demanda NÃO leva junto os itens da anterior", async ({ page }) => {
  test.setTimeout(90000);
  await page.addInitScript(() => localStorage.setItem("gerador:jornada-vista", "1"));
  await page.route(
    (url) => url.pathname === "/ia/status",
    (rota) => rota.fulfill({ json: { modelosChat: [], embeddingInstalado: false, capacidades: {} } })
  );
  await entrar(page);

  // Uma demanda VAZIA já salva, para abrir depois — é o "escolhi outra
  // demanda" do relato.
  const outra = `demanda sem itens ${Date.now()}`;
  const criada = await page.request.post("http://localhost:4100/quebras", {
    data: { titulo: outra, time: "time-pagamentos", diagrama: { nodes: [], edges: [] } },
  });
  expect(criada.status()).toBe(201);

  // Demanda A: deriva COM nome (a quebra é salva) e gera os itens, que ficam
  // persistidos nela.
  await page.getByTestId("abrir-cenarios").click();
  await page.getByRole("button", { name: "Carregar cenário: Dados não-relacionais" }).click();
  await page.locator('[data-tour="derivar-button"]').click();
  await page.getByLabel("ex.: Fatura mensal em lote").fill(`demanda com itens ${Date.now()}`);
  await page.getByTestId("assistente-balao-confirmar").click();

  await page.getByTestId("balao-sem-ia").getByRole("button", { name: "Dispensar sugestão" }).click();
  if (await page.getByTestId("balao-sem-contexto").isVisible().catch(() => false)) {
    await page.getByTestId("balao-sem-contexto").getByRole("button", { name: "Dispensar sugestão" }).click();
  }
  const botaoItens = page.getByTestId("balao-gerar-itens").or(page.getByTestId("balao-especificacao-itens")).first();
  await botaoItens.waitFor({ timeout: 15000 });
  await botaoItens.click();
  await expect(page.getByTestId("itens-screen")).toBeVisible();
  const quantosNaPrimeira = await page.locator('[data-testid^="item-"]').count();
  expect(quantosNaPrimeira).toBeGreaterThan(0);

  // Agora o caminho exato do relato: Abrir → outra demanda → Itens escritos.
  // Duas voltas: a primeira fecha a tela de itens, a segunda fecha a revisão.
  // Sem a segunda, a revisão fica por cima e INTERCEPTA o clique no ☰ do
  // canvas — que é o menu que a pessoa usa no relato.
  await page.getByRole("button", { name: "Voltar ao canvas" }).click();
  await page.getByRole("button", { name: "Voltar ao canvas" }).click();
  await page.getByRole("button", { name: "☰ Menu" }).click();
  await page.getByRole("button", { name: "Abrir…" }).click();
  await page.getByText(outra).first().click();

  // A busca dos itens da demanda nova fica LENTA de propósito: é na janela
  // entre abrir a outra demanda e a resposta chegar que o relato acontece.
  // Sem atraso, o `expect` espera a resposta e o defeito passa despercebido —
  // que foi exatamente o que aconteceu na primeira versão deste teste.
  await page.route(
    (url) => /\/quebras\/[^/]+\/itens$/.test(url.pathname),
    async (rota) => {
      await new Promise((ok) => setTimeout(ok, 3000));
      await rota.continue();
    }
  );

  await page.getByRole("button", { name: "☰ Menu" }).click();
  await page.getByRole("button", { name: "Itens escritos" }).click();
  await expect(page.getByTestId("itens-screen")).toBeVisible();

  // AQUI: com a resposta ainda no ar, a tela não pode mostrar o trabalho da
  // demanda anterior. Item pertence a uma quebra — o de outra não é "dado
  // velho", é material de outra demanda.
  //
  // Leitura IMEDIATA (`count()`), e não `expect().toHaveCount()`: o auto-retry
  // esperaria os 3s do atraso e veria a lista já corrigida — deixando passar
  // exatamente o instante que o usuário viu. Um teste que espera o defeito
  // sumir não testa o defeito.
  expect(
    await page.locator('[data-testid^="item-"]').count(),
    "com a busca ainda no ar, a tela não pode exibir os itens da demanda anterior"
  ).toBe(0);

  // E, quando a resposta chega, o vazio se confirma (a demanda aberta não tem
  // item nenhum).
  await expect(page.getByTestId("itens-vazio")).toBeVisible();
  await expect(page.locator('[data-testid^="item-"]')).toHaveCount(0);
});

/**
 * §210 (o outro caminho, e o mais grave) — demanda NOVA, ainda sem id.
 *
 * O recarregamento tinha uma porta de saída: `if (!quebraId) return`. Numa
 * demanda que ainda não foi salva não há o que buscar no servidor — e o
 * `return` deixava na tela exatamente o que estava lá antes: os itens da
 * demanda anterior. Nada a carregar não é o mesmo que "mostre o que sobrou".
 */
test("§210 — demanda NOVA (sem id) não herda os itens escritos da anterior", async ({ page }) => {
  test.setTimeout(90000);
  await page.addInitScript(() => localStorage.setItem("gerador:jornada-vista", "1"));
  await page.route(
    (url) => url.pathname === "/ia/status",
    (rota) => rota.fulfill({ json: { modelosChat: [], embeddingInstalado: false, capacidades: {} } })
  );
  await entrar(page);

  await page.getByTestId("abrir-cenarios").click();
  await page.getByRole("button", { name: "Carregar cenário: Dados não-relacionais" }).click();
  await page.locator('[data-tour="derivar-button"]').click();
  await page.getByTestId("assistente-balao-secundaria").click(); // sem título: fica local

  await page.getByTestId("balao-sem-ia").getByRole("button", { name: "Dispensar sugestão" }).click();
  if (await page.getByTestId("balao-sem-contexto").isVisible().catch(() => false)) {
    await page.getByTestId("balao-sem-contexto").getByRole("button", { name: "Dispensar sugestão" }).click();
  }
  await page.getByTestId("balao-gerar-itens").click();
  await expect(page.getByTestId("itens-screen")).toBeVisible();
  expect(await page.locator('[data-testid^="item-"]').count()).toBeGreaterThan(0);

  // Começar outra demanda do zero — o "Nova quebra" do menu.
  await page.getByRole("button", { name: "Voltar ao canvas" }).click();
  await page.getByRole("button", { name: "Voltar ao canvas" }).click();
  await page.getByRole("button", { name: "☰ Menu" }).click();
  await page.getByRole("button", { name: "Nova quebra" }).click();

  await page.getByRole("button", { name: "☰ Menu" }).click();
  await page.getByRole("button", { name: "Itens escritos" }).click();

  await expect(page.getByTestId("itens-screen")).toBeVisible();
  await expect(page.locator('[data-testid^="item-"]')).toHaveCount(0);
  await expect(page.getByTestId("itens-vazio")).toBeVisible();
});
