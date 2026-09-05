import { test, expect, type Page } from "@playwright/test";
import { entrar } from "./auth";
import { CHAVE_GATEWAY_FALSO } from "@gerador/gateway-falso";

const API = "http://localhost:4100";
const GATEWAY_FALSO = "http://localhost:4123";

/**
 * SPEC-105 fatias C+D — o fluxo como grafo, no navegador.
 *
 * A fatia C prova que se DESENHA (nó da paleta do catálogo, ligação, o
 * mapeamento na aresta, e o ciclo travando com a mensagem do desenho); a D
 * prova o exemplo do JMeter (§4.2) rodando ponta a ponta contra o dublê, com
 * o rastro por nó na tela.
 *
 * Os conectores entram DECLARADOS na chave `conectores` (e não como destinos
 * do exportador) por uma razão de suíte: o documento do exportador é global e
 * vários specs o reescrevem inteiro — a escrita aqui é read-modify-write só
 * dos NOSSOS ids, para não apagar o destino de ninguém nem ser apagado.
 */
test.describe.configure({ mode: "serial" });

const MEUS_IDS = ["leitor-fluxo-e2e", "volumetria-fluxo-e2e", "repo-fluxo-e2e"];

async function declararConectores(page: Page, conectores: Record<string, unknown>[]) {
  const atual = (await (await page.request.get(`${API}/config/conectores`)).json()).documento as {
    conectores?: { id: string }[];
  };
  const dosOutros = (atual?.conectores ?? []).filter((c) => !MEUS_IDS.includes(c.id));
  await page.request.put(`${API}/config/conectores`, {
    data: { documento: { conectores: [...dosOutros, ...conectores] } },
  });
}

async function limparMeusConectores(page: Page) {
  const atual = (await (await page.request.get(`${API}/config/conectores`)).json()).documento as {
    conectores?: { id: string }[];
  };
  await page.request.put(`${API}/config/conectores`, {
    data: { documento: { conectores: (atual?.conectores ?? []).filter((c) => !MEUS_IDS.includes(c.id)) } },
  });
}

function leitorDeVolumetria(id: string) {
  return {
    id,
    nome: "Volumetria (E2E)",
    endpoint: `${GATEWAY_FALSO}/v1/documento-externo`,
    entrada: [{ chave: "link", rotulo: "Link", tipo: "texto", obrigatorio: true }],
    saida: [{ chave: "conteudo", rotulo: "Conteúdo", tipo: "texto", caminho: "$.conteudo", obrigatorio: true }],
  };
}

async function ligar(page: Page, deId: string, paraId: string) {
  const origem = page.locator(`.react-flow__node[data-id="${deId}"] .react-flow__handle-right`);
  const destino = page.locator(`.react-flow__node[data-id="${paraId}"] .react-flow__handle-left`);
  const a = (await origem.boundingBox())!;
  const b = (await destino.boundingBox())!;
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 12 });
  await page.mouse.up();
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("gerador:jornada-vista", "1"));
  await page.route(
    (url) => url.pathname === "/ia/status",
    (rota) => rota.fulfill({ json: { modelosChat: [], embeddingInstalado: false, capacidades: {} } })
  );
  await entrar(page);
});

test("fatia C: desenhar, ligar, mapear — e o ciclo trava com a mensagem do desenho", async ({ page }) => {
  test.setTimeout(90000);
  const original = (await (await page.request.get(`${API}/config/fluxos?timeId=time-pagamentos`)).json()).documento;
  try {
    await declararConectores(page, [leitorDeVolumetria("leitor-fluxo-e2e")]);

    await page.goto("/#/fluxo");
    await expect(page.getByTestId("fluxo-screen")).toBeVisible();

    await page.getByLabel("Nome do fluxo novo").fill("Desenho E2E");
    await page.getByTestId("criar-fluxo").click();

    // Dois nós da paleta: um conector do catálogo e um agente da esteira.
    await page.getByLabel("Conector da paleta").selectOption("leitor-fluxo-e2e");
    await page.getByTestId("adicionar-no-conector").click();
    await page.getByLabel("Agente da paleta").selectOption("po");
    await page.getByTestId("adicionar-no-agente").click();
    await expect(page.locator(".react-flow__node")).toHaveCount(2);

    // Ligar: a aresta nasce SEM mapeamento, e a tela diz isso.
    await ligar(page, "leitor-fluxo-e2e-1", "po-1");
    await expect(page.getByText("sem mapeamento")).toBeVisible();

    // O mapeamento na aresta: a saída declarada do conector (fatia A) é o que
    // alimenta o select — é a forma virando fiação.
    await expect(page.getByTestId("painel-da-aresta")).toBeVisible();
    await page.getByTestId("adicionar-mapeamento").click();
    await page.getByLabel("Saída do par 1").selectOption("conteudo");
    await page.getByLabel("Entrada do par 1").fill("volumetria");
    await expect(page.getByText("conteudo→volumetria")).toBeVisible();

    // O ciclo trava a execução com a MESMA mensagem do desenho (§4.4).
    await ligar(page, "po-1", "leitor-fluxo-e2e-1");
    await expect(page.getByTestId("aviso-de-ciclo")).toContainText("Ciclo: ");
    await expect(page.getByTestId("executar-fluxo")).toBeDisabled();

    // E o servidor recusa a ESCRITA do ciclo com a mesma frase.
    await page.getByTestId("salvar-fluxos").click();
    await expect(page.getByTestId("erro-do-fluxo")).toContainText("Ciclo: ");

    // Sem o ciclo, salva — e o desenho sobrevive ao F5. O painel da aresta
    // cíclica já está aberto (o onConnect a seleciona ao ligar).
    await page.getByRole("button", { name: "Remover aresta" }).click();
    await page.getByTestId("salvar-fluxos").click();
    await expect(page.getByTestId("erro-do-fluxo")).not.toBeVisible();
    await page.reload();
    await expect(page.getByTestId("fluxo-screen")).toBeVisible();
    // O documento pode carregar outros fluxos do time — o F5 prova ESTE.
    await page.getByTestId("seletor-de-fluxo").selectOption("desenho-e2e");
    await expect(page.locator(".react-flow__node")).toHaveCount(2);
    await expect(page.getByText("conteudo→volumetria")).toBeVisible();
  } finally {
    await page.request.put(`${API}/config/fluxos`, { data: { documento: original, timeId: "time-pagamentos" } });
    await limparMeusConectores(page);
  }
});

test("fatia D: o exemplo do JMeter roda pela tela, com rastro por nó", async ({ page }) => {
  test.setTimeout(90000);
  const original = (await (await page.request.get(`${API}/config/fluxos?timeId=time-pagamentos`)).json()).documento;
  try {
    await declararConectores(page, [
      leitorDeVolumetria("volumetria-fluxo-e2e"),
      {
        id: "repo-fluxo-e2e",
        nome: "Repo da casa (E2E)",
        endpoint: `${GATEWAY_FALSO}/v1/documento`,
        entrada: [
          { chave: "demandaId", rotulo: "Id", tipo: "texto", obrigatorio: true },
          { chave: "markdown", rotulo: "Markdown", tipo: "texto", obrigatorio: true },
        ],
        saida: [{ chave: "linkExterno", rotulo: "Link", tipo: "texto", caminho: "$.linkExterno", obrigatorio: true }],
      },
    ]);
    // O agente roda de verdade: a credencial aponta para o dublê.
    await page.request.put(`${API}/ia/credencial`, {
      data: { baseUrl: `${GATEWAY_FALSO}/v1`, chave: CHAVE_GATEWAY_FALSO, modelo: "gateway-falso" },
    });
    await page.request.put(`${API}/config/fluxos`, {
      data: {
        timeId: "time-pagamentos",
        documento: {
          fluxos: [
            {
              id: "jmx-e2e",
              nome: "JMX a partir da volumetria",
              nos: [
                { id: "le", tipo: "conector", refId: "volumetria-fluxo-e2e", posicao: { x: 0, y: 80 }, parametros: { link: "https://wiki.invalido/volumetria" } },
                { id: "gera", tipo: "agente", refId: "especialista", posicao: { x: 260, y: 80 }, parametros: {} },
                { id: "publica", tipo: "conector", refId: "repo-fluxo-e2e", posicao: { x: 520, y: 80 }, parametros: { demandaId: "jmx-e2e" } },
              ],
              arestas: [
                { de: "le", para: "gera", mapeamento: [{ saida: "conteudo", entrada: "volumetria" }] },
                { de: "gera", para: "publica", mapeamento: [{ saida: "texto", entrada: "markdown" }] },
              ],
            },
          ],
        },
      },
    });

    await page.goto("/#/fluxo");
    await expect(page.getByTestId("fluxo-screen")).toBeVisible();
    await page.getByTestId("seletor-de-fluxo").selectOption("jmx-e2e");
    await expect(page.locator(".react-flow__node")).toHaveCount(3);

    await page.getByTestId("executar-fluxo").click();

    // O rastro por nó: os três verdes, e a saída final com o link de onde a
    // publicação foi parar.
    await expect(page.getByTestId("rastro-da-execucao")).toBeVisible({ timeout: 30000 });
    for (const no of ["le", "gera", "publica"]) {
      await expect(page.getByTestId(`rastro-${no}`)).toContainText("✓");
    }
    await expect(page.getByTestId("rastro-publica")).toContainText("linkExterno");
  } finally {
    await page.request.put(`${API}/config/fluxos`, { data: { documento: original, timeId: "time-pagamentos" } });
    await limparMeusConectores(page);
  }
});
