import { test, expect } from "@playwright/test";
import { entrar } from "./auth";

// Este arquivo testa fluxos determinísticos SEM IA (cenários, tour) — mas a
// credencial do gateway é da organização e outros specs a criam em paralelo
// (§162), o que ligava a esteira (e o M1 da SPEC-37) conforme a corrida. O
// route declara o pressuposto: sem gateway. O M1 é coberto em ia-hospedada.
test.beforeEach(async ({ page }) => {
  await page.route(
    (url) => url.pathname === "/ia/status",
    (rota) => rota.fulfill({ json: { modelosChat: [], embeddingInstalado: false, capacidades: {} } })
  );
});

test("jornada abre sozinha no primeiro acesso, explica as saídas, e some ao fechar", async ({ page }) => {
  await entrar(page);

  await expect(page.getByText("Como funciona o Gerador de Itens")).toBeVisible();
  await expect(page.getByText("Não é um gerador de prompt de IA")).toBeVisible();
  // `.first()`: "Especificação de solução" aparece duas vezes na jornada (o
  // título da saída e a menção no corpo). O que este teste garante é que a
  // saída está listada, não quantas vezes o nome aparece.
  await expect(page.getByText("Especificação de solução").first()).toBeVisible();

  await page.getByRole("button", { name: "Fechar" }).click();
  await expect(page.getByText("Como funciona o Gerador de Itens")).not.toBeVisible();

  await page.reload();
  await expect(page.getByText("Como funciona o Gerador de Itens")).not.toBeVisible();
});

test("carregar um cenário pronto popula o canvas e deriva sem ciclos/conflitos", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("gerador:jornada-vista", "1"));
  await entrar(page);

  await page.getByTestId("abrir-cenarios").click();
  await page.getByRole("button", { name: "Carregar cenário: Dados não-relacionais" }).click();

  await expect(page.getByText("Como funciona o Gerador de Itens")).not.toBeVisible();
  await expect(page.locator(".react-flow__node", { hasText: "srv-catalogo" })).toBeVisible();
  await expect(page.locator(".react-flow__node", { hasText: "produtos" })).toBeVisible();

  const botaoDerivar = page.locator('[data-tour="derivar-button"]');
  await expect(botaoDerivar).toBeEnabled();
  await botaoDerivar.click();

  // Cenário carregado não tem título → o assistente pergunta o nome antes.
  // Aqui é exploração, não registro: "Derivar sem salvar" segue direto.
  await expect(page.getByTestId("assistente-balao")).toContainText("qual é o nome da demanda");
  await page.getByTestId("assistente-balao-secundaria").click();

  await expect(page.getByTestId("contagem-itens")).toHaveText("4 itens");
  await expect(page.getByText("Não é possível derivar ainda")).not.toBeVisible();

  await page.screenshot({ path: "e2e/screenshots/cenario-mongo.png", fullPage: true });
});

test("tela Stacks conhecidas (SPEC-43): cards por COMPONENTE, sem nenhuma menção a time", async ({
  page,
}) => {
  await page.addInitScript(() => localStorage.setItem("gerador:jornada-vista", "1"));
  await entrar(page);

  await page.getByRole("button", { name: "☰ Menu" }).click();
  await page.getByRole("button", { name: /Stacks conhecidas/ }).click();

  // Escopado pra dentro da tela de config: o header tem um <select> com essas
  // mesmas strings como <option>, e getByText também bate em <option>s no DOM.
  const telaConfig = page.locator('[data-tour="config-screen-content"]');
  // SPEC-43: a migração 0026 fatiou o perfil misto por componente — o card
  // "Java + Spring Boot" é do Serviço e "Camunda 7" é do Processo, e nenhum
  // deles menciona time (o catálogo é global).
  await expect(telaConfig.getByTestId("stack-Java + Spring Boot")).toBeVisible();
  await expect(telaConfig.getByTestId("stack-Camunda 7")).toBeVisible();
  await expect(telaConfig.getByTestId("stack-Java + Spring Boot").getByText("Spring Boot", { exact: true })).toBeVisible();
  await expect(telaConfig.getByText(/usado por/)).toHaveCount(0);
  await expect(telaConfig.getByText(/salvar estes valores como stack conhecida/)).toBeVisible();

  await page.screenshot({ path: "e2e/screenshots/perfis-de-time-tab.png", fullPage: true });
});

test("declarar uma stack conhecida faz um Serviço novo de QUALQUER time já sugerir o valor (SPEC-43)", async ({
  page,
}) => {
  await page.addInitScript(() => localStorage.setItem("gerador:jornada-vista", "1"));
  // time-checkout de propósito: o catálogo é GLOBAL — a sugestão chega sem o
  // time declarar nada (era o ponto do "poderia simplesmente ter tudo").
  await entrar(page, "time-checkout");

  await page.getByRole("button", { name: "☰ Menu" }).click();
  await page.getByRole("button", { name: /Stacks conhecidas/ }).click();

  const nomeStack = `stack e2e ${Date.now()}`;
  await page.getByLabel("Componente da nova stack").selectOption({ label: "Serviço" });
  await page.getByLabel("Nome da nova stack").fill(nomeStack);
  await page.getByRole("button", { name: "+ Criar stack" }).click();

  const cardStack = page.getByTestId(`stack-${nomeStack}`);
  await expect(cardStack).toBeVisible();
  await cardStack.getByText("+ adicionar valor").click();
  await page.getByLabel("Campo", { exact: true }).selectOption({ label: "Linguagem/Stack" });
  await page.getByLabel("Valor", { exact: true }).fill("Java");
  await page.getByTestId("salvar-valor-de-stack").click();

  // Grava direto no servidor — o valor aparece no card da stack.
  await expect(cardStack.getByText("linguagem:", { exact: false })).toBeVisible();

  await page.getByRole("button", { name: "Voltar ao canvas" }).click();

  // Login como time-checkout já deixou esse time ativo no header (select, não
  // mais texto livre) — um Serviço novo já nasce sugerindo o valor recém-declarado.
  await page.getByRole("button", { name: "+ Serviço", exact: true }).click();
  await page.locator(".react-flow__node", { hasText: "Serviço" }).click();

  await expect(page.getByText("usar sugestão: Java").first()).toBeVisible();
});

test("adicionar dois cenários ao canvas (sem substituir) compõe um diagrama maior, sem colidir IDs, e deriva tudo junto", async ({
  page,
}) => {
  await page.addInitScript(() => localStorage.setItem("gerador:jornada-vista", "1"));
  await entrar(page);

  await page.getByTestId("abrir-cenarios").click();

  await page.getByRole("button", { name: "Adicionar cenário ao canvas: Dados não-relacionais" }).click();
  await expect(page.getByText("✓ Adicionado")).toBeVisible();
  // Não fecha o modal — dá pra adicionar outro em seguida.
  await expect(page.getByText("Como funciona o Gerador de Itens")).toBeVisible();

  await page.getByRole("button", { name: "Adicionar cenário ao canvas: Streaming Kafka" }).click();
  await page.getByRole("button", { name: "Fechar" }).click();

  // 4 nós do mongo (2) + kafka (3) = 5, mas mongo e kafka cada um tem um "Serviço"
  // com nome próprio — confere pelos rótulos, que são únicos entre os dois cenários.
  await expect(page.locator(".react-flow__node", { hasText: "srv-catalogo" })).toBeVisible();
  await expect(page.locator(".react-flow__node", { hasText: "produtos" })).toBeVisible();
  await expect(page.locator(".react-flow__node", { hasText: "srv-portabilidade" })).toBeVisible();
  await expect(page.locator(".react-flow__node", { hasText: "portabilidade.solicitada.v1" })).toBeVisible();
  await expect(page.locator(".react-flow__node", { hasText: "srv-auditoria-eventos" })).toBeVisible();
  await expect(page.locator(".react-flow__node")).toHaveCount(5);

  const botaoDerivar = page.locator('[data-tour="derivar-button"]');
  await expect(botaoDerivar).toBeEnabled();
  await botaoDerivar.click();

  // Sem título → pergunta do nome; composição de cenários é exploração.
  await expect(page.getByTestId("assistente-balao")).toContainText("qual é o nome da demanda");
  await page.getByTestId("assistente-balao-secundaria").click();

  // 4 atividades do mongo + 5 do kafka = 9 — se algum ID tivesse colidido/se
  // perdido na mesclagem, esse número não bateria.
  await expect(page.getByTestId("contagem-itens")).toHaveText("9 itens");
  await expect(page.getByText("Não é possível derivar ainda")).not.toBeVisible();

  await page.screenshot({ path: "e2e/screenshots/cenarios-compostos.png", fullPage: true });
});

/**
 * SPEC-48 — o tour validado pelo TÍTULO de cada passo, não pelo número: o
 * spec antigo dizia "PASSO 7 DE 13" e quebrava toda vez que o produto
 * ganhava um passo novo (que é o que se quer que aconteça). O que importa é
 * que a etapa existe, na ordem, e que a tela certa abre com ela.
 */
async function irAtePasso(page: import("@playwright/test").Page, titulo: string) {
  for (let i = 0; i < 25; i++) {
    if (await page.getByTestId("tour-titulo").filter({ hasText: titulo }).count()) return;
    await page.getByRole("button", { name: "Próximo" }).click();
  }
  throw new Error(`passo "${titulo}" não apareceu no tour`);
}

test("tour guiado de 1 clique percorre o ciclo inteiro: desenho, derivação, confirmação em lote, itens escritos, documento e configurações", async ({
  page,
}) => {
  test.setTimeout(60000);
  await entrar(page);

  await page.getByRole("button", { name: "▶ Iniciar tour guiado" }).click();

  // Abertura, sem alvo (overlay centralizado).
  await expect(page.getByTestId("tour-titulo")).toHaveText("Bem-vindo");
  await expect(page.getByText(/PASSO 1 DE \d+/)).toBeVisible();

  // O diagrama de verdade, com o cenário do tour já carregado.
  await irAtePasso(page, "O diagrama");
  await expect(page.locator(".react-flow__node")).toHaveCount(2);

  // Prontidão e proveniência.
  await irAtePasso(page, "Prontidão");
  await expect(page.locator('[data-tour="readiness-summary"]')).toBeVisible();
  await irAtePasso(page, "Proveniência");
  await expect(page.locator('[data-tour="properties-panel"]')).toBeVisible();

  // Derivação de verdade — a revisão abre com os itens calculados.
  await irAtePasso(page, "Revisão");
  await expect(page.locator('[data-tour="review-table"]')).toBeVisible();
  await expect(page.getByTestId("contagem-itens")).toHaveText("4 itens");

  // SPEC-44/48 — a confirmação em lote entrou no tour.
  await irAtePasso(page, "Confirmar o que a IA escreveu");
  await expect(page.getByTestId("barra-pendencias")).toBeVisible();

  // O documento sai pelo agente (o botão do header morreu na SPEC-39).
  await irAtePasso(page, "Especificação de solução");
  await expect(page.getByRole("button", { name: "Gerar especificação de solução" })).toHaveCount(0);
  await expect(page.getByTestId("abrir-conversa-especificacao")).toBeVisible();

  // SPEC-47/48 — os ITENS ESCRITOS, a tela que o tour não conhecia.
  await irAtePasso(page, "Itens escritos");
  await expect(page.getByTestId("itens-screen")).toBeVisible();

  // O menu e as telas de configuração.
  await irAtePasso(page, "O menu");
  await irAtePasso(page, "Stacks conhecidas");
  const telaConfigNoTour = page.locator('[data-tour="config-screen-content"]');
  await expect(telaConfigNoTour.getByText("Stacks conhecidas").first()).toBeVisible();

  await irAtePasso(page, "Padrões por componente");
  await expect(telaConfigNoTour.getByRole("button", { name: "sobrescrever" }).first()).toBeVisible();

  await irAtePasso(page, "Níveis e acessos");
  await expect(telaConfigNoTour.getByText(/visualizar.*lê as quebras/).first()).toBeVisible();

  await irAtePasso(page, "Modelos: documento e item");
  await expect(telaConfigNoTour.getByText(/\{\{titulo\}\}/).first()).toBeVisible();

  // SPEC-45/48 — a jornada da melhoria contínua também entrou.
  await irAtePasso(page, "Melhoria contínua (PDCA)");
  await expect(telaConfigNoTour.getByTestId("feedbacks-do-ciclo")).toBeVisible();

  await irAtePasso(page, "Fim do tour");
  await expect(page.locator('[data-tour="config-screen-content"]')).not.toBeVisible();
  await page.getByRole("button", { name: "Concluir" }).click();

  await expect(page.getByText(/PASSO \d+ DE \d+/)).not.toBeVisible();
  await expect(page.getByTestId("contagem-itens")).not.toBeVisible();
});

test("pular tour a qualquer momento encerra o overlay imediatamente", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("gerador:jornada-vista", "1"));
  await entrar(page);

  await page.getByTestId("abrir-demonstracao").click();
  await page.getByRole("button", { name: "▶ Iniciar tour guiado" }).click();
  await page.getByRole("button", { name: "Próximo" }).click();
  await page.getByRole("button", { name: "Pular tour" }).click();

  await expect(page.getByText(/PASSO \d+ DE 13/)).not.toBeVisible();
});
