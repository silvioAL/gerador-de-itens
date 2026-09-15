import { migrate } from "drizzle-orm/node-postgres/migrator";
import { resolve } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { criarBancoDeDados, type BancoDeDados } from "../db/client.js";
import { organizacoes, times, usuarioTime } from "../db/schema.js";
import { exigirBancoDescartavel, garantirBancoDeTeste, URL_BANCO_DE_TESTE } from "../test-support/bancoDeTeste.js";
import { buildApp } from "../app.js";

/**
 * SPEC-118 fatia F — **"Testar conexão" para o gateway da casa.**
 *
 * Hoje só a IA tinha. É o par natural do importador de cURL: colou, conferiu,
 * testou — e um endereço errado é descoberto na configuração, não na primeira
 * exportação com trinta itens na mão.
 *
 * O que só esta camada prova é a decisão que a rota toma sobre o resultado:
 * **o teste é do transporte, não da operação**, e por isso um 4xx não é falha.
 */

const DATABASE_URL = process.env.DATABASE_URL || URL_BANCO_DE_TESTE;

let db: BancoDeDados;
let app: Awaited<ReturnType<typeof buildApp>>;
let sessao: string;
let sessaoDeOperador: string;
const fetchFalso = vi.fn();

beforeAll(async () => {
  exigirBancoDescartavel(DATABASE_URL);
  await garantirBancoDeTeste(DATABASE_URL);
  db = criarBancoDeDados(DATABASE_URL).db;
  await migrate(db, { migrationsFolder: resolve(import.meta.dirname, "../../migrations") });
  app = await buildApp({ db, diretorioConfig: resolve(import.meta.dirname, "../../../../config") });
  await app.ready();

  const [org] = await db.select().from(organizacoes).limit(1);
  await db.insert(times).values({ id: "time-testar", organizacaoId: org.id, nome: "time-testar" }).onConflictDoNothing();
  /**
   * `owner`, e não `operar`: testar o gateway usa o servidor para fazer uma
   * chamada de saída, e por isso ele passa pelo MESMO portão de quem edita a
   * configuração do exportador. Quem não pode configurar não pode usar o
   * servidor como oráculo de endereço alheio — é o mesmo cuidado que a rota de
   * testar credencial de IA já tinha.
   */
  /**
   * `onConflictDoUpdate` e não `DoNothing`: o banco de teste SOBREVIVE entre
   * execuções, e `DoNothing` manteria o nível que uma rodada anterior deixou —
   * um teste verde hoje e vermelho amanhã por causa do estado de ontem.
   */
  for (const [email, nivel] of [
    ["testar@teste.local", "owner"],
    ["operador@teste.local", "operar"],
  ] as const) {
    await db
      .insert(usuarioTime)
      .values({ email, timeId: "time-testar", nivel })
      .onConflictDoUpdate({ target: [usuarioTime.email, usuarioTime.timeId], set: { nivel } });
  }

  const login = await app.inject({ method: "POST", url: "/auth/login", payload: { email: "testar@teste.local" } });
  sessao = String(login.cookies.find((c) => c.name === "gerador_sessao")!.value);
  const loginOperador = await app.inject({
    method: "POST",
    url: "/auth/login",
    payload: { email: "operador@teste.local" },
  });
  sessaoDeOperador = String(loginOperador.cookies.find((c) => c.name === "gerador_sessao")!.value);
});

afterAll(async () => {
  await app?.close();
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", fetchFalso);
});

function testar(payload: { endpoint?: string; cabecalhos?: Record<string, string> }) {
  return app.inject({
    method: "POST",
    url: "/config/exportador/testar",
    cookies: { gerador_sessao: sessao },
    payload,
  });
}

describe("POST /config/exportador/testar (SPEC-118 fatia F)", () => {
  it("chama o gateway com CORPO VAZIO — testar não pode criar issue nenhum", async () => {
    /**
     * Resposta da pergunta 3: *"o teste é do transporte, não da operação"*. O
     * medo da pergunta original — testar de verdade criaria lixo no tracker —
     * sai de cena porque ninguém propôs exercitar a operação.
     */
    fetchFalso.mockResolvedValue({ ok: true, status: 200, text: async () => "pong" } as Response);

    const r = await testar({ endpoint: "https://gw.empresa/jira", cabecalhos: { "X-Org": "acme" } });

    expect(r.statusCode).toBe(200);
    const [url, init] = fetchFalso.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://gw.empresa/jira");
    expect(init.method).toBe("POST");
    expect(init.body).toBe("{}");
    expect(init.headers).toMatchObject({ "X-Org": "acme" });
  });

  it("a resposta DIZ o que foi mandado — um “falhou” precisa ser diagnosticável", () => {
    // *"O produto precisa dizer o que está mandando, para que um 'falhou' seja
    // diagnosticável em vez de ser apenas vermelho."*
    fetchFalso.mockResolvedValue({ ok: true, status: 200, text: async () => "" } as Response);

    return testar({ endpoint: "https://gw.empresa/jira" }).then((r) => {
      expect(r.json().oQueMandei).toContain("POST https://gw.empresa/jira");
      expect(r.json().oQueMandei).toContain("corpo vazio");
    });
  });

  it("HTTP 401 é `ok` — alguém ATENDEU, e o problema é a chave, não o endereço", async () => {
    /**
     * A decisão que este teste guarda: o que o teste procura é **silêncio** —
     * DNS que não resolve, porta fechada, timeout. Tratar 401 como falha de
     * conexão mandaria a pessoa conferir o endereço quando o problema é outro.
     */
    fetchFalso.mockResolvedValue({ ok: false, status: 401, text: async () => "token expirado" } as Response);

    const r = await testar({ endpoint: "https://gw.empresa/jira" });

    expect(r.json().ok).toBe(true);
    expect(r.json().status).toBe(401);
    // E o corpo volta recortado: é ele que diz se o 400 é "contrato errado" ou
    // "faltou um campo".
    expect(r.json().amostra).toContain("token expirado");
  });

  it("ninguém atendendo é `ok: false`, com o motivo", async () => {
    fetchFalso.mockRejectedValue(new Error("getaddrinfo ENOTFOUND gw.empresa"));

    const r = await testar({ endpoint: "https://gw.empresa/jira" });

    expect(r.json().ok).toBe(false);
    expect(r.json().erro).toContain("ENOTFOUND");
    // Mesmo na falha, o que foi mandado continua sendo dito.
    expect(r.json().oQueMandei).toContain("POST https://gw.empresa/jira");
  });

  it("endereço vazio ou sem http é recusado ANTES de chamar qualquer coisa", async () => {
    for (const endpoint of ["", "   ", "gw.empresa/jira"]) {
      const r = await testar({ endpoint });
      expect(r.statusCode, endpoint).toBe(400);
    }
    expect(fetchFalso).not.toHaveBeenCalled();
  });

  it("quem não pode CONFIGURAR não pode testar — o mesmo portão da edição", async () => {
    /**
     * A régua vem da rota de testar credencial de IA: *"sem o mesmo portão,
     * quem não pode gravar credencial poderia usar o servidor como oráculo
     * para validar chaves alheias"*. Aqui é o endereço, e vale igual — quem
     * não administra configuração não faz o servidor bater em host nenhum.
     */
    const r = await app.inject({
      method: "POST",
      url: "/config/exportador/testar",
      cookies: { gerador_sessao: sessaoDeOperador },
      payload: { endpoint: "https://gw.empresa/jira" },
    });

    expect(r.statusCode).toBe(403);
    expect(fetchFalso).not.toHaveBeenCalled();
  });

  it("sem sessão, não testa — o servidor não é oráculo de endereço de ninguém", async () => {
    const r = await app.inject({
      method: "POST",
      url: "/config/exportador/testar",
      payload: { endpoint: "https://gw.empresa/jira" },
    });

    expect(r.statusCode).toBe(401);
    expect(fetchFalso).not.toHaveBeenCalled();
  });
});
