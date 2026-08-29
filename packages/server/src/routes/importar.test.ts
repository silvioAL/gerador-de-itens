import { sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { resolve } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { criarBancoDeDados, type BancoDeDados } from "../db/client.js";
import { configDocumentos, organizacoes, produtos, quebras, times, usuarioTime } from "../db/schema.js";
import { exigirBancoDescartavel, garantirBancoDeTeste, URL_BANCO_DE_TESTE } from "../test-support/bancoDeTeste.js";
import { buildApp } from "../app.js";

/**
 * SPEC-81 fatias C e F — **as duas rotas de importação, e a régua que as une:
 * importar não é aceitar.**
 *
 * Nenhuma das duas grava. Elas leem do gateway, comparam com o que já existe
 * aqui, e devolvem — a decisão de escrever continua sendo da pessoa, pelo mesmo
 * `PUT` de sempre, com a mesma auditoria.
 *
 * Escrever direto pareceria conveniente e criaria exatamente o problema que as
 * fatias existem para evitar: dado de terceiro entrando sem ninguém ter lido.
 */

const DATABASE_URL = process.env.DATABASE_URL || URL_BANCO_DE_TESTE;

let db: BancoDeDados;
let app: Awaited<ReturnType<typeof buildApp>>;
let sessao: string;
let produtoId: string;
let quebraId: string;
const fetchFalso = vi.fn();

function resposta(corpo: unknown, ok = true, status = 200): Response {
  return { ok, status, json: async () => corpo, text: async () => JSON.stringify(corpo) } as unknown as Response;
}

async function configurarDestino(operacao: string, id = "gw") {
  const destinos = [{ id, operacao, endpoint: `https://gw.casa/${operacao}`, rotulo: `Gateway de ${operacao}` }];
  await db
    .insert(configDocumentos)
    .values({ chave: "exportador", documento: { endpoint: "", rotulo: "", cabecalhos: {}, destinos } })
    .onConflictDoUpdate({
      target: [configDocumentos.chave, configDocumentos.timeId],
      set: { documento: { endpoint: "", rotulo: "", cabecalhos: {}, destinos } },
    });
}

beforeAll(async () => {
  exigirBancoDescartavel(DATABASE_URL);
  await garantirBancoDeTeste(DATABASE_URL);
  db = criarBancoDeDados(DATABASE_URL).db;
  await migrate(db, { migrationsFolder: resolve(import.meta.dirname, "../../migrations") });
  app = await buildApp({ db, diretorioConfig: resolve(import.meta.dirname, "../../../../config") });
  await app.ready();

  const [org] = await db.select().from(organizacoes).limit(1);
  await db.insert(times).values({ id: "time-importar", organizacaoId: org.id, nome: "time-importar" }).onConflictDoNothing();
  await db
    .insert(usuarioTime)
    .values({ email: "importar@teste.local", timeId: "time-importar", nivel: "owner" })
    .onConflictDoNothing();

  const login = await app.inject({ method: "POST", url: "/auth/login", payload: { email: "importar@teste.local" } });
  sessao = String(login.cookies.find((c) => c.name === "gerador_sessao")!.value);
});

afterAll(async () => {
  await app?.close();
});

beforeEach(async () => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", fetchFalso);
  await db.execute(sql`truncate table ${quebras} cascade`);
  await db.execute(sql`truncate table ${produtos} cascade`);
  await db.execute(sql`delete from ${configDocumentos} where chave = 'exportador'`);

  const [org] = await db.select().from(organizacoes).limit(1);
  const p = await db
    .insert(produtos)
    .values({ organizacaoId: org.id, nome: "Catálogo", objetivo: "", criadoPor: "importar@teste.local" })
    .returning({ id: produtos.id });
  produtoId = p[0].id;

  const q = await db
    .insert(quebras)
    .values({ titulo: "Busca por SKU", diagrama: { nodes: [], edges: [] } })
    .returning({ id: quebras.id });
  quebraId = q[0].id;
});

function chamar(url: string) {
  return app.inject({ method: "POST", url, cookies: { gerador_sessao: sessao } });
}

describe("POST /produtos/:id/arquitetura/importar (SPEC-81 fatia F)", () => {
  it("sem destino configurado, a resposta DIZ onde configurar", async () => {
    const r = await chamar(`/produtos/${produtoId}/arquitetura/importar`);

    expect(r.statusCode).toBe(409);
    expect(r.json().erro).toMatch(/Outros destinos/);
  });

  it("devolve a proposta e NÃO grava no produto", async () => {
    /**
     * A régua da fatia. `Produto` não tem onde guardar proveniência, e escrever
     * aqui faria texto de terceiro ficar indistinguível do que alguém desta casa
     * digitou.
     */
    await configurarDestino("arquiteturaDeNegocio");
    fetchFalso.mockResolvedValue(resposta({ objetivo: "Vender no atacado" }));

    const r = await chamar(`/produtos/${produtoId}/arquitetura/importar`);

    expect(r.statusCode).toBe(200);
    expect(r.json().campos).toEqual([
      { campo: "objetivo", atual: "", proposto: "Vender no atacado", situacao: "novo" },
    ]);
    // O produto continua como estava: a rota lê e compara, quem escreve é o PUT.
    const [depois] = await db.select().from(produtos);
    expect(depois.objetivo).toBe("");
  });

  it("gateway sem nada a dizer devolve proposta VAZIA, não erro", async () => {
    // Nem 500 nem 404: o gateway respondeu e não tinha nada. A tela diz isso, e
    // ninguém vai procurar defeito onde não há.
    await configurarDestino("arquiteturaDeNegocio");
    fetchFalso.mockResolvedValue(resposta({ versao: 3 }));

    const r = await chamar(`/produtos/${produtoId}/arquitetura/importar`);

    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({ campos: [], termosNovos: [] });
  });

  it("e diz de ONDE veio — a origem é parte da proposta", async () => {
    await configurarDestino("arquiteturaDeNegocio");
    fetchFalso.mockResolvedValue(resposta({ objetivo: "x" }));

    expect((await chamar(`/produtos/${produtoId}/arquitetura/importar`)).json().origem).toBe(
      "Gateway de arquiteturaDeNegocio"
    );
  });
});

describe("POST /quebras/:id/adr/importar (SPEC-81 fatia C)", () => {
  it("traz os ADRs já marcados como importados", async () => {
    await configurarDestino("adr");
    fetchFalso.mockResolvedValue(
      resposta({ adrs: [{ id: "ADR-14", titulo: "Fila em vez de síncrono", link: "https://adr/14" }] })
    );

    const r = await chamar(`/quebras/${quebraId}/adr/importar`);

    expect(r.statusCode).toBe(200);
    const [primeira] = r.json().decisoes;
    expect(primeira.decisao.origem).toBe("extraido");
    expect(primeira.decisao.importadoDe).toBe("https://adr/14");
  });

  it("as LACUNAS viajam junto — a tela precisa dizer 'esta vem sem o porquê'", () => {
    // Calcular na tela seria reimplementar a mesma conta (§263), e ADR pobre é
    // o caso comum.
    return configurarDestino("adr")
      .then(() => {
        fetchFalso.mockResolvedValue(resposta({ adrs: [{ id: "ADR-1", titulo: "só o título" }] }));
        return chamar(`/quebras/${quebraId}/adr/importar`);
      })
      .then((r) => {
        expect(r.json().decisoes[0].lacunas).toEqual(["contexto", "alternativas", "escolhida", "porque"]);
      });
  });

  it("o que JÁ foi importado não volta na lista", async () => {
    /**
     * Reimportar criaria uma segunda cópia da mesma decisão da casa, com outro
     * id — e a partir daí ninguém sabe qual é a original. `importadoDe` é o
     * campo que torna isso verificável.
     */
    await configurarDestino("adr");
    await db.execute(sql`
      UPDATE ${quebras} SET decisoes = ${JSON.stringify([
        {
          id: "adr:ADR-14",
          titulo: "Fila",
          alternativas: [],
          escolhida: "Fila",
          porque: "x",
          status: "aceita",
          origem: "extraido",
          autor: "ana",
          em: "2026-08-29T10:00:00.000Z",
          importadoDe: "https://adr/14",
        },
      ])}::jsonb WHERE id = ${quebraId}::uuid
    `);
    fetchFalso.mockResolvedValue(
      resposta({
        adrs: [
          { id: "ADR-14", titulo: "Fila", link: "https://adr/14" },
          { id: "ADR-20", titulo: "Cache", link: "https://adr/20" },
        ],
      })
    );

    const r = await chamar(`/quebras/${quebraId}/adr/importar`);

    expect(r.json().decisoes.map((d: { decisao: { importadoDe: string } }) => d.decisao.importadoDe)).toEqual([
      "https://adr/20",
    ]);
  });

  it("a rota NÃO grava — importar não é aceitar", async () => {
    await configurarDestino("adr");
    fetchFalso.mockResolvedValue(resposta({ adrs: [{ id: "ADR-14", titulo: "Fila" }] }));

    await chamar(`/quebras/${quebraId}/adr/importar`);

    const [depois] = await db.select().from(quebras);
    expect(depois.decisoes).toEqual([]);
  });

  it("sem destino de ADR, diz onde configurar", async () => {
    const r = await chamar(`/quebras/${quebraId}/adr/importar`);

    expect(r.statusCode).toBe(409);
    expect(r.json().erro).toMatch(/Outros destinos/);
  });

  it("destino de OUTRA operação não serve", async () => {
    // O `operacao` é o que torna a lista utilizável: um endereço de documento
    // não sabe responder ADR.
    await configurarDestino("documento");

    expect((await chamar(`/quebras/${quebraId}/adr/importar`)).statusCode).toBe(409);
  });
});
