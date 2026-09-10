import { test, expect } from "@playwright/test";
import { entrar } from "./auth";
import { DESENHO_DO_GATEWAY_FALSO } from "@gerador/gateway-falso";

const API = "http://localhost:4100";
const TIME = "time-portabilidade";

/**
 * SPEC-110 fatia J (D16) — **a jornada da demanda: o fluxo maior de que as
 * outras derivadas são etapas.**
 *
 * A queixa literal: *"quais fluxos estão relacionados ao quê? ficou complicada
 * essa parte de 'derivado', onde se configura isso? … faria mais sentido ter um
 * fluxo maior com pools ou algo assim"*.
 *
 * O que só o navegador prova: o mestre existe SEM ninguém o desenhar (é
 * derivado), aparece em destaque na galeria, os cartões dele mostram o nome dos
 * fluxos que rodam ali dentro, o duplo-clique ENTRA no subfluxo, e rodar o
 * mestre pausa na bancada — que é uma tela de OUTRO fluxo — dizendo em qual
 * etapa a execução parou.
 */
test.describe.configure({ mode: "serial" });

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("gerador:jornada-vista", "1"));
  await page.route(
    (url) => url.pathname === "/ia/status",
    (rota) => rota.fulfill({ json: { modelosChat: [], embeddingInstalado: false, capacidades: {} } })
  );
  await entrar(page, TIME);
});

/** Uma demanda salva com desenho de verdade — cada etapa da jornada a lê. */
async function demandaSalva(page: import("@playwright/test").Page, titulo: string) {
  const criada = await page.request.post(`${API}/quebras`, {
    data: { titulo, time: TIME, diagrama: DESENHO_DO_GATEWAY_FALSO.diagrama },
  });
  expect(criada.status()).toBe(201);
  return ((await criada.json()) as { id: string }).id;
}

test("a jornada aparece DERIVADA e em destaque na galeria, dizendo de onde nasce", async ({ page }) => {
  test.setTimeout(120000);
  await page.goto("/#/fluxo");
  await expect(page.getByTestId("galeria-de-fluxos")).toBeVisible();

  // Ninguém a desenhou: ela nasce das etapas que existem no time.
  const card = page.getByTestId("card-fluxo-jornada-da-demanda");
  await expect(card).toBeVisible();
  await expect(card).toContainText("Jornada da demanda");
  await expect(card).toContainText("derivado");
  // D16b — a pergunta "onde se configura isso?" morre no card: as etapas são
  // os cards abaixo, e cada uma diz a própria origem.
  await expect(card).toContainText("nasce de: as etapas abaixo");
  // Em DESTAQUE quer dizer: numa seção própria, antes das etapas soltas.
  await expect(page.getByTestId("etapa-jornada")).toBeVisible();
});

/**
 * A régua GEOMÉTRICA do §300: contar `.react-flow__node` passa com folga
 * mesmo quando a câmera aponta para outro lugar — o DOM tem os cartões. O que
 * responde "dá para ver?" é quantos caem dentro do retângulo visível.
 */
async function noCanvas(page: import("@playwright/test").Page) {
  return await page.evaluate(() => {
    const painel = document.querySelector(".react-flow");
    if (!painel) return { total: 0, dentro: 0 };
    const r = painel.getBoundingClientRect();
    const nos = [...document.querySelectorAll(".react-flow__node")];
    const dentro = nos.filter((n) => {
      const b = n.getBoundingClientRect();
      return b.left >= r.left - 1 && b.right <= r.right + 1 && b.top >= r.top - 1 && b.bottom <= r.bottom + 1;
    }).length;
    return { total: nos.length, dentro };
  });
}

test("os cartões do mestre não se encavalam, e o desenho abre visível", async ({ page }) => {
  test.setTimeout(120000);
  /**
   * **Os cartões se encavalavam.** O passo horizontal das outras fábricas é
   * 280px, e um cartão de subfluxo carrega o NOME DE UM FLUXO: "Esteira de
   * agentes (da configuração)" mede 348px na tela. É a lição da SPEC-109
   * (cartão largo esconde o handle do vizinho) repetida noutro desenho.
   * Corrigido com passo de 400px, e é isto que a prova guarda.
   *
   * **Dívida medida, declarada aqui — e uma tentativa de conserto REVERTIDA.**
   * O canvas não enquadra ao abrir um fluxo pronto: o `fitView` do React Flow
   * roda na montagem, quando a lista de nós ainda está vazia, e o
   * reenquadramento existente só dispara quando o desenho CRESCE. Nenhum fluxo
   * era largo o bastante para denunciar antes do mestre.
   *
   * Tentei consertar aqui e desfiz, por dois motivos medidos: (a) mesmo
   * enquadrando, dois cartões continuavam parcialmente fora, porque o React
   * Flow calcula os limites pelas POSIÇÕES dos nós ignorando a largura dos
   * cartões — o próprio botão "Fit View" dele dá o mesmo resultado, e mexer em
   * `padding`, `initialWidth` ou preservar `measured` não move o número; (b) o
   * efeito disparava na stack de dev e não na de E2E, e comportamento que
   * aparece num ambiente e não no outro é pior que a falta dele. O conserto de
   * verdade pede mexer no ciclo de medida do canvas (o efeito que recria os nós
   * a cada seleção descarta o que o React Flow mediu), o que atinge TODOS os
   * fluxos e merece rodada própria. Até lá o desenho é navegável: minimapa,
   * arrasto e zoom continuam ali.
   */
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/#/fluxo/jornada-da-demanda");
  await expect(page.getByTestId("seletor-de-fluxo")).toHaveValue("jornada-da-demanda", { timeout: 15000 });
  /**
   * **A espera é pelo que a jornada SEMPRE tem, não pelo desenho completo.**
   *
   * A primeira versão esperava o cartão `publicar-documento` e falhou em duas
   * rodadas cheias: a jornada é derivada das etapas que EXISTEM, e sem destino
   * de documento configurado no time não há esse nó — nem esse fluxo. Prender a
   * prova a uma configuração que ela não cria era a prova mentindo sobre o
   * produto. O ensaio, esse, existe sempre (é capacidade do motor).
   */
  await expect(page.locator('.react-flow__node[data-id="ensaio-de-cenarios"]')).toBeVisible();
  await expect.poll(async () => (await noCanvas(page)).total, { timeout: 15000 }).toBeGreaterThanOrEqual(3);

  // 1. Nenhum cartão nasce inteiramente fora da vista — o piso do "abre
  //    visível". Quantos cabem INTEIROS é o número da dívida, medido abaixo.
  const forinhas = await page.evaluate(() => {
    const r = document.querySelector(".react-flow")!.getBoundingClientRect();
    return [...document.querySelectorAll(".react-flow__node")]
      .filter((n) => {
        const b = n.getBoundingClientRect();
        return b.right <= r.left || b.left >= r.right || b.bottom <= r.top || b.top >= r.bottom;
      })
      .map((n) => n.getAttribute("data-id"));
  });
  expect(forinhas).toEqual([]);

  // 2. E nenhum cartão invade o retângulo do vizinho.
  const encavalados = await page.evaluate(() => {
    const nos = [...document.querySelectorAll(".react-flow__node")].map((n) => ({
      id: n.getAttribute("data-id"),
      r: n.getBoundingClientRect(),
    }));
    const pares = [];
    for (let i = 0; i < nos.length; i++)
      for (let j = i + 1; j < nos.length; j++) {
        const a = nos[i].r;
        const b = nos[j].r;
        if (a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom)
          pares.push(`${nos[i].id}×${nos[j].id}`);
      }
    return pares;
  });
  expect(encavalados).toEqual([]);
  /**
   * **Quantos cabem INTEIROS não vira asserção aqui, de propósito.** É o número
   * da dívida acima, e ele depende de quantas etapas o time configurou e da
   * largura da área — travá-lo num piso foi como esta prova mentiu duas vezes
   * (primeiro exigindo um cartão que o time não tem, depois um piso que o
   * enquadramento não sustenta). Quem mede esse número é a validação visual
   * (`visual-do-subfluxo.mjs`), que o imprime a cada rodada para a próxima
   * saber de onde partiu.
   */
});

test("o mestre desenha as etapas como CARTÕES, e o duplo-clique entra no subfluxo", async ({ page }) => {
  test.setTimeout(120000);
  await page.goto("/#/fluxo/jornada-da-demanda");
  await expect(page.getByTestId("fluxo-screen")).toBeVisible();
  await expect(page.getByTestId("seletor-de-fluxo")).toHaveValue("jornada-da-demanda", { timeout: 15000 });

  // Um cartão por etapa, e o cartão diz QUAL fluxo roda ali dentro — é isso
  // que responde "quais fluxos se relacionam" de relance.
  const doEnsaio = page.locator('.react-flow__node[data-id="ensaio-de-cenarios"]');
  await expect(doEnsaio).toBeVisible();
  await expect(doEnsaio).toContainText("Subfluxo");
  await expect(doEnsaio).toContainText("Ensaio de cenários");
  await expect(page.locator('.react-flow__node[data-id="esteira-de-agentes"]')).toBeVisible();
  await expect(page.locator('.react-flow__node[data-id="gatilho"]')).toBeVisible();

  // O painel repete a porta em BOTÃO, para quem não descobre gestos sozinho.
  await doEnsaio.click();
  await expect(page.getByTestId("proposito-do-subfluxo")).toBeVisible();
  await expect(page.getByTestId("fluxo-do-subfluxo")).toHaveValue("ensaio-de-cenarios");

  // ── O gesto do n8n: duplo-clique ABRE o fluxo de dentro ──
  await doEnsaio.dblclick();
  await expect(page.getByTestId("seletor-de-fluxo")).toHaveValue("ensaio-de-cenarios", { timeout: 15000 });
  await expect(page.locator('.react-flow__node[data-id="bancada"]')).toBeVisible();
});

test("rodar o mestre PAUSA na bancada — que é tela de outro fluxo — e o Avançar segue", async ({ page }) => {
  test.setTimeout(180000);
  const demandaId = await demandaSalva(page, `jornada ${Date.now()}`);

  /**
   * A demanda desce para CADA etapa pelo campo externo `demandaId` — o mesmo
   * caminho que o atalho da mesa usa. Sem ele, cada subfluxo cairia n'"a
   * demanda ativa do time": a errada, em silêncio.
   */
  const exec = await page.request.post(`${API}/fluxos/jornada-da-demanda/executar`, {
    data: {
      timeId: TIME,
      parametrosPorNo: {
        "ensaio-de-cenarios": { demandaId },
        "esteira-de-agentes": { demandaId },
      },
    },
  });
  expect(exec.status()).toBe(200);
  const suspensa = (await exec.json()) as {
    execucaoId: string;
    aguardandoTela?: { noId: string; refId: string };
    nos: { noId: string }[];
  };
  // A tela que pausou é a BANCADA, e ela é nó do ENSAIO, não do mestre.
  expect(suspensa.aguardandoTela?.noId).toBe("bancada");
  expect(suspensa.aguardandoTela?.refId).toBe("bancada-de-ensaios");
  // O nó de subfluxo não terminou: nem sucesso, nem falha — está esperando.
  expect(suspensa.nos.map((n) => n.noId)).toEqual(["gatilho"]);

  // ── A porta no canvas do MESTRE, como em qualquer fluxo que pausa ──
  await page.goto("/#/fluxo/jornada-da-demanda");
  await expect(page.getByTestId("aguardando-tela")).toBeVisible({ timeout: 30000 });
  await page.getByTestId("abrir-tela-do-stage").click();

  // ── A moldura diz ONDE a pessoa está: "Jornada da demanda › Ensaio de
  //    cenários". Sem a trilha, ela procuraria a bancada no desenho do mestre,
  //    onde ela não está ──
  await expect(page.getByTestId("tela-do-stage")).toBeVisible();
  await expect(page.getByTestId("tela-do-stage-origem")).toContainText("Jornada da demanda › Ensaio de cenários");
  await expect(page.getByTestId("tela-ensaios")).toBeVisible({ timeout: 30000 });

  // ── Avançar: o ensaio termina, e o mestre segue para a esteira ──
  await page.getByTestId("tela-avancar").click();
  await expect(page.getByTestId("fluxo-screen")).toBeVisible({ timeout: 60000 });
  await expect
    .poll(
      async () => {
        const r = await page.request.get(`${API}/fluxos/jornada-da-demanda/execucoes?timeId=${TIME}`);
        const { execucoes } = (await r.json()) as {
          execucoes: { id: string; estado: string; nos: { noId: string; estado: string }[] }[];
        };
        const minha = execucoes.find((e) => e.id === suspensa.execucaoId);
        return minha ? `${minha.estado}:${minha.nos.map((n) => `${n.noId}=${n.estado}`).join(",")}` : "sumiu";
      },
      { timeout: 120000 }
    )
    // O ensaio fechou verde; o que vier depois é o que o time configurou.
    .toContain("ensaio-de-cenarios=sucesso");

  /**
   * ── A execução do subfluxo é LINHA PRÓPRIA, no histórico do fluxo dele ──
   *
   * É o que dá alvo ao link "ver execução do subfluxo" (§4.J), e o que impede
   * o histórico do ensaio de esconder uma corrida que de fato aconteceu.
   */
  const doEnsaio = await page.request.get(`${API}/fluxos/ensaio-de-cenarios/execucoes?timeId=${TIME}`);
  const { execucoes } = (await doEnsaio.json()) as { execucoes: { nos: { noId: string }[] }[] };
  expect(execucoes.length).toBeGreaterThan(0);
  // E ela tem a bancada dentro: o filho rodou inteiro, não pela metade.
  expect(execucoes[0].nos.map((n) => n.noId)).toContain("bancada");
});
