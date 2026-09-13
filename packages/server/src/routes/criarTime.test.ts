import { migrate } from "drizzle-orm/node-postgres/migrator";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { criarBancoDeDados, type BancoDeDados } from "../db/client.js";
import { exigirBancoDescartavel, garantirBancoDeTeste, URL_BANCO_DE_TESTE } from "../test-support/bancoDeTeste.js";
import { buildApp } from "../app.js";
import { times, usuarioTime } from "../db/schema.js";
import { idDeTimeAPartirDoNome } from "./times.js";

/**
 * **Criar um time com o nome que a pessoa tem na cabeça.**
 *
 * Relato real, com print: alguém digitou "Consignado Público" no campo que pede
 * "nome do time" e recebeu *"Não foi possível completar a operação."* — o
 * servidor recusou com 400 (o id precisa ser minúsculo, sem espaço e sem
 * acento) e a tela transformou o motivo num genérico.
 *
 * Eram três defeitos empilhados: a tela mandava o nome CRU como id, o servidor
 * exigia de quem digita um nome o formato de uma chave de URL, e o cliente
 * engolia a razão. Estas provas guardam os três.
 */

const DATABASE_URL = process.env.DATABASE_URL || URL_BANCO_DE_TESTE;
let db: BancoDeDados;
const EMAIL = "cria-time@gerador.local";
const IDS = ["consignado-publico", "consignado-publico-2", "ja-existe-e2e"];

beforeAll(async () => {
  exigirBancoDescartavel(DATABASE_URL);
  await garantirBancoDeTeste(DATABASE_URL);
  db = criarBancoDeDados(DATABASE_URL).db;
  await migrate(db, { migrationsFolder: resolve(import.meta.dirname, "../../migrations") });
});

async function limpar() {
  await db.delete(usuarioTime).where(eq(usuarioTime.email, EMAIL));
  await db.delete(times).where(inArray(times.id, IDS));
}
beforeAll(limpar);
afterAll(limpar);

type App = Awaited<ReturnType<typeof buildApp>>;

async function comApp<T>(f: (app: App, cookies: Record<string, string>) => Promise<T>): Promise<T> {
  const app = await buildApp({ db, diretorioConfig: resolve(import.meta.dirname, "../../../../config") });
  await app.ready();
  try {
    const sessao = await app.inject({ method: "POST", url: "/auth/login", payload: { email: EMAIL } });
    const cookies = sessao.cookies.reduce((acc, c) => ({ ...acc, [c.name]: c.value }), {});
    return await f(app, cookies);
  } finally {
    await app.close();
  }
}

describe("o id do time DERIVA do nome", () => {
  it("a derivação tira acento, maiúscula e espaço — e é pura", () => {
    expect(idDeTimeAPartirDoNome("Consignado Público")).toBe("consignado-publico");
    expect(idDeTimeAPartirDoNome("  Squad  Pagamentos  ")).toBe("squad-pagamentos");
    expect(idDeTimeAPartirDoNome("Ação & Reação")).toBe("acao-reacao");
    // Nada aproveitável não vira id vazio disfarçado: vira vazio, e a rota recusa.
    expect(idDeTimeAPartirDoNome("🙂")).toBe("");
  });

  it("“Consignado Público” CRIA o time — o caso do relato", async () => {
    await comApp(async (app, cookies) => {
      const r = await app.inject({ method: "POST", url: "/times", cookies, payload: { nome: "Consignado Público" } });
      expect(r.statusCode).toBe(201);
      expect((r.json() as { timeId: string }).timeId).toBe("consignado-publico");

      // O NOME fica como a pessoa escreveu: o id é endereço, o nome é rótulo.
      const [linha] = await db.select().from(times).where(eq(times.id, "consignado-publico"));
      expect(linha.nome).toBe("Consignado Público");

      // E quem criou é o primeiro owner — senão o time nasceria sem dono.
      const [membro] = await db.select().from(usuarioTime).where(eq(usuarioTime.email, EMAIL));
      expect(membro).toMatchObject({ timeId: "consignado-publico", nivel: "owner" });
    });
  });

  it("um nome sem nada aproveitável é recusado com FRASE, não com dump", async () => {
    await comApp(async (app, cookies) => {
      const r = await app.inject({ method: "POST", url: "/times", cookies, payload: { nome: "🙂" } });
      expect(r.statusCode).toBe(400);
      const erro = (r.json() as { erro: unknown }).erro;
      // O tipo importa: um objeto de validação vira "Não foi possível completar
      // a operação" na tela, que foi a queixa.
      expect(typeof erro).toBe("string");
      expect(erro).toContain("três letras ou números");
    });
  });

  it("nome vazio também recusa nomeando, e não com o dump do validador", async () => {
    await comApp(async (app, cookies) => {
      const r = await app.inject({ method: "POST", url: "/times", cookies, payload: {} });
      expect(r.statusCode).toBe(400);
      expect(typeof (r.json() as { erro: unknown }).erro).toBe("string");
    });
  });

  it("dois nomes que derivam o mesmo endereço: o segundo é recusado com o motivo", async () => {
    await comApp(async (app, cookies) => {
      const primeiro = await app.inject({ method: "POST", url: "/times", cookies, payload: { nome: "Já Existe E2E" } });
      expect(primeiro.statusCode).toBe(201);

      // "já existe e2e" e "Já Existe E2E" derivam o MESMO id — e é aqui que a
      // derivação poderia surpreender, então a recusa precisa ser legível.
      const segundo = await app.inject({ method: "POST", url: "/times", cookies, payload: { nome: "já existe e2e" } });
      expect(segundo.statusCode).toBe(409);
      // A frase nomeia o ENDEREÇO: dois nomes diferentes colidem nele, e
      // mandar procurar "um nome igual" seria mandar procurar o que não há.
      expect((segundo.json() as { erro: string }).erro).toContain('endereço "ja-existe-e2e"');
    });
  });

  /**
   * A régua do caminho de compatibilidade, que eu tinha derrubado sem perceber:
   * aceitar `timeId` SEM validar deixaria "Time Com Espaço" virar id de
   * verdade, quebrando URL e chave de config. Quem manda o id pronto afirma
   * que já o formatou — e precisa provar.
   */
  it("`timeId` mal formatado continua RECUSADO, e a frase diz o formato", async () => {
    await comApp(async (app, cookies) => {
      const r = await app.inject({
        method: "POST",
        url: "/times",
        cookies,
        payload: { timeId: "Time Com Espaço E Maiúscula" },
      });
      expect(r.statusCode).toBe(400);
      const erro = (r.json() as { erro: unknown }).erro;
      expect(typeof erro).toBe("string");
      expect(erro).toContain("letras minúsculas");
    });
  });

  it("quem manda o `timeId` pronto continua funcionando (automação, E2E)", async () => {
    await comApp(async (app, cookies) => {
      const r = await app.inject({
        method: "POST",
        url: "/times",
        cookies,
        payload: { timeId: "consignado-publico-2" },
      });
      expect(r.statusCode).toBe(201);
      expect((r.json() as { timeId: string }).timeId).toBe("consignado-publico-2");
    });
  });
});
