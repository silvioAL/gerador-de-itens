import { test, expect } from "@playwright/test";
import { entrar } from "./auth";

const API = "http://localhost:4100";

/**
 * SPEC-110 fatia D (D6) — **o banco como componente do fluxo.**
 *
 * A queixa: *"sinto falta de componente do banco de dados por exemplo e de
 * configurações para essas coisas"*.
 *
 * O que só o navegador (e um Postgres de verdade) provam: a consulta roda
 * contra o banco descartável da suíte com PARÂMETRO NOMEADO, as linhas chegam
 * ao rastro pelo contrato declarado, o LIMIT é forçado, e a transação
 * read-only recusa a escrita que a régua de texto deixaria passar.
 *
 * A tabela `e2e_pedidos` é semeada no `globalSetup` (3 linhas: acme 100, acme
 * 250, globex 70) — o alvo é o próprio Postgres do E2E, para a prova exercitar
 * o driver `pg` e não um dublê.
 *
 * O documento de conectores é ORGANIZACIONAL (não por time): este spec faz
 * read-modify-write só dos IDs dele, o molde de `fluxo-de-integracao`.
 */
test.describe.configure({ mode: "serial" });

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

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("gerador:jornada-vista", "1"));
  await page.route(
    (url) => url.pathname === "/ia/status",
    (rota) => rota.fulfill({ json: { modelosChat: [], embeddingInstalado: false, capacidades: {} } })
  );
  await entrar(page, "time-portabilidade");
});

test("a consulta roda contra o Postgres de verdade, com parâmetro nomeado", async ({ page }) => {
  test.setTimeout(120000);
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
