import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer, type Server } from "node:http";
import { resolve } from "node:path";
import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import type { FastifyInstance } from "fastify";
import { buildApp } from "./app.js";
import { criarBancoDeDados, type BancoDeDados } from "./db/client.js";
import { credenciaisIa } from "./db/schema.js";
import { exigirBancoDescartavel, garantirBancoDeTeste, URL_BANCO_DE_TESTE } from "./test-support/bancoDeTeste.js";

/**
 * SPEC-54 — a rota real gravando no cofre real (um Infisical FALSO, que fala o
 * mesmo protocolo).
 *
 * Os testes de unidade cobrem o decorator e o adaptador isolados. O que só
 * este prova é a ligação: com `INFISICAL_*` no ambiente, `PUT /ia/credencial`
 * manda a chave para o cofre e **a coluna do banco fica vazia** — que é o
 * pedido inteiro desta SPEC.
 */
const DATABASE_URL = process.env.DATABASE_URL || URL_BANCO_DE_TESTE;

/** Infisical de mentira: guarda em memória e responde o formato da API v3. */
function criarInfisicalFalso() {
  const segredos = new Map<string, string>();
  const servidor: Server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://local");
    const nome = decodeURIComponent(url.pathname.split("/").pop() ?? "");
    let corpo = "";
    req.on("data", (p) => (corpo += p));
    req.on("end", () => {
      const responder = (status: number, json: unknown = {}) => {
        res.writeHead(status, { "content-type": "application/json" });
        res.end(JSON.stringify(json));
      };

      if (url.pathname.endsWith("/auth/universal-auth/login")) {
        return responder(200, { accessToken: "token-de-teste", expiresIn: 3600 });
      }
      if (req.headers.authorization !== "Bearer token-de-teste") return responder(401, { erro: "sem token" });

      if (req.method === "GET") {
        const valor = segredos.get(nome);
        return valor ? responder(200, { secret: { secretValue: valor } }) : responder(404, {});
      }
      if (req.method === "PATCH") {
        // Como o Infisical: atualizar o que não existe é 404, e o adaptador
        // cai no POST.
        if (!segredos.has(nome)) return responder(404, {});
        segredos.set(nome, JSON.parse(corpo).secretValue);
        return responder(200, {});
      }
      if (req.method === "POST") {
        segredos.set(nome, JSON.parse(corpo).secretValue);
        return responder(200, {});
      }
      if (req.method === "DELETE") {
        segredos.delete(nome);
        return responder(200, {});
      }
      return responder(405, {});
    });
  });
  return { servidor, segredos };
}

let app: FastifyInstance;
let db: BancoDeDados;
let infisical: ReturnType<typeof criarInfisicalFalso>;

async function logar(): Promise<string> {
  const r = await app.inject({ method: "POST", url: "/auth/login", payload: { email: "dev@gerador.local" } });
  return String(r.cookies.find((c) => c.name === "gerador_sessao")?.value);
}

beforeAll(async () => {
  exigirBancoDescartavel(DATABASE_URL);
  await garantirBancoDeTeste(DATABASE_URL);
  db = criarBancoDeDados(DATABASE_URL).db;
  await migrate(db, { migrationsFolder: resolve(import.meta.dirname, "../migrations") });

  infisical = criarInfisicalFalso();
  const porta = await new Promise<number>((ok) => {
    infisical.servidor.listen(0, "127.0.0.1", () => {
      ok((infisical.servidor.address() as { port: number }).port);
    });
  });

  process.env.INFISICAL_API_URL = `http://127.0.0.1:${porta}`;
  process.env.INFISICAL_CLIENT_ID = "id-de-teste";
  process.env.INFISICAL_CLIENT_SECRET = "segredo-de-teste";
  process.env.INFISICAL_PROJECT_ID = "projeto-de-teste";
  process.env.INFISICAL_ENV = "test";
  process.env.RATE_LIMIT_LOGIN_MAX = "1000";
  process.env.RATE_LIMIT_GLOBAL_MAX = "10000";

  app = await buildApp({ db, diretorioConfig: resolve(import.meta.dirname, "../../../config") });
});

afterAll(async () => {
  await app?.close();
  await new Promise<void>((ok) => infisical.servidor.close(() => ok()));
  // As variáveis são do PROCESSO: deixá-las de pé faria o próximo arquivo de
  // teste falar com um cofre que já morreu.
  for (const v of [
    "INFISICAL_API_URL",
    "INFISICAL_CLIENT_ID",
    "INFISICAL_CLIENT_SECRET",
    "INFISICAL_PROJECT_ID",
    "INFISICAL_ENV",
  ]) {
    delete process.env[v];
  }
  await db.execute(`truncate table ${'"credenciais_ia"'}`);
});

describe("credencial de IA com cofre ligado (SPEC-54)", () => {
  it("salvar pela rota manda a chave pro COFRE e deixa a coluna do banco vazia", async () => {
    const cookie = await logar();
    const salvou = await app.inject({
      method: "PUT",
      url: "/ia/credencial",
      cookies: { gerador_sessao: cookie },
      payload: { baseUrl: "https://gw.empresa/v1", chave: "sk-do-cofre-123456", modelo: "qwen" },
    });
    expect(salvou.statusCode).toBe(200);

    // No cofre, com o nome que o operador vê na UI dele.
    expect(infisical.segredos.get("GERADOR_IA_GATEWAY")).toBe("sk-do-cofre-123456");

    // E no banco, só configuração — o pedido inteiro desta SPEC.
    const [linha] = await db.select().from(credenciaisIa).where(eq(credenciaisIa.provedorId, "gateway"));
    expect(linha.baseUrl).toBe("https://gw.empresa/v1");
    expect(linha.chave).toBeNull();
  });

  it("o resumo diz CONFIGURADO, mascarado — pelo banco sozinho, diria que não está", async () => {
    const cookie = await logar();
    const resumo = await app.inject({ method: "GET", url: "/ia/credencial", cookies: { gerador_sessao: cookie } });

    expect(resumo.json()).toMatchObject({ configurado: true, baseUrl: "https://gw.empresa/v1", chaveMascarada: "sk-…3456" });
    expect(resumo.body).not.toContain("sk-do-cofre-123456");
  });

  it("salvar de novo SEM a chave (o campo mascarado volta vazio) preserva o segredo — o defeito da §191", async () => {
    const cookie = await logar();
    await app.inject({
      method: "PUT",
      url: "/ia/credencial",
      cookies: { gerador_sessao: cookie },
      payload: { baseUrl: "https://gw.empresa/v2", modelo: "sonnet" },
    });

    expect(infisical.segredos.get("GERADOR_IA_GATEWAY")).toBe("sk-do-cofre-123456");
    const resumo = await app.inject({ method: "GET", url: "/ia/credencial", cookies: { gerador_sessao: cookie } });
    expect(resumo.json()).toMatchObject({ configurado: true, baseUrl: "https://gw.empresa/v2" });
  });

  it("chave que já estava no BANCO migra pro cofre na primeira leitura, e some da coluna", async () => {
    const cookie = await logar();
    // Estado de quem já usava antes desta SPEC: chave em texto plano na tabela.
    infisical.segredos.delete("GERADOR_IA_GATEWAY");
    await db.update(credenciaisIa).set({ chave: "sk-legada-999999" }).where(eq(credenciaisIa.provedorId, "gateway"));

    const resumo = await app.inject({ method: "GET", url: "/ia/credencial", cookies: { gerador_sessao: cookie } });
    expect(resumo.json().configurado).toBe(true);

    expect(infisical.segredos.get("GERADOR_IA_GATEWAY")).toBe("sk-legada-999999");
    const [linha] = await db.select().from(credenciaisIa).where(eq(credenciaisIa.provedorId, "gateway"));
    expect(linha.chave).toBeNull();
  });
});
