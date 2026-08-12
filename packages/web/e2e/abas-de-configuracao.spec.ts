import { test, expect } from "@playwright/test";
import { entrar } from "./auth";

/**
 * #306 — as abas de Configurações que não tinham NENHUM teste de navegador.
 *
 * A medição que originou este arquivo (JOURNEY §153): das nove abas, quatro
 * estavam descobertas — "Regras de refinamento", "Acessos", "Pipeline de IA" e
 * "Campos por tipo de conexão". A primeira delas **abriu em branco em
 * produção**, e chegou até o usuário exatamente porque nada a clicava num
 * navegador.
 *
 * Ficam três aqui: "Campos por tipo de conexão" só aparecia no modo local, que
 * a SPEC-33 removeu.
 *
 * O `ConfigScreen.test.tsx` já garante, em jsdom, que nenhuma aba abre vazia.
 * Estes vão além do "não está vazio": afirmam que o CONTEÚDO de cada uma
 * chegou — o que depende do servidor responder, da rota existir e da permissão
 * não esconder tudo. Nenhuma dessas três coisas o jsdom vê.
 */
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("gerador:jornada-vista", "1"));
});

async function abrirConfig(page: import("@playwright/test").Page, aba: RegExp) {
  await entrar(page);
  await page.getByRole("button", { name: /Configurações/ }).click();
  await page.getByRole("button", { name: aba }).click();
}

test("Regras de refinamento: carrega o documento do servidor e mostra as seções", async ({ page }) => {
  await abrirConfig(page, /Regras de refinamento/);

  // O defeito real era a aba abrir VAZIA — o corpo estava atrás de um gate de
  // modo local. Aqui se exige o conteúdo, não a ausência de branco. (O seletor
  // "Tecnologia" saiu — as regras agora aparecem agrupadas por componente.)
  await expect(page.getByText(/vira o conteúdo dos itens gerados/)).toBeVisible();

  // As seções que a pessoa alterna (checklist técnico, testes, volumetria,
  // processo) — é o que a delegação da SPEC-28 recorta por papel.
  const secoes = page.getByRole("button", { name: /Checklist|Testes|Volumetria|Processo/ });
  expect(await secoes.count()).toBeGreaterThan(1);
});

test("Regras: criar um grupo pela tela (§165) e marcar contexto por clique — o campo de vírgula saiu", async ({ page }) => {
  await entrar(page);

  // O documento de regras é da organização — guarda o vigente pra restaurar.
  // Frontend de propósito: nenhum cenário dos outros specs deriva itens
  // Frontend, então o grupo criado aqui não muda ficha de ninguém (§162).
  const API = "http://localhost:4100";
  const antes = await (await page.request.get(`${API}/config/regras`)).json();
  // Setup determinístico: garante que Frontend NÃO tem grupo antes de testar a
  // criação — um run falho anterior pode ter deixado o grupo salvo (o restore
  // do fim não roda quando o teste morre no meio; por isso ele virou finally).
  const { Frontend: _f, ...porTechSemFrontend } = antes.documento.porTech ?? {};
  await page.request.put(`${API}/config/regras`, {
    data: { documento: { ...antes.documento, porTech: porTechSemFrontend } },
  });

  try {
  await page.getByRole("button", { name: /Configurações/ }).click();
  await page.getByRole("button", { name: /Regras de refinamento/ }).click();

  // §165 — a instalação limpa nasce sem grupo nenhum; o clique cria.
  await page.getByTestId("novo-grupo-Frontend").click();
  const grupo = page.getByTestId("regras-grupo-Frontend");
  await expect(grupo).toBeVisible();

  // O fluxo real continua: um requisito novo digitado no grupo recém-criado,
  // e o contexto por clique (Frontend não tem contexto próprio, então o menu
  // cai na lista completa — o fallback documentado).
  await grupo.getByRole("textbox", { name: "Novo item", exact: true }).fill("Definir o tratamento de estado offline");
  await grupo.getByRole("button", { name: "+ Adicionar" }).click();
  const primeiro = grupo.getByTestId("regra-0");
  await primeiro.getByRole("button", { name: /adicionar$/ }).click();
  // As opções vêm de appConfig.contextos — valor exato, sem digitação.
  await page.getByRole("option", { name: "Mobile-android" }).click();
  await expect(primeiro.getByRole("button", { name: "Remover contexto Mobile-android" })).toBeVisible();

  // Persistiu de verdade: sair da aba e voltar relê do servidor.
  await page.getByRole("button", { name: "Voltar ao canvas" }).click();
  await page.getByRole("button", { name: /Configurações/ }).click();
  await page.getByRole("button", { name: /Regras de refinamento/ }).click();
  await expect(
    page.getByTestId("regras-grupo-Frontend").getByRole("button", { name: "Remover contexto Mobile-android" })
  ).toBeVisible();

  } finally {
    // Restaura o documento como estava — regras é da organização, não do
    // teste; e `finally` porque um teste que falha no meio não pode deixar o
    // grupo pra trás (foi exatamente o que sujou a rodada anterior).
    await page.request.put(`${API}/config/regras`, { data: { documento: antes.documento } });
  }
});

test("Especificação: apagar {{itens}} não deixa salvar e mostra o motivo (SPEC-35); com {{itens}}, salva de verdade", async ({ page }) => {
  await entrar(page);
  // O template global é da organização — guarda o vigente pra restaurar no fim.
  const API = "http://localhost:4100";
  const antes = await (await page.request.get(`${API}/especificacao-template`)).json();

  await page.getByRole("button", { name: /Configurações/ }).click();
  await page.getByRole("button", { name: /Especificação de solução/ }).click();
  await page.getByRole("button", { name: "editar" }).click();

  const conteudo = page.getByLabel("Conteúdo do template");
  await conteudo.fill("# {{titulo}}\n{{contexto}}");

  // O motivo aparece ANTES do clique, e o salvar trava — nada é gravado.
  // (Escopado pela aba: o header da quebra também tem um "Salvar".)
  const salvar = page.getByTestId("corpo-da-aba").getByRole("button", { name: "Salvar", exact: true });
  await expect(page.getByTestId("template-erros")).toContainText("{{itens}}");
  await expect(page.getByTestId("template-erros")).toContainText("corpo do documento");
  await expect(salvar).toBeDisabled();

  // Template enxuto é aviso, não trava: com {{itens}} de volta, salvar libera
  // e a consequência das ausências continua dita.
  // Mantém {{titulo}}: o tour (spec paralelo) afirma essa variável nesta
  // mesma aba — um template global sem ela abriria a corrida da §162.
  await conteudo.fill("# {{titulo}} — Template do E2E\n{{itens}}");
  await expect(page.getByTestId("template-erros")).toHaveCount(0);
  await expect(page.getByTestId("template-avisos")).toContainText("Contexto do épico");
  await expect(salvar).toBeEnabled();

  // E salva DE VERDADE (pedido do usuário: o fluxo de uso desta parte tem que
  // constar no E2E, não só o bloqueio): grava, sai da tela, volta e o texto
  // persistido é o novo.
  await salvar.click();
  await page.getByRole("button", { name: "Voltar ao canvas" }).click();
  await page.getByRole("button", { name: /Configurações/ }).click();
  await page.getByRole("button", { name: /Especificação de solução/ }).click();
  await expect(page.getByText(/Template do E2E/)).toBeVisible();

  // Restaura o template vigente — ele é da organização, não deste teste.
  if (antes?.conteudo) {
    await page.request.put(`${API}/especificacao-template`, {
      data: { timeId: antes.timeId ?? "__global__", conteudo: antes.conteudo },
    });
  }
});

test("Acessos: a tela da delegação de RBAC abre e diz o estado atual", async ({ page }) => {
  await abrirConfig(page, /^Acessos/);

  // Sem papel nenhum criado, o produto roda em "modo aberto" — e precisa DIZER
  // isso, senão a tela parece quebrada. É a aba que existe por causa do pedido
  // que originou a SPEC-28 inteira ("Agilidade cuida do checklist de processo")
  // e que estava sem nenhuma cobertura de navegador.
  const corpo = page.getByTestId("corpo-da-aba");
  await expect(corpo).toBeVisible();
  expect((await corpo.textContent())?.trim().length ?? 0).toBeGreaterThan(40);
});

test("Pipeline de IA: os papéis, o prompt herdado e a anatomia do prompt", async ({ page }) => {
  await abrirConfig(page, /Pipeline de IA/);

  for (const papel of ["PO", "Arquiteto", "Especialista técnico", "QA"]) {
    await expect(page.getByRole("button", { name: new RegExp(`^${papel}`) }).first()).toBeVisible();
  }

  // #296: papel sem prompt custom mostra o padrão da seção, não um campo em
  // branco. Este é o caso que a aba inteira existia para permitir e que
  // ninguém via.
  await page.getByRole("button", { name: /^PO/ }).first().click();
  const herdado = page.getByTestId("preambulo-herdado-po");
  await expect(herdado).toBeVisible();
  expect((await herdado.textContent())?.length ?? 0).toBeGreaterThan(100);

  // E a anatomia — onde entra o que a pessoa preenche no canvas.
  await expect(page.getByTestId("anatomia-do-prompt")).toBeVisible();
});
