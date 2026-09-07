import { test, expect } from "@playwright/test";
import { entrar } from "./auth";

const API = "http://localhost:4100";
const GATEWAY_FALSO = "http://localhost:4123";

/**
 * SERIAL, e por medição: todos os testes deste arquivo fazem read-modify-write
 * do documento GLOBAL de conectores (que não tem time). Em paralelo eles se
 * apagam por lost update — foi o que a CI mostrou quando as provas do conector
 * de banco moravam num arquivo próprio.
 */
test.describe.configure({ mode: "serial" });

/**
 * SPEC-105 fatias A+B — **a régua de aceite da SPEC inteira, no navegador.**
 *
 * Uma integração nova entra como UMA linha de configuração (um conector
 * apontando para um endpoint que o dublê já servia) e é executada pela tela,
 * com a saída lida pelos `caminho`s declarados. Nenhuma porta, nenhum
 * adaptador, nenhuma rota nova, nenhum endpoint novo no dublê — se qualquer
 * uma dessas peças tivesse sido necessária, a fatia A não teria terminado.
 */
test("cadastrar um conector pela tela e executá-lo — sem tocar em código", async ({ page }) => {
  test.setTimeout(90000);
  await page.addInitScript(() => localStorage.setItem("gerador:jornada-vista", "1"));
  await page.route(
    (url) => url.pathname === "/ia/status",
    (rota) => rota.fulfill({ json: { modelosChat: [], embeddingInstalado: false, capacidades: {} } })
  );
  await entrar(page);

  const configOriginal = (await (await page.request.get(`${API}/config/conectores`)).json()).documento;
  try {
    await page.goto("/#/config/conectores");
    await expect(page.getByTestId("conectores-tab")).toBeVisible();

    // Cadastro pela tela: id, endereço (o dublê já serve /documento-externo),
    // a entrada `link` e a saída `conteudo` lida por caminho.
    await page.getByTestId("adicionar-conector").click();
    await page.getByLabel("Identificador").fill("wiki-e2e");
    await page.getByLabel("Nome", { exact: true }).fill("Leitor da wiki (E2E)");
    await page.getByLabel("Endereço (endpoint)").fill(`${GATEWAY_FALSO}/v1/documento-externo`);

    const entrada = page.getByTestId("form-conector");
    await entrada.getByRole("button", { name: "+ campo" }).first().click();
    await page.getByLabel("Entrada — o que mandar — chave do campo 1").fill("link");
    await page.getByLabel("Entrada — o que mandar — rótulo do campo 1").fill("Link");
    await entrada.getByRole("checkbox").first().check();

    await entrada.getByRole("button", { name: "+ campo" }).nth(1).click();
    await page.getByLabel("Saída — como ler o que volta — chave do campo 1").fill("conteudo");
    await page.getByLabel("Saída — como ler o que volta — caminho do campo 1").fill("$.conteudo");

    await page.getByTestId("salvar-conector").click();
    await expect(page.getByTestId("conector-wiki-e2e")).toBeVisible();
    await expect(page.getByTestId("conector-wiki-e2e")).toContainText("cadastrado");

    // Executar (fatia B): a saída vem MAPEADA — o conteúdo que o dublê serve.
    await page.getByTestId("executar-wiki-e2e").click();
    await page.getByLabel("Link *").fill("https://wiki.invalido/pages/42");
    await page.getByTestId("rodar-wiki-e2e").click();

    await expect(page.getByTestId("saida-wiki-e2e")).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId("saida-wiki-e2e")).toContainText("conteudo");

    // §9.3 — sem o obrigatório, o erro diz o nome do campo; nada roda com default.
    await page.getByLabel("Link *").fill("");
    await page.getByTestId("rodar-wiki-e2e").click();
    await expect(page.getByTestId("erro-execucao-wiki-e2e")).toContainText("link");
  } finally {
    await page.request.put(`${API}/config/conectores`, { data: { documento: configOriginal } });
  }
});

/**
 * SPEC-110 fatia D (D6) — **o banco como componente do fluxo**, no MESMO
 * arquivo dos outros conectores, e isso e a correcao de um defeito medido.
 *
 * Estas provas nasceram em `conector-de-banco.spec.ts` e passaram 144/144
 * localmente — e cairam na CI: dois arquivos de spec fazendo read-modify-write
 * do documento GLOBAL de conectores em paralelo se apagam por lost update (a
 * licao que a SPEC-107 D ja tinha pago). Ler so os NOSSOS ids nao resolve: a
 * corrida esta entre o read e o write, nao no filtro.
 *
 * Juntar no arquivo que ja e dono do documento elimina a corrida POR
 * CONSTRUCAO — o Playwright paraleliza por arquivo, e um arquivo so tem um
 * dono. E coeso: sao todos conectores.
 */
const ID_DO_CONECTOR = "pedidos-do-cliente-e2e";

async function declararConectorDeBanco(page: import("@playwright/test").Page, sql: string, extras: Record<string, unknown> = {}) {
  const atual = (await (await page.request.get(`${API}/config/conectores`)).json()).documento as
    | { conectores?: { id: string }[] }
    | null;
  const dosOutros = (atual?.conectores ?? []).filter((c) => c.id !== ID_DO_CONECTOR);
  return page.request.put(`${API}/config/conectores`, {
    data: {
      documento: {
        conectores: [
          ...dosOutros,
          {
            id: ID_DO_CONECTOR,
            nome: "Pedidos do cliente (banco)",
            tipo: "banco",
            banco: { motor: "postgres", segredoDaConexao: "e2e", sql, ...extras },
            entrada: [{ chave: "cliente", rotulo: "Cliente", tipo: "texto", obrigatorio: true }],
            saida: [
              { chave: "linhas", rotulo: "Linhas", tipo: "lista", caminho: "$.linhas" },
              { chave: "total", rotulo: "Quantas", tipo: "numero", caminho: "$.total" },
            ],
          },
        ],
      },
    },
  });
}

/**
 * O login vai INLINE, e não num `beforeEach`: o teste que já morava neste
 * arquivo faz o seu próprio (com outro time), e um `beforeEach` declarado
 * depois valeria para ele também — trocando o contexto por baixo e gastando um
 * login a mais no rate limit.
 */
async function entrarParaConsultar(page: import("@playwright/test").Page) {
  await page.addInitScript(() => localStorage.setItem("gerador:jornada-vista", "1"));
  await page.route(
    (url) => url.pathname === "/ia/status",
    (rota) => rota.fulfill({ json: { modelosChat: [], embeddingInstalado: false, capacidades: {} } })
  );
  await entrar(page, "time-portabilidade");
}

test("a consulta roda contra o Postgres de verdade, com parâmetro nomeado", async ({ page }) => {
  test.setTimeout(120000);
  await entrarParaConsultar(page);
  const conectoresOriginais = (await (await page.request.get(`${API}/config/conectores`)).json()).documento;
  const fluxosOriginais = (await (await page.request.get(`${API}/config/fluxos?timeId=time-portabilidade`)).json()).documento;

  try {
    const salvo = await declararConectorDeBanco(page, "select cliente, total from e2e_pedidos where cliente = :cliente order by total");
    expect(salvo.status()).toBe(200);

    // O catálogo EM VIGOR mostra o conector de banco como qualquer outro —
    // quem fia não precisa saber qual é o transporte.
    const catalogo = (await (await page.request.get(`${API}/conectores`)).json()) as { conectores: { id: string; tipo?: string }[] };
    expect(catalogo.conectores.find((c) => c.id === ID_DO_CONECTOR)?.tipo).toBe("banco");

    await page.request.put(`${API}/config/fluxos`, {
      data: {
        timeId: "time-portabilidade",
        documento: {
          fluxos: [
            {
              id: "consulta-no-banco-e2e",
              nome: "Consulta no banco",
              nos: [
                { id: "gatilho", tipo: "gatilho", refId: "manual", posicao: { x: 0, y: 0 }, parametros: {} },
                // O parâmetro vai como VALOR FIXO do nó — o mesmo caminho de
                // qualquer entrada de conector.
                { id: "consulta", tipo: "conector", refId: ID_DO_CONECTOR, posicao: { x: 240, y: 0 }, parametros: { cliente: "acme" } },
              ],
              arestas: [{ de: "gatilho", para: "consulta", mapeamento: [] }],
            },
          ],
        },
      },
    });

    const exec = await page.request.post(`${API}/fluxos/consulta-no-banco-e2e/executar`, {
      data: { timeId: "time-portabilidade" },
    });
    expect(exec.status()).toBe(200);
    const corpo = (await exec.json()) as {
      nos: { noId: string; estado: string; erro?: string }[];
      saidas: Record<string, { linhas?: { cliente: string; total: string }[]; total?: number }>;
    };
    const daConsulta = corpo.nos.find((n) => n.noId === "consulta");
    expect(daConsulta?.erro ?? "").toBe("");
    expect(daConsulta?.estado).toBe("sucesso");

    // As DUAS linhas da acme, e não as três da tabela: o parâmetro filtrou de
    // verdade — e o valor viajou fora do texto do SQL.
    const linhas = corpo.saidas["consulta"].linhas ?? [];
    expect(linhas).toHaveLength(2);
    expect(linhas.every((l) => l.cliente === "acme")).toBe(true);
    expect(corpo.saidas["consulta"].total).toBe(2);

    // ── A trava do READ ONLY: a régua de texto recusa o óbvio na ESCRITA da
    //    config; a transação recusa o resto, na hora de rodar ──
    const comEscrita = await declararConectorDeBanco(page, "delete from e2e_pedidos");
    expect(comEscrita.status()).toBe(400);
    expect(JSON.stringify(await comEscrita.json())).toContain("só consulta");
  } finally {
    await page.request.put(`${API}/config/fluxos`, { data: { documento: fluxosOriginais, timeId: "time-portabilidade" } });
    await page.request.put(`${API}/config/conectores`, { data: { documento: conectoresOriginais } });
  }
});

test("o LIMIT é forçado, e a conexão inexistente falha NOMEANDO", async ({ page }) => {
  test.setTimeout(120000);
  await entrarParaConsultar(page);
  const conectoresOriginais = (await (await page.request.get(`${API}/config/conectores`)).json()).documento;
  const fluxosOriginais = (await (await page.request.get(`${API}/config/fluxos?timeId=time-portabilidade`)).json()).documento;

  try {
    // Sem `where`, e com limite 1: a tabela tem 3 linhas e só UMA pode voltar.
    // O parâmetro declarado sai junto — declarar sem usar é recusado (D6).
    const atual = (await (await page.request.get(`${API}/config/conectores`)).json()).documento as { conectores?: { id: string }[] } | null;
    const dosOutros = (atual?.conectores ?? []).filter((c) => c.id !== ID_DO_CONECTOR);
    await page.request.put(`${API}/config/conectores`, {
      data: {
        documento: {
          conectores: [
            ...dosOutros,
            {
              id: ID_DO_CONECTOR,
              nome: "Pedidos (sem filtro)",
              tipo: "banco",
              banco: { motor: "postgres", segredoDaConexao: "e2e", sql: "select cliente from e2e_pedidos", limite: 1 },
              entrada: [],
              saida: [{ chave: "linhas", rotulo: "Linhas", tipo: "lista", caminho: "$.linhas" }],
            },
          ],
        },
      },
    });

    await page.request.put(`${API}/config/fluxos`, {
      data: {
        timeId: "time-portabilidade",
        documento: {
          fluxos: [
            {
              id: "limite-no-banco-e2e",
              nome: "Limite no banco",
              nos: [{ id: "consulta", tipo: "conector", refId: ID_DO_CONECTOR, posicao: { x: 0, y: 0 }, parametros: {} }],
              arestas: [],
            },
          ],
        },
      },
    });

    const exec = await page.request.post(`${API}/fluxos/limite-no-banco-e2e/executar`, { data: { timeId: "time-portabilidade" } });
    const corpo = (await exec.json()) as { saidas: Record<string, { linhas?: unknown[] }> };
    expect(corpo.saidas["consulta"].linhas).toHaveLength(1);

    // ── A conexão que não existe: falha NOMEADA, dizendo onde cadastrá-la ──
    await page.request.put(`${API}/config/conectores`, {
      data: {
        documento: {
          conectores: [
            ...dosOutros,
            {
              id: ID_DO_CONECTOR,
              nome: "Sem conexão",
              tipo: "banco",
              banco: { motor: "postgres", segredoDaConexao: "nao-existe", sql: "select 1 as um" },
              entrada: [],
              saida: [{ chave: "linhas", rotulo: "Linhas", tipo: "lista", caminho: "$.linhas" }],
            },
          ],
        },
      },
    });
    const semConexao = await page.request.post(`${API}/fluxos/limite-no-banco-e2e/executar`, { data: { timeId: "time-portabilidade" } });
    const corpoSem = (await semConexao.json()) as { nos: { noId: string; estado: string; erro?: string }[] };
    const no = corpoSem.nos.find((n) => n.noId === "consulta");
    expect(no?.estado).toBe("falhou");
    // §244 — o erro DIZ o que fazer, e não só que deu errado.
    expect(no?.erro).toContain("GERADOR_CONEXAO_NAO_EXISTE");
  } finally {
    await page.request.put(`${API}/config/fluxos`, { data: { documento: fluxosOriginais, timeId: "time-portabilidade" } });
    await page.request.put(`${API}/config/conectores`, { data: { documento: conectoresOriginais } });
  }
});
