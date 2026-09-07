import { migrate } from "drizzle-orm/node-postgres/migrator";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarBancoDeDados, type BancoDeDados } from "../db/client.js";
import { exigirBancoDescartavel, garantirBancoDeTeste, URL_BANCO_DE_TESTE } from "../test-support/bancoDeTeste.js";
import { buildApp } from "../app.js";
import { criarGatewayFalso, CHAVE_GATEWAY_FALSO, DESENHO_DO_GATEWAY_FALSO } from "@gerador/gateway-falso";
import { criarCasosDeUsoDeQuebras, executarFuncao } from "@gerador/aplicacao";
import { contextoDasFuncoes } from "../config/contextoDasFuncoes.js";
import { criarRepositorioDeQuebrasEmPostgres } from "../adaptadores/quebrasEmPostgres.js";

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
      // SPEC-107 G5 — a esteira COMPLETA: a demanda como fonte, os quatro
      // papéis de fábrica na ordem, e o destino que grava as sugestões.
      // SPEC-110 A — na frente de tudo, o gatilho que diz quando ela roda.
      expect(esteira!.nos.map((n) => n.id)).toEqual(["gatilho", "demanda", "po", "arquiteto", "especialista", "qa", "grava"]);

      // Ela EXECUTA pelo executor de fluxos (a resolução vem do em-vigor) — e
      // sem demanda salva no mundo, quem barra é a FONTE, com o nome do que
      // faltou (§9.3 uma camada antes: o po agora TEM entrada mapeada, a fila).
      const exec = await app.inject({ method: "POST", url: "/fluxos/esteira-de-agentes/executar", cookies, payload: { ateNo: "po" } });
      expect(exec.statusCode).toBe(200);
      const { nos } = exec.json() as { nos: { noId: string; estado: string; erro?: string }[] };
      const demanda = nos.find((n) => n.noId === "demanda");
      expect(demanda?.estado).toBe("falhou");
      expect(demanda?.erro).toContain("demanda");
      expect(nos.find((n) => n.noId === "po")?.estado).toBe("nao-executado");
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

describe("SPEC-107 fatia A — o nó de FUNÇÃO no fluxo", () => {

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

/**
 * SPEC-107 fatia B — **o nó PROJETO, nas duas direções.**
 *
 * A prova da fatia: as fiações da fatia A com o projeto REAL como fonte, e o
 * destino que NUNCA toca o desenho da demanda — o desenho mapeado vira
 * VARIANTE (a mecânica da SPEC-88), e adotar continua decisão humana.
 */
describe("SPEC-107 fatia B — o nó PROJETO", () => {
  async function criarDemanda(app: App, cookies: Cookies, titulo: string) {
    const r = await app.inject({
      method: "POST",
      url: "/quebras",
      cookies,
      payload: { titulo, time: "time-pagamentos", diagrama: DESENHO_DO_GATEWAY_FALSO.diagrama },
    });
    expect(r.statusCode).toBe(201);
    return (r.json() as { id: string }).id;
  }

  it("fonte: a fiação da fatia A com projeto REAL — projeto.desenho → derivacao → agente → conector(escrita)", async () => {
    await comApp(async (app, cookies) => {
      await prepararMundo(app, cookies);
      const demandaId = await criarDemanda(app, cookies, "Demanda da fatia B");
      await app.inject({
        method: "PUT",
        url: "/config/fluxos",
        cookies,
        payload: {
          documento: {
            fluxos: [
              {
                id: "itens-da-demanda",
                nome: "Itens da demanda ativa",
                nos: [
                  { id: "demanda", tipo: "projeto", refId: "projeto", posicao: { x: 0, y: 0 }, parametros: { demandaId } },
                  { id: "gera-itens", tipo: "funcao", refId: "derivacao", posicao: { x: 200, y: 0 }, parametros: {} },
                  { id: "resume", tipo: "agente", refId: "especialista", posicao: { x: 400, y: 0 }, parametros: {} },
                  { id: "publica", tipo: "conector", refId: "publicar", posicao: { x: 600, y: 0 }, parametros: { demandaId: "fatia-b-teste" } },
                ],
                arestas: [
                  { de: "demanda", para: "gera-itens", mapeamento: [{ saida: "desenho", entrada: "desenho" }] },
                  { de: "gera-itens", para: "resume", mapeamento: [{ saida: "itens", entrada: "itens" }] },
                  { de: "resume", para: "publica", mapeamento: [{ saida: "texto", entrada: "markdown" }] },
                ],
              },
            ],
          },
        },
      });

      const r = await app.inject({ method: "POST", url: "/fluxos/itens-da-demanda/executar", cookies, payload: {} });
      expect(r.statusCode).toBe(200);
      const corpo = r.json() as {
        nos: { noId: string; estado: string; erro?: string }[];
        saidas: Record<string, Record<string, unknown>>;
      };
      expect(corpo.nos.map((n) => [n.noId, n.estado])).toEqual([
        ["demanda", "sucesso"],
        ["gera-itens", "sucesso"],
        ["resume", "sucesso"],
        ["publica", "sucesso"],
      ]);
      // O desenho que viajou é o da DEMANDA salva, não um parâmetro fixo.
      const desenho = corpo.saidas["demanda"].desenho as { diagrama: unknown; time?: string };
      expect(desenho.diagrama).toEqual(JSON.parse(JSON.stringify(DESENHO_DO_GATEWAY_FALSO.diagrama)));
      expect(desenho.time).toBe("time-pagamentos");
      expect((corpo.saidas["gera-itens"].itens as unknown[]).length).toBeGreaterThan(0);
      expect(String(corpo.saidas["publica"].linkExterno)).toContain("http");
      // §9.3 — a demanda nunca teve documento gerado nem volume declarado:
      // as chaves FICAM FORA da saída, nunca viram default.
      expect("markdown" in corpo.saidas["demanda"]).toBe(false);
      expect("volumetria" in corpo.saidas["demanda"]).toBe(false);
    });
  });

  it("fonte: sem demandaId vale a mais recentemente atualizada DO TIME da execução", async () => {
    await comApp(async (app, cookies) => {
      // Time próprio (criado pela tabela, não pelo cookie): dois specs criando
      // demandas em time-pagamentos em paralelo tornariam "a ativa" um alvo
      // móvel — aqui o time é deste teste, e a resposta é determinística.
      const timeId = `time-fatia-b-${Date.now()}`;
      expect((await app.inject({ method: "POST", url: "/times", cookies, payload: { timeId } })).statusCode).toBe(201);
      const criar = (titulo: string) =>
        app.inject({ method: "POST", url: "/quebras", cookies, payload: { titulo, time: timeId, diagrama: { nodes: [], edges: [] } } });
      const primeira = (await criar("antiga")).json() as { id: string };
      const segunda = (await criar("recente")).json() as { id: string };
      // A primeira volta a ser tocada? Não — a SEGUNDA é atualizada por
      // último, e é ela que a execução deve enxergar como ativa.
      await app.inject({
        method: "PUT",
        url: `/quebras/${segunda.id}`,
        cookies,
        payload: { titulo: "recente (editada)", time: timeId, diagrama: { nodes: [], edges: [] } },
      });

      await app.inject({
        method: "PUT",
        url: "/config/fluxos",
        cookies,
        payload: {
          timeId,
          documento: {
            fluxos: [
              {
                id: "le-ativa",
                nome: "Lê a demanda ativa",
                nos: [{ id: "demanda", tipo: "projeto", refId: "projeto", posicao: { x: 0, y: 0 }, parametros: {} }],
                arestas: [],
              },
            ],
          },
        },
      });

      const r = await app.inject({ method: "POST", url: "/fluxos/le-ativa/executar", cookies, payload: { timeId } });
      expect(r.statusCode).toBe(200);
      const { saidas } = r.json() as { saidas: Record<string, Record<string, unknown>> };
      expect(saidas["demanda"].demandaId).toBe(segunda.id);
      expect(saidas["demanda"].demandaId).not.toBe(primeira.id);
    });
  });

  it("destino: o desenho mapeado vira VARIANTE — e o diagrama da demanda fica intacto (§2.4-14)", async () => {
    await comApp(async (app, cookies) => {
      await prepararMundo(app, cookies);
      await declararLeitorDeDesenho(app, cookies);
      const demandaId = await criarDemanda(app, cookies, "Recebe proposta");
      const antes = (await app.inject({ method: "GET", url: `/quebras/${demandaId}`, cookies })).json() as {
        diagrama: unknown;
      };

      await app.inject({
        method: "PUT",
        url: "/config/fluxos",
        cookies,
        payload: {
          documento: {
            fluxos: [
              {
                id: "importa-desenho",
                nome: "Importa desenho da casa",
                nos: [
                  { id: "le", tipo: "conector", refId: "leitor-de-desenho", posicao: { x: 0, y: 0 }, parametros: {} },
                  { id: "propoe", tipo: "projeto", refId: "projeto", posicao: { x: 200, y: 0 }, parametros: { demandaId } },
                ],
                arestas: [{ de: "le", para: "propoe", mapeamento: [{ saida: "desenho", entrada: "desenho" }] }],
              },
            ],
          },
        },
      });

      const r = await app.inject({ method: "POST", url: "/fluxos/importa-desenho/executar", cookies, payload: {} });
      expect(r.statusCode).toBe(200);
      const corpo = r.json() as { nos: { noId: string; estado: string; erro?: string }[]; saidas: Record<string, Record<string, unknown>> };
      expect(corpo.nos.map((n) => [n.noId, n.estado])).toEqual([
        ["le", "sucesso"],
        ["propoe", "sucesso"],
      ]);
      expect(String(corpo.saidas["propoe"].varianteId)).toContain("proposta-");

      const depois = (await app.inject({ method: "GET", url: `/quebras/${demandaId}`, cookies })).json() as {
        diagrama: unknown;
        variantes: { id: string; titulo: string; diagrama: { nodes: unknown[] } }[];
      };
      // Importar não é aceitar: o desenho da demanda NÃO mudou…
      expect(depois.diagrama).toEqual(antes.diagrama);
      // …e a proposta está lá, como variante, esperando alguém adotar.
      expect(depois.variantes).toHaveLength(1);
      expect(depois.variantes[0].titulo).toBe('Proposta do fluxo "Importa desenho da casa"');
      expect(depois.variantes[0].diagrama.nodes.length).toBeGreaterThan(0);
    });
  });

  it("destino: sem nível no time da DEMANDA, o nó falha com o nome do portão", async () => {
    await comApp(async (app, cookies) => {
      await prepararMundo(app, cookies);
      await declararLeitorDeDesenho(app, cookies);
      // A quebra é de um time em que o dev NÃO está — direto pelo caso de uso,
      // porque a própria rota de quebras (certamente) barraria o POST.
      const casos = criarCasosDeUsoDeQuebras(criarRepositorioDeQuebrasEmPostgres(db));
      const alheia = await casos.criar({ titulo: "de outro time", time: "time-fantasma", diagrama: { nodes: [], edges: [] } as never });

      await app.inject({
        method: "PUT",
        url: "/config/fluxos",
        cookies,
        payload: {
          documento: {
            fluxos: [
              {
                id: "propoe-alheia",
                nome: "Propõe em demanda alheia",
                nos: [
                  { id: "le", tipo: "conector", refId: "leitor-de-desenho", posicao: { x: 0, y: 0 }, parametros: {} },
                  { id: "propoe", tipo: "projeto", refId: "projeto", posicao: { x: 200, y: 0 }, parametros: { demandaId: alheia.id } },
                ],
                arestas: [{ de: "le", para: "propoe", mapeamento: [{ saida: "desenho", entrada: "desenho" }] }],
              },
            ],
          },
        },
      });

      const r = await app.inject({ method: "POST", url: "/fluxos/propoe-alheia/executar", cookies, payload: {} });
      expect(r.statusCode).toBe(200);
      const porNo = Object.fromEntries(
        (r.json() as { nos: { noId: string; estado: string; erro?: string }[] }).nos.map((n) => [n.noId, n])
      );
      expect(porNo["propoe"].estado).toBe("falhou");
      expect(porNo["propoe"].erro).toContain('exige nível "operar" no time "time-fantasma"');
    });
  });

  it("SPEC-107 fatia C — o gate suspende, persiste as saídas, e continuar roda SÓ o resto", async () => {
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
                id: "com-gate",
                nome: "Com gate de confirmação",
                nos: [
                  { id: "le", tipo: "conector", refId: "leitor-de-desenho", posicao: { x: 0, y: 0 }, parametros: {} },
                  { id: "gera", tipo: "funcao", refId: "derivacao", posicao: { x: 200, y: 0 }, parametros: {}, confirmacao: "aguardar" },
                  { id: "resume", tipo: "agente", refId: "especialista", posicao: { x: 400, y: 0 }, parametros: {} },
                ],
                arestas: [
                  { de: "le", para: "gera", mapeamento: [{ saida: "desenho", entrada: "desenho" }] },
                  { de: "gera", para: "resume", mapeamento: [{ saida: "itens", entrada: "itens" }] },
                ],
              },
            ],
          },
        },
      });

      // 1. Executar SUSPENDE no gate: o agente nem dispara.
      const exec = await app.inject({ method: "POST", url: "/fluxos/com-gate/executar", cookies, payload: {} });
      expect(exec.statusCode).toBe(200);
      const suspensa = exec.json() as {
        execucaoId: string;
        aguardandoEm?: string;
        nos: { noId: string; estado: string }[];
        saidas: Record<string, Record<string, unknown>>;
      };
      expect(suspensa.aguardandoEm).toBe("gera");
      expect(suspensa.nos.map((n) => n.noId)).toEqual(["le", "gera"]);
      expect((suspensa.saidas["gera"].itens as unknown[]).length).toBeGreaterThan(0);

      // 2. A suspensão PERSISTE — com as saídas (o stage da revisão), que é o
      // que sobrevive a F5 e a outra máquina.
      const persistida = await app.inject({ method: "GET", url: "/fluxos/com-gate/execucoes", cookies });
      const linha = (persistida.json() as { execucoes: { id: string; estado: string; saidas: Record<string, unknown> | null }[] }).execucoes[0];
      expect(linha.estado).toBe("aguardando-confirmacao");
      expect(linha.saidas).not.toBeNull();

      // 3. Continuar roda SÓ o resto (o agente), do ponto exato.
      const continuada = await app.inject({
        method: "POST",
        url: `/fluxos/execucoes/${suspensa.execucaoId}/continuar`,
        cookies,
        payload: {},
      });
      expect(continuada.statusCode).toBe(200);
      const fim = continuada.json() as { aguardandoEm?: string; nos: { noId: string; estado: string }[]; saidas: Record<string, Record<string, unknown>> };
      expect(fim.aguardandoEm).toBeUndefined();
      expect(fim.nos.map((n) => [n.noId, n.estado])).toEqual([
        ["le", "sucesso"],
        ["gera", "sucesso"],
        ["resume", "sucesso"],
      ]);
      expect(String(fim.saidas["resume"].texto)).toBeTruthy();

      // 4. Concluída: as saídas persistidas somem (rastro não é armazém), e
      // continuar de novo é 409 — o gate não é uma porta que fica aberta.
      const depois = await app.inject({ method: "GET", url: "/fluxos/com-gate/execucoes", cookies });
      const linhaFinal = (depois.json() as { execucoes: { estado: string; saidas: unknown; nos: unknown[] }[] }).execucoes[0];
      expect(linhaFinal.estado).toBe("concluida");
      expect(linhaFinal.saidas).toBeNull();
      expect(linhaFinal.nos).toHaveLength(3);

      const deNovo = await app.inject({ method: "POST", url: `/fluxos/execucoes/${suspensa.execucaoId}/continuar`, cookies, payload: {} });
      expect(deNovo.statusCode).toBe(409);
    });
  });

  /**
   * SPEC-110 fatia B (D2) — **a TELA como nó, do lado do servidor.**
   *
   * A diferença para o gate, em uma frase: o gate pausa DEPOIS de um nó que
   * rodou; a tela pausa NELA, porque o executor dela é gente. O contrato
   * cobra: suspende com o stage, o GET diz o que a tela vai mostrar, o
   * continuar exige a decisão VÁLIDA, e retornar encerra.
   */
  it("SPEC-110 B — a tela suspende, o stage é servido, e o Avançar continua com a decisão", async () => {
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
                id: "com-tela",
                nome: "Com tela de revisão",
                nos: [
                  { id: "le", tipo: "conector", refId: "leitor-de-desenho", posicao: { x: 0, y: 0 }, parametros: {} },
                  { id: "gera", tipo: "funcao", refId: "derivacao", posicao: { x: 200, y: 0 }, parametros: {} },
                  { id: "revisa", tipo: "tela", refId: "documento", posicao: { x: 400, y: 0 }, parametros: {} },
                  { id: "resume", tipo: "agente", refId: "especialista", posicao: { x: 600, y: 0 }, parametros: {} },
                ],
                arestas: [
                  { de: "le", para: "gera", mapeamento: [{ saida: "desenho", entrada: "desenho" }] },
                  { de: "gera", para: "revisa", mapeamento: [{ saida: "itens", entrada: "documento" }] },
                  { de: "revisa", para: "resume", mapeamento: [{ saida: "decisao", entrada: "decisao" }] },
                ],
              },
            ],
          },
        },
      });

      // 1. Executar SUSPENDE NA tela — o agente depois dela nem dispara, e a
      //    tela NÃO entra no rastro (ela não rodou, está esperando).
      const exec = await app.inject({ method: "POST", url: "/fluxos/com-tela/executar", cookies, payload: {} });
      expect(exec.statusCode).toBe(200);
      const suspensa = exec.json() as {
        execucaoId: string;
        aguardandoTela?: { noId: string; refId: string; entradas: Record<string, unknown> };
        nos: { noId: string }[];
      };
      expect(suspensa.aguardandoTela?.noId).toBe("revisa");
      expect(suspensa.aguardandoTela?.refId).toBe("documento");
      expect(suspensa.nos.map((n) => n.noId)).toEqual(["le", "gera"]);

      // 2. O estado persistido diz QUAL suspensão é — o gate e a tela não são
      //    a mesma coisa, e o canvas oferece botões diferentes.
      const persistida = await app.inject({ method: "GET", url: "/fluxos/com-tela/execucoes", cookies });
      expect((persistida.json() as { execucoes: { estado: string }[] }).execucoes[0].estado).toBe("aguardando-tela");

      // 3. O STAGE: o que a tela vai mostrar, resolvido pelo MESMO executor
      //    (§263) — nada de recalcular mapeamento no navegador.
      const stage = await app.inject({ method: "GET", url: `/fluxos/execucoes/${suspensa.execucaoId}/tela`, cookies });
      expect(stage.statusCode).toBe(200);
      const doStage = stage.json() as {
        noId: string;
        tela: { id: string; entrada: { chave: string }[]; saida: { chave: string }[] };
        entradas: Record<string, unknown>;
      };
      expect(doStage.noId).toBe("revisa");
      expect(doStage.tela.id).toBe("documento");
      expect(doStage.tela.saida.map((c) => c.chave)).toContain("decisao");
      expect((doStage.entradas.documento as unknown[]).length).toBeGreaterThan(0);

      // 4. Continuar SEM a decisão é 400 NOMEADO — a tela não roda sozinha.
      const semDecisao = await app.inject({
        method: "POST",
        url: `/fluxos/execucoes/${suspensa.execucaoId}/continuar`,
        cookies,
        payload: {},
      });
      expect(semDecisao.statusCode).toBe(400);
      expect((semDecisao.json() as { erro: string }).erro).toContain("saidaDaTela");

      // 5. Decisão fora do catálogo é 400 — o acionador é enlatado (D17).
      const decisaoInventada = await app.inject({
        method: "POST",
        url: `/fluxos/execucoes/${suspensa.execucaoId}/continuar`,
        cookies,
        payload: { saidaDaTela: { decisao: "talvez" } },
      });
      expect(decisaoInventada.statusCode).toBe(400);

      // 6. Avançar continua com a saída DA PESSOA, e o resto roda.
      const avancou = await app.inject({
        method: "POST",
        url: `/fluxos/execucoes/${suspensa.execucaoId}/continuar`,
        cookies,
        payload: { saidaDaTela: { decisao: "avancar" } },
      });
      expect(avancou.statusCode).toBe(200);
      const fim = avancou.json() as { nos: { noId: string; estado: string }[]; saidas: Record<string, Record<string, unknown>> };
      expect(fim.nos.map((n) => [n.noId, n.estado])).toEqual([
        ["le", "sucesso"],
        ["gera", "sucesso"],
        ["revisa", "sucesso"],
        ["resume", "sucesso"],
      ]);
      expect(fim.saidas["revisa"]).toEqual({ decisao: "avancar" });
    });
  });

  it("SPEC-110 B — Retornar ENCERRA a execução (D2: re-rodar o anterior é dívida declarada)", async () => {
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
                id: "tela-retornada",
                nome: "Tela que retorna",
                nos: [
                  { id: "le", tipo: "conector", refId: "leitor-de-desenho", posicao: { x: 0, y: 0 }, parametros: {} },
                  { id: "revisa", tipo: "tela", refId: "mesa", posicao: { x: 200, y: 0 }, parametros: {} },
                  { id: "resume", tipo: "agente", refId: "especialista", posicao: { x: 400, y: 0 }, parametros: {} },
                ],
                arestas: [
                  { de: "le", para: "revisa", mapeamento: [] },
                  { de: "revisa", para: "resume", mapeamento: [{ saida: "decisao", entrada: "decisao" }] },
                ],
              },
            ],
          },
        },
      });

      const exec = await app.inject({ method: "POST", url: "/fluxos/tela-retornada/executar", cookies, payload: {} });
      const { execucaoId } = exec.json() as { execucaoId: string };

      // "retornar" pelo continuar é recusado com o caminho certo — uma decisão
      // terminal não pode entrar pela porta de "siga em frente".
      const peloContinuar = await app.inject({
        method: "POST",
        url: `/fluxos/execucoes/${execucaoId}/continuar`,
        cookies,
        payload: { saidaDaTela: { decisao: "retornar" } },
      });
      expect(peloContinuar.statusCode).toBe(400);
      expect((peloContinuar.json() as { erro: string }).erro).toContain("/retornar");

      const retornou = await app.inject({ method: "POST", url: `/fluxos/execucoes/${execucaoId}/retornar`, cookies, payload: {} });
      expect(retornou.statusCode).toBe(200);

      // Terminal: o estado é "retornada", o stage sumiu, o rastro ficou (é
      // ele que diz até onde chegou), e o agente NUNCA rodou.
      const depois = await app.inject({ method: "GET", url: "/fluxos/tela-retornada/execucoes", cookies });
      const linha = (depois.json() as { execucoes: { estado: string; saidas: unknown; nos: { noId: string }[] }[] }).execucoes[0];
      expect(linha.estado).toBe("retornada");
      expect(linha.saidas).toBeNull();
      expect(linha.nos.map((n) => n.noId)).toEqual(["le"]);

      // E ela não volta: continuar depois de retornar é 409.
      const deNovo = await app.inject({
        method: "POST",
        url: `/fluxos/execucoes/${execucaoId}/continuar`,
        cookies,
        payload: { saidaDaTela: { decisao: "avancar" } },
      });
      expect(deNovo.statusCode).toBe(409);
    });
  });

  it("SPEC-107 fatia C — descartar fecha a execução sem o resto rodar", async () => {
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
                id: "gate-descartado",
                nome: "Gate descartado",
                nos: [
                  { id: "le", tipo: "conector", refId: "leitor-de-desenho", posicao: { x: 0, y: 0 }, parametros: {}, confirmacao: "aguardar" },
                  { id: "gera", tipo: "funcao", refId: "derivacao", posicao: { x: 200, y: 0 }, parametros: {} },
                ],
                arestas: [{ de: "le", para: "gera", mapeamento: [{ saida: "desenho", entrada: "desenho" }] }],
              },
            ],
          },
        },
      });
      const exec = await app.inject({ method: "POST", url: "/fluxos/gate-descartado/executar", cookies, payload: {} });
      const { execucaoId } = exec.json() as { execucaoId: string };

      const descarte = await app.inject({ method: "POST", url: `/fluxos/execucoes/${execucaoId}/descartar`, cookies, payload: {} });
      expect(descarte.statusCode).toBe(200);

      const depois = await app.inject({ method: "GET", url: "/fluxos/gate-descartado/execucoes", cookies });
      const linha = (depois.json() as { execucoes: { estado: string; saidas: unknown }[] }).execucoes[0];
      expect(linha.estado).toBe("descartada");
      expect(linha.saidas).toBeNull();

      const continuar = await app.inject({ method: "POST", url: `/fluxos/execucoes/${execucaoId}/continuar`, cookies, payload: {} });
      expect(continuar.statusCode).toBe(409);
    });
  });

  it("SPEC-107 fatia C (§9.5) — fluxo editado depois da suspensão: continuar é recusado com o caminho", async () => {
    await comApp(async (app, cookies) => {
      await prepararMundo(app, cookies);
      await declararLeitorDeDesenho(app, cookies);
      const fluxoBase = {
        id: "gate-que-muda",
        nome: "Gate que muda",
        nos: [
          { id: "le", tipo: "conector", refId: "leitor-de-desenho", posicao: { x: 0, y: 0 }, parametros: {}, confirmacao: "aguardar" },
          { id: "gera", tipo: "funcao", refId: "derivacao", posicao: { x: 200, y: 0 }, parametros: {} },
        ],
        arestas: [{ de: "le", para: "gera", mapeamento: [{ saida: "desenho", entrada: "desenho" }] }],
      };
      await app.inject({ method: "PUT", url: "/config/fluxos", cookies, payload: { documento: { fluxos: [fluxoBase] } } });
      const exec = await app.inject({ method: "POST", url: "/fluxos/gate-que-muda/executar", cookies, payload: {} });
      const { execucaoId } = exec.json() as { execucaoId: string };

      // A fiação muda depois da suspensão (a posição basta: o hash é do fluxo
      // inteiro) — continuar sobre outra fiação tornaria o rastro ambíguo.
      await app.inject({
        method: "PUT",
        url: "/config/fluxos",
        cookies,
        payload: { documento: { fluxos: [{ ...fluxoBase, nos: [{ ...fluxoBase.nos[0], posicao: { x: 999, y: 0 } }, fluxoBase.nos[1]] }] } },
      });

      const continuar = await app.inject({ method: "POST", url: `/fluxos/execucoes/${execucaoId}/continuar`, cookies, payload: {} });
      expect(continuar.statusCode).toBe(409);
      expect((continuar.json() as { erro: string }).erro).toContain("mudou desde a suspensão");
    });
  });

  it("SPEC-107 fatia D — `aoVivo` streama NDJSON por nó, e o fim carrega a resposta de sempre", async () => {
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
                id: "vivo",
                nome: "Fiação assistível",
                nos: [
                  { id: "le", tipo: "conector", refId: "leitor-de-desenho", posicao: { x: 0, y: 0 }, parametros: {} },
                  { id: "gera", tipo: "funcao", refId: "derivacao", posicao: { x: 200, y: 0 }, parametros: {} },
                  { id: "resume", tipo: "agente", refId: "especialista", posicao: { x: 400, y: 0 }, parametros: {} },
                ],
                arestas: [
                  { de: "le", para: "gera", mapeamento: [{ saida: "desenho", entrada: "desenho" }] },
                  { de: "gera", para: "resume", mapeamento: [{ saida: "itens", entrada: "itens" }] },
                ],
              },
            ],
          },
        },
      });

      const r = await app.inject({ method: "POST", url: "/fluxos/vivo/executar", cookies, payload: { aoVivo: true } });
      expect(r.statusCode).toBe(200);
      expect(String(r.headers["content-type"])).toContain("application/x-ndjson");

      const eventos = r.payload
        .trim()
        .split("\n")
        .map((linha) => JSON.parse(linha) as { tipo: string; noId?: string; rastro?: { noId: string; estado: string }; resposta?: { nos: unknown[]; execucaoId: string; saidas: Record<string, unknown> } });

      // O vivo é feedback (§2.4-9): cada nó anuncia começo e fim, na ordem.
      const porTipo = (t: string) => eventos.filter((e) => e.tipo === t);
      expect(porTipo("no-comecou").map((e) => e.noId)).toEqual(["le", "gera", "resume"]);
      expect(porTipo("no-terminou").map((e) => e.rastro!.noId)).toEqual(["le", "gera", "resume"]);
      // O texto do agente STREAMOU por nó — a técnica do executarPedido.
      const textos = porTipo("texto");
      expect(textos.length).toBeGreaterThan(0);
      expect(textos.every((e) => e.noId === "resume")).toBe(true);

      // E o fim fecha com a MESMA forma do modo one-shot: os dois caminhos
      // convergem, e o rastro persistiu como sempre.
      const fim = eventos[eventos.length - 1];
      expect(fim.tipo).toBe("fim");
      expect(fim.resposta!.nos).toHaveLength(3);
      expect(fim.resposta!.execucaoId).toBeTruthy();
      expect(String((fim.resposta!.saidas as Record<string, Record<string, unknown>>)["resume"].texto)).toBeTruthy();
    });
  });

  it("SPEC-107 fatia E — a transformação re-mapeia, extrai e concatena, pura, no meio da fiação", async () => {
    await comApp(async (app, cookies) => {
      await prepararMundo(app, cookies);
      const demandaId = await criarDemanda(app, cookies, "Demanda transformada");
      await app.inject({
        method: "PUT",
        url: "/config/fluxos",
        cookies,
        payload: {
          documento: {
            fluxos: [
              {
                id: "com-transformacao",
                nome: "Com transformação",
                nos: [
                  { id: "demanda", tipo: "projeto", refId: "projeto", posicao: { x: 0, y: 0 }, parametros: { demandaId } },
                  {
                    id: "molda",
                    tipo: "transformacao",
                    refId: "transformacao",
                    posicao: { x: 200, y: 0 },
                    parametros: {
                      campos: [
                        { chave: "resumo", modelo: "Demanda {titulo} ({demandaId})" },
                        { chave: "nosDoDesenho", caminho: "$.desenho.diagrama.nodes" },
                      ],
                    },
                  },
                ],
                arestas: [
                  {
                    de: "demanda",
                    para: "molda",
                    mapeamento: [
                      { saida: "titulo", entrada: "titulo" },
                      { saida: "demandaId", entrada: "demandaId" },
                      { saida: "desenho", entrada: "desenho" },
                    ],
                  },
                ],
              },
            ],
          },
        },
      });

      const r = await app.inject({ method: "POST", url: "/fluxos/com-transformacao/executar", cookies, payload: {} });
      expect(r.statusCode).toBe(200);
      const { nos, saidas } = r.json() as { nos: { noId: string; estado: string; erro?: string }[]; saidas: Record<string, Record<string, unknown>> };
      expect(nos.map((n) => [n.noId, n.estado])).toEqual([
        ["demanda", "sucesso"],
        ["molda", "sucesso"],
      ]);
      expect(saidas["molda"].resumo).toBe(`Demanda Demanda transformada (${demandaId})`);
      expect((saidas["molda"].nosDoDesenho as unknown[]).length).toBeGreaterThan(0);
    });
  });

  it("SPEC-107 fatia E — transformação sem campos (ou pela metade) é recusada na ESCRITA", async () => {
    await comApp(async (app, cookies) => {
      const semCampos = await app.inject({
        method: "PUT",
        url: "/config/fluxos",
        cookies,
        payload: {
          documento: {
            fluxos: [{ id: "f", nos: [{ id: "t", tipo: "transformacao", refId: "transformacao", posicao: { x: 0, y: 0 }, parametros: { campos: [] } }], arestas: [] }],
          },
        },
      });
      expect(semCampos.statusCode).toBe(400);
      expect((semCampos.json() as { erro: string }).erro).toContain("não declara nenhum campo");

      const pelaMetade = await app.inject({
        method: "PUT",
        url: "/config/fluxos",
        cookies,
        payload: {
          documento: {
            fluxos: [{ id: "f", nos: [{ id: "t", tipo: "transformacao", refId: "transformacao", posicao: { x: 0, y: 0 }, parametros: { campos: [{ chave: "x" }] } }], arestas: [] }],
          },
        },
      });
      expect(pelaMetade.statusCode).toBe(400);
      expect((pelaMetade.json() as { erro: string }).erro).toContain('"modelo" (concatenar) ou um "caminho"');
    });
  });

  it("SPEC-107 G1 — a exportação COMO fiação semeada: prontos sobem, pendente fica de fora, falha é por item", async () => {
    await comApp(async (app, cookies) => {
      // O destino de itens aponta o dublê (que falha o ÚLTIMO item de
      // propósito — falha parcial é o modo de falhar deste contrato).
      await app.inject({
        method: "PUT",
        url: "/config/exportador",
        cookies,
        payload: {
          documento: {
            endpoint: `${baseDoGateway}/itens`,
            rotulo: "Tracker de teste",
            cabecalhos: {},
          },
        },
      });
      const demandaId = await criarDemanda(app, cookies, "Demanda exportada");
      await app.inject({
        method: "PUT",
        url: `/quebras/${demandaId}/itens`,
        cookies,
        payload: {
          itens: [
            { chave: "a", titulo: "A", tipo: "História", tamanho: "M", dependencias: [], corpoMarkdown: "…", pendencias: 0, sugestoes: 0 },
            { chave: "b", titulo: "B", tipo: "História", tamanho: "M", dependencias: [], corpoMarkdown: "…", pendencias: 0, sugestoes: 0 },
            { chave: "pendente", titulo: "P", tipo: "História", tamanho: "M", dependencias: [], corpoMarkdown: "…", pendencias: 2, sugestoes: 0 },
          ],
        },
      });

      // A fiação está EM VIGOR, derivada do destino — ninguém a desenhou.
      const emVigorResp = await app.inject({ method: "GET", url: "/fluxos" });
      const daExportacao = (emVigorResp.json() as { fluxos: { id: string; origem: string }[] }).fluxos.find(
        (f) => f.id === "exportar-prontos"
      );
      expect(daExportacao?.origem).toBe("fabrica");

      const r = await app.inject({
        method: "POST",
        url: "/fluxos/exportar-prontos/executar",
        cookies,
        payload: { parametrosPorNo: { demanda: { demandaId } } },
      });
      expect(r.statusCode).toBe(200);
      const corpo = r.json() as {
        nos: { noId: string; estado: string; erro?: string }[];
        saidas: Record<string, Record<string, unknown>>;
      };
      // SPEC-110 A — a derivada começa pelo gatilho (no-op) e o rastro o diz.
      expect(corpo.nos.map((n) => [n.noId, n.estado])).toEqual([
        ["gatilho", "sucesso"],
        ["demanda", "sucesso"],
        ["envio", "sucesso"],
        ["grava", "sucesso"],
      ]);
      expect(corpo.nos.find((n) => n.noId === "gatilho")).toMatchObject({ origem: "manual" });
      // A régua de "pronto" (a MESMA da SPEC-49): o pendente ficou de fora.
      expect(corpo.saidas["demanda"].itensIgnorados).toEqual(["pendente"]);
      // Falha parcial por item: o dublê recusa o último enviado.
      expect(corpo.saidas["grava"].exportados).toEqual(["a"]);
      expect(corpo.saidas["grava"].erros).toEqual([{ chave: "b", erro: "campo obrigatório ausente no tracker (recusa simulada)" }]);

      // E o banco diz o mesmo: quem subiu está `exportado` com link; quem
      // falhou continua `gerado`.
      const itens = (await app.inject({ method: "GET", url: `/quebras/${demandaId}/itens`, cookies })).json() as {
        chave: string;
        estado: string;
        linkExterno: string | null;
      }[];
      const porChave = Object.fromEntries(itens.map((i) => [i.chave, i]));
      expect(porChave["a"].estado).toBe("exportado");
      expect(String(porChave["a"].linkExterno)).toContain("https://");
      expect(porChave["b"].estado).toBe("gerado");
      expect(porChave["pendente"].estado).toBe("gerado");
    });
  });

  it("escrever fluxo com projeto de refId errado é recusado com a régua", async () => {
    await comApp(async (app, cookies) => {
      const r = await app.inject({
        method: "PUT",
        url: "/config/fluxos",
        cookies,
        payload: {
          documento: {
            fluxos: [{ id: "f", nos: [{ id: "p", tipo: "projeto", refId: "minha-demanda", posicao: { x: 0, y: 0 }, parametros: {} }], arestas: [] }],
          },
        },
      });
      expect(r.statusCode).toBe(400);
      expect((r.json() as { erro: string }).erro).toContain('o refId precisa ser "projeto"');
    });
  });
});
