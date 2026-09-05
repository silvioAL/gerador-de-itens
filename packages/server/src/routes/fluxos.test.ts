import { migrate } from "drizzle-orm/node-postgres/migrator";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarBancoDeDados, type BancoDeDados } from "../db/client.js";
import { exigirBancoDescartavel, garantirBancoDeTeste, URL_BANCO_DE_TESTE } from "../test-support/bancoDeTeste.js";
import { buildApp } from "../app.js";
import { criarGatewayFalso, CHAVE_GATEWAY_FALSO, DESENHO_DO_GATEWAY_FALSO } from "@gerador/gateway-falso";
import { executarFuncao } from "@gerador/aplicacao";
import { contextoDasFuncoes } from "../config/contextoDasFuncoes.js";

/**
 * SPEC-105 fatia D — **a prova da SPEC: o exemplo do JMeter (§4.2), ponta a
 * ponta contra o dublê.**
 *
 * conector (lê a "volumetria" — o documento externo do dublê) → agente (gera o
 * artefato a partir do que chegou) → conector (publica o resultado). Nenhum
 * dos três passos ganhou código próprio: dois são conectores de fábrica
 * derivados de destinos, o agente é um papel da esteira, e a fiação é um
 * documento de configuração.
 */
const DATABASE_URL = process.env.DATABASE_URL || URL_BANCO_DE_TESTE;
let db: BancoDeDados;
let gateway: ReturnType<typeof criarGatewayFalso>;
let baseDoGateway: string;

beforeAll(async () => {
  exigirBancoDescartavel(DATABASE_URL);
  await garantirBancoDeTeste(DATABASE_URL);
  db = criarBancoDeDados(DATABASE_URL).db;
  await migrate(db, { migrationsFolder: resolve(import.meta.dirname, "../../migrations") });

  gateway = criarGatewayFalso();
  await new Promise<void>((r) => gateway.listen(0, "127.0.0.1", () => r()));
  const addr = gateway.address() as { port: number };
  baseDoGateway = `http://127.0.0.1:${addr.port}/v1`;
});

afterAll(() => new Promise<void>((r) => gateway.close(() => r())));

async function comApp<T>(
  f: (app: Awaited<ReturnType<typeof buildApp>>, cookies: Record<string, string>) => Promise<T>
): Promise<T> {
  const app = await buildApp({ db, diretorioConfig: resolve(import.meta.dirname, "../../../../config") });
  await app.ready();
  try {
    const sessao = await app.inject({ method: "POST", url: "/auth/login", payload: { email: "dev@gerador.local" } });
    const cookies = sessao.cookies.reduce((acc, c) => ({ ...acc, [c.name]: c.value }), {});
    return await f(app, cookies);
  } finally {
    await app.close();
  }
}

type App = Awaited<ReturnType<typeof buildApp>>;
type Cookies = Record<string, string>;

async function prepararMundo(app: App, cookies: Cookies) {
  // Os dois destinos viram conectores de fábrica ("volumetria" lê, "publicar"
  // escreve) — nenhum código, só configuração, que é a régua da fatia A.
  await app.inject({
    method: "PUT",
    url: "/config/exportador",
    cookies,
    payload: {
      documento: {
        endpoint: "",
        rotulo: "",
        cabecalhos: {},
        destinos: [
          { id: "volumetria", operacao: "documentoExterno", endpoint: `${baseDoGateway}/documento-externo`, rotulo: "Volumetria" },
          { id: "publicar", operacao: "documento", endpoint: `${baseDoGateway}/documento`, rotulo: "Repo da casa" },
        ],
      },
    },
  });
  // A credencial de IA aponta para o dublê — o agente roda "de verdade".
  await app.inject({
    method: "PUT",
    url: "/ia/credencial",
    cookies,
    payload: { baseUrl: baseDoGateway, chave: CHAVE_GATEWAY_FALSO, modelo: "gateway-falso" },
  });
}

const FLUXO_JMETER = {
  id: "jmx",
  nome: "JMX a partir da volumetria",
  nos: [
    {
      id: "le-volumetria",
      tipo: "conector",
      refId: "volumetria",
      posicao: { x: 0, y: 0 },
      parametros: { link: "https://wiki.invalido/volumetria" },
    },
    { id: "gera-jmx", tipo: "agente", refId: "especialista", posicao: { x: 200, y: 0 }, parametros: {} },
    {
      id: "publica",
      tipo: "conector",
      refId: "publicar",
      posicao: { x: 400, y: 0 },
      parametros: { demandaId: "fluxo-jmx-teste" },
    },
  ],
  arestas: [
    { de: "le-volumetria", para: "gera-jmx", mapeamento: [{ saida: "conteudo", entrada: "volumetria" }] },
    { de: "gera-jmx", para: "publica", mapeamento: [{ saida: "texto", entrada: "markdown" }] },
  ],
};

describe("SPEC-105 fatia D — POST /fluxos/:id/executar", () => {
  it("o exemplo do JMeter roda ponta a ponta contra o dublê, com rastro e hash", async () => {
    await comApp(async (app, cookies) => {
      await prepararMundo(app, cookies);
      await app.inject({ method: "PUT", url: "/config/fluxos", cookies, payload: { documento: { fluxos: [FLUXO_JMETER] } } });

      const r = await app.inject({ method: "POST", url: "/fluxos/jmx/executar", cookies, payload: {} });

      expect(r.statusCode).toBe(200);
      const corpo = r.json() as {
        hash: string;
        nos: { noId: string; estado: string; erro?: string }[];
        saidas: Record<string, Record<string, unknown>>;
      };
      expect(corpo.nos.map((n) => [n.noId, n.estado])).toEqual([
        ["le-volumetria", "sucesso"],
        ["gera-jmx", "sucesso"],
        ["publica", "sucesso"],
      ]);
      // A saída de um alimentou a entrada do outro: o conteúdo lido virou
      // entrada do agente, o texto do agente virou o markdown publicado — e a
      // publicação devolveu o link, lido pelo caminho declarado.
      expect(String(corpo.saidas["gera-jmx"].texto)).toBeTruthy();
      expect(String(corpo.saidas["publica"].linkExterno)).toContain("http");
      // §9.5 — a impressão digital do fluxo que rodou.
      expect(corpo.hash).toMatch(/^[0-9a-f]{16}$/);

      // O rastro persiste, por nó, SEM as saídas.
      const rastro = await app.inject({ method: "GET", url: "/fluxos/jmx/execucoes", cookies });
      const { execucoes } = rastro.json() as { execucoes: { hash: string; nos: { saida?: unknown }[] }[] };
      expect(execucoes.length).toBeGreaterThan(0);
      expect(execucoes[0].hash).toBe(corpo.hash);
      expect(execucoes[0].nos.every((n) => n.saida === undefined)).toBe(true);
    });
  });

  it("prova da fatia C — fluxo com ciclo é recusado na ESCRITA com a mensagem do desenho", async () => {
    await comApp(async (app, cookies) => {
      const r = await app.inject({
        method: "PUT",
        url: "/config/fluxos",
        cookies,
        payload: {
          documento: {
            fluxos: [
              {
                id: "circular",
                nos: [
                  { id: "a", tipo: "conector", refId: "x" },
                  { id: "b", tipo: "agente", refId: "y" },
                ],
                arestas: [
                  { de: "a", para: "b", mapeamento: [] },
                  { de: "b", para: "a", mapeamento: [] },
                ],
              },
            ],
          },
        },
      });
      expect(r.statusCode).toBe(400);
      expect((r.json() as { erro: string }).erro).toMatch(/^Ciclo: /);
    });
  });

  it("§9.3 — o nó que falha derruba só o ramo dele; o independente segue", async () => {
    await comApp(async (app, cookies) => {
      await prepararMundo(app, cookies);
      await app.inject({
        method: "PUT",
        url: "/config/conectores",
        cookies,
        payload: {
          documento: {
            conectores: [
              { id: "fora-do-ar", nome: "Fora do ar", endpoint: "http://127.0.0.1:9/nada", saida: [] },
            ],
          },
        },
      });
      await app.inject({
        method: "PUT",
        url: "/config/fluxos",
        cookies,
        payload: {
          documento: {
            fluxos: [
              {
                id: "meio-quebrado",
                nos: [
                  { id: "quebra", tipo: "conector", refId: "fora-do-ar", posicao: { x: 0, y: 0 }, parametros: {} },
                  { id: "dependente", tipo: "agente", refId: "po", posicao: { x: 1, y: 0 }, parametros: {} },
                  {
                    id: "independente",
                    tipo: "conector",
                    refId: "volumetria",
                    posicao: { x: 2, y: 0 },
                    parametros: { link: "https://wiki.invalido/x" },
                  },
                ],
                arestas: [{ de: "quebra", para: "dependente", mapeamento: [{ saida: "x", entrada: "x" }] }],
              },
            ],
          },
        },
      });

      const r = await app.inject({ method: "POST", url: "/fluxos/meio-quebrado/executar", cookies, payload: {} });
      expect(r.statusCode).toBe(200);
      const porNo = Object.fromEntries(
        (r.json() as { nos: { noId: string; estado: string; erro?: string }[] }).nos.map((n) => [n.noId, n])
      );
      expect(porNo.quebra.estado).toBe("falhou");
      expect(porNo.dependente.estado).toBe("nao-executado");
      expect(porNo.dependente.erro).toContain('"quebra" falhou');
      expect(porNo.independente.estado).toBe("sucesso");
    });
  });

  it("`ateNo` executa só o fecho de ancestrais — o publicador não dispara", async () => {
    await comApp(async (app, cookies) => {
      await prepararMundo(app, cookies);
      await app.inject({ method: "PUT", url: "/config/fluxos", cookies, payload: { documento: { fluxos: [FLUXO_JMETER] } } });

      const r = await app.inject({
        method: "POST",
        url: "/fluxos/jmx/executar",
        cookies,
        payload: { ateNo: "gera-jmx" },
      });

      expect(r.statusCode).toBe(200);
      const corpo = r.json() as { nos: { noId: string; estado: string }[]; saidas: Record<string, unknown> };
      // "Ver o resultado do agente antes de rodar o próximo": quem escreve no
      // mundo (a publicação) fica de fora do rastro porque nem foi tentado.
      expect(corpo.nos.map((n) => [n.noId, n.estado])).toEqual([
        ["le-volumetria", "sucesso"],
        ["gera-jmx", "sucesso"],
      ]);
      expect(corpo.saidas["publica"]).toBeUndefined();

      // Nó que o fluxo não tem é 404, não um fluxo inteiro rodando por engano.
      const errado = await app.inject({ method: "POST", url: "/fluxos/jmx/executar", cookies, payload: { ateNo: "fantasma" } });
      expect(errado.statusCode).toBe(404);
    });
  });

  it("SPEC-106 — a esteira aparece DERIVADA no em-vigor, e executa pelo mesmo motor", async () => {
    await comApp(async (app, cookies) => {
      await prepararMundo(app, cookies);

      const r = await app.inject({ method: "GET", url: "/fluxos" });
      expect(r.statusCode).toBe(200);
      const { fluxos } = r.json() as { fluxos: { id: string; origem: string; nos: { id: string }[] }[] };
      const esteira = fluxos.find((f) => f.id === "esteira-de-agentes");
      expect(esteira).toBeDefined();
      expect(esteira!.origem).toBe("fabrica");
      // Os quatro papéis de fábrica, na ordem — o desenho da mesma coisa.
      expect(esteira!.nos.map((n) => n.id)).toEqual(["po", "arquiteto", "especialista", "qa"]);

      // Ela EXECUTA pelo executor de fluxos (a resolução vem do em-vigor) — e
      // o primeiro papel, sem entrada nenhuma mapeada, falha pela §9.3 em vez
      // de rodar com um prompt vazio inventado.
      const exec = await app.inject({ method: "POST", url: "/fluxos/esteira-de-agentes/executar", cookies, payload: { ateNo: "po" } });
      expect(exec.statusCode).toBe(200);
      const { nos } = exec.json() as { nos: { noId: string; estado: string; erro?: string }[] };
      expect(nos).toHaveLength(1);
      expect(nos[0].estado).toBe("falhou");
      expect(nos[0].erro).toContain("entrada");
    });
  });

  it("SPEC-106 fatia E — /fluxos/execucoes/ultimas devolve só a saúde, moldada", async () => {
    await comApp(async (app, cookies) => {
      await prepararMundo(app, cookies);
      await app.inject({ method: "PUT", url: "/config/fluxos", cookies, payload: { documento: { fluxos: [FLUXO_JMETER] } } });
      await app.inject({ method: "POST", url: "/fluxos/jmx/executar", cookies, payload: {} });

      const r = await app.inject({ method: "GET", url: "/fluxos/execucoes/ultimas" });
      expect(r.statusCode).toBe(200);
      const { ultimas } = r.json() as { ultimas: { fluxoId: string; ok: boolean; noComFalha?: string; erro?: string }[] };
      const doJmx = ultimas.find((u) => u.fluxoId === "jmx");
      expect(doJmx).toBeDefined();
      expect(doJmx!.ok).toBe(true);
      // Só estados — nunca o texto do erro nem saídas (régua de /ia/execucoes).
      expect(JSON.stringify(ultimas)).not.toContain("erro");
    });
  });

  it("executar exige sessão; fluxo desconhecido é 404", async () => {
    await comApp(async (app, cookies) => {
      expect((await app.inject({ method: "POST", url: "/fluxos/x/executar", payload: {} })).statusCode).toBe(401);
      expect(
        (await app.inject({ method: "POST", url: "/fluxos/nao-existe/executar", cookies, payload: {} })).statusCode
      ).toBe(404);
    });
  });
});

/**
 * SPEC-107 fatia A — **a prova da fatia: as fiações com FUNÇÃO, ponta a ponta
 * contra o dublê.**
 *
 * `conector(desenho) → derivacao → agente → conector(escrita)` e
 * `conector(desenho) → ensaio → agente`. O desenho vem DE FORA (modo b, §5.4)
 * — e por isso o rastro grava as ENTRADAS do nó de função, a âncora da tese
 * reescrita ("mesma fiação + mesmas entradas → mesmos itens").
 */
describe("SPEC-107 fatia A — o nó de FUNÇÃO no fluxo", () => {
  async function declararLeitorDeDesenho(app: App, cookies: Cookies) {
    await app.inject({
      method: "PUT",
      url: "/config/conectores",
      cookies,
      payload: {
        documento: {
          conectores: [
            {
              id: "leitor-de-desenho",
              nome: "Desenho da casa",
              endpoint: `${baseDoGateway}/desenho`,
              entrada: [],
              saida: [{ chave: "desenho", rotulo: "Desenho", tipo: "objeto", caminho: "$.desenho", obrigatorio: true }],
            },
          ],
        },
      },
    });
  }

  const FLUXO_DERIVACAO = {
    id: "gera-itens-de-fora",
    nome: "Itens de um desenho de fora",
    nos: [
      { id: "le-desenho", tipo: "conector", refId: "leitor-de-desenho", posicao: { x: 0, y: 0 }, parametros: {} },
      { id: "gera-itens", tipo: "funcao", refId: "derivacao", posicao: { x: 200, y: 0 }, parametros: {} },
      { id: "resume", tipo: "agente", refId: "especialista", posicao: { x: 400, y: 0 }, parametros: {} },
      { id: "publica", tipo: "conector", refId: "publicar", posicao: { x: 600, y: 0 }, parametros: { demandaId: "itens-de-fora-teste" } },
    ],
    arestas: [
      { de: "le-desenho", para: "gera-itens", mapeamento: [{ saida: "desenho", entrada: "desenho" }] },
      { de: "gera-itens", para: "resume", mapeamento: [{ saida: "itens", entrada: "itens" }] },
      { de: "resume", para: "publica", mapeamento: [{ saida: "texto", entrada: "markdown" }] },
    ],
  };

  it("a fiação da derivação roda ponta a ponta, e o rastro guarda as ENTRADAS do nó de função", async () => {
    await comApp(async (app, cookies) => {
      await prepararMundo(app, cookies);
      await declararLeitorDeDesenho(app, cookies);
      const escrito = await app.inject({
        method: "PUT",
        url: "/config/fluxos",
        cookies,
        payload: { documento: { fluxos: [FLUXO_DERIVACAO] } },
      });
      expect(escrito.statusCode).toBe(200);

      const r = await app.inject({ method: "POST", url: "/fluxos/gera-itens-de-fora/executar", cookies, payload: {} });
      expect(r.statusCode).toBe(200);
      const corpo = r.json() as {
        nos: { noId: string; estado: string; erro?: string }[];
        saidas: Record<string, Record<string, unknown>>;
      };
      expect(corpo.nos.map((n) => [n.noId, n.estado])).toEqual([
        ["le-desenho", "sucesso"],
        ["gera-itens", "sucesso"],
        ["resume", "sucesso"],
        ["publica", "sucesso"],
      ]);
      // O desenho de fora derivou itens de verdade (o fixture tem um campo
      // obrigatório por preencher de propósito), e o artefato final subiu.
      expect((corpo.saidas["gera-itens"].itens as unknown[]).length).toBeGreaterThan(0);
      expect(String(corpo.saidas["publica"].linkExterno)).toContain("http");

      // §5.4 — o rastro persistido guarda as ENTRADAS do nó de função (e só
      // dele): é o que torna "mesma fiação + mesmas entradas" auditável.
      const rastro = await app.inject({ method: "GET", url: "/fluxos/gera-itens-de-fora/execucoes", cookies });
      const { execucoes } = rastro.json() as {
        execucoes: { nos: { noId: string; entradas?: Record<string, unknown> }[] }[];
      };
      const nos = Object.fromEntries(execucoes[0].nos.map((n) => [n.noId, n]));
      expect(nos["gera-itens"].entradas?.desenho).toBeDefined();
      expect(nos["le-desenho"].entradas).toBeUndefined();
      expect(nos["resume"].entradas).toBeUndefined();
    });
  });

  it("§263 — a rota devolve EXATAMENTE o que o motor devolve com o vocabulário do servidor: um executor só", async () => {
    await comApp(async (app, cookies) => {
      await prepararMundo(app, cookies);
      await declararLeitorDeDesenho(app, cookies);
      await app.inject({ method: "PUT", url: "/config/fluxos", cookies, payload: { documento: { fluxos: [FLUXO_DERIVACAO] } } });

      const r = await app.inject({
        method: "POST",
        url: "/fluxos/gera-itens-de-fora/executar",
        cookies,
        payload: { ateNo: "gera-itens" },
      });
      expect(r.statusCode).toBe(200);
      const corpo = r.json() as { saidas: Record<string, Record<string, unknown>> };

      const contexto = await contextoDasFuncoes(db, resolve(import.meta.dirname, "../../../../config"));
      const direto = executarFuncao("derivacao", { desenho: DESENHO_DO_GATEWAY_FALSO }, contexto);
      expect(corpo.saidas["gera-itens"].itens).toEqual(JSON.parse(JSON.stringify(direto.itens)));
    });
  });

  it("a fiação do ensaio roda: desenho de fora + cenário fixo → leitura → agente", async () => {
    await comApp(async (app, cookies) => {
      await prepararMundo(app, cookies);
      await declararLeitorDeDesenho(app, cookies);
      await app.inject({
        method: "PUT",
        url: "/config/fluxos",
        cookies,
        payload: {
          documento: {
            fluxos: [
              {
                id: "ensaia-de-fora",
                nome: "Ensaio de um desenho de fora",
                nos: [
                  { id: "le-desenho", tipo: "conector", refId: "leitor-de-desenho", posicao: { x: 0, y: 0 }, parametros: {} },
                  {
                    id: "ensaia",
                    tipo: "funcao",
                    refId: "ensaio",
                    posicao: { x: 200, y: 0 },
                    parametros: { cenario: { id: "pico", nome: "pico de fim de mês", ajustes: [] } },
                  },
                  { id: "avalia", tipo: "agente", refId: "qa", posicao: { x: 400, y: 0 }, parametros: {} },
                ],
                arestas: [
                  { de: "le-desenho", para: "ensaia", mapeamento: [{ saida: "desenho", entrada: "desenho" }] },
                  { de: "ensaia", para: "avalia", mapeamento: [{ saida: "leitura", entrada: "leitura" }] },
                ],
              },
            ],
          },
        },
      });

      const r = await app.inject({ method: "POST", url: "/fluxos/ensaia-de-fora/executar", cookies, payload: {} });
      expect(r.statusCode).toBe(200);
      const corpo = r.json() as { nos: { noId: string; estado: string; erro?: string }[]; saidas: Record<string, Record<string, unknown>> };
      expect(corpo.nos.map((n) => [n.noId, n.estado])).toEqual([
        ["le-desenho", "sucesso"],
        ["ensaia", "sucesso"],
        ["avalia", "sucesso"],
      ]);
      const leitura = corpo.saidas["ensaia"].leitura as { hoje?: unknown; resultado?: { cenarioId: string } };
      expect(leitura.hoje).toBeDefined();
      expect(leitura.resultado?.cenarioId).toBe("pico");
    });
  });

  it("escrever fluxo com função fora do registro é recusado com o nome dela", async () => {
    await comApp(async (app, cookies) => {
      const r = await app.inject({
        method: "PUT",
        url: "/config/fluxos",
        cookies,
        payload: {
          documento: {
            fluxos: [{ id: "f", nos: [{ id: "g", tipo: "funcao", refId: "telepatia", posicao: { x: 0, y: 0 }, parametros: {} }], arestas: [] }],
          },
        },
      });
      expect(r.statusCode).toBe(400);
      expect((r.json() as { erro: string }).erro).toContain('"telepatia", que não existe');
    });
  });

  it("GET /funcoes serve o registro, com contrato e governança como dado", async () => {
    await comApp(async (app) => {
      const r = await app.inject({ method: "GET", url: "/funcoes" });
      expect(r.statusCode).toBe(200);
      const { funcoes } = r.json() as { funcoes: { id: string; governanca: { nivel: string } }[] };
      expect(funcoes.map((f) => f.id)).toEqual(["derivacao", "ensaio"]);
      expect(funcoes.every((f) => f.governanca.nivel === "operar")).toBe(true);
    });
  });
});
