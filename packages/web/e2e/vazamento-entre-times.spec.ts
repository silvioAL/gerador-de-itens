import { test, expect } from "@playwright/test";
import { entrar, entrarEmTimeProprio } from "./auth";

const API = "http://localhost:4100";

/**
 * **O beco sem saída que um usuário encontrou, e o vazamento por trás dele.**
 *
 * Relato real: a pessoa abriu o fluxo de ensaio pelo time DELA, o canvas listou
 * uma execução suspensa, ela clicou em "abrir →" e caiu numa tela cujos dois
 * botões recusavam — "exige nível operar no time time-pagamentos; seu nível é
 * nenhum". Sem avançar e sem retornar.
 *
 * A recusa estava certa; o resto não. A execução era de OUTRO time e nunca
 * deveria ter sido oferecida: `ensaio-de-cenarios` é fluxo de FÁBRICA, existe
 * com o mesmo id em todo time, e a listagem filtrava só por `fluxoId`.
 *
 * ## O que só o navegador prova
 *
 * As provas de rota já cobrem os quatro endpoints. O que só aqui se vê é que a
 * PORTA sumiu da tela: o convite ("abrir →") não aparece mais, e por isso
 * ninguém entra no beco. Um teste de rota diria "403"; este diz "não há o que
 * clicar".
 */
test.describe.configure({ mode: "serial" });

test("a execução suspensa de OUTRO time não aparece no canvas — nem o convite de abrir", async ({ page }) => {
  test.setTimeout(120000);
  await page.addInitScript(() => localStorage.setItem("gerador:jornada-vista", "1"));

  /**
   * Primeiro: alguém de um time COMUM deixa uma execução parada numa tela. O
   * fluxo do ensaio é de fábrica, então ele existe igual nos dois times — é
   * exatamente a condição que fazia o vazamento aparecer.
   */
  await entrar(page, "time-pagamentos");
  const demanda = await page.request.post(`${API}/quebras`, {
    data: { titulo: `vazamento e2e ${Date.now()}`, time: "time-pagamentos", diagrama: { nodes: [], edges: [] } },
  });
  expect(demanda.status()).toBe(201);
  const { id: demandaId } = (await demanda.json()) as { id: string };

  const execucao = await page.request.post(`${API}/fluxos/ensaio-de-cenarios/executar`, {
    data: { timeId: "time-pagamentos", parametrosPorNo: { demanda: { demandaId } } },
  });
  expect(execucao.status()).toBe(200);
  const alheia = (await execucao.json()) as { execucaoId?: string; aguardandoTela?: unknown };
  // O ensaio para na bancada (fatia B) — é a execução suspensa do relato.
  expect(alheia.aguardandoTela).toBeDefined();

  /**
   * Agora a pessoa do OUTRO time abre o mesmo fluxo de fábrica. Antes do
   * conserto, o canvas listava a execução acima e oferecia "abrir →".
   */
  // Trocar de identidade: sem limpar a sessão, `entrar` não acha a tela de
  // login (a pessoa anterior continua dentro) e o teste morre no lugar errado.
  await page.context().clearCookies();
  await entrarEmTimeProprio(page, "vazamento");
  await page.goto("/#/fluxo/ensaio-de-cenarios");
  await expect(page.getByTestId("fluxo-screen")).toBeVisible();
  // Espera o canvas assentar: o efeito que busca o histórico roda depois do
  // desenho, e afirmar a ausência antes dele passaria por qualquer motivo.
  await expect(page.locator('.react-flow__node[data-id="bancada"]')).toBeVisible();
  await page.waitForTimeout(1500);

  // A porta para o beco não existe: não há execução alheia a abrir.
  await expect(page.getByTestId("abrir-tela-do-stage")).toHaveCount(0);

  // E a API confirma o recorte, sem depender do que a tela desenhou.
  const historico = await page.request.get(`${API}/fluxos/ensaio-de-cenarios/execucoes`);
  const { execucoes } = (await historico.json()) as { execucoes: { timeId: string }[] };
  expect(execucoes.every((e) => e.timeId !== "time-pagamentos")).toBe(true);
});

test("o link direto para a tela alheia é RECUSADO — em vez de renderizar e prender", async ({ page }) => {
  test.setTimeout(120000);
  await page.addInitScript(() => localStorage.setItem("gerador:jornada-vista", "1"));

  // A execução alheia, criada pelo time comum.
  await entrar(page, "time-pagamentos");
  const demanda = await page.request.post(`${API}/quebras`, {
    data: { titulo: `vazamento link ${Date.now()}`, time: "time-pagamentos", diagrama: { nodes: [], edges: [] } },
  });
  const { id: demandaId } = (await demanda.json()) as { id: string };
  const execucao = await page.request.post(`${API}/fluxos/ensaio-de-cenarios/executar`, {
    data: { timeId: "time-pagamentos", parametrosPorNo: { demanda: { demandaId } } },
  });
  const { execucaoId } = (await execucao.json()) as { execucaoId: string };

  // Alguém manda o link. A pessoa do outro time abre.
  await page.context().clearCookies();
  await entrarEmTimeProprio(page, "vazamento");
  const direto = await page.request.get(`${API}/fluxos/execucoes/${execucaoId}/tela`);
  expect(direto.status()).toBe(403);

  /**
   * E pela tela: o App não deixa a pessoa parada num stage que ela não pode
   * decidir. Ele a devolve para a galeria — **com o motivo à vista**, que é o
   * que separa "desvio" de "cliquei e não aconteceu nada" (§2.4-3).
   */
  await page.goto(`/#/tela/${execucaoId}`);
  await expect(page.getByTestId("galeria-de-fluxos")).toBeVisible({ timeout: 15000 });
  await expect(page.getByTestId("tela-do-stage-titulo")).toHaveCount(0);
  await expect(page.getByTestId("aviso-de-chegada")).toContainText("time");
});
