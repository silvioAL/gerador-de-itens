import { migrate } from "drizzle-orm/node-postgres/migrator";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { criarBancoDeDados, type BancoDeDados } from "../db/client.js";
import { exigirBancoDescartavel, garantirBancoDeTeste, URL_BANCO_DE_TESTE } from "../test-support/bancoDeTeste.js";
import { buildApp } from "../app.js";
import { fluxoExecucoes } from "../db/schema.js";

/**
 * SPEC-112 fatia A (R4) — **`pulado` não pode virar "falhou" na galeria.**
 *
 * A régua da saúde era "todos os nós com sucesso". Com o nó opcional isso
 * pintaria de vermelho uma jornada perfeitamente saudável: bastava a pessoa
 * não ter pedido o ensaio. O risco estava NOMEADO na SPEC antes de existir —
 * esta prova é o que impede ele de voltar.
 */

const DATABASE_URL = process.env.DATABASE_URL || URL_BANCO_DE_TESTE;
let db: BancoDeDados;
const FLUXO = "com-opcional-e2e";

beforeAll(async () => {
  exigirBancoDescartavel(DATABASE_URL);
  await garantirBancoDeTeste(DATABASE_URL);
  db = criarBancoDeDados(DATABASE_URL).db;
  await migrate(db, { migrationsFolder: resolve(import.meta.dirname, "../../migrations") });
});
afterAll(async () => {
  await db.delete(fluxoExecucoes).where(eq(fluxoExecucoes.fluxoId, FLUXO));
});

type App = Awaited<ReturnType<typeof buildApp>>;

async function comApp<T>(f: (app: App, cookies: Record<string, string>) => Promise<T>): Promise<T> {
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

/** `gatilho → opcional(tela) → funcao`: a linha que o pulado não pode quebrar. */
const DESENHO = {
  id: FLUXO,
  nome: "Com etapa opcional",
  nos: [
    { id: "gatilho", tipo: "gatilho", refId: "manual", posicao: { x: 0, y: 0 }, parametros: {} },
    // Uma TELA como etapa opcional: sem `opcional`, ela suspenderia a execução
    // e a saúde nunca fecharia — é exatamente o caso do ensaio na jornada.
    { id: "ensaio", tipo: "tela", refId: "bancada-de-ensaios", posicao: { x: 200, y: 0 }, parametros: {}, opcional: true },
    { id: "registra", tipo: "funcao", refId: "pdca-feedback", posicao: { x: 400, y: 0 }, parametros: { texto: "ok" } },
  ],
  arestas: [
    { de: "gatilho", para: "ensaio", mapeamento: [] },
    { de: "ensaio", para: "registra", mapeamento: [] },
  ],
};

describe("SPEC-112 A — a etapa opcional na rota", () => {
  it("a execução ATRAVESSA a etapa opcional em vez de suspender nela", async () => {
    await comApp(async (app, cookies) => {
      const salvo = await app.inject({
        method: "PUT",
        url: "/config/fluxos",
        cookies,
        payload: { documento: { fluxos: [DESENHO] } },
      });
      expect(salvo.statusCode).toBe(200);

      const r = await app.inject({ method: "POST", url: `/fluxos/${FLUXO}/executar`, cookies, payload: {} });
      expect(r.statusCode).toBe(200);
      const corpo = r.json() as { estado?: string; nos: { noId: string; estado: string }[]; aguardandoTela?: unknown };

      // Sem `opcional`, uma tela SUSPENDE. Com ele, a corrida passa.
      expect(corpo.aguardandoTela).toBeUndefined();
      expect(corpo.nos.find((n) => n.noId === "ensaio")?.estado).toBe("pulado");
      // E o nó DEPOIS dela rodou: o pulado não derrubou a linha.
      expect(corpo.nos.find((n) => n.noId === "registra")?.estado).toBe("sucesso");
    });
  });

  it("pulado não derruba a saúde do fluxo na galeria (R4)", async () => {
    await comApp(async (app, cookies) => {
      await app.inject({ method: "PUT", url: "/config/fluxos", cookies, payload: { documento: { fluxos: [DESENHO] } } });
      await app.inject({ method: "POST", url: `/fluxos/${FLUXO}/executar`, cookies, payload: {} });

      const saude = await app.inject({ method: "GET", url: "/fluxos/execucoes/ultimas", cookies });
      const { ultimas } = saude.json() as { ultimas: { fluxoId: string; ok: boolean }[] };
      const meu = ultimas.find((u) => u.fluxoId === FLUXO)!;
      expect(meu).toBeDefined();
      // Saudável é "nada falhou e nada ficou por rodar" — pular de propósito
      // não é nenhum dos dois.
      expect(meu.ok).toBe(true);
    });
  });
});
