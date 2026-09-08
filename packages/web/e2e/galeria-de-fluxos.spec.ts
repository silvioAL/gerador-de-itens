import { test, expect } from "@playwright/test";
import { entrarEmTimeProprio } from "./auth";

const API = "http://localhost:4100";
/**
 * Time PRÓPRIO: este spec escreve os documentos `fluxos` e `telas` do time
 * inteiro. Num time compartilhado ele apaga o desenho de quem estiver rodando
 * em paralelo — medido: derrubou `jornada-e-cenarios`, que usa `time-checkout`.
 */
const TIME = "time-e2e-galeria";

/**
 * SPEC-110 fatia H (D14) — **a galeria: onde os fluxos e as telas moram.**
 *
 * O que existia era um dropdown no topo do canvas. Para saber o que o time
 * tem, era preciso abrir um fluxo qualquer e ler uma lista de nomes — e para
 * saber de ONDE um fluxo derivado nasce, não havia resposta nenhuma na tela.
 */
test.describe.configure({ mode: "serial" });

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("gerador:jornada-vista", "1"));
  await page.route(
    (url) => url.pathname === "/ia/status",
    (rota) => rota.fulfill({ json: { modelosChat: [], embeddingInstalado: false, capacidades: {} } })
  );
  await entrarEmTimeProprio(page, "galeria");
});

test("`#/fluxo` abre a GALERIA, com os derivados dizendo de onde nascem", async ({ page }) => {
  test.setTimeout(120000);
  await page.goto("/#/fluxo");
  await expect(page.getByTestId("galeria-de-fluxos")).toBeVisible();

  // As fábricas aparecem agrupadas pela ETAPA da jornada, não em ordem
  // alfabética: "o que existe aqui?" se responde por momento de uso.
  await expect(page.getByTestId("card-fluxo-esteira-de-agentes")).toBeVisible();
  await expect(page.getByTestId("card-fluxo-ensaio-de-cenarios")).toBeVisible();
  await expect(page.getByTestId("card-fluxo-pdca-melhoria")).toBeVisible();
  await expect(page.getByTestId("etapa-ensaiar")).toBeVisible();
  await expect(page.getByTestId("etapa-melhorar")).toBeVisible();

  // D16b — a pergunta "onde se configura isso?" morre no card.
  const esteira = page.getByTestId("card-fluxo-esteira-de-agentes");
  await expect(esteira).toContainText("derivado");
  await expect(esteira).toContainText("nasce de: papéis da esteira");
  // E o ensaio diz que não há o que configurar — é do motor.
  await expect(page.getByTestId("card-fluxo-ensaio-de-cenarios")).toContainText("sempre existe (motor)");
  await expect(page.getByTestId("porta-da-origem-ensaio-de-cenarios")).toHaveCount(0);
});

test("a porta do 'nasce de' leva à tela que GERA o derivado", async ({ page }) => {
  await page.goto("/#/fluxo");
  await expect(page.getByTestId("galeria-de-fluxos")).toBeVisible();
  await page.getByTestId("porta-da-origem-esteira-de-agentes").click();
  // Chegou na configuração dos papéis — que é de onde a esteira deriva.
  await expect(page).toHaveURL(/#\/config\/pipeline/);
});

test("clicar num card abre o CANVAS naquele fluxo, num endereço mandável", async ({ page }) => {
  await page.goto("/#/fluxo");
  await page.getByTestId("card-fluxo-ensaio-de-cenarios").click();
  await expect(page.getByTestId("fluxo-screen")).toBeVisible();
  await expect(page).toHaveURL(/#\/fluxo\/ensaio-de-cenarios/);
  await expect(page.getByTestId("seletor-de-fluxo")).toHaveValue("ensaio-de-cenarios");
});

test("a busca FILTRA — e o que não casa some", async ({ page }) => {
  await page.goto("/#/fluxo");
  await expect(page.getByTestId("card-fluxo-esteira-de-agentes")).toBeVisible();

  await page.getByTestId("busca-da-galeria").fill("ensaio");
  await expect(page.getByTestId("card-fluxo-ensaio-de-cenarios")).toBeVisible();
  await expect(page.getByTestId("card-fluxo-esteira-de-agentes")).toHaveCount(0);

  // Sem acento e sem maiúscula: quem digita "melhoria" acha "Melhoria".
  await page.getByTestId("busca-da-galeria").fill("MELHORIA");
  await expect(page.getByTestId("card-fluxo-pdca-melhoria")).toBeVisible();

  // A busca também casa pelo TIPO — "derivado" traz as fábricas.
  await page.getByTestId("busca-da-galeria").fill("derivado");
  await expect(page.getByTestId("card-fluxo-esteira-de-agentes")).toBeVisible();
  await expect(page.getByTestId("card-fluxo-ensaio-de-cenarios")).toBeVisible();

  await page.getByTestId("busca-da-galeria").fill("nada-com-esse-nome");
  await expect(page.locator('[data-testid^="card-fluxo-"]')).toHaveCount(0);
});

test("criar, renomear e trocar o rosto de um fluxo — e tudo sobrevive ao F5", async ({ page }) => {
  test.setTimeout(120000);
  const original = (await (await page.request.get(`${API}/config/fluxos?timeId=${TIME}`)).json()).documento;
  try {
    await page.goto("/#/fluxo");
    await expect(page.getByTestId("galeria-de-fluxos")).toBeVisible();

    // ── Criar pela galeria: o "+ Novo fluxo" mora aqui (D14) ──
    await page.getByTestId("nome-do-fluxo-novo").fill("Galeria E2E");
    await page.getByTestId("criar-fluxo-na-galeria").click();
    await expect(page.getByTestId("fluxo-screen")).toBeVisible();
    await expect(page).toHaveURL(/#\/fluxo\/galeria-e2e/);

    // ── De volta à galeria: o declarado aparece na seção "Do time" ──
    await page.goto("/#/fluxo");
    const card = page.getByTestId("card-fluxo-galeria-e2e");
    await expect(card).toBeVisible();
    await expect(card).toContainText("declarado");
    await expect(page.getByTestId("etapa-meus")).toBeVisible();

    // ── Renomear e dar um rosto ──
    await page.getByTestId("editar-card-galeria-e2e").click();
    await page.getByTestId("nome-em-edicao").fill("Vitrine renomeada");
    await page.getByTestId("icone-em-edicao").fill("🎯");
    await page.getByTestId("salvar-card-galeria-e2e").click();
    await expect(card).toContainText("Vitrine renomeada");
    await expect(card).toContainText("🎯");

    // ── O F5: o que se vê depois de recarregar é o que ficou gravado ──
    await page.reload();
    await expect(page.getByTestId("card-fluxo-galeria-e2e")).toContainText("Vitrine renomeada");
    await expect(page.getByTestId("card-fluxo-galeria-e2e")).toContainText("🎯");

    // O DERIVADO não oferece edição: "editar uma cópia" continua sendo a
    // porta, e um campo que não persiste seria pior que campo nenhum.
    await expect(page.getByTestId("editar-card-esteira-de-agentes")).toHaveCount(0);
  } finally {
    await page.request.put(`${API}/config/fluxos`, { data: { documento: original, timeId: TIME } });
  }
});

test("a tela declarada aparece na galeria, com quantos fluxos a usam, e o clique abre o editor", async ({ page }) => {
  test.setTimeout(120000);
  const telasOriginais = (await (await page.request.get(`${API}/config/telas?timeId=${TIME}`)).json()).documento;
  const fluxosOriginais = (await (await page.request.get(`${API}/config/fluxos?timeId=${TIME}`)).json()).documento;
  try {
    await page.request.put(`${API}/config/telas`, {
      data: {
        timeId: TIME,
        documento: {
          telas: [
            {
              id: "aprovacao-galeria",
              nome: "Aprovação da galeria",
              icone: "✅",
              blocos: [
                { tipo: "texto", markdown: "confira e decida" },
                { tipo: "acao", rotulo: "Aprovar", acao: "avancar" },
              ],
            },
          ],
        },
      },
    });
    // Um fluxo que USA a tela — é o que dá sentido ao "usada em N fluxos".
    await page.request.put(`${API}/config/fluxos`, {
      data: {
        timeId: TIME,
        documento: {
          fluxos: [
            {
              id: "usa-a-tela-e2e",
              nome: "Usa a tela",
              nos: [{ id: "t", tipo: "tela", refId: "tela:aprovacao-galeria", posicao: { x: 0, y: 0 }, parametros: {} }],
              arestas: [],
            },
          ],
        },
      },
    });

    await page.goto("/#/fluxo");
    const cardDaTela = page.getByTestId("card-tela-aprovacao-galeria");
    await expect(cardDaTela).toBeVisible();
    await expect(cardDaTela).toContainText("Aprovação da galeria");
    await expect(cardDaTela).toContainText("✅");
    // A pergunta que o card responde antes de alguém mexer: "posso editar?".
    await expect(page.getByTestId("usos-da-tela-aprovacao-galeria")).toContainText("usada em 1 fluxo");

    await cardDaTela.click();
    await expect(page).toHaveURL(/#\/config\/telas/);
  } finally {
    await page.request.put(`${API}/config/telas`, { data: { documento: telasOriginais, timeId: TIME } });
    await page.request.put(`${API}/config/fluxos`, { data: { documento: fluxosOriginais, timeId: TIME } });
  }
});
