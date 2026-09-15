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

/**
 * SPEC-115 fatia E — **a rota responde antes de o envio terminar**, e por isso
 * o teste precisa esperar o BANCO, não a resposta.
 *
 * Não é fragilidade de teste: é a forma do que se está testando. A decisão da
 * SPEC-98 §3.2 foi que o envio é assíncrono, e a prova de que ele funciona é
 * exatamente essa — o desfecho aparece no estado persistido depois, sem ninguém
 * segurando a conexão HTTP.
 */
async function aguardarAte(condicao: () => Promise<boolean>, oQue: string, limiteMs = 3000) {
  const fim = Date.now() + limiteMs;
  while (Date.now() < fim) {
    if (await condicao()) return;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error(`esperei ${limiteMs}ms e ${oQue} não aconteceu`);
}

const itensSalvos = () => criarRepositorioDeItensGeradosEmPostgres(db).listarDaQuebra(idDaQuebra);

async function porChave() {
  return new Map((await itensSalvos()).map((i) => [i.chave, i]));
}

describe("POST /quebras/:id/spec/anexar (SPEC-114)", () => {
  it("sem destino configurado, a resposta DIZ onde configurar", async () => {
    await gerarItem("a");
    const r = await anexar({ itens: [{ chave: "a", conteudo: "# Spec a" }] });

    expect(r.statusCode).toBe(409);
    expect(r.json().erro).toMatch(/Outros destinos/);
  });

  it("com UM destino, aceita o envio e marca specAnexada quando ele termina", async () => {
    await configurarDestinos([{ id: "agente", operacao: "specDoItem", endpoint: "https://gw/spec", rotulo: "Agente" }]);
    await gerarItem("a");
    fetchFalso.mockResolvedValue(resposta({ resultados: [{ chaveExterna: "https://tracker/A" }] }));

    const r = await anexar({ itens: [{ chave: "a", conteudo: "# Spec do item a" }] });

    // SPEC-115 fatia E — 202, e não 200: aceito e EM CURSO. O 200 de antes
    // prometia "terminou", e agora não terminou.
    expect(r.statusCode).toBe(202);
    expect(r.json()).toMatchObject({ destino: "Agente", demonstracao: false });
    expect(r.json().emAndamento).toEqual(["a"]);

    await aguardarAte(async () => (await itensSalvos())[0].specAnexada, "a spec ser marcada como anexada");

    // Cada item manda o SEU conteúdo, com a chaveExterna que a exportação
    // (primeira chamada) já tinha devolvido.
    const enviado = JSON.parse(fetchFalso.mock.calls[0][1].body);
    expect(enviado).toEqual({ itens: [{ chaveExterna: "https://tracker/A", conteudo: "# Spec do item a" }] });

    const [depois] = await itensSalvos();
    expect(depois.specAnexada).toBe(true);
    // Chegou: sai do "indo". Sem isto a tela mostraria o item anexado E
    // anexando ao mesmo tempo, para sempre.
    expect(depois.specEnviadaEm).toBeNull();
    expect(depois.specErro).toBeNull();
  });

  it("o item já está marcado como INDO quando a resposta sai — é o que faz o F5 achar o envio", async () => {
    /**
     * A prova central da fatia E, na camada que importa: o estado é gravado
     * ANTES da chamada ao gateway, então quem recarregar a tela no segundo
     * seguinte encontra o envio em curso em vez de não encontrar rastro nenhum.
     *
     * O `fetch` daqui nunca resolve — é assim que o teste congela o mundo no
     * exato instante em que a pessoa aperta F5.
     */
    await configurarDestinos([{ id: "agente", operacao: "specDoItem", endpoint: "https://gw/spec", rotulo: "Agente" }]);
    await gerarItem("a");
    fetchFalso.mockImplementation(() => new Promise(() => {}));

    const r = await anexar({ itens: [{ chave: "a", conteudo: "# Spec a" }] });

    expect(r.statusCode).toBe(202);
    const [item] = await itensSalvos();
    expect(item.specEnviadaEm).not.toBeNull();
    expect(item.specAnexada).toBe(false);
  });

  /**
   * SPEC-115 fatia D — **o destino que não chama ninguém, pela mesma rota.**
   *
   * Pedido do usuário: *"eu não tenho o endpoint de subidas dos itens acessível
   * ainda aqui, mas precisamos de tela e experiências prontos"*.
   */
  it("destino em modo de demonstração vale SEM endereço, e não toca a rede", async () => {
    await configurarDestinos([
      { id: "demo", operacao: "specDoItem", endpoint: "", rotulo: "Agente de demonstração", demonstracao: true },
    ]);
    await gerarItem("a");

    const r = await anexar({ itens: [{ chave: "a", conteudo: "# Spec a" }] });

    expect(r.statusCode).toBe(202);
    // A resposta CONFESSA o que é — a recusa central da SPEC-115 §2 é o mock se
    // passar pelo comportamento real, e isto é o que a impede de acontecer.
    expect(r.json()).toMatchObject({ demonstracao: true, destino: "Agente de demonstração" });
    expect(r.json().emAndamento).toEqual(["a"]);
    expect(fetchFalso).not.toHaveBeenCalled();

    // O item fica "indo" pelos ~20s do dublê: é exatamente a experiência que a
    // fatia existe para tornar demonstrável antes de haver endereço real.
    const [item] = await itensSalvos();
    expect(item.specEnviadaEm).not.toBeNull();
    expect(item.specAnexada).toBe(false);
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

    expect(r.statusCode).toBe(202);
    expect(r.json().semLinkExterno).toEqual(["a"]);
    expect(r.json().emAndamento).toEqual([]);
    expect(fetchFalso).not.toHaveBeenCalled();
  });

  it("spec com lacuna nem chega a ser enviada — recusa antes da rede", async () => {
    await configurarDestinos([{ id: "agente", operacao: "specDoItem", endpoint: "https://gw/spec", rotulo: "Agente" }]);
    await gerarItem("a");

    const r = await anexar({ itens: [{ chave: "a", conteudo: `# Spec\n_(o que falta)_ ${MARCADOR_ESPECIFICAR}` }] });

    expect(r.statusCode).toBe(202);
    expect(r.json().comLacuna).toEqual(["a"]);
    expect(r.json().emAndamento).toEqual([]);
    expect(fetchFalso).not.toHaveBeenCalled();
    // SPEC-115 — e ele não fica "indo": nunca entrou na fila.
    expect((await itensSalvos())[0].specEnviadaEm).toBeNull();
  });

  it("reenviar depois de anexado manda ZERO itens — reenvio só manda o que falta", async () => {
    await configurarDestinos([{ id: "agente", operacao: "specDoItem", endpoint: "https://gw/spec", rotulo: "Agente" }]);
    await gerarItem("a");
    fetchFalso.mockResolvedValue(resposta({ resultados: [{ chaveExterna: "https://tracker/A" }] }));

    await anexar({ itens: [{ chave: "a", conteudo: "# Spec a" }] });
    // Espera o PRIMEIRO envio terminar: o segundo só pode ser julgado depois de
    // o estado do primeiro estar no banco (é o mesmo que a pessoa faz na tela).
    await aguardarAte(async () => (await itensSalvos())[0].specAnexada, "o primeiro envio terminar");
    fetchFalso.mockClear();

    const segunda = await anexar({ itens: [{ chave: "a", conteudo: "# Spec a" }] });

    expect(segunda.statusCode).toBe(202);
    expect(segunda.json().emAndamento).toEqual([]);
    expect(fetchFalso).not.toHaveBeenCalled();
  });

  it("falha por item, nunca tudo-ou-nada — e o motivo fica PERSISTIDO", async () => {
    /**
     * SPEC-115 fatia E — a diferença em relação à SPEC-114. Antes o erro só
     * existia no corpo da resposta; com o envio assíncrono, a resposta sai
     * antes de o erro acontecer. Se ele não fosse gravado, morreria sem
     * ninguém para lê-lo — e o item ficaria "indo" para sempre.
     */
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
    expect(r.json().emAndamento).toEqual(["a", "b"]);

    await aguardarAte(async () => (await porChave()).get("b")!.specErro !== null, "o erro do item b ser gravado");

    const salvos = await porChave();
    expect(salvos.get("a")!.specAnexada).toBe(true);
    expect(salvos.get("b")!.specAnexada).toBe(false);
    expect(salvos.get("b")!.specErro).toBe("issue arquivada");
    expect(salvos.get("b")!.specEnviadaEm).toBeNull();
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
