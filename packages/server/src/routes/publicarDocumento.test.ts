import { sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { resolve } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { criarBancoDeDados, type BancoDeDados } from "../db/client.js";
import { configDocumentos, organizacoes, quebras, times, usuarioTime } from "../db/schema.js";
import { exigirBancoDescartavel, garantirBancoDeTeste, URL_BANCO_DE_TESTE } from "../test-support/bancoDeTeste.js";
import { buildApp } from "../app.js";

/**
 * SPEC-81 fatia B — **a rota que publica o documento**, contra Postgres de
 * verdade.
 *
 * O que só esta camada prova: que a rota lê a configuração certa, escolhe o
 * destino certo, e — o mais importante — **diz o que fazer quando não dá para
 * escolher**, em vez de escolher sozinha.
 */

const DATABASE_URL = process.env.DATABASE_URL || URL_BANCO_DE_TESTE;

let db: BancoDeDados;
let app: Awaited<ReturnType<typeof buildApp>>;
let sessao: string;
let idDaQuebra: string;
const fetchFalso = vi.fn();

function resposta(corpo: unknown, ok = true, status = 200): Response {
  return { ok, status, json: async () => corpo, text: async () => JSON.stringify(corpo) } as unknown as Response;
}

async function configurarDestinos(destinos: unknown[]) {
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
  // Nível "operar" — a rota exige, como toda escrita numa quebra. Sem isto o
  // teste mediria o portão de permissão em vez da publicação.
  const [org] = await db.select().from(organizacoes).limit(1);
  await db.insert(times).values({ id: "time-publicar", organizacaoId: org.id, nome: "time-publicar" }).onConflictDoNothing();
  await db
    .insert(usuarioTime)
    .values({ email: "publicar@teste.local", timeId: "time-publicar", nivel: "operar" })
    .onConflictDoNothing();

  const login = await app.inject({ method: "POST", url: "/auth/login", payload: { email: "publicar@teste.local" } });
  sessao = String(login.cookies.find((c) => c.name === "gerador_sessao")!.value);
});

afterAll(async () => {
  await app?.close();
});

beforeEach(async () => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", fetchFalso);
  await db.execute(sql`truncate table ${quebras} cascade`);
  await db.execute(sql`delete from ${configDocumentos} where chave = 'exportador'`);
  const linha = await db
    .insert(quebras)
    .values({ titulo: "Busca por SKU", diagrama: { nodes: [], edges: [] } })
    .returning({ id: quebras.id });
  idDaQuebra = linha[0].id;
});

async function publicar(corpo: unknown) {
  return app.inject({
    method: "POST",
    url: `/quebras/${idDaQuebra}/documento/publicar`,
    payload: corpo as never,
    cookies: { gerador_sessao: sessao },
  });
}

describe("POST /quebras/:id/documento/publicar (SPEC-81 fatia B)", () => {
  it("sem destino configurado, a resposta DIZ onde configurar", async () => {
    // Um erro genérico manda a pessoa adivinhar. É a mesma disciplina do §57 e
    // da rota de exportação de itens, que já responde assim.
    const r = await publicar({ markdown: "# doc" });

    expect(r.statusCode).toBe(409);
    expect(r.json().erro).toMatch(/Outros destinos/);
  });

  it("com UM destino, publica e devolve o link", async () => {
    await configurarDestinos([
      { id: "conf", operacao: "documento", endpoint: "https://gw/confluence", rotulo: "Confluence" },
    ]);
    fetchFalso.mockResolvedValue(resposta({ linkExterno: "https://wiki/q-1", atualizada: false }));

    const r = await publicar({ markdown: "# doc", desatualizado: true });

    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({ linkExterno: "https://wiki/q-1", destino: "Confluence" });
    // O payload leva a identidade da página e o estado de frescor — é o que
    // permite o outro lado atualizar no lugar e dizer que envelheceu.
    const enviado = JSON.parse(fetchFalso.mock.calls[0][1].body);
    expect(enviado).toMatchObject({ demandaId: idDaQuebra, demandaTitulo: "Busca por SKU", desatualizado: true });
    expect(enviado.demandaAtualizadaEm).toBeTruthy();
  });

  it("com DOIS destinos e nenhum escolhido, NÃO escolhe sozinha — devolve as opções", async () => {
    /**
     * A decisão mais importante da rota. Publicar no primeiro silenciosamente
     * colocaria a página no espaço errado — o pior desfecho de uma publicação,
     * porque ninguém vai procurar no lugar em que ela foi parar.
     */
    await configurarDestinos([
      { id: "eng", operacao: "documento", endpoint: "https://gw/eng", rotulo: "Confluence Engenharia" },
      { id: "prod", operacao: "documento", endpoint: "https://gw/prod", rotulo: "Confluence Produto" },
    ]);

    const r = await publicar({ markdown: "# doc" });

    expect(r.statusCode).toBe(409);
    expect(r.json().destinos.map((d: { id: string }) => d.id)).toEqual(["eng", "prod"]);
    expect(fetchFalso).not.toHaveBeenCalled();
  });

  it("e com o destino escolhido, publica naquele", async () => {
    await configurarDestinos([
      { id: "eng", operacao: "documento", endpoint: "https://gw/eng", rotulo: "Eng" },
      { id: "prod", operacao: "documento", endpoint: "https://gw/prod", rotulo: "Prod" },
    ]);
    fetchFalso.mockResolvedValue(resposta({ linkExterno: "https://wiki/x" }));

    const r = await publicar({ markdown: "# doc", destinoId: "prod" });

    expect(r.statusCode).toBe(200);
    expect(fetchFalso.mock.calls[0][0]).toBe("https://gw/prod");
  });

  it("destino de OUTRA operação não serve para documento", async () => {
    // O `operacao` é o que torna a lista utilizável: um endereço de ADR não
    // sabe receber um documento, e mandar mesmo assim seria erro do produto.
    await configurarDestinos([{ id: "adr", operacao: "adr", endpoint: "https://gw/adr", rotulo: "ADR" }]);

    expect((await publicar({ markdown: "# doc" })).statusCode).toBe(409);
  });

  it("markdown vazio é 400 — não há documento para publicar", async () => {
    await configurarDestinos([{ id: "c", operacao: "documento", endpoint: "https://gw/c", rotulo: "C" }]);

    expect((await publicar({ markdown: "" })).statusCode).toBe(400);
  });

  it("falha do outro lado é 502, não 500 — muda onde a pessoa procura o problema", async () => {
    await configurarDestinos([{ id: "c", operacao: "documento", endpoint: "https://gw/c", rotulo: "Confluence" }]);
    fetchFalso.mockResolvedValue(resposta({ erro: "sem permissão" }, false, 403));

    const r = await publicar({ markdown: "# doc" });

    expect(r.statusCode).toBe(502);
    expect(r.json().erro).toMatch(/Confluence respondeu HTTP 403/);
  });

  it("quebra que não existe é 404", async () => {
    const r = await app.inject({
      method: "POST",
      url: "/quebras/00000000-0000-0000-0000-000000000000/documento/publicar",
      payload: { markdown: "# doc" } as never,
      cookies: { gerador_sessao: sessao },
    });

    expect(r.statusCode).toBe(404);
  });
});
