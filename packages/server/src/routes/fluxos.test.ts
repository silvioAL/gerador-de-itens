import { migrate } from "drizzle-orm/node-postgres/migrator";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarBancoDeDados, type BancoDeDados } from "../db/client.js";
import { exigirBancoDescartavel, garantirBancoDeTeste, URL_BANCO_DE_TESTE } from "../test-support/bancoDeTeste.js";
import { buildApp } from "../app.js";
import { criarGatewayFalso, CHAVE_GATEWAY_FALSO } from "@gerador/gateway-falso";

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

  it("executar exige sessão; fluxo desconhecido é 404", async () => {
    await comApp(async (app, cookies) => {
      expect((await app.inject({ method: "POST", url: "/fluxos/x/executar", payload: {} })).statusCode).toBe(401);
      expect(
        (await app.inject({ method: "POST", url: "/fluxos/nao-existe/executar", cookies, payload: {} })).statusCode
      ).toBe(404);
    });
  });
});
