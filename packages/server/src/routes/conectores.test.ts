import { migrate } from "drizzle-orm/node-postgres/migrator";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarBancoDeDados, type BancoDeDados } from "../db/client.js";
import { exigirBancoDescartavel, garantirBancoDeTeste, URL_BANCO_DE_TESTE } from "../test-support/bancoDeTeste.js";
import { buildApp } from "../app.js";
import { criarGatewayFalso } from "@gerador/gateway-falso";

/**
 * SPEC-105 fatias A/B — a régua de aceite da SPEC inteira, como teste:
 * **acrescentar uma integração é UMA linha de configuração, não oito lugares.**
 *
 * O cenário central cadastra um conector novo por `PUT /config/conectores`
 * (nenhum código, nenhuma porta, nenhum adaptador, nenhum endpoint novo no
 * dublê) e o executa por `POST /conectores/:id/executar` contra o gateway
 * falso — que NÃO ganhou rota nova para isso, e é esse o ponto.
 *
 * Roda contra o banco de verdade porque "tem conector cadastrado" é estado do
 * banco, não parâmetro — mesmo molde do teste da rota do §356.
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

async function comApp<T>(f: (app: Awaited<ReturnType<typeof buildApp>>, cookies: Record<string, string>) => Promise<T>): Promise<T> {
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

/** O conector da prova: aponta para um endpoint que o dublê JÁ serve — o
 * produto não precisou de código novo em lado nenhum. */
function conectorLeitorDeWiki(id = "wiki-da-casa") {
  return {
    id,
    nome: "Leitor da wiki",
    endpoint: `${baseDoGateway}/documento-externo`,
    cabecalhos: { Authorization: "Bearer segredo-que-nao-vaza" },
    entrada: [{ chave: "link", rotulo: "Link", tipo: "texto", obrigatorio: true }],
    saida: [
      { chave: "conteudo", rotulo: "Conteúdo", tipo: "texto", caminho: "$.conteudo", obrigatorio: true },
      { chave: "titulo", rotulo: "Título", tipo: "texto", caminho: "$.titulo" },
    ],
  };
}

async function salvarConectores(app: Awaited<ReturnType<typeof buildApp>>, cookies: Record<string, string>, conectores: unknown[]) {
  return app.inject({
    method: "PUT",
    url: "/config/conectores",
    cookies,
    payload: { documento: { conectores } },
  });
}

describe("SPEC-105 fatia A — o conector como dado", () => {
  it("uma integração nova entra por configuração e aparece no catálogo — sem cabeçalho exposto", async () => {
    await comApp(async (app, cookies) => {
      const put = await salvarConectores(app, cookies, [conectorLeitorDeWiki()]);
      expect(put.statusCode).toBe(200);

      const r = await app.inject({ method: "GET", url: "/conectores" });
      expect(r.statusCode).toBe(200);
      const { conectores } = r.json() as { conectores: Record<string, unknown>[] };
      const wiki = conectores.find((c) => c.id === "wiki-da-casa");

      expect(wiki).toBeDefined();
      expect(wiki!.origem).toBe("declarado");
      expect(wiki!.temCabecalhos).toBe(true);
      // O segredo NUNCA sai do servidor — nem o campo, nem o valor (§7).
      expect(wiki!.cabecalhos).toBeUndefined();
      expect(r.body).not.toContain("segredo-que-nao-vaza");
    });
  });

  it("os destinos do gateway já configurados aparecem como conectores de fábrica, com o contrato da operação", async () => {
    await comApp(async (app, cookies) => {
      await app.inject({
        method: "PUT",
        url: "/config/exportador",
        cookies,
        payload: {
          documento: {
            endpoint: "",
            rotulo: "",
            cabecalhos: {},
            destinos: [{ id: "wiki-eng", operacao: "documentoExterno", endpoint: `${baseDoGateway}/documento-externo`, rotulo: "Wiki de Engenharia" }],
          },
        },
      });

      const r = await app.inject({ method: "GET", url: "/conectores" });
      const { conectores } = r.json() as { conectores: { id: string; origem: string; nome: string; entrada: { chave: string }[] }[] };
      const fabrica = conectores.find((c) => c.id === "wiki-eng");

      expect(fabrica).toBeDefined();
      expect(fabrica!.origem).toBe("fabrica");
      // O rótulo ecoa o nome que a pessoa cadastrou no destino.
      expect(fabrica!.nome).toBe("Wiki de Engenharia");
      expect(fabrica!.entrada.map((c) => c.chave)).toEqual(["link"]);
    });
  });

  it("a escrita recusa conector pela metade, com o motivo (SPEC-35)", async () => {
    await comApp(async (app, cookies) => {
      const r = await salvarConectores(app, cookies, [{ nome: "sem id", endpoint: "https://x.invalido" }]);
      expect(r.statusCode).toBe(400);
      expect((r.json() as { erro: string }).erro).toContain("sem \"id\"");
    });
  });
});

describe("SPEC-105 fatia B — POST /conectores/:id/executar", () => {
  it("executa o conector cadastrado contra o dublê e devolve a saída MAPEADA", async () => {
    await comApp(async (app, cookies) => {
      await salvarConectores(app, cookies, [conectorLeitorDeWiki()]);

      const r = await app.inject({
        method: "POST",
        url: "/conectores/wiki-da-casa/executar",
        cookies,
        payload: { parametros: { link: "https://wiki.invalido/pages/42" } },
      });

      expect(r.statusCode).toBe(200);
      const corpo = r.json() as { conector: string; saida: Record<string, unknown>; ausentes: string[] };
      expect(corpo.conector).toBe("wiki-da-casa");
      // A saída vem pelos CAMINHOS declarados, não como resposta crua.
      expect(String(corpo.saida.conteudo)).toContain("bureau");
      expect(corpo.ausentes).toEqual([]);
    });
  });

  it("§9.3 — obrigatório ausente é 400 com o nome do campo, nunca um default", async () => {
    await comApp(async (app, cookies) => {
      await salvarConectores(app, cookies, [conectorLeitorDeWiki()]);

      const r = await app.inject({ method: "POST", url: "/conectores/wiki-da-casa/executar", cookies, payload: { parametros: {} } });

      expect(r.statusCode).toBe(400);
      expect((r.json() as { erro: string }).erro).toContain('"link"');
    });
  });

  it("conector desconhecido é 404; endpoint fora do ar é 502 com o motivo", async () => {
    await comApp(async (app, cookies) => {
      expect(
        (await app.inject({ method: "POST", url: "/conectores/nao-existe/executar", cookies, payload: {} })).statusCode
      ).toBe(404);

      await salvarConectores(app, cookies, [
        { ...conectorLeitorDeWiki("fora-do-ar"), endpoint: "http://127.0.0.1:9/nada" },
      ]);
      const r = await app.inject({
        method: "POST",
        url: "/conectores/fora-do-ar/executar",
        cookies,
        payload: { parametros: { link: "https://wiki.invalido/x" } },
      });
      expect(r.statusCode).toBe(502);
      expect((r.json() as { erro: string }).erro).toContain("não consegui falar");
    });
  });

  it("executar exige sessão — agir no mundo não é rota aberta", async () => {
    await comApp(async (app) => {
      const r = await app.inject({ method: "POST", url: "/conectores/qualquer/executar", payload: {} });
      expect(r.statusCode).toBe(401);
    });
  });
});
