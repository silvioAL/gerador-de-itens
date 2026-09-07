import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test, expect, type Page } from "@playwright/test";
import { entrar } from "./auth";
import { derivarNaMesa } from "./derivar";
import { BASE_URL_GATEWAY_FALSO, CHAVE_GATEWAY_FALSO, DESENHO_DO_GATEWAY_FALSO, MODELO_GATEWAY_FALSO } from "@gerador/gateway-falso";

const API = "http://localhost:4100";

/**
 * SPEC-107 fatia A — **as FUNÇÕES do sistema no fluxo, pela tela.**
 *
 * A prova da fatia: `conector(desenho de fora) → derivacao → agente →
 * conector(escrita)` roda ponta a ponta contra o dublê (modo b, §5.4), com o
 * rastro auditável; e a derivação pelo botão da mesa passa pelo MESMO motor
 * que a função (§263) — o vocabulário é montado pela mesma mescla nas duas
 * pontas.
 *
 * Escrita de config global por read-modify-write só dos NOSSOS ids (o molde
 * de `fluxo-de-integracao.spec.ts`): vários specs reescrevem o documento de
 * conectores em paralelo.
 */
test.describe.configure({ mode: "serial" });

// Este arquivo NÃO toca o documento global de conectores de propósito: as
// fontes e destinos são o PROJETO real (fatia B) e as funções — dois arquivos
// de spec fazendo read-modify-write do mesmo documento em paralelo se apagam
// por lost update (medido na fatia D). As fiações com conector são provadas
// em fluxo-de-integracao.spec.ts e nos testes de rota.

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("gerador:jornada-vista", "1"));
  await page.route(
    (url) => url.pathname === "/ia/status",
    (rota) => rota.fulfill({ json: { modelosChat: [], embeddingInstalado: false, capacidades: {} } })
  );
  // time-portabilidade, e não o time-pagamentos de todo mundo: este spec e o
  // fluxo-de-integracao escrevem o documento `fluxos` INTEIRO do time — em
  // paralelo, um apaga o do outro. Documento por time, um time por spec.
  await entrar(page, "time-portabilidade");
});

test("a fiação da derivação (modo b) roda pela tela, com o rastro gravando as entradas", async ({ page }) => {
  test.setTimeout(120000);
  const original = (await (await page.request.get(`${API}/config/fluxos?timeId=time-portabilidade`)).json()).documento;
  try {
    // A fonte é o PROJETO real (fatia B) — nenhuma escrita no documento
    // GLOBAL de conectores: dois arquivos de spec fazendo read-modify-write
    // nele em paralelo se apagam (lost update medido nesta fatia).
    const criada = await page.request.post(`${API}/quebras`, {
      data: { titulo: `entradas-no-rastro-e2e ${Date.now()}`, time: "time-portabilidade", diagrama: DESENHO_DO_GATEWAY_FALSO.diagrama },
    });
    expect(criada.status()).toBe(201);
    const { id: demandaId } = (await criada.json()) as { id: string };
    // A credencial é UMA por organização e vários specs a gravam em paralelo —
    // a convenção da suíte (ia-hospedada.spec.ts:260): TODO save grava a
    // MESMA, com visão.
    await page.request.put(`${API}/ia/credencial`, {
      data: { baseUrl: BASE_URL_GATEWAY_FALSO, chave: CHAVE_GATEWAY_FALSO, modelo: MODELO_GATEWAY_FALSO, visao: true },
    });
    await page.request.put(`${API}/config/fluxos`, {
      data: {
        timeId: "time-portabilidade",
        documento: {
          fluxos: [
            {
              id: "itens-da-demanda-e2e",
              nome: "Itens da demanda",
              nos: [
                { id: "demanda", tipo: "projeto", refId: "projeto", posicao: { x: 0, y: 80 }, parametros: { demandaId } },
                { id: "gera", tipo: "funcao", refId: "derivacao", posicao: { x: 240, y: 80 }, parametros: {} },
                { id: "resume", tipo: "agente", refId: "especialista", posicao: { x: 480, y: 80 }, parametros: {} },
              ],
              arestas: [
                { de: "demanda", para: "gera", mapeamento: [{ saida: "desenho", entrada: "desenho" }] },
                { de: "gera", para: "resume", mapeamento: [{ saida: "itens", entrada: "itens" }] },
              ],
            },
          ],
        },
      },
    });

    await page.goto("/#/fluxo");
    await expect(page.getByTestId("fluxo-screen")).toBeVisible();
    await page.getByTestId("seletor-de-fluxo").selectOption("itens-da-demanda-e2e");
    await expect(page.locator(".react-flow__node")).toHaveCount(3);
    // O cartão diz o que o nó É — a família e o rótulo genérico (§2.3), no
    // MESMO cartão da mesa (fatia D).
    await expect(page.locator(`.react-flow__node[data-id="gera"]`)).toContainText("Função do sistema");
    await expect(page.locator(`.react-flow__node[data-id="gera"]`)).toContainText("Geração de itens");
    await expect(page.locator(`.react-flow__node[data-id="demanda"]`)).toContainText("Mesa de projeto");

    await page.getByTestId("executar-fluxo").click();
    await expect(page.getByTestId("rastro-da-execucao")).toBeVisible({ timeout: 30000 });
    for (const no of ["demanda", "gera", "resume"]) {
      await expect(page.getByTestId(`rastro-${no}`)).toContainText("✓", { timeout: 30000 });
    }
    // Os itens saíram da função, e o agente escreveu a partir deles.
    await expect(page.getByTestId("rastro-gera")).toContainText("itens");
    await expect(page.getByTestId("artefato-resume")).toBeVisible();

    // §5.4 — o rastro PERSISTIDO guarda as entradas do nó de função (e só
    // dele): a âncora de "mesma fiação + mesmas entradas → mesmos itens".
    const execucoes = (await (await page.request.get(`${API}/fluxos/itens-da-demanda-e2e/execucoes`)).json()) as {
      execucoes: { nos: { noId: string; entradas?: Record<string, unknown> }[] }[];
    };
    const nos = Object.fromEntries(execucoes.execucoes[0].nos.map((n) => [n.noId, n]));
    expect(nos["gera"].entradas?.desenho).toBeDefined();
    expect(nos["demanda"].entradas).toBeUndefined();

    // Regressão do defeito pego nesta fatia: o Executar da tela salvava a
    // esteira DERIVADA como declarada — congelando a cópia que ninguém pediu
    // (§365). O documento do time não pode ganhar a esteira por executar.
    const doc = (await (await page.request.get(`${API}/config/fluxos?timeId=time-portabilidade`)).json()).documento as {
      fluxos?: { id: string }[];
    };
    expect((doc?.fluxos ?? []).some((f) => f.id === "esteira-de-agentes")).toBe(false);
  } finally {
    await page.request.put(`${API}/config/fluxos`, { data: { documento: original, timeId: "time-portabilidade" } });
  }
});

test("a função entra pela paleta já com o contrato à mostra — sem adaptador a escolher", async ({ page }) => {
  test.setTimeout(90000);
  const original = (await (await page.request.get(`${API}/config/fluxos?timeId=time-portabilidade`)).json()).documento;
  try {
    await page.goto("/#/fluxo");
    await expect(page.getByTestId("fluxo-screen")).toBeVisible();
    await page.getByLabel("Nome do fluxo novo").fill("Funções E2E");
    await page.getByTestId("criar-fluxo").click();

    // O nó nasce com o refId do registro (§2.4-10: escolha só quando há
    // escolha) e o painel diz o contrato em voz alta (§2.4-6).
    await page.getByTestId("add-funcao-derivacao").click();
    await expect(page.getByTestId("painel-do-no")).toContainText("Função do sistema — Geração de itens");
    await expect(page.getByTestId("contrato-da-funcao")).toContainText("Desenho (demanda) *");
    await expect(page.getByTestId("contrato-da-funcao")).toContainText("Itens derivados");
    await expect(page.getByTestId("adaptador-do-no")).toHaveCount(0);

    // SPEC-109 D — o template da especificação mora no nó que o consome: a
    // porta está no painel (clicar navegaria para fora e mataria o rascunho
    // deste teste; o DESTINO — o editor via deep-link — é o que o spec das
    // abas passou a provar).
    await expect(page.getByTestId("abrir-config-da-especificacao")).toBeVisible();

    await page.getByTestId("add-funcao-ensaio").click();
    await expect(page.getByTestId("painel-do-no")).toContainText("Função do sistema — Ensaio de cenários");

    // SPEC-107 fatia B — o projeto também nasce pronto, e o painel diz as
    // duas direções em voz alta (a escrita vira proposta, nunca o desenho).
    await page.getByTestId("add-projeto").click();
    await expect(page.getByTestId("painel-do-no")).toContainText("Mesa de projeto (a demanda, nas duas direções)");
    await expect(page.getByTestId("contrato-do-projeto")).toContainText("vira uma variante");
    await expect(page.getByTestId("demanda-do-projeto")).toBeVisible();
    await expect(page.getByTestId("adaptador-do-no")).toHaveCount(0);

    // SPEC-107 fatia E — a transformação nasce vazia e o painel ensina o
    // gesto: declarar os campos de saída (modelo concatena, caminho extrai).
    await page.getByTestId("add-transformacao").click();
    await expect(page.getByTestId("painel-do-no")).toContainText("Transformação (pura");
    await expect(page.getByTestId("campos-da-transformacao")).toContainText("modelo");
    await page.getByTestId("adicionar-campo-da-transformacao").click();
    await page.getByLabel("Modelo do campo 1").fill("RPS {rps}");
    await expect(page.locator(`.react-flow__node[data-id="transformacao-1"]`)).toContainText("campo1");
  } finally {
    await page.request.put(`${API}/config/fluxos`, { data: { documento: original, timeId: "time-portabilidade" } });
  }
});

/**
 * SPEC-107 fatia F — o tipo de dado `documento`: o aviso de mapeamento por
 * tipo (aviso, NÃO bloqueio) e o preview do documento no rastro.
 */
test("tipos que não combinam AVISAM sem bloquear, e o documento ganha preview no rastro", async ({ page }) => {
  test.setTimeout(120000);
  const original = (await (await page.request.get(`${API}/config/fluxos?timeId=time-portabilidade`)).json()).documento;
  try {
    const criada = await page.request.post(`${API}/quebras`, {
      data: {
        titulo: `com-documento-e2e ${Date.now()}`,
        time: "time-portabilidade",
        diagrama: DESENHO_DO_GATEWAY_FALSO.diagrama,
        especificacao: "# Documento da demanda\n\nO markdown que a mesa gerou.",
      },
    });
    expect(criada.status()).toBe(201);
    const { id: demandaId } = (await criada.json()) as { id: string };

    await page.request.put(`${API}/config/fluxos`, {
      data: {
        timeId: "time-portabilidade",
        documento: {
          fluxos: [
            {
              id: "com-documento-e2e",
              nome: "Com documento",
              nos: [
                { id: "demanda", tipo: "projeto", refId: "projeto", posicao: { x: 0, y: 80 }, parametros: { demandaId } },
                { id: "gera", tipo: "funcao", refId: "derivacao", posicao: { x: 240, y: 80 }, parametros: {} },
              ],
              arestas: [
                {
                  de: "demanda",
                  para: "gera",
                  // O par errado DE PROPÓSITO (lista → objeto) ao lado do
                  // certo: o aviso aponta o par, e a execução continua.
                  mapeamento: [
                    { saida: "itens", entrada: "desenho" },
                    { saida: "desenho", entrada: "desenho" },
                  ],
                },
              ],
            },
          ],
        },
      },
    });

    await page.goto("/#/fluxo");
    await expect(page.getByTestId("fluxo-screen")).toBeVisible();
    await page.getByTestId("seletor-de-fluxo").selectOption("com-documento-e2e");
    // Aviso, não bloqueio (§230): o par errado é dito com os dois tipos, e o
    // Executar segue habilitado.
    await expect(page.getByTestId("aviso-de-mapeamento")).toContainText('"itens" (lista) → "desenho" (objeto)');
    await expect(page.getByTestId("executar-fluxo")).toBeEnabled();

    await page.getByTestId("executar-fluxo").click();
    await expect(page.getByTestId("rastro-da-execucao")).toBeVisible({ timeout: 30000 });
    await expect(page.getByTestId("rastro-demanda")).toContainText("✓");
    // O documento aparece como TEXTO CORRIDO (preview), não como JSON (§2.1).
    await expect(page.getByTestId("documento-demanda-markdown")).toContainText("# Documento da demanda");
  } finally {
    await page.request.put(`${API}/config/fluxos`, { data: { documento: original, timeId: "time-portabilidade" } });
  }
});

/**
 * SPEC-107 fatia C — a prova do gate: a execução SUSPENDE no nó marcado,
 * SOBREVIVE ao F5 (o stage está no servidor, não na aba) e CONTINUA do ponto
 * exato — o agente só roda depois da decisão humana.
 */
test("o gate suspende, sobrevive ao F5 e continua do ponto exato", async ({ page }) => {
  test.setTimeout(120000);
  const original = (await (await page.request.get(`${API}/config/fluxos?timeId=time-portabilidade`)).json()).documento;
  try {
    const criada = await page.request.post(`${API}/quebras`, {
      data: { titulo: `gate-e2e ${Date.now()}`, time: "time-portabilidade", diagrama: DESENHO_DO_GATEWAY_FALSO.diagrama },
    });
    const { id: demandaId } = (await criada.json()) as { id: string };
    await page.request.put(`${API}/ia/credencial`, {
      data: { baseUrl: BASE_URL_GATEWAY_FALSO, chave: CHAVE_GATEWAY_FALSO, modelo: MODELO_GATEWAY_FALSO, visao: true },
    });
    await page.request.put(`${API}/config/fluxos`, {
      data: {
        timeId: "time-portabilidade",
        documento: {
          fluxos: [
            {
              id: "gate-e2e",
              nome: "Fiação com gate",
              nos: [
                { id: "demanda", tipo: "projeto", refId: "projeto", posicao: { x: 0, y: 80 }, parametros: { demandaId } },
                { id: "gera", tipo: "funcao", refId: "derivacao", posicao: { x: 240, y: 80 }, parametros: {}, confirmacao: "aguardar" },
                { id: "resume", tipo: "agente", refId: "especialista", posicao: { x: 480, y: 80 }, parametros: {} },
              ],
              arestas: [
                { de: "demanda", para: "gera", mapeamento: [{ saida: "desenho", entrada: "desenho" }] },
                { de: "gera", para: "resume", mapeamento: [{ saida: "itens", entrada: "itens" }] },
              ],
            },
          ],
        },
      },
    });

    await page.goto("/#/fluxo");
    await expect(page.getByTestId("fluxo-screen")).toBeVisible();
    await page.getByTestId("seletor-de-fluxo").selectOption("gate-e2e");
    // O gate se anuncia no cartão antes de qualquer execução (⏸).
    await expect(page.locator(`.react-flow__node[data-id="gera"]`)).toContainText("⏸");

    await page.getByTestId("executar-fluxo").click();
    await expect(page.getByTestId("gate-de-confirmacao")).toBeVisible({ timeout: 30000 });
    await expect(page.getByTestId("gate-de-confirmacao")).toContainText("gera");
    await expect(page.getByTestId("rastro-gera")).toContainText("✓");
    // O agente está esperando, não pulado: fora do rastro.
    await expect(page.getByTestId("rastro-resume")).toHaveCount(0);

    // F5 — o gate está no SERVIDOR: reaparece com o stage persistido.
    await page.reload();
    await expect(page.getByTestId("fluxo-screen")).toBeVisible();
    await page.getByTestId("seletor-de-fluxo").selectOption("gate-e2e");
    await expect(page.getByTestId("gate-de-confirmacao")).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId("rastro-gera")).toContainText("✓");

    // Continuar roda SÓ o resto — o agente, agora sim.
    await page.getByTestId("continuar-execucao").click();
    await expect(page.getByTestId("gate-de-confirmacao")).toHaveCount(0, { timeout: 30000 });
    await expect(page.getByTestId("rastro-resume")).toContainText("✓", { timeout: 30000 });
  } finally {
    await page.request.put(`${API}/config/fluxos`, { data: { documento: original, timeId: "time-portabilidade" } });
  }
});

/**
 * A prova do §263 no NAVEGADOR: o botão "Derivar Quebra" da mesa e a função
 * `derivacao` do fluxo, sobre o MESMO diagrama e o MESMO time, produzem os
 * MESMOS itens. É a fronteira mais fácil de quebrar em silêncio — o botão
 * deriva no navegador com o vocabulário do `loadConfig`, a função deriva no
 * servidor com o vocabulário do `contextoDasFuncoes` — e é exatamente por
 * isso que os dois mescladores são a mesma função da aplicação.
 */
test("derivar pelo botão da mesa ≡ derivar pela função do fluxo — os mesmos itens", async ({ page }) => {
  test.setTimeout(120000);
  // Time DESCARTÁVEL próprio (prefixo `time-e2e-`, que o globalSetup limpa):
  // os times do seed são envenenados por vizinhos — `padroes-por-componente`
  // cria campo `required: true` em time-portabilidade e o botão da mesa
  // desabilita com obrigatório em aberto. A igualdade se mede em terreno
  // parado. Id FIXO e idempotente (409 = rodada anterior; o dev segue owner).
  const TIME = "time-e2e-funcoes";
  const criado = await page.request.post(`${API}/times`, { data: { timeId: TIME } });
  expect([201, 409]).toContain(criado.status());
  // O relogin entra no time novo — cookie e time lembrado zerados, porque o
  // POST /times reemite a sessão mas o app continua no time da entrada.
  await page.context().clearCookies();
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem("gerador:jornada-vista", "1");
  });
  await entrar(page, TIME);

  const original = (await (await page.request.get(`${API}/config/fluxos?timeId=${TIME}`)).json()).documento;
  // O cenário do mongo: metade da suíte já o deriva pelo botão — o diagrama
  // não tem obrigatório em aberto NESTE ambiente (o botão da mesa não
  // habilita com vermelho, e o teste é da igualdade, não do portão; o rabbit
  // tem dois serviços por resolver e não serve aqui).
  const { diagrama } = (
    JSON.parse(readFileSync(resolve(import.meta.dirname, "../../../config/cenarios/mongo.json"), "utf-8")) as {
      quebra: { diagrama: { nodes: unknown[]; edges: unknown[] } };
    }
  ).quebra;
  const titulo = `derivacao-comparada-e2e ${Date.now()}`;
  try {
    // O MESMO desenho entra nos dois lados: como quebra da mesa…
    const criada = await page.request.post(`${API}/quebras`, {
      data: { titulo, time: TIME, diagrama },
    });
    expect(criada.status()).toBe(201);
    const { id: demandaId } = (await criada.json()) as { id: string };
    // …e pela fiação com o PROJETO REAL como fonte (SPEC-107 fatia B): a
    // mesma demanda, lida pelo nó — não um parâmetro fixo.
    await page.request.put(`${API}/config/fluxos`, {
      data: {
        timeId: TIME,
        documento: {
          fluxos: [
            {
              id: "derivacao-comparada-e2e",
              nome: "Derivação comparada (E2E)",
              nos: [
                { id: "demanda", tipo: "projeto", refId: "projeto", posicao: { x: 0, y: 80 }, parametros: { demandaId } },
                { id: "deriva", tipo: "funcao", refId: "derivacao", posicao: { x: 240, y: 80 }, parametros: {} },
              ],
              arestas: [{ de: "demanda", para: "deriva", mapeamento: [{ saida: "desenho", entrada: "desenho" }] }],
            },
          ],
        },
      },
    });

    const execucao = await page.request.post(`${API}/fluxos/derivacao-comparada-e2e/executar`, {
      data: { timeId: TIME },
    });
    expect(execucao.status()).toBe(200);
    const { saidas } = (await execucao.json()) as { saidas: Record<string, { itens: { chave: string }[] }> };
    const chavesDoFluxo = saidas["deriva"].itens.map((i) => i.chave).sort();
    expect(chavesDoFluxo.length).toBeGreaterThan(0);

    // Agora a mesa: abrir a MESMA demanda e clicar o botão de sempre.
    await page.reload();
    await page.getByRole("button", { name: "☰ Menu" }).click();
    await page.getByRole("button", { name: "Abrir…" }).click();
    await page.getByPlaceholder("ex.: aprovação de crédito").fill(titulo);
    await page.getByRole("button", { name: new RegExp(titulo.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) }).click();
    await expect(page.getByTestId("titulo-da-quebra")).toContainText("derivacao-comparada-e2e");
    await derivarNaMesa(page);

    // G5c-3 — derivar escreve os itens e PERSISTE (a quebra tem id): a
    // comparação byte a byte lê as chaves da FONTE DA VERDADE.
    await expect(page.getByTestId("documento-screen")).toBeVisible();
    await expect(page.locator('[data-testid^="item-gerado-"]')).toHaveCount(chavesDoFluxo.length);
    const itensDaMesa = (await (
      await page.request.get(`${API}/quebras/${demandaId}/itens`)
    ).json()) as { chave: string }[];
    expect(itensDaMesa.map((i) => i.chave).sort()).toEqual(chavesDoFluxo);
  } finally {
    await page.request.put(`${API}/config/fluxos`, { data: { documento: original, timeId: TIME } });
  }
});

/**
 * SPEC-107 fatia B — o PROJETO como DESTINO: o desenho importado de fora vira
 * PROPOSTA (variante) na demanda, nunca o desenho dela — importar não é
 * aceitar (§2.4-14), e a adoção continua sendo o gesto humano de sempre da
 * mesa (a mecânica de variantes da SPEC-88, provada em variantes.spec.ts).
 */
test("o desenho importado vira proposta na demanda — o desenho dela fica intacto", async ({ page }) => {
  test.setTimeout(120000);
  const TIME = "time-e2e-funcoes";
  expect([201, 409]).toContain((await page.request.post(`${API}/times`, { data: { timeId: TIME } })).status());
  const original = (await (await page.request.get(`${API}/config/fluxos?timeId=${TIME}`)).json()).documento;
  try {
    // A ORIGEM tem desenho; o DESTINO nasce vazio e recebe a proposta —
    // projeto nas duas pontas, nenhuma escrita no doc global de conectores.
    const origem = (await (
      await page.request.post(`${API}/quebras`, {
        data: { titulo: `origem-da-proposta-e2e ${Date.now()}`, time: TIME, diagrama: DESENHO_DO_GATEWAY_FALSO.diagrama },
      })
    ).json()) as { id: string };
    const criada = await page.request.post(`${API}/quebras`, {
      data: { titulo: `recebe-proposta-e2e ${Date.now()}`, time: TIME, diagrama: { nodes: [], edges: [] } },
    });
    expect(criada.status()).toBe(201);
    const { id: demandaId } = (await criada.json()) as { id: string };

    await page.request.put(`${API}/config/fluxos`, {
      data: {
        timeId: TIME,
        documento: {
          fluxos: [
            {
              id: "importa-desenho-e2e",
              nome: "Importa desenho da casa",
              nos: [
                { id: "le", tipo: "projeto", refId: "projeto", posicao: { x: 0, y: 80 }, parametros: { demandaId: origem.id } },
                { id: "propoe", tipo: "projeto", refId: "projeto", posicao: { x: 240, y: 80 }, parametros: { demandaId } },
              ],
              arestas: [{ de: "le", para: "propoe", mapeamento: [{ saida: "desenho", entrada: "desenho" }] }],
            },
          ],
        },
      },
    });

    const execucao = await page.request.post(`${API}/fluxos/importa-desenho-e2e/executar`, { data: { timeId: TIME } });
    expect(execucao.status()).toBe(200);
    const { nos } = (await execucao.json()) as { nos: { noId: string; estado: string }[] };
    expect(nos.map((n) => [n.noId, n.estado])).toEqual([
      ["le", "sucesso"],
      ["propoe", "sucesso"],
    ]);

    const quebra = (await (await page.request.get(`${API}/quebras/${demandaId}`)).json()) as {
      diagrama: { nodes: unknown[] };
      variantes: { titulo: string; diagrama: { nodes: unknown[] } }[];
    };
    // O desenho da demanda continua o que era (vazio); a proposta está do
    // lado, como variante com o desenho que veio de fora.
    expect(quebra.diagrama.nodes).toHaveLength(0);
    expect(quebra.variantes).toHaveLength(1);
    expect(quebra.variantes[0].titulo).toBe('Proposta do fluxo "Importa desenho da casa"');
    expect(quebra.variantes[0].diagrama.nodes.length).toBeGreaterThan(0);
  } finally {
    await page.request.put(`${API}/config/fluxos`, { data: { documento: original, timeId: TIME } });
  }
});
