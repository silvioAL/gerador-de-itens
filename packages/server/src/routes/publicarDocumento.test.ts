import { eq, sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { resolve } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { criarBancoDeDados, type BancoDeDados } from "../db/client.js";
import { ALVO_CONFLITO_CONFIG, configDocumentos, organizacoes, quebras, times, usuarioTime } from "../db/schema.js";
import { exigirBancoDescartavel, garantirBancoDeTeste, URL_BANCO_DE_TESTE } from "../test-support/bancoDeTeste.js";
import { buildApp } from "../app.js";

/**
 * SPEC-81 fatia B → SPEC-107 G2 — **publicar É a fiação semeada**, contra
 * Postgres de verdade.
 *
 * A rota dedicada morreu; estes testes provam que a fiação
 * `projeto.markdown → conector(documento) → projeto(linkExterno)` cobre cada
 * caso que a rota cobria: o destino certo, a recusa de escolher sozinho, o
 * link gravado na demanda (SPEC-106 C), o §348 do espaço, e as falhas com
 * nome.
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
      target: [...ALVO_CONFLITO_CONFIG],
      set: { documento: { endpoint: "", rotulo: "", cabecalhos: {}, destinos } },
    });
}

const CONFLUENCE = { id: "confluence", operacao: "documento", endpoint: "https://gw.casa/confluence", rotulo: "Confluence" };

beforeAll(async () => {
  exigirBancoDescartavel(DATABASE_URL);
  await garantirBancoDeTeste(DATABASE_URL);
  db = criarBancoDeDados(DATABASE_URL).db;
  await migrate(db, { migrationsFolder: resolve(import.meta.dirname, "../../migrations") });
  app = await buildApp({ db, diretorioConfig: resolve(import.meta.dirname, "../../../../config") });
  await app.ready();
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
    .values({
      titulo: "Busca por SKU",
      diagrama: { nodes: [], edges: [] },
      // O que a fiação publica: a especificação PERSISTIDA (o atalho da tela
      // grava o markdown vivo aqui antes de disparar).
      especificacao: "# Especificação\n\ncorpo",
    })
    .returning({ id: quebras.id });
  idDaQuebra = linha[0].id;
});

async function executarPublicacao(id = "publicar-documento", parametros?: Record<string, Record<string, unknown>>) {
  return app.inject({
    method: "POST",
    url: `/fluxos/${id}/executar`,
    payload: {
      parametrosPorNo: parametros ?? { demanda: { demandaId: idDaQuebra }, publica: { desatualizado: true } },
    },
    cookies: { gerador_sessao: sessao },
  });
}

describe("a fiação de publicação (SPEC-107 G2)", () => {
  it("sem destino de documento, a fiação nem existe — e executá-la responde com o nome", async () => {
    await configurarDestinos([]);
    const emVigor = (await app.inject({ method: "GET", url: "/fluxos" })).json() as { fluxos: { id: string }[] };
    expect(emVigor.fluxos.some((f) => f.id.startsWith("publicar-documento"))).toBe(false);
    expect((await executarPublicacao()).statusCode).toBe(404);
    // E a rota antiga está MORTA.
    const rotaMorta = await app.inject({
      method: "POST",
      url: `/quebras/${idDaQuebra}/documento/publicar`,
      payload: { markdown: "# x" },
      cookies: { gerador_sessao: sessao },
    });
    expect(rotaMorta.statusCode).toBe(404);
  });

  it("com UM destino: publica a especificação da demanda, e o link volta para ela (SPEC-106 C)", async () => {
    await configurarDestinos([CONFLUENCE]);
    fetchFalso.mockResolvedValue(resposta({ linkExterno: "https://wiki/q-1", atualizada: true }));

    const r = await executarPublicacao();
    expect(r.statusCode).toBe(200);
    const corpo = r.json() as { nos: { noId: string; estado: string; erro?: string }[]; saidas: Record<string, Record<string, unknown>> };
    // SPEC-110 A — a derivada começa pelo gatilho (no-op), como as outras.
    expect(corpo.nos.map((n) => [n.noId, n.estado])).toEqual([
      ["gatilho", "sucesso"],
      ["demanda", "sucesso"],
      ["publica", "sucesso"],
      ["grava", "sucesso"],
    ]);
    // O payload leva a identidade da página e o markdown persistido — e o
    // `desatualizado` que o atalho calculou.
    const enviado = JSON.parse(fetchFalso.mock.calls[0][1].body as string) as Record<string, unknown>;
    expect(enviado).toMatchObject({
      demandaId: idDaQuebra,
      demandaTitulo: "Busca por SKU",
      markdown: "# Especificação\n\ncorpo",
      desatualizado: true,
    });
    expect(corpo.saidas["publica"].linkExterno).toBe("https://wiki/q-1");
    expect(corpo.saidas["publica"].atualizada).toBe(true);
    // SPEC-106 C — a demanda LEMBRA onde o documento mora.
    const [linha] = await db.select({ link: quebras.documentoLinkExterno }).from(quebras).where(eq(quebras.id, idDaQuebra));
    expect(linha.link).toBe("https://wiki/q-1");
  });

  it("§348 — o espaço do destino viaja no corpo, como o gateway sempre mandou", async () => {
    await configurarDestinos([{ ...CONFLUENCE, espaco: "ENG" }]);
    fetchFalso.mockResolvedValue(resposta({ linkExterno: "https://wiki/eng/q-1" }));

    await executarPublicacao();
    const enviado = JSON.parse(fetchFalso.mock.calls[0][1].body as string) as Record<string, unknown>;
    expect(enviado.espaco).toBe("ENG");
  });

  it("com MAIS de um destino: uma fiação POR destino, e ninguém escolhe sozinho", async () => {
    await configurarDestinos([
      { ...CONFLUENCE, id: "eng", rotulo: "Wiki eng" },
      { ...CONFLUENCE, id: "prod", rotulo: "Wiki prod" },
    ]);
    const emVigor = (await app.inject({ method: "GET", url: "/fluxos" })).json() as { fluxos: { id: string }[] };
    const daPublicacao = emVigor.fluxos.filter((f) => f.id.startsWith("publicar-documento")).map((f) => f.id);
    expect(daPublicacao.sort()).toEqual(["publicar-documento-eng", "publicar-documento-prod"]);
    // O id "sem sufixo" não existe: o atalho da tela recusa escolher e diz
    // isso à pessoa — publicar no primeiro seria o pior desfecho.
    expect((await executarPublicacao("publicar-documento")).statusCode).toBe(404);

    fetchFalso.mockResolvedValue(resposta({ linkExterno: "https://wiki/prod/q-1" }));
    const explicita = await executarPublicacao("publicar-documento-prod");
    expect(explicita.statusCode).toBe(200);
    expect(String(fetchFalso.mock.calls[0][0])).toBe("https://gw.casa/confluence");
  });

  it("§9.3 — demanda sem especificação gerada: o nó publica barra com o nome do que faltou", async () => {
    await configurarDestinos([CONFLUENCE]);
    await db.update(quebras).set({ especificacao: null }).where(eq(quebras.id, idDaQuebra));

    const r = await executarPublicacao();
    const porNo = Object.fromEntries((r.json() as { nos: { noId: string; estado: string; erro?: string }[] }).nos.map((n) => [n.noId, n]));
    expect(porNo["publica"].estado).toBe("falhou");
    expect(porNo["publica"].erro).toContain('"markdown"');
    // E nada foi mandado nem gravado.
    expect(fetchFalso).not.toHaveBeenCalled();
    const [linha] = await db.select({ link: quebras.documentoLinkExterno }).from(quebras).where(eq(quebras.id, idDaQuebra));
    expect(linha.link).toBeNull();
  });

  it("gateway com HTTP 403: o nó falha com o status, e o grava nem roda", async () => {
    await configurarDestinos([CONFLUENCE]);
    fetchFalso.mockResolvedValue(resposta({ erro: "sem permissão" }, false, 403));

    const r = await executarPublicacao();
    const porNo = Object.fromEntries((r.json() as { nos: { noId: string; estado: string; erro?: string }[] }).nos.map((n) => [n.noId, n]));
    expect(porNo["publica"].estado).toBe("falhou");
    expect(porNo["publica"].erro).toContain("HTTP 403");
    expect(porNo["grava"].estado).toBe("nao-executado");
  });

  it("demanda desconhecida: o nó de projeto falha com o nome dela", async () => {
    await configurarDestinos([CONFLUENCE]);
    const r = await executarPublicacao("publicar-documento", {
      demanda: { demandaId: "00000000-0000-4000-8000-000000000000" },
    });
    const porNo = Object.fromEntries((r.json() as { nos: { noId: string; estado: string; erro?: string }[] }).nos.map((n) => [n.noId, n]));
    expect(porNo["demanda"].estado).toBe("falhou");
    expect(porNo["demanda"].erro).toContain("não conheço a demanda");
  });
});
