import { sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { resolve } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { MARCADOR_ESPECIFICAR } from "@gerador/engine";
import { criarBancoDeDados, type BancoDeDados } from "../db/client.js";
import { ALVO_CONFLITO_CONFIG, configDocumentos, organizacoes, quebras, times, usuarioTime } from "../db/schema.js";
import { exigirBancoDescartavel, garantirBancoDeTeste, URL_BANCO_DE_TESTE } from "../test-support/bancoDeTeste.js";
import { criarRepositorioDeItensGeradosEmPostgres } from "../adaptadores/itensGeradosEmPostgres.js";
import { buildApp } from "../app.js";

/**
 * SPEC-114 — a rota da SEGUNDA chamada, contra Postgres de verdade.
 *
 * O que só esta camada prova: que a rota lê o destino certo (`specDoItem`,
 * não `itens`), recusa spec com lacuna antes de qualquer chamada de rede, e
 * separa "sem link ainda" de "erro" — a mesma disciplina do `/documento/publicar`.
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

beforeAll(async () => {
  exigirBancoDescartavel(DATABASE_URL);
  await garantirBancoDeTeste(DATABASE_URL);
  db = criarBancoDeDados(DATABASE_URL).db;
  await migrate(db, { migrationsFolder: resolve(import.meta.dirname, "../../migrations") });
  app = await buildApp({ db, diretorioConfig: resolve(import.meta.dirname, "../../../../config") });
  await app.ready();
  const [org] = await db.select().from(organizacoes).limit(1);
  await db.insert(times).values({ id: "time-anexar-spec", organizacaoId: org.id, nome: "time-anexar-spec" }).onConflictDoNothing();
  await db
    .insert(usuarioTime)
    .values({ email: "anexar-spec@teste.local", timeId: "time-anexar-spec", nivel: "operar" })
    .onConflictDoNothing();

  const login = await app.inject({
    method: "POST",
    url: "/auth/login",
    payload: { email: "anexar-spec@teste.local" },
  });
  sessao = String(login.cookies.find((c) => c.name === "gerador_sessao")!.value);
});

afterAll(async () => {
  await app?.close();
});

beforeEach(async () => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", fetchFalso);
  await db.execute(sql`truncate table itens_gerados cascade`);
  await db.execute(sql`truncate table ${quebras} cascade`);
  await db.execute(sql`delete from ${configDocumentos} where chave = 'exportador'`);
  const linha = await db
    .insert(quebras)
    .values({ titulo: "Busca por SKU", diagrama: { nodes: [], edges: [] } })
    .returning({ id: quebras.id });
  idDaQuebra = linha[0].id;
});

/**
 * `substituirDaQuebra` REGENERA o conjunto inteiro — chamá-lo de novo com só
 * o item novo apagaria os anteriores. Por isso lê o que já existe primeiro
 * e substitui pelo conjunto INTEIRO (velhos + novo); a preservação de
 * estado/link/specAnexada por `chave` faz o resto.
 */
async function gerarItem(chave: string, jaExportado = true) {
  const repo = criarRepositorioDeItensGeradosEmPostgres(db);
  const existentes = await repo.listarDaQuebra(idDaQuebra);
  await repo.substituirDaQuebra(idDaQuebra, [
    ...existentes.map((i) => ({
      chave: i.chave,
      titulo: i.titulo,
      tipo: i.tipo,
      tamanho: i.tamanho,
      dependencias: i.dependencias,
      corpoMarkdown: i.corpoMarkdown,
      pendencias: i.pendencias,
      sugestoes: i.sugestoes,
    })),
    {
      chave,
      titulo: `Item ${chave}`,
      tipo: "atomica",
      tamanho: "P",
      dependencias: [],
      corpoMarkdown: "corpo",
      pendencias: 0,
      sugestoes: 0,
    },
  ]);
  if (jaExportado) await repo.marcarExportado(idDaQuebra, chave, `https://tracker/${chave.toUpperCase()}`);
}

async function anexar(corpo: unknown) {
  return app.inject({
    method: "POST",
    url: `/quebras/${idDaQuebra}/spec/anexar`,
    payload: corpo as never,
    cookies: { gerador_sessao: sessao },
  });
}

describe("POST /quebras/:id/spec/anexar (SPEC-114)", () => {
  it("sem destino configurado, a resposta DIZ onde configurar", async () => {
    await gerarItem("a");
    const r = await anexar({ itens: [{ chave: "a", conteudo: "# Spec a" }] });

    expect(r.statusCode).toBe(409);
    expect(r.json().erro).toMatch(/Outros destinos/);
  });

  it("com UM destino, anexa e marca specAnexada", async () => {
    await configurarDestinos([{ id: "agente", operacao: "specDoItem", endpoint: "https://gw/spec", rotulo: "Agente" }]);
    await gerarItem("a");
    fetchFalso.mockResolvedValue(resposta({ resultados: [{ chaveExterna: "https://tracker/A" }] }));

    const r = await anexar({ itens: [{ chave: "a", conteudo: "# Spec do item a" }] });

    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({ destino: "Agente" });
    expect(r.json().anexadas.map((i: { chave: string }) => i.chave)).toEqual(["a"]);

    // Cada item manda o SEU conteúdo, com a chaveExterna que a exportação
    // (primeira chamada) já tinha devolvido.
    const enviado = JSON.parse(fetchFalso.mock.calls[0][1].body);
    expect(enviado).toEqual({ itens: [{ chaveExterna: "https://tracker/A", conteudo: "# Spec do item a" }] });

    const depois = await criarRepositorioDeItensGeradosEmPostgres(db).listarDaQuebra(idDaQuebra);
    expect(depois[0].specAnexada).toBe(true);
  });

  it("destino de OUTRA operação não serve — specDoItem é separado de itens", async () => {
    await configurarDestinos([{ id: "tracker", operacao: "itens", endpoint: "https://gw/itens", rotulo: "Tracker" }]);
    await gerarItem("a");

    expect((await anexar({ itens: [{ chave: "a", conteudo: "# Spec" }] })).statusCode).toBe(409);
    expect(fetchFalso).not.toHaveBeenCalled();
  });

  it("com DOIS destinos e nenhum escolhido, NÃO escolhe sozinha — devolve as opções", async () => {
    await configurarDestinos([
      { id: "eng", operacao: "specDoItem", endpoint: "https://gw/eng", rotulo: "Agente Eng" },
      { id: "prod", operacao: "specDoItem", endpoint: "https://gw/prod", rotulo: "Agente Prod" },
    ]);
    await gerarItem("a");

    const r = await anexar({ itens: [{ chave: "a", conteudo: "# Spec" }] });

    expect(r.statusCode).toBe(409);
    expect(r.json().destinos.map((d: { id: string }) => d.id)).toEqual(["eng", "prod"]);
    expect(fetchFalso).not.toHaveBeenCalled();
  });

  it("item ainda sem linkExterno vira semLinkExterno, não erro — história não subiu ainda", async () => {
    await configurarDestinos([{ id: "agente", operacao: "specDoItem", endpoint: "https://gw/spec", rotulo: "Agente" }]);
    await gerarItem("a", /* jaExportado */ false);

    const r = await anexar({ itens: [{ chave: "a", conteudo: "# Spec" }] });

    expect(r.statusCode).toBe(200);
    expect(r.json().semLinkExterno).toEqual(["a"]);
    expect(r.json().anexadas).toEqual([]);
    expect(fetchFalso).not.toHaveBeenCalled();
  });

  it("spec com lacuna nem chega a ser enviada — recusa antes da rede", async () => {
    await configurarDestinos([{ id: "agente", operacao: "specDoItem", endpoint: "https://gw/spec", rotulo: "Agente" }]);
    await gerarItem("a");

    const r = await anexar({ itens: [{ chave: "a", conteudo: `# Spec\n_(o que falta)_ ${MARCADOR_ESPECIFICAR}` }] });

    expect(r.statusCode).toBe(200);
    expect(r.json().comLacuna).toEqual(["a"]);
    expect(r.json().anexadas).toEqual([]);
    expect(fetchFalso).not.toHaveBeenCalled();
  });

  it("reenviar depois de anexado manda ZERO itens — reenvio só manda o que falta", async () => {
    await configurarDestinos([{ id: "agente", operacao: "specDoItem", endpoint: "https://gw/spec", rotulo: "Agente" }]);
    await gerarItem("a");
    fetchFalso.mockResolvedValue(resposta({ resultados: [{ chaveExterna: "https://tracker/A" }] }));

    await anexar({ itens: [{ chave: "a", conteudo: "# Spec a" }] });
    fetchFalso.mockClear();
    const segunda = await anexar({ itens: [{ chave: "a", conteudo: "# Spec a" }] });

    expect(segunda.statusCode).toBe(200);
    expect(segunda.json().anexadas).toEqual([]);
    expect(fetchFalso).not.toHaveBeenCalled();
  });

  it("falha por item, nunca tudo-ou-nada", async () => {
    await configurarDestinos([{ id: "agente", operacao: "specDoItem", endpoint: "https://gw/spec", rotulo: "Agente" }]);
    await gerarItem("a");
    await gerarItem("b");
    fetchFalso.mockResolvedValue(
      resposta({
        resultados: [
          { chaveExterna: "https://tracker/A" },
          { chaveExterna: "https://tracker/B", erro: "issue arquivada" },
        ],
      })
    );

    const r = await anexar({
      itens: [
        { chave: "a", conteudo: "# Spec a" },
        { chave: "b", conteudo: "# Spec b" },
      ],
    });

    expect(r.json().anexadas.map((i: { chave: string }) => i.chave)).toEqual(["a"]);
    expect(r.json().erros).toEqual([{ chave: "b", erro: "issue arquivada" }]);
  });

  it("lista de itens vazia é 400", async () => {
    await configurarDestinos([{ id: "agente", operacao: "specDoItem", endpoint: "https://gw/spec", rotulo: "Agente" }]);
    expect((await anexar({ itens: [] })).statusCode).toBe(400);
  });

  it("quebra que não existe é 404", async () => {
    const r = await app.inject({
      method: "POST",
      url: "/quebras/00000000-0000-0000-0000-000000000000/spec/anexar",
      payload: { itens: [{ chave: "a", conteudo: "# Spec" }] } as never,
      cookies: { gerador_sessao: sessao },
    });

    expect(r.statusCode).toBe(404);
  });
});
