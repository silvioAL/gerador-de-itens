import { migrate } from "drizzle-orm/node-postgres/migrator";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarBancoDeDados, type BancoDeDados } from "../db/client.js";
import { exigirBancoDescartavel, garantirBancoDeTeste, URL_BANCO_DE_TESTE } from "../test-support/bancoDeTeste.js";
import { buildApp } from "../app.js";
import { criarGatewayFalso } from "@gerador/gateway-falso";

/**
 * §356 — **a rota que o §349 não escreveu.**
 *
 * O §349 entregou a porta (`LeitorDeDocumento`), o adaptador
 * (`criarLeitorDeDocumentoViaGateway`), a operação `documentoExterno` na lista
 * fechada,99 linhas de teste do adaptador e três linhas na tela de Exportação
 * para cadastrar o destino. **Nunca entregou rota.**
 *
 * O adaptador era chamado só pelo próprio teste: dava para configurar o destino
 * e nada jamais o chamava. O commit dizia *"Fecha a frente (3)"*.
 *
 * Estes testes existem para a rota não poder sumir de novo em silêncio — é a
 * mesma disciplina do `permissoes.cobertura.test.ts`, que nasceu porque 14 de 16
 * recursos eram concedidos sem nenhuma rota perguntar.
 *
 * Rodam contra o banco de verdade porque "tem destino configurado" é um estado
 * do banco, não um parâmetro.
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

async function comApp<T>(f: (app: Awaited<ReturnType<typeof buildApp>>) => Promise<T>): Promise<T> {
  const app = await buildApp({ db, diretorioConfig: resolve(import.meta.dirname, "../../../../config") });
  await app.ready();
  try {
    return await f(app);
  } finally {
    await app.close();
  }
}

/** Grava (ou apaga) o destino de leitura. O corpo do PUT é o mesmo da tela. */
async function comDestinoDeLeitura(endpoint: string | null) {
  await comApp(async (app) => {
    const sessao = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "dev@gerador.local" },
    });
    await app.inject({
      method: "PUT",
      url: "/config/exportador",
      cookies: sessao.cookies.reduce((acc, c) => ({ ...acc, [c.name]: c.value }), {}),
      payload: {
        documento: {
          endpoint: "",
          rotulo: "",
          cabecalhos: {},
          destinos: endpoint
            ? [{ id: "d-ext", operacao: "documentoExterno", endpoint, rotulo: "Wiki da casa" }]
            : [],
        },
      },
    });
  });
}

async function lerLink(link: unknown) {
  return comApp((app) => app.inject({ method: "POST", url: "/ia/documento-externo", payload: { link } }));
}

describe("POST /ia/documento-externo (§356)", () => {
  it("com destino configurado, traz o conteúdo e ECOA o link", async () => {
    await comDestinoDeLeitura(`${baseDoGateway}/documento-externo`);

    const r = await lerLink("https://wiki.invalido/pages/42");
    const corpo = r.json();

    expect(r.statusCode).toBe(200);
    expect(corpo.conteudo).toContain("bureau");
    // O eco é PROVENIÊNCIA: o desenho que nascer disto diz de onde veio, e
    // inventar o link seria mentir sobre a origem.
    expect(corpo.link).toBe("https://wiki.invalido/pages/42");
  });

  it("SEM destino configurado responde 409 dizendo ONDE configurar", async () => {
    // Um erro genérico manda a pessoa adivinhar — mesma régua das rotas irmãs.
    await comDestinoDeLeitura(null);

    const r = await lerLink("https://wiki.invalido/pages/42");

    expect(r.statusCode).toBe(409);
    expect(r.json().erro).toContain("Exportação");
  });

  it("sem `link` no corpo responde 400", async () => {
    await comDestinoDeLeitura(`${baseDoGateway}/documento-externo`);

    expect((await lerLink(undefined)).statusCode).toBe(400);
    expect((await lerLink("")).statusCode).toBe(400);
  });

  it("endereço que o gateway não lê vira 404, e NÃO uma proposta vazia", async () => {
    /**
     * §349 §6 — **200 com conteúdo vazio é o mesmo que não achar.**
     *
     * É a régua que mais importa desta rota: uma página vazia virando descrição
     * faria o modelo inventar o desenho inteiro para não devolver nada — e o
     * resultado pareceria importado, com a autoridade de um documento da casa
     * que ninguém escreveu.
     */
    await comDestinoDeLeitura(`${baseDoGateway}/rota-que-nao-existe`);

    const r = await lerLink("https://wiki.invalido/pages/42");

    expect(r.statusCode).toBe(404);
    expect(r.json().erro).toBeTruthy();
  });
});
