import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { eq, sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { resolve } from "node:path";
import { buildApp } from "./app.js";
import { criarBancoDeDados, type BancoDeDados } from "./db/client.js";
import {
  auditoria,
  camposNo,
  convitesTime,
  organizacoes,
  perfisTime,
  quebras,
  times,
  usuarioTime,
} from "./db/schema.js";

const DATABASE_URL = process.env.DATABASE_URL ?? "postgres://gerador:gerador@localhost:5432/gerador";

// Seedados pela migração 0001 (packages/server/migrations/0001_auth_e_campos_no.sql) —
// "dev" pertence aos três times (testa troca de time; "time-checkout" existe só
// pra E2E declarar stack pela primeira vez, sem perfil pré-existente), "outro"
// só a um (testa isolamento).
const EMAIL_DEV = "dev@gerador.local";
const EMAIL_OUTRO = "outro@gerador.local";
const TIME_A = "time-pagamentos";
const TIME_B = "time-portabilidade";
const TIME_C = "time-checkout";

let app: FastifyInstance;
let db: BancoDeDados;

// Só e-mail — login não pede time (SPEC-09, ver routes/auth.ts). A sessão vem
// com todos os times que o e-mail já tem, seja zero, um, ou vários.
async function logarComo(email: string): Promise<string> {
  const resposta = await app.inject({ method: "POST", url: "/auth/login", payload: { email } });
  if (resposta.statusCode !== 200) throw new Error(`login falhou pra ${email}: ${resposta.body}`);
  const cookie = resposta.cookies.find((c) => c.name === "gerador_sessao");
  if (!cookie) throw new Error(`login não emitiu cookie de sessão pra ${email}`);
  return String(cookie.value);
}

// `usuario_time.time_id` agora tem FK pra `times.id` (Fase B.2/SPEC-13) — um
// time de teste precisa existir em `times` antes de qualquer insert direto em
// `usuario_time` pra ele, senão a FK rejeita. Nunca deletado (só criado uma vez
// via onConflictDoNothing), igual às três seeds da migração 0001.
async function garantirTime(timeId: string): Promise<void> {
  const [organizacao] = await db.select().from(organizacoes).limit(1);
  await db.insert(times).values({ id: timeId, organizacaoId: organizacao.id, nome: timeId }).onConflictDoNothing();
}

const DIRETORIO_CONFIG = resolve(import.meta.dirname, "../../../config");

beforeAll(async () => {
  const banco = criarBancoDeDados(DATABASE_URL);
  db = banco.db;
  await migrate(db, { migrationsFolder: resolve(import.meta.dirname, "../migrations") });
  // Alto o bastante pra suíte inteira (dezenas de logins em vários describe)
  // nunca esbarrar nisso à toa — o teste de rate limit de verdade builda a
  // própria instância de app com um limite baixo de propósito (ver describe "rate limit").
  process.env.RATE_LIMIT_LOGIN_MAX = "1000";
  process.env.RATE_LIMIT_GLOBAL_MAX = "10000";
  app = await buildApp({ db, diretorioConfig: DIRETORIO_CONFIG });
});

beforeEach(async () => {
  await db.execute(
    sql`truncate table ${quebras}, ${perfisTime}, ${camposNo}, ${convitesTime}, ${auditoria}`
  );
});

afterAll(async () => {
  await app.close();
});

describe("GET /health", () => {
  it("responde ok", async () => {
    const resposta = await app.inject({ method: "GET", url: "/health" });
    expect(resposta.statusCode).toBe(200);
    expect(resposta.json()).toEqual({ status: "ok" });
  });
});

describe("/auth", () => {
  it("modo dev: login só com e-mail emite sessão com todos os times que ele já tem", async () => {
    const resposta = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: EMAIL_DEV },
    });
    expect(resposta.statusCode).toBe(200);
    const corpo = resposta.json();
    expect(corpo.email).toBe(EMAIL_DEV);
    // arrayContaining, não igualdade exata: EMAIL_DEV também é usado como
    // "primeiro membro" nos describes de convite/administração de time mais
    // abaixo neste arquivo (times de teste isolados) — a sessão dele
    // legitimamente pode ter mais times que só TIME_A/B/C.
    expect(corpo.timeIds).toEqual(expect.arrayContaining([TIME_A, TIME_B, TIME_C]));
    expect(resposta.cookies.some((c) => c.name === "gerador_sessao")).toBe(true);
  });

  it("login não pede nem checa time — a sessão só reflete o que já existe em usuario_time", async () => {
    // EMAIL_OUTRO só pertence a TIME_B (seed da migração 0001) — login continua
    // 200, a sessão simplesmente não inclui TIME_A. Não existe mais um jeito de
    // "pedir" um time no login pra ele ser recusado (SPEC-09: o login não é o
    // lugar de escolher/validar time, só de provar identidade).
    const resposta = await app.inject({ method: "POST", url: "/auth/login", payload: { email: EMAIL_OUTRO } });
    expect(resposta.statusCode).toBe(200);
    expect(resposta.json().timeIds).toEqual([TIME_B]);
  });

  it("GET /auth/modo devolve dev nesta suíte (AUTH_MODE nunca setado pra oidc nos testes) — achado real: LoginScreen não tinha como saber isso antes", async () => {
    const resposta = await app.inject({ method: "GET", url: "/auth/modo" });
    expect(resposta.statusCode).toBe(200);
    expect(resposta.json()).toEqual({ modo: "dev" });
  });

  it("GET /auth/me sem sessão devolve 401; com sessão devolve os claims", async () => {
    const semSessao = await app.inject({ method: "GET", url: "/auth/me" });
    expect(semSessao.statusCode).toBe(401);

    const cookie = await logarComo(EMAIL_DEV);
    const comSessao = await app.inject({ method: "GET", url: "/auth/me", cookies: { gerador_sessao: cookie } });
    expect(comSessao.statusCode).toBe(200);
    const corpo = comSessao.json();
    expect(corpo.email).toBe(EMAIL_DEV);
    expect(corpo.timeIds).toEqual(expect.arrayContaining([TIME_A, TIME_B, TIME_C]));
  });
});

describe("/quebras", () => {
  it("cria, lista e busca uma quebra (exige sessão pra escrever, leitura é aberta)", async () => {
    const cookie = await logarComo(EMAIL_DEV);
    const criar = await app.inject({
      method: "POST",
      url: "/quebras",
      cookies: { gerador_sessao: cookie },
      payload: { titulo: "Aprovação de crédito v2", time: TIME_A, diagrama: { nodes: [], edges: [] } },
    });
    expect(criar.statusCode).toBe(201);
    const criada = criar.json();
    expect(criada.time).toBe(TIME_A);
    expect(criada.titulo).toBe("Aprovação de crédito v2");

    const listar = await app.inject({ method: "GET", url: "/quebras" });
    const lista = listar.json();
    expect(lista).toHaveLength(1);
    expect(lista[0].titulo).toBe("Aprovação de crédito v2");
    expect(lista[0].criadoEm).toEqual(expect.any(String));

    const buscar = await app.inject({ method: "GET", url: `/quebras/${criada.id}` });
    expect(buscar.json().diagrama).toEqual({ nodes: [], edges: [] });
    expect(buscar.json().titulo).toBe("Aprovação de crédito v2");
  });

  it("titulo é opcional na criação (quebra pode existir sem título ainda)", async () => {
    const cookie = await logarComo(EMAIL_DEV);
    const criar = await app.inject({
      method: "POST",
      url: "/quebras",
      cookies: { gerador_sessao: cookie },
      payload: { diagrama: { nodes: [], edges: [] } },
    });
    expect(criar.statusCode).toBe(201);
    expect(criar.json().titulo).toBeNull();
  });

  it("recusa POST sem sessão com 401", async () => {
    const resposta = await app.inject({
      method: "POST",
      url: "/quebras",
      payload: { diagrama: { nodes: [], edges: [] } },
    });
    expect(resposta.statusCode).toBe(401);
  });

  it("rejeita corpo inválido com 400", async () => {
    const cookie = await logarComo(EMAIL_DEV);
    const resposta = await app.inject({
      method: "POST",
      url: "/quebras",
      cookies: { gerador_sessao: cookie },
      payload: { diagrama: "não é objeto" },
    });
    expect(resposta.statusCode).toBe(400);
  });

  it("404 pra quebra inexistente", async () => {
    const resposta = await app.inject({ method: "GET", url: "/quebras/00000000-0000-0000-0000-000000000000" });
    expect(resposta.statusCode).toBe(404);
  });

  it("atualiza uma quebra existente via PUT", async () => {
    const cookie = await logarComo(EMAIL_DEV);
    const criar = await app.inject({
      method: "POST",
      url: "/quebras",
      cookies: { gerador_sessao: cookie },
      payload: { diagrama: { nodes: [], edges: [] } },
    });
    const { id } = criar.json();

    const atualizar = await app.inject({
      method: "PUT",
      url: `/quebras/${id}`,
      cookies: { gerador_sessao: cookie },
      payload: { time: TIME_B, diagrama: { nodes: [], edges: [] } },
    });
    expect(atualizar.statusCode).toBe(200);
    expect(atualizar.json().time).toBe(TIME_B);
  });

  it("deriva uma quebra reaproveitando o mesmo engine do CLI/web", async () => {
    const cookie = await logarComo(EMAIL_DEV);
    const criar = await app.inject({
      method: "POST",
      url: "/quebras",
      cookies: { gerador_sessao: cookie },
      payload: {
        time: TIME_B,
        diagrama: {
          nodes: [
            {
              id: "n1",
              type: "service",
              x: 0,
              y: 0,
              label: "srv-portabilidade",
              status: "novo",
              spec: { nome: { valor: "srv-portabilidade", origem: "manual" } },
              specNA: {},
            },
          ],
          edges: [],
        },
      },
    });
    const { id } = criar.json();

    const derivar = await app.inject({ method: "POST", url: `/quebras/${id}/derivar` });
    expect(derivar.statusCode).toBe(200);
    const resultado = derivar.json();
    expect(resultado.atividades.length).toBeGreaterThan(0);
    expect(resultado.podeDerivar).toBe(true);
  });
});

describe("/perfis-time", () => {
  it("declarar um valor novo (ex.: time trabalha com Java) e ler de volta", async () => {
    const cookie = await logarComo(EMAIL_DEV);
    const salvar = await app.inject({
      method: "PUT",
      url: `/perfis-time/${TIME_A}`,
      cookies: { gerador_sessao: cookie },
      payload: { tipoNo: "service", valores: { linguagem: "Java" } },
    });
    expect(salvar.statusCode).toBe(200);

    const ler = await app.inject({ method: "GET", url: `/perfis-time/${TIME_A}` });
    expect(ler.json()).toEqual({ service: { linguagem: "Java" } });

    const listarTodos = await app.inject({ method: "GET", url: "/perfis-time" });
    expect(listarTodos.json()).toEqual({ [TIME_A]: { service: { linguagem: "Java" } } });
  });

  it("corrigir um valor já existente sobrescreve, não duplica", async () => {
    const cookie = await logarComo(EMAIL_DEV);
    await app.inject({
      method: "PUT",
      url: `/perfis-time/${TIME_A}`,
      cookies: { gerador_sessao: cookie },
      payload: { tipoNo: "service", valores: { linguagem: "Java" } },
    });
    await app.inject({
      method: "PUT",
      url: `/perfis-time/${TIME_A}`,
      cookies: { gerador_sessao: cookie },
      payload: { tipoNo: "service", valores: { linguagem: "Kotlin" } },
    });

    const ler = await app.inject({ method: "GET", url: `/perfis-time/${TIME_A}` });
    expect(ler.json()).toEqual({ service: { linguagem: "Kotlin" } });
  });

  it("401 sem sessão, 403 quando a sessão não pertence ao time do recurso", async () => {
    const semSessao = await app.inject({
      method: "PUT",
      url: `/perfis-time/${TIME_A}`,
      payload: { tipoNo: "service", valores: { linguagem: "Java" } },
    });
    expect(semSessao.statusCode).toBe(401);

    const cookieOutro = await logarComo(EMAIL_OUTRO);
    const outroTime = await app.inject({
      method: "PUT",
      url: `/perfis-time/${TIME_A}`,
      cookies: { gerador_sessao: cookieOutro },
      payload: { tipoNo: "service", valores: { linguagem: "Java" } },
    });
    expect(outroTime.statusCode).toBe(403);
  });
});

describe("/campos-no", () => {
  it("cria campo global (qualquer sessão) e campo de time (só sessão do time), e mescla os dois na leitura", async () => {
    const cookieDev = await logarComo(EMAIL_DEV);

    const global = await app.inject({
      method: "POST",
      url: "/campos-no",
      cookies: { gerador_sessao: cookieDev },
      payload: { tipoNo: "service", key: "linguagem", label: "Linguagem", type: "text" },
    });
    expect(global.statusCode).toBe(201);
    expect(global.json().timeId).toBe("__global__");

    const doTime = await app.inject({
      method: "POST",
      url: "/campos-no",
      cookies: { gerador_sessao: cookieDev },
      payload: { timeId: TIME_A, tipoNo: "service", key: "motorPadrao", label: "Motor padrão", type: "text" },
    });
    expect(doTime.statusCode).toBe(201);

    const efetivo = await app.inject({ method: "GET", url: `/campos-no?timeId=${TIME_A}` });
    const chaves = efetivo.json().map((c: { key: string }) => c.key);
    expect(chaves).toEqual(expect.arrayContaining(["linguagem", "motorPadrao"]));
  });

  it("campo de time sobrescreve campo global de mesma key", async () => {
    const cookieDev = await logarComo(EMAIL_DEV);
    await app.inject({
      method: "POST",
      url: "/campos-no",
      cookies: { gerador_sessao: cookieDev },
      payload: { tipoNo: "service", key: "linguagem", label: "Linguagem (global)", type: "text" },
    });
    await app.inject({
      method: "POST",
      url: "/campos-no",
      cookies: { gerador_sessao: cookieDev },
      payload: { timeId: TIME_A, tipoNo: "service", key: "linguagem", label: "Linguagem (time)", type: "select" },
    });

    const efetivo = await app.inject({ method: "GET", url: `/campos-no?timeId=${TIME_A}` });
    const campo = efetivo.json().find((c: { key: string }) => c.key === "linguagem");
    expect(campo.label).toBe("Linguagem (time)");
    expect(campo.type).toBe("select");
  });

  it("401 sem sessão pra criar campo de time; 403 quando a sessão é de outro time", async () => {
    const semSessao = await app.inject({
      method: "POST",
      url: "/campos-no",
      payload: { timeId: TIME_A, tipoNo: "service", key: "x", label: "X", type: "text" },
    });
    expect(semSessao.statusCode).toBe(401);

    const cookieOutro = await logarComo(EMAIL_OUTRO);
    const outroTime = await app.inject({
      method: "POST",
      url: "/campos-no",
      cookies: { gerador_sessao: cookieOutro },
      payload: { timeId: TIME_A, tipoNo: "service", key: "x", label: "X", type: "text" },
    });
    expect(outroTime.statusCode).toBe(403);
  });

  it("PUT/DELETE de campo de time exigem sessão do mesmo time", async () => {
    const cookieDev = await logarComo(EMAIL_DEV);
    const criar = await app.inject({
      method: "POST",
      url: "/campos-no",
      cookies: { gerador_sessao: cookieDev },
      payload: { timeId: TIME_A, tipoNo: "service", key: "x", label: "X", type: "text" },
    });
    const { id } = criar.json();

    const cookieOutro = await logarComo(EMAIL_OUTRO);
    const putDeOutroTime = await app.inject({
      method: "PUT",
      url: `/campos-no/${id}`,
      cookies: { gerador_sessao: cookieOutro },
      payload: { label: "Renomeado" },
    });
    expect(putDeOutroTime.statusCode).toBe(403);

    const putDoDono = await app.inject({
      method: "PUT",
      url: `/campos-no/${id}`,
      cookies: { gerador_sessao: cookieDev },
      payload: { label: "Renomeado" },
    });
    expect(putDoDono.statusCode).toBe(200);
    expect(putDoDono.json().label).toBe("Renomeado");

    const deleteDeOutroTime = await app.inject({
      method: "DELETE",
      url: `/campos-no/${id}`,
      cookies: { gerador_sessao: cookieOutro },
    });
    expect(deleteDeOutroTime.statusCode).toBe(403);

    const deleteDoDono = await app.inject({
      method: "DELETE",
      url: `/campos-no/${id}`,
      cookies: { gerador_sessao: cookieDev },
    });
    expect(deleteDoDono.statusCode).toBe(204);
  });
});

describe("/especificacao-template (SPEC-14)", () => {
  it("GET sem timeId devolve o global semeado pela migração", async () => {
    const resposta = await app.inject({ method: "GET", url: "/especificacao-template" });
    expect(resposta.json().timeId).toBe("__global__");
    expect(resposta.json().conteudo).toContain("{{titulo}}");
  });

  it("PUT cria override de time e a leitura efetiva (com timeId) passa a devolver o do time", async () => {
    const cookieDev = await logarComo(EMAIL_DEV);

    const put = await app.inject({
      method: "PUT",
      url: "/especificacao-template",
      cookies: { gerador_sessao: cookieDev },
      payload: { timeId: TIME_A, conteudo: "{{titulo}} — molde do time" },
    });
    expect(put.statusCode).toBe(200);
    expect(put.json().timeId).toBe(TIME_A);

    const efetivo = await app.inject({ method: "GET", url: `/especificacao-template?timeId=${TIME_A}` });
    expect(efetivo.json().conteudo).toBe("{{titulo}} — molde do time");

    // outro time sem override próprio continua vendo o global
    const outroEfetivo = await app.inject({ method: "GET", url: `/especificacao-template?timeId=${TIME_B}` });
    expect(outroEfetivo.json().timeId).toBe("__global__");
  });

  it("PUT no mesmo timeId faz upsert — não duplica linha", async () => {
    const cookieDev = await logarComo(EMAIL_DEV);
    await app.inject({
      method: "PUT",
      url: "/especificacao-template",
      cookies: { gerador_sessao: cookieDev },
      payload: { timeId: TIME_C, conteudo: "{{titulo}} v1" },
    });
    const segunda = await app.inject({
      method: "PUT",
      url: "/especificacao-template",
      cookies: { gerador_sessao: cookieDev },
      payload: { timeId: TIME_C, conteudo: "{{titulo}} v2" },
    });
    expect(segunda.statusCode).toBe(200);

    const efetivo = await app.inject({ method: "GET", url: `/especificacao-template?timeId=${TIME_C}` });
    expect(efetivo.json().conteudo).toBe("{{titulo}} v2");
  });

  it("400 quando o template usa variável desconhecida", async () => {
    const cookieDev = await logarComo(EMAIL_DEV);
    const resposta = await app.inject({
      method: "PUT",
      url: "/especificacao-template",
      cookies: { gerador_sessao: cookieDev },
      payload: { timeId: TIME_A, conteudo: "{{titulo}} {{especificacaoTecnica}}" },
    });
    expect(resposta.statusCode).toBe(400);
    expect(resposta.json().erro).toContain("especificacaoTecnica");
  });

  it("401 sem sessão pra salvar override de time; 403 quando a sessão é de outro time", async () => {
    const semSessao = await app.inject({
      method: "PUT",
      url: "/especificacao-template",
      payload: { timeId: TIME_A, conteudo: "{{titulo}}" },
    });
    expect(semSessao.statusCode).toBe(401);

    const cookieOutro = await logarComo(EMAIL_OUTRO);
    const outroTime = await app.inject({
      method: "PUT",
      url: "/especificacao-template",
      cookies: { gerador_sessao: cookieOutro },
      payload: { timeId: TIME_A, conteudo: "{{titulo}}" },
    });
    expect(outroTime.statusCode).toBe(403);
  });
});


/** Poll curto pro insert fire-and-forget de auditoria (auditoria.ts) —
 * a rota já respondeu antes do insert necessariamente terminar. */
async function esperarLinhaAuditoria(condicao: (l: { acao: string; recurso: string; recursoId: string | null }) => boolean) {
  for (let tentativa = 0; tentativa < 20; tentativa++) {
    const linhas = await db.select().from(auditoria);
    const achada = linhas.find(condicao);
    if (achada) return achada;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error("linha de auditoria esperada não apareceu a tempo");
}

describe("/times — criar (correção SPEC-09 §3.3, ver SPEC-13)", () => {
  const TIME_NOVO = "time-teste-criar-bootstrap";

  afterEach(async () => {
    await db.delete(usuarioTime).where(eq(usuarioTime.timeId, TIME_NOVO));
    await db.delete(times).where(eq(times.id, TIME_NOVO));
  });

  it("qualquer sessão cria um time novo, mesmo sem pertencer a nenhum ainda, e a sessão já reflete o time novo", async () => {
    const cookie = await logarComo("sem-time-nenhum@gerador.local");

    const criar = await app.inject({
      method: "POST",
      url: "/times",
      payload: { timeId: TIME_NOVO },
      cookies: { gerador_sessao: cookie },
    });
    expect(criar.statusCode).toBe(201);
    expect(criar.json()).toEqual({ timeId: TIME_NOVO });

    const cookieAtualizado = criar.cookies.find((c) => c.name === "gerador_sessao");
    expect(cookieAtualizado).toBeDefined();
    const me = await app.inject({
      method: "GET",
      url: "/auth/me",
      cookies: { gerador_sessao: String(cookieAtualizado!.value) },
    });
    expect(me.json().timeIds).toEqual([TIME_NOVO]);

    const [linhaTime] = await db.select().from(times).where(eq(times.id, TIME_NOVO));
    expect(linhaTime).toBeDefined();
    expect(linhaTime.organizacaoId).toBeDefined();
  });

  it("409 quando o nome já existe (não deixa reaproveitar time de outra pessoa)", async () => {
    const cookieA = await logarComo("primeiro-dono@gerador.local");
    const primeira = await app.inject({
      method: "POST",
      url: "/times",
      payload: { timeId: TIME_NOVO },
      cookies: { gerador_sessao: cookieA },
    });
    expect(primeira.statusCode).toBe(201);

    const cookieB = await logarComo("segundo-tentando@gerador.local");
    const segunda = await app.inject({
      method: "POST",
      url: "/times",
      payload: { timeId: TIME_NOVO },
      cookies: { gerador_sessao: cookieB },
    });
    expect(segunda.statusCode).toBe(409);
  });

  it("401 sem sessão; 400 com nome de time inválido", async () => {
    const semSessao = await app.inject({ method: "POST", url: "/times", payload: { timeId: TIME_NOVO } });
    expect(semSessao.statusCode).toBe(401);

    const cookie = await logarComo("valida-nome-invalido@gerador.local");
    const nomeInvalido = await app.inject({
      method: "POST",
      url: "/times",
      payload: { timeId: "Time Com Espaço E Maiúscula" },
      cookies: { gerador_sessao: cookie },
    });
    expect(nomeInvalido.statusCode).toBe(400);
  });
});

describe("/times — convites", () => {
  const TIME_CONVITE = "time-teste-convite";

  beforeEach(async () => {
    // Time isolado pra esses testes, sem afetar TIME_A/B/C usados no resto do
    // arquivo — precisa de um primeiro membro pra sequer poder gerar convite.
    await garantirTime(TIME_CONVITE);
    await db.delete(usuarioTime).where(eq(usuarioTime.timeId, TIME_CONVITE));
    await db.insert(usuarioTime).values({ email: EMAIL_DEV, timeId: TIME_CONVITE }).onConflictDoNothing();
  });

  // Sem isso, EMAIL_DEV fica pertencendo a TIME_CONVITE pra sempre (usuario_time
  // não é truncado no beforeEach global, de propósito — é a seed de login, não
  // dado de teste) — a próxima vez que a suíte rodasse, os testes de /auth mais
  // acima veriam esse time "vazado" (achado real: foi exatamente isso que
  // quebrou a asserção exata de timeIds da primeira vez que rodei duas vezes seguidas).
  afterEach(async () => {
    await db.delete(usuarioTime).where(eq(usuarioTime.timeId, TIME_CONVITE));
  });

  it("cria convite (só quem já é do time), aceita (qualquer sessão), e vira membro", async () => {
    const cookieDev = await logarComo(EMAIL_DEV);
    const criar = await app.inject({
      method: "POST",
      url: `/times/${TIME_CONVITE}/convites`,
      cookies: { gerador_sessao: cookieDev },
    });
    expect(criar.statusCode).toBe(201);
    const { token } = criar.json();

    // Pessoa nova: zero times ainda, só prova quem é (login sem timeId).
    const cookieNovo = await logarComo("novo-convidado@gerador.local");
    const meAntes = await app.inject({ method: "GET", url: "/auth/me", cookies: { gerador_sessao: cookieNovo } });
    expect(meAntes.json().timeIds).toEqual([]);

    const aceitar = await app.inject({
      method: "POST",
      url: `/convites/${token}/aceitar`,
      cookies: { gerador_sessao: cookieNovo },
    });
    expect(aceitar.statusCode).toBe(200);
    expect(aceitar.json().timeId).toBe(TIME_CONVITE);

    // A sessão é reemitida na resposta de aceitar — sem isso, o cookie antigo
    // (assinado no login, antes de entrar no time) continuaria valendo com
    // `timeIds` desatualizado até a pessoa logar de novo (achado real, ver times.ts).
    const cookieAtualizado = aceitar.cookies.find((c) => c.name === "gerador_sessao");
    expect(cookieAtualizado).toBeDefined();
    const meDepois = await app.inject({
      method: "GET",
      url: "/auth/me",
      cookies: { gerador_sessao: String(cookieAtualizado!.value) },
    });
    expect(meDepois.json().timeIds).toEqual([TIME_CONVITE]);

    const membros = await app.inject({
      method: "GET",
      url: `/times/${TIME_CONVITE}/membros`,
      cookies: { gerador_sessao: cookieDev },
    });
    expect(membros.json()).toEqual(expect.arrayContaining(["novo-convidado@gerador.local", EMAIL_DEV]));
  });

  it("401 sem sessão pra criar convite; 403 quando a sessão não é do time", async () => {
    const semSessao = await app.inject({ method: "POST", url: `/times/${TIME_CONVITE}/convites` });
    expect(semSessao.statusCode).toBe(401);

    const cookieOutro = await logarComo(EMAIL_OUTRO);
    const outroTime = await app.inject({
      method: "POST",
      url: `/times/${TIME_CONVITE}/convites`,
      cookies: { gerador_sessao: cookieOutro },
    });
    expect(outroTime.statusCode).toBe(403);
  });

  it("convite usado não aceita de novo (410); convite inexistente dá 404; convite expirado dá 410", async () => {
    const cookieDev = await logarComo(EMAIL_DEV);
    const criar = await app.inject({
      method: "POST",
      url: `/times/${TIME_CONVITE}/convites`,
      cookies: { gerador_sessao: cookieDev },
    });
    const { token } = criar.json();

    const cookieA = await logarComo("primeiro-a-aceitar@gerador.local");
    const primeiraVez = await app.inject({
      method: "POST",
      url: `/convites/${token}/aceitar`,
      cookies: { gerador_sessao: cookieA },
    });
    expect(primeiraVez.statusCode).toBe(200);

    const cookieB = await logarComo("segundo-a-tentar@gerador.local");
    const segundaVez = await app.inject({
      method: "POST",
      url: `/convites/${token}/aceitar`,
      cookies: { gerador_sessao: cookieB },
    });
    expect(segundaVez.statusCode).toBe(410);

    const inexistente = await app.inject({
      method: "POST",
      url: "/convites/00000000-0000-0000-0000-000000000000/aceitar",
      cookies: { gerador_sessao: cookieB },
    });
    expect(inexistente.statusCode).toBe(404);

    const [conviteExpirado] = await db
      .insert(convitesTime)
      .values({ timeId: TIME_CONVITE, criadoPor: EMAIL_DEV, expiraEm: new Date(Date.now() - 1000) })
      .returning();
    const expirado = await app.inject({
      method: "POST",
      url: `/convites/${conviteExpirado.token}/aceitar`,
      cookies: { gerador_sessao: cookieB },
    });
    expect(expirado.statusCode).toBe(410);
  });
});

describe("/times — administração de membros", () => {
  const TIME_MEMBROS = "time-teste-membros";

  beforeEach(async () => {
    await garantirTime(TIME_MEMBROS);
    await db.delete(usuarioTime).where(eq(usuarioTime.timeId, TIME_MEMBROS));
    await db.insert(usuarioTime).values({ email: EMAIL_DEV, timeId: TIME_MEMBROS }).onConflictDoNothing();
  });

  afterEach(async () => {
    await db.delete(usuarioTime).where(eq(usuarioTime.timeId, TIME_MEMBROS));
  });

  it("adiciona membro direto por e-mail e depois remove", async () => {
    const cookieDev = await logarComo(EMAIL_DEV);
    const adicionar = await app.inject({
      method: "POST",
      url: `/times/${TIME_MEMBROS}/membros`,
      cookies: { gerador_sessao: cookieDev },
      payload: { email: "adicionado-direto@gerador.local" },
    });
    expect(adicionar.statusCode).toBe(201);

    const listar = await app.inject({
      method: "GET",
      url: `/times/${TIME_MEMBROS}/membros`,
      cookies: { gerador_sessao: cookieDev },
    });
    expect(listar.json()).toEqual(expect.arrayContaining(["adicionado-direto@gerador.local", EMAIL_DEV]));

    const remover = await app.inject({
      method: "DELETE",
      url: `/times/${TIME_MEMBROS}/membros/adicionado-direto@gerador.local`,
      cookies: { gerador_sessao: cookieDev },
    });
    expect(remover.statusCode).toBe(204);

    const listarDepois = await app.inject({
      method: "GET",
      url: `/times/${TIME_MEMBROS}/membros`,
      cookies: { gerador_sessao: cookieDev },
    });
    expect(listarDepois.json()).toEqual([EMAIL_DEV]);
  });

  it("recusa remover o último membro do time", async () => {
    const cookieDev = await logarComo(EMAIL_DEV);
    const remover = await app.inject({
      method: "DELETE",
      url: `/times/${TIME_MEMBROS}/membros/${EMAIL_DEV}`,
      cookies: { gerador_sessao: cookieDev },
    });
    expect(remover.statusCode).toBe(400);
  });

  it("401 sem sessão, 403 quando a sessão é de outro time", async () => {
    const semSessao = await app.inject({ method: "GET", url: `/times/${TIME_MEMBROS}/membros` });
    expect(semSessao.statusCode).toBe(401);

    const cookieOutro = await logarComo(EMAIL_OUTRO);
    const outroTime = await app.inject({
      method: "GET",
      url: `/times/${TIME_MEMBROS}/membros`,
      cookies: { gerador_sessao: cookieOutro },
    });
    expect(outroTime.statusCode).toBe(403);
  });
});

describe("auditoria", () => {
  it("grava quem/quando depois de uma escrita ter sucesso (ex.: perfis-time)", async () => {
    const cookieDev = await logarComo(EMAIL_DEV);
    await app.inject({
      method: "PUT",
      url: `/perfis-time/${TIME_A}`,
      cookies: { gerador_sessao: cookieDev },
      payload: { tipoNo: "service", valores: { linguagem: "Java" } },
    });

    const linha = await esperarLinhaAuditoria(
      (l) => l.recurso === "perfis_time" && l.recursoId === TIME_A && l.acao === "atualizar"
    );
    expect(linha).toMatchObject({ email: EMAIL_DEV, acao: "atualizar", recurso: "perfis_time", recursoId: TIME_A });
  });
});

describe("rate limit do login", () => {
  it("bloqueia com 429 depois do limite configurado — instância de app isolada, limite baixo só pra este teste", async () => {
    const anterior = process.env.RATE_LIMIT_LOGIN_MAX;
    process.env.RATE_LIMIT_LOGIN_MAX = "3";
    const appIsolado = await buildApp({ db, diretorioConfig: DIRETORIO_CONFIG });
    try {
      const respostas = [];
      for (let i = 0; i < 4; i++) {
        respostas.push(await appIsolado.inject({ method: "POST", url: "/auth/login", payload: { email: EMAIL_DEV } }));
      }
      expect(respostas.slice(0, 3).every((r) => r.statusCode === 200)).toBe(true);
      expect(respostas[3].statusCode).toBe(429);
    } finally {
      await appIsolado.close();
      process.env.RATE_LIMIT_LOGIN_MAX = anterior;
    }
  });
});
