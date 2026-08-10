import { test, expect } from "@playwright/test";
import { entrar } from "./auth";

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

  await page.getByRole("button", { name: "✦ Como funciona & cenários" }).click();
  await page.getByRole("button", { name: /Cenários prontos/ }).click();
  await page.getByRole("button", { name: "Carregar cenário: Dados não-relacionais" }).click();

  await expect(page.getByText("Como funciona o Gerador de Itens")).not.toBeVisible();
  await expect(page.locator(".react-flow__node", { hasText: "srv-catalogo" })).toBeVisible();
  await expect(page.locator(".react-flow__node", { hasText: "produtos" })).toBeVisible();

  const botaoDerivar = page.getByRole("button", { name: "Derivar Quebra" });
  await expect(botaoDerivar).toBeEnabled();
  await botaoDerivar.click();

  await expect(page.getByText("4 itens")).toBeVisible();
  await expect(page.getByText("Não é possível derivar ainda")).not.toBeVisible();

  await page.screenshot({ path: "e2e/screenshots/cenario-mongo.png", fullPage: true });
});

test("aba Perfis de time (tela de Configurações) mostra os times conhecidos e explica como capturar um novo", async ({
  page,
}) => {
  await page.addInitScript(() => localStorage.setItem("gerador:jornada-vista", "1"));
  await entrar(page);

  await page.getByRole("button", { name: "⚙ Configurações" }).click();
  await page.getByRole("button", { name: /Perfis de time/ }).click();

  // Escopado pra dentro da tela de config: o header tem um <select> com essas
  // mesmas strings como <option>, e getByText também bate em <option>s no DOM.
  const telaConfig = page.locator('[data-tour="config-screen-content"]');
  await expect(telaConfig.getByText("time-pagamentos", { exact: true })).toBeVisible();
  await expect(telaConfig.getByText("time-portabilidade", { exact: true })).toBeVisible();
  await expect(telaConfig.getByText(/Spring Boot/)).toBeVisible();
  await expect(telaConfig.getByText(/salvar estes valores como padrão do time/)).toBeVisible();

  await page.screenshot({ path: "e2e/screenshots/perfis-de-time-tab.png", fullPage: true });
});

test("declarar 'time trabalha com Java' na aba Perfis de time faz um Serviço novo desse time já sugerir Java", async ({
  page,
}) => {
  await page.addInitScript(() => localStorage.setItem("gerador:jornada-vista", "1"));
  // dev@gerador.local pertence a time-checkout também (seed sem perfil de stack
  // nenhum ainda — só assim dá pra demonstrar "declarar pela primeira vez").
  await entrar(page, "time-checkout");

  await page.getByRole("button", { name: "⚙ Configurações" }).click();
  await page.getByRole("button", { name: /Perfis de time/ }).click();
  await page.getByText("+ Adicionar ou corrigir um valor de stack").click();

  await page.getByPlaceholder("ex.: time-pagamentos").fill("time-checkout");
  await page.getByLabel("Tipo de nó").selectOption({ label: "Serviço" });
  await page.getByLabel("Campo").selectOption({ label: "Linguagem/Stack (linguagem)" });
  await page.getByPlaceholder("ex.: Java").fill("Java");
  await page.getByRole("button", { name: "Salvar" }).last().click();

  // Grava direto no servidor — confirma reabrindo a aba e vendo o valor persistido.
  // Escopado: "time-checkout" também aparece como <option> no <select> do header.
  const telaConfig = page.locator('[data-tour="config-screen-content"]');
  await expect(telaConfig.getByText("time-checkout", { exact: true })).toBeVisible();
  await expect(telaConfig.getByText("linguagem:", { exact: false }).last()).toBeVisible();

  await page.getByRole("button", { name: "Voltar ao canvas" }).click();

  // Login como time-checkout já deixou esse time ativo no header (select, não
  // mais texto livre) — um Serviço novo já nasce sugerindo o valor recém-declarado.
  await page.getByRole("button", { name: "+ Serviço", exact: true }).click();
  await page.locator(".react-flow__node", { hasText: "Serviço" }).click();

  await expect(page.getByText("usar sugestão: Java")).toBeVisible();
});

test("adicionar dois cenários ao canvas (sem substituir) compõe um diagrama maior, sem colidir IDs, e deriva tudo junto", async ({
  page,
}) => {
  await page.addInitScript(() => localStorage.setItem("gerador:jornada-vista", "1"));
  await entrar(page);

  await page.getByRole("button", { name: "✦ Como funciona & cenários" }).click();
  await page.getByRole("button", { name: /Cenários prontos/ }).click();

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

  const botaoDerivar = page.getByRole("button", { name: "Derivar Quebra" });
  await expect(botaoDerivar).toBeEnabled();
  await botaoDerivar.click();

  // 4 atividades do mongo + 5 do kafka = 9 — se algum ID tivesse colidido/se
  // perdido na mesclagem, esse número não bateria.
  await expect(page.getByText("9 itens")).toBeVisible();
  await expect(page.getByText("Não é possível derivar ainda")).not.toBeVisible();

  await page.screenshot({ path: "e2e/screenshots/cenarios-compostos.png", fullPage: true });
});

test("tour guiado de 1 clique percorre diagrama, prontidão, proveniência, derivação, revisão, especificação de solução, perfis de time, campos por tipo de nó e modelo da especificação", async ({
  page,
}) => {
  await entrar(page);

  await page.getByRole("button", { name: "▶ Iniciar tour guiado" }).click();

  // Passo 1: bem-vindo (sem alvo, overlay centralizado).
  await expect(page.getByText("PASSO 1 DE 12")).toBeVisible();
  await expect(page.getByText("Bem-vindo")).toBeVisible();
  await page.getByRole("button", { name: "Próximo" }).click();

  // Cada passo com alvo checa que o seletor do spotlight realmente existe no
  // DOM — sem isso o overlay cai silenciosamente no fallback centralizado de
  // tela cheia em vez de apontar pro elemento certo (achado por QA visual).
  // Passo 2: diagrama — cenário mongo já carregado no canvas real.
  await expect(page.getByText("PASSO 2 DE 12")).toBeVisible();
  await expect(page.locator(".react-flow")).toBeVisible();
  await expect(page.locator(".react-flow__node", { hasText: "srv-catalogo" })).toBeVisible();
  await page.getByRole("button", { name: "Próximo" }).click();

  // Passo 3: prontidão.
  await expect(page.getByText("PASSO 3 DE 12")).toBeVisible();
  await expect(page.locator('[data-tour="readiness-summary"]')).toBeVisible();
  await page.getByRole("button", { name: "Próximo" }).click();

  // Passo 4: proveniência — o tour seleciona o nó mongo, painel real abre.
  // O alvo do spotlight precisa existir de verdade — sem isso o overlay cai
  // silenciosamente no fallback centralizado de tela cheia (achado por QA visual).
  await expect(page.getByText("PASSO 4 DE 12")).toBeVisible();
  const painel = page.locator('[data-tour="properties-panel"]');
  await expect(painel).toBeVisible();
  await expect(painel.getByText("Coleção Mongo")).toBeVisible();
  await page.getByRole("button", { name: "Próximo" }).click();

  // Passo 5: derivar.
  await expect(page.getByText("PASSO 5 DE 12")).toBeVisible();
  await expect(page.locator('[data-tour="derivar-button"]')).toBeVisible();
  await page.getByRole("button", { name: "Próximo" }).click();

  // Passo 6: revisão — o tour já disparou a derivação de verdade.
  await expect(page.getByText("PASSO 6 DE 12")).toBeVisible();
  await expect(page.locator('[data-tour="review-table"]')).toBeVisible();
  await expect(page.getByText("4 itens")).toBeVisible();
  await page.getByRole("button", { name: "Próximo" }).click();

  // Passo 7: especificação de solução — revisão e especificação viraram uma coisa só.
  await expect(page.getByText("PASSO 7 DE 12")).toBeVisible();
  await expect(page.locator('[data-tour="export-buttons"]')).toBeVisible();
  await expect(page.getByRole("button", { name: "Gerar especificação de solução" })).toBeVisible();
  await page.getByRole("button", { name: "Próximo" }).click();

  // Passo 8: perfis de time — o tour abre a tela de Configurações já na aba certa,
  // sem o usuário precisar navegar até lá sozinho.
  await expect(page.getByText("PASSO 8 DE 12")).toBeVisible();
  const telaConfigNoTour = page.locator('[data-tour="config-screen-content"]');
  await expect(telaConfigNoTour).toBeVisible();
  await expect(telaConfigNoTour.getByText("time-pagamentos", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Próximo" }).click();

  // Passo 9: campos por tipo de nó — mesma tela, só troca de aba.
  await expect(page.getByText("PASSO 9 DE 12")).toBeVisible();
  await expect(telaConfigNoTour.getByRole("button", { name: "sobrescrever" }).first()).toBeVisible();
  await page.getByRole("button", { name: "Próximo" }).click();

  // Passo 10: modelo da especificação de solução — mesma tela, só troca de aba.
  await expect(page.getByText("PASSO 10 DE 12")).toBeVisible();
  // `.first()`: o template ganhou mais de uma ocorrência de `{{titulo}}` (o
  // cabeçalho do documento e o corpo). O passo do tour prova que a aba certa
  // abriu, não quantas variáveis o modelo usa.
  await expect(telaConfigNoTour.getByText(/\{\{titulo\}\}/).first()).toBeVisible();
  await page.getByRole("button", { name: "Próximo" }).click();

  // Passo 11: linha de comando (sem alvo).
  await expect(page.getByText("PASSO 11 DE 12")).toBeVisible();
  await expect(page.getByText("Linha de comando")).toBeVisible();
  await page.getByRole("button", { name: "Próximo" }).click();

  // Passo 12: fim do tour — fecha a tela de Configurações de volta.
  await expect(page.getByText("PASSO 12 DE 12")).toBeVisible();
  await expect(page.getByText("Fim do tour")).toBeVisible();
  await expect(page.locator('[data-tour="config-screen-content"]')).not.toBeVisible();
  await page.getByRole("button", { name: "Concluir" }).click();

  await expect(page.getByText(/PASSO \d+ DE 12/)).not.toBeVisible();
  await expect(page.getByText("4 itens")).not.toBeVisible();
});

test("pular tour a qualquer momento encerra o overlay imediatamente", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("gerador:jornada-vista", "1"));
  await entrar(page);

  await page.getByRole("button", { name: "✦ Como funciona & cenários" }).click();
  await page.getByRole("button", { name: "▶ Iniciar tour guiado" }).click();
  await page.getByRole("button", { name: "Próximo" }).click();
  await page.getByRole("button", { name: "Pular tour" }).click();

  await expect(page.getByText(/PASSO \d+ DE 12/)).not.toBeVisible();
});
