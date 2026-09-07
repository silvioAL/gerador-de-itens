import { test, expect } from "@playwright/test";
import { entrar } from "./auth";
import { DESENHO_DO_GATEWAY_FALSO } from "@gerador/gateway-falso";

const API = "http://localhost:4100";

/**
 * SPEC-110 fatia B — **o ensaio pela TELA: a cadeia que o usuário desenhou.**
 *
 * Nas palavras dele: *"seria feita a conexão com essa screen, o agente iria
 * gerar o ensaio, e depois o usuário revisa, e decide avançar para a derivação
 * (conexão com próximo output), ou retornar"*.
 *
 * O que só o navegador prova: a fiação de fábrica ATRAVESSA a tela (o canvas
 * mostra o nó), a execução PARA nela com a porta "abrir →", a moldura
 * Retornar/Avançar é do shell (a bancada não mudou por dentro), o Avançar
 * roda a derivação e fecha o rastro verde, e o Retornar ENCERRA a execução
 * com o aviso certo (D2 — sem re-rodar automático).
 *
 * Time próprio: este spec dispara execuções do fluxo do ensaio, e a suspensa
 * mais recente é o que a tela lê ao abrir — outro spec do mesmo time no meio
 * embaralharia qual execução está esperando.
 */
test.describe.configure({ mode: "serial" });

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("gerador:jornada-vista", "1"));
  await page.route(
    (url) => url.pathname === "/ia/status",
    (rota) => rota.fulfill({ json: { modelosChat: [], embeddingInstalado: false, capacidades: {} } })
  );
  await entrar(page, "time-portabilidade");
});

/** Uma demanda salva com desenho de verdade — a fiação lê a demanda SALVA. */
async function demandaSalva(page: import("@playwright/test").Page, titulo: string) {
  const criada = await page.request.post(`${API}/quebras`, {
    data: { titulo, time: "time-portabilidade", diagrama: DESENHO_DO_GATEWAY_FALSO.diagrama },
  });
  expect(criada.status()).toBe(201);
  return ((await criada.json()) as { id: string }).id;
}

test("a fiação do ensaio atravessa a TELA: para nela, avança, e a derivação roda", async ({ page }) => {
  test.setTimeout(120000);
  const demandaId = await demandaSalva(page, `tela-do-ensaio avancar ${Date.now()}`);

  // ── 1. O canvas mostra a cadeia inteira, com a TELA desenhada nela ──
  await page.goto("/#/fluxo/ensaio-de-cenarios");
  await expect(page.getByTestId("fluxo-screen")).toBeVisible();
  await expect(page.getByTestId("seletor-de-fluxo")).toHaveValue("ensaio-de-cenarios", { timeout: 15000 });
  for (const no of ["gatilho", "demanda", "ensaio", "bancada", "derivacao"]) {
    await expect(page.locator(`.react-flow__node[data-id="${no}"]`)).toBeVisible();
  }
  // O cartão diz que é uma TELA — a família nova, no vocabulário da casa.
  await expect(page.locator('.react-flow__node[data-id="bancada"]')).toContainText("Tela");

  // ── 2. Executar PARA na tela: a derivação não rodou ──
  const exec = await page.request.post(`${API}/fluxos/ensaio-de-cenarios/executar`, {
    data: { timeId: "time-portabilidade", parametrosPorNo: { demanda: { demandaId } } },
  });
  expect(exec.status()).toBe(200);
  const suspensa = (await exec.json()) as {
    execucaoId: string;
    aguardandoTela?: { noId: string };
    nos: { noId: string }[];
  };
  expect(suspensa.aguardandoTela?.noId).toBe("bancada");
  expect(suspensa.nos.map((n) => n.noId)).toEqual(["gatilho", "demanda", "ensaio"]);

  // ── 3. O canvas oferece a PORTA (e não os botões do gate: quem decide numa
  //       tela decide LÁ, não aqui) ──
  await page.reload();
  await expect(page.getByTestId("aguardando-tela")).toBeVisible({ timeout: 20000 });
  await expect(page.getByTestId("gate-de-confirmacao")).toHaveCount(0);
  await page.getByTestId("abrir-tela-do-stage").click();

  // ── 4. A tela: a bancada REUSADA como corpo, com a moldura do shell ──
  await expect(page).toHaveURL(/#\/tela\//);
  await expect(page.getByTestId("tela-do-stage")).toBeVisible();
  await expect(page.getByTestId("tela-ensaios")).toBeVisible({ timeout: 30000 });
  // A âncora de hoje veio do STAGE (a leitura que o nó `ensaio` produziu), e
  // não de uma segunda medição feita aqui.
  await expect(page.getByTestId("linha-hoje")).toBeVisible();

  // ── 5. Avançar: a derivação roda e o rastro fecha verde ──
  await page.getByTestId("tela-avancar").click();
  await expect(page.getByTestId("fluxo-screen")).toBeVisible({ timeout: 30000 });
  await expect
    .poll(
      async () => {
        const r = await page.request.get(`${API}/fluxos/ensaio-de-cenarios/execucoes`);
        const { execucoes } = (await r.json()) as { execucoes: { id: string; estado: string; nos: { noId: string; estado: string }[] }[] };
        const minha = execucoes.find((e) => e.id === suspensa.execucaoId);
        return minha ? `${minha.estado}:${minha.nos.map((n) => `${n.noId}=${n.estado}`).join(",")}` : "sumiu";
      },
      { timeout: 30000 }
    )
    .toBe("concluida:gatilho=sucesso,demanda=sucesso,ensaio=sucesso,bancada=sucesso,derivacao=sucesso");
});

test("Retornar ENCERRA a execução, e o canvas diz o que fazer (D2)", async ({ page }) => {
  test.setTimeout(120000);
  const demandaId = await demandaSalva(page, `tela-do-ensaio retornar ${Date.now()}`);

  const exec = await page.request.post(`${API}/fluxos/ensaio-de-cenarios/executar`, {
    data: { timeId: "time-portabilidade", parametrosPorNo: { demanda: { demandaId } } },
  });
  const { execucaoId } = (await exec.json()) as { execucaoId: string };

  await page.goto(`/#/tela/${execucaoId}`);
  await expect(page.getByTestId("tela-ensaios")).toBeVisible({ timeout: 30000 });
  await page.getByTestId("tela-retornar").click();

  // A execução TERMINOU ali: a derivação nunca rodou, e o estado diz o porquê.
  await expect
    .poll(
      async () => {
        const r = await page.request.get(`${API}/fluxos/ensaio-de-cenarios/execucoes`);
        const { execucoes } = (await r.json()) as { execucoes: { id: string; estado: string; nos: { noId: string }[] }[] };
        const minha = execucoes.find((e) => e.id === execucaoId);
        return minha ? `${minha.estado}:${minha.nos.length}` : "sumiu";
      },
      { timeout: 30000 }
    )
    .toBe("retornada:3");

  // E o canvas conta: "retornado — ajuste e rode de novo" (sem re-rodar nada
  // sozinho, D2: isso é dívida declarada, não v1).
  await page.goto("/#/fluxo/ensaio-de-cenarios");
  await expect(page.getByTestId("execucao-retornada")).toBeVisible({ timeout: 20000 });
  await expect(page.getByTestId("execucao-retornada")).toContainText("rode de novo");
});
