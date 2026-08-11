import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { eq, sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { resolve } from "node:path";
import { buildApp } from "./app.js";
import { criarBancoDeDados, type BancoDeDados } from "./db/client.js";
import { exigirBancoDescartavel, garantirBancoDeTeste, URL_BANCO_DE_TESTE } from "./test-support/bancoDeTeste.js";
import {
  auditoria,
  CAMPO_GLOBAL,
  camposNo,
  convitesTime,
  credenciaisIa,
  especificacaoTemplates,
  organizacoes,
  papeisAcesso,
  papelPermissao,
  perfisTime,
  quebras,
  times,
  usuarioPapel,
  usuarioTime,
} from "./db/schema.js";

// Banco PRÓPRIO da suíte, nunca o de desenvolvimento — ver
// test-support/bancoDeTeste.ts pro estrago real que motivou isso.
// `||` e não `??`: `DATABASE_URL=` vazia no shell passa pelo `??` e viraria uma
// URL inválida lá na frente, com erro que não aponta pra cá.
const DATABASE_URL = process.env.DATABASE_URL || URL_BANCO_DE_TESTE;

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
  exigirBancoDescartavel(DATABASE_URL);
  await garantirBancoDeTeste(DATABASE_URL);
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
  // `usuarioPapel`/`papelPermissao` PRECISAM entrar aqui: um papel deixado
  // para trás liga o RBAC da organização (SPEC-28 §4.3) e faria todos os
  // outros testes — que assumem o modo aberto — falharem com 403.
  await db.execute(
    sql`truncate table ${quebras}, ${perfisTime}, ${camposNo}, ${convitesTime}, ${auditoria}, ${usuarioPapel}, ${papelPermissao}, ${papeisAcesso}`
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

/**
 * SPEC-31 Fase 3 — configuração no modo hospedado. Estas rotas NÃO EXISTIAM:
 * quem subia o Docker ficava com o default compilado, sem tela nem API.
 */
/**
 * SPEC-31 Fase 4 — as rotas de IA no modo hospedado. NÃO EXISTIAM (§105): o
 * app servido pelo container pedia `/ia/status` e recebia 404, então a esteira
 * de agentes não rodava e a tela não dizia por quê.
 */
describe("/ia/* (SPEC-31 Fase 4)", () => {
  /**
   * Estes casos afirmam o comportamento SEM credencial, então precisam garantir
   * que não há credencial — a suíte de contrato do adaptador grava uma e o
   * último `limpar` dela roda ANTES do último caso, não depois. Mesma lição do
   * template da Fase 3: quem precisa de um estado garante o estado, em vez de
   * combinar ordem entre arquivos.
   */
  beforeAll(async () => {
    await db.execute(sql`truncate table ${credenciaisIa}`);
  });

  it("sem credencial, o status diz que não está pronto em vez de 404", async () => {
    const resposta = await app.inject({ method: "GET", url: "/ia/status" });

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json().pronto).toBe(false);
    expect(resposta.json().provedor).toBe("gateway");
  });

  /**
   * ACHADO REAL, com print da tela: a aba "Modelo de IA" no modo hospedado não
   * mostrava formulário nenhum — só "o modelo de embedding não está instalado,
   * rode `gerador ia instalar`", um comando que não existe em container.
   *
   * A tela renderiza `status.modelosChat`, e eu devolvia lista VAZIA com
   * `embeddingInstalado: false`. Valores honestos ("não tenho modelo local")
   * lidos com a semântica do outro modo. O status do hospedado passa a falar a
   * MESMA forma, em vez de a UI ganhar um `if` por modo.
   */
  it("o status fala a forma que a tela de Modelo de IA espera — um modelo remoto, selecionado", async () => {
    const resposta = await app.inject({ method: "GET", url: "/ia/status" });
    const status = resposta.json();

    expect(status.modelosChat).toHaveLength(1);
    expect(status.modelosChat[0]).toMatchObject({ remoto: true, selecionado: true, id: "gateway" });
    // Não há embedding a instalar aqui — e isso é decisão, não pendência.
    expect(status.embeddingInstalado).toBe(true);
    // Os destinos conhecidos vêm do servidor: a Anthropic tem que estar entre eles.
    expect(status.presetsGateway.some((p: { id: string }) => p.id === "anthropic")).toBe(true);
    expect(status.gateway).toBeTruthy();
  });

  it("sem credencial, /ia/sugerir responde 503 explicando — não 500 nem silêncio", async () => {
    const resposta = await app.inject({
      method: "POST",
      url: "/ia/sugerir",
      payload: { tech: "Backend", rotulo: "timeout", contextoNo: "" },
    });

    expect(resposta.statusCode).toBe(503);
    expect(resposta.json().erro).toContain("credencial");
  });

  /**
   * SPEC-31 Fase 4 (conclusão) — as QUATRO rotas que faltavam existem aqui
   * agora, e recusam entrada inválida com a MESMA mensagem do modo local,
   * porque quem valida é o mesmo montador da camada de aplicação.
   */
  it.each([
    ["/ia/diagrama", {}, "descricao vazia"],
    ["/ia/alterar-item", { itemRotulo: "x", campos: [] }, "nada a propor"],
    ["/ia/sugerir-config", { alvo: "inventado", instrucao: "x" }, "alvo desconhecido"],
    ["/ia/pipeline/po", { itens: [] }, "nenhum item com placeholder"],
  ])("POST %s com entrada inválida é 400 com a mesma mensagem do modo local", async (url, payload, trecho) => {
    const resposta = await app.inject({ method: "POST", url, payload });

    expect(resposta.statusCode).toBe(400);
    expect(resposta.json().erro).toContain(trecho);
  });

  it("com entrada válida mas sem credencial, as quatro respondem 503 explicando", async () => {
    const resposta = await app.inject({
      method: "POST",
      url: "/ia/diagrama",
      payload: { descricao: "um serviço de crédito", tiposDeNo: [{ id: "servico", rotulo: "Serviço" }] },
    });

    expect(resposta.statusCode).toBe(503);
    expect(resposta.json().erro).toContain("credencial");
  });

  /**
   * ACHADO REAL configurando o modo hospedado: a tela testa a credencial ANTES
   * de salvar (é o ponto do botão "Testar"). Minha primeira versão só lia a
   * credencial gravada, então o primeiro teste da vida sempre respondia
   * "nenhuma credencial configurada" com os campos preenchidos na frente.
   */
  it("testar usa a credencial do CORPO — a tela testa antes de salvar", async () => {
    const cookieDev = await logarComo(EMAIL_DEV);

    const resposta = await app.inject({
      method: "POST",
      url: "/ia/credencial/testar",
      cookies: { gerador_sessao: cookieDev },
      payload: { baseUrl: "https://destino-que-nao-existe.invalid/v1", chave: "sk-x", modelo: "m" },
    });

    // Falha de conexão é RESULTADO do teste (HTTP 200 com ok:false), não erro
    // da rota — e o importante: NÃO é o 400 de "nenhuma credencial".
    expect(resposta.statusCode).toBe(200);
    expect(resposta.json().ok).toBe(false);
    expect(resposta.json().erro).toBeTruthy();
  });

  /** A tela não deveria precisar saber que a Anthropic exige `json_schema`
   * (medido contra a API real, não lido na documentação). */
  it("o dialeto de JSON é deduzido da base URL quando o cliente não manda", async () => {
    const cookieDev = await logarComo(EMAIL_DEV);
    await app.inject({
      method: "PUT",
      url: "/ia/credencial",
      cookies: { gerador_sessao: cookieDev },
      payload: { baseUrl: "https://api.anthropic.com/v1", chave: "sk-ant-teste-de-dialeto", modelo: "claude-sonnet-5" },
    });

    const [linha] = await db.select().from(credenciaisIa);
    expect(linha.formatoJson).toBe("json_schema");
  });

  it("PUT da credencial exige sessão", async () => {
    const resposta = await app.inject({
      method: "PUT",
      url: "/ia/credencial",
      payload: { baseUrl: "https://api.anthropic.com/v1", chave: "sk-ant-x", modelo: "claude-sonnet-5" },
    });

    expect(resposta.statusCode).toBe(401);
  });

  /**
   * A regra que existe porque no hospedado a credencial é da ORGANIZAÇÃO e é
   * usada por terceiros: a chave entra e nunca mais volta por HTTP.
   */
  it("a chave NUNCA volta — nem para quem acabou de gravá-la", async () => {
    const cookieDev = await logarComo(EMAIL_DEV);
    const chave = "sk-ant-uma-chave-que-nao-pode-vazar";

    const put = await app.inject({
      method: "PUT",
      url: "/ia/credencial",
      cookies: { gerador_sessao: cookieDev },
      payload: { baseUrl: "https://api.anthropic.com/v1", chave, modelo: "claude-sonnet-5" },
    });
    expect(put.statusCode).toBe(200);
    expect(put.body).not.toContain(chave);
    expect(put.json().chaveMascarada).toBe("sk-…azar");

    const get = await app.inject({ method: "GET", url: "/ia/credencial" });
    expect(get.body).not.toContain(chave);
    expect(get.json().configurado).toBe(true);

    const status = await app.inject({ method: "GET", url: "/ia/status" });
    expect(status.body).not.toContain(chave);
    expect(status.json().pronto).toBe(true);
  });
});

describe("/config/:chave (SPEC-31 Fase 3)", () => {
  it("chave desconhecida é 404 — a lista de configs é fechada", async () => {
    expect((await app.inject({ method: "GET", url: "/config/inventada" })).statusCode).toBe(404);
  });

  it("nunca editada devolve o template desta versão, marcado como não personalizado", async () => {
    const resposta = await app.inject({ method: "GET", url: "/config/pipeline-agentes" });

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json().personalizado).toBe(false);
  });

  it("chave removida do produto é 404, não um documento vazio", async () => {
    // `prompt-unico` saiu junto com a feature (JOURNEY §143). A rota rejeitar a
    // chave é o comportamento certo: linha órfã no banco não deve voltar a ser
    // lida como configuração viva só porque o caminho ainda existe.
    const resposta = await app.inject({ method: "GET", url: "/config/prompt-unico" });
    expect(resposta.statusCode).toBe(404);
  });

  it("PUT grava, carimba e o GET seguinte devolve o documento com o diagnóstico", async () => {
    const cookieDev = await logarComo(EMAIL_DEV);
    const documento = {
      porTech: { Backend: { checklistTecnico: [{ texto: "timeout", contextos: [] }], checklistProcesso: [], testes: [], volumetria: [] } },
    };

    const put = await app.inject({
      method: "PUT",
      url: "/config/regras",
      cookies: { gerador_sessao: cookieDev },
      payload: { documento },
    });
    expect(put.statusCode).toBe(200);

    const get = await app.inject({ method: "GET", url: "/config/regras" });
    expect(get.json().documento).toEqual(documento);
    expect(get.json().personalizado).toBe(true);
    expect(get.json().diagnostico).toHaveProperty("possivelmenteDesatualizada");
  });

  it("PUT sem sessão é rejeitado — ler config é aberto, escrever não", async () => {
    const resposta = await app.inject({ method: "PUT", url: "/config/regras", payload: { documento: { porTech: {} } } });
    expect(resposta.statusCode).toBe(401);
  });

  it("PUT sem `documento` é 400 — corpo torto não apaga a config", async () => {
    const cookieDev = await logarComo(EMAIL_DEV);
    const resposta = await app.inject({
      method: "PUT",
      url: "/config/regras",
      cookies: { gerador_sessao: cookieDev },
      payload: { porTech: {} },
    });
    expect(resposta.statusCode).toBe(400);
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

  /**
   * SPEC-31 Fase 2 — o defeito que a suíte de contrato expôs, visto pela
   * borda: `POST` do mesmo (time, tipoNo, key) fazia `insert` puro contra a
   * restrição `campos_no_chave_unica` e devolvia 500. O modo local, no mesmo
   * gesto, corrigia o campo. Agora os dois corrigem.
   */
  it("salvar o MESMO campo de novo corrige em vez de estourar a restrição única", async () => {
    const cookieDev = await logarComo(EMAIL_DEV);
    const payload = { tipoNo: "cache", key: "ttl", label: "TTL", type: "text" };

    const primeira = await app.inject({ method: "POST", url: "/campos-no", cookies: { gerador_sessao: cookieDev }, payload });
    const segunda = await app.inject({
      method: "POST",
      url: "/campos-no",
      cookies: { gerador_sessao: cookieDev },
      payload: { ...payload, label: "TTL em segundos", ordem: 4 },
    });

    expect(primeira.statusCode).toBe(201);
    expect(segunda.statusCode).toBe(201);
    expect(segunda.json().id).toBe(primeira.json().id);

    const efetivo = await app.inject({ method: "GET", url: "/campos-no" });
    const ttl = efetivo.json().filter((c: { key: string }) => c.key === "ttl");
    expect(ttl).toHaveLength(1);
    expect(ttl[0]).toMatchObject({ label: "TTL em segundos", ordem: 4 });
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
  /**
   * O global vem semeado pela migração, mas depender disso é depender de
   * NENHUM outro arquivo de teste ter tocado na tabela — e a suíte de contrato
   * do adaptador (SPEC-31 Fase 2) trunca de propósito, para começar limpa.
   * Garantir aqui o que este teste precisa é mais barato que combinar ordem
   * entre arquivos.
   */
  const CONTEUDO_GLOBAL = "# {{titulo}}\n\nEspecificação de entrega.";

  beforeAll(async () => {
    await db
      .insert(especificacaoTemplates)
      .values({ timeId: "__global__", conteudo: CONTEUDO_GLOBAL })
      .onConflictDoUpdate({ target: especificacaoTemplates.timeId, set: { conteudo: CONTEUDO_GLOBAL } });
  });

  it("GET sem timeId devolve o global", async () => {
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

describe("SPEC-28 — gestão de acessos", () => {
  /** Cria papel direto no banco: as rotas de administração exigem permissão de
   * `acessos`, e alguém precisa ser o primeiro (o Administrador do onboarding,
   * §4.4). No teste, o banco faz esse papel. */
  async function criarPapel(
    nome: string,
    permissoes: { recurso: string; acao: string }[],
    membros: { email: string; escopoTimeId?: string }[]
  ): Promise<string> {
    const [org] = await db.select().from(organizacoes).limit(1);
    const [papel] = await db.insert(papeisAcesso).values({ organizacaoId: org.id, nome }).returning();
    if (permissoes.length > 0) {
      await db.insert(papelPermissao).values(permissoes.map((p) => ({ papelId: papel.id, ...p })));
    }
    for (const m of membros) {
      await db.insert(usuarioPapel).values({ email: m.email, papelId: papel.id, escopoTimeId: m.escopoTimeId ?? null });
    }
    return papel.id;
  }

  /**
   * Campo GLOBAL por padrão de propósito: `exigirTime` devolve `null` para
   * `__global__`, então o único portão que sobra é a permissão — que é o que
   * estes testes querem medir. Usar um time aqui misturaria os dois 403 (o de
   * "não é do time" e o de "não tem permissão") e o teste passaria pelo
   * motivo errado. Os casos que testam ESCOPO passam `timeId` explícito.
   */
  async function criarCampo(cookie: string, key: string, timeId: string = CAMPO_GLOBAL) {
    return app.inject({
      method: "POST",
      url: "/campos-no",
      cookies: { gerador_sessao: cookie },
      payload: { timeId, tipoNo: "service", key, label: "X", type: "text" },
    });
  }

  /**
   * A TRANCA — o defeito que a revisão da SPEC-28 achou, medido antes de
   * existir a correção: `POST /acessos/papeis` devolvia 201 e o
   * `POST /acessos/papeis/:id/membros` seguinte devolvia 403, deixando a
   * organização sem ninguém capaz de administrar acessos.
   *
   * Nenhum teste via porque todos criam papel e atribuição com `insert` direto
   * (o `criarPapel` acima), sem passar pelo `preHandler` da segunda rota —
   * pulando exatamente a janela onde o produto quebrava.
   */
  it("criar o PRIMEIRO papel não tranca a organização fora de /acessos", async () => {
    const cookie = await logarComo(EMAIL_DEV);

    const criado = await app.inject({
      method: "POST",
      url: "/acessos/papeis",
      cookies: { gerador_sessao: cookie },
      payload: { nome: "Agilidade", permissoes: [{ recurso: "regras.checklistProcesso", acao: "editar" }] },
    });
    expect(criado.statusCode).toBe(201);

    // ANTES da correção: 403. Repare que o papel criado NÃO concede `acessos` —
    // é o caso que a auto-atribuição ingênua não resolveria.
    const atribuir = await app.inject({
      method: "POST",
      url: `/acessos/papeis/${criado.json().id}/membros`,
      cookies: { gerador_sessao: cookie },
      payload: { email: EMAIL_OUTRO },
    });
    expect(atribuir.statusCode).toBe(201);
  });

  it("quem liga o RBAC vira Administrador — e ninguém mais herda isso", async () => {
    await app.inject({
      method: "POST",
      url: "/acessos/papeis",
      cookies: { gerador_sessao: await logarComo(EMAIL_DEV) },
      payload: { nome: "Agilidade", permissoes: [] },
    });

    const minhasDoDev = await app.inject({
      method: "GET",
      url: "/permissoes/minhas",
      cookies: { gerador_sessao: await logarComo(EMAIL_DEV) },
    });
    expect(minhasDoDev.json().porRecurso.acessos).toEqual(["editar"]);

    // A correção dá a chave a QUEM LIGOU, não a todo mundo: o RBAC continua
    // valendo para os demais desde o primeiro instante.
    const minhasDoOutro = await app.inject({
      method: "GET",
      url: "/permissoes/minhas",
      cookies: { gerador_sessao: await logarComo(EMAIL_OUTRO) },
    });
    expect(minhasDoOutro.json()).toMatchObject({ rbacAtivo: true, porRecurso: {} });
  });

  /**
   * O PEDIDO, literalmente: "delegar a gestão de padrões técnicos e checklists
   * de processos a setores específicos". As quatro seções de `regras` moram no
   * MESMO documento, salvo inteiro por `PUT /config/regras` — então a permissão
   * é conferida por diferença, não por rota.
   */
  describe("delegação dentro de `regras` (o documento único com quatro donos)", () => {
    const REGRAS_BASE = {
      tipos: ["Story"],
      tamanhos: ["P"],
      porTech: {
        java: {
          checklistTecnico: [{ texto: "definir pool de conexões", contextos: [] }],
          checklistProcesso: [{ texto: "abrir mudança", contextos: [] }],
          testes: [],
        },
      },
    };

    async function salvarRegras(cookie: string, documento: unknown) {
      return app.inject({
        method: "PUT",
        url: "/config/regras",
        cookies: { gerador_sessao: cookie },
        payload: { documento },
      });
    }

    it("Agilidade edita o checklist de PROCESSO mandando o documento inteiro de volta", async () => {
      await salvarRegras(await logarComo(EMAIL_DEV), REGRAS_BASE); // modo aberto ainda
      await criarPapel("Agilidade", [{ recurso: "regras.checklistProcesso", acao: "editar" }], [
        { email: EMAIL_OUTRO },
      ]);

      const doc = structuredClone(REGRAS_BASE);
      doc.porTech.java.checklistProcesso = [{ texto: "abrir mudança no ServiceNow", contextos: [] }];

      // O ponto: a UI manda o documento COMPLETO. Se a checagem fosse por rota,
      // isto seria 403 por causa do checklist técnico que veio junto, intacto.
      expect((await salvarRegras(await logarComo(EMAIL_OUTRO), doc)).statusCode).toBe(200);
    });

    it("...e leva 403 ao encostar no checklist TÉCNICO, que é de outro setor", async () => {
      await salvarRegras(await logarComo(EMAIL_DEV), REGRAS_BASE);
      await criarPapel("Agilidade", [{ recurso: "regras.checklistProcesso", acao: "editar" }], [
        { email: EMAIL_OUTRO },
      ]);

      const doc = structuredClone(REGRAS_BASE);
      doc.porTech.java.checklistTecnico = [{ texto: "trocar o pool por HikariCP", contextos: [] }];

      const negado = await salvarRegras(await logarComo(EMAIL_OUTRO), doc);
      expect(negado.statusCode).toBe(403);
      expect(negado.json()).toMatchObject({ recurso: "regras.checklistTecnico", acao: "editar" });
    });

    it("reenviar o documento sem mudar nada passa mesmo sem permissão nenhuma", async () => {
      await salvarRegras(await logarComo(EMAIL_DEV), REGRAS_BASE);
      await criarPapel("SoCampos", [{ recurso: "campos-no", acao: "editar" }], [{ email: EMAIL_OUTRO }]);

      // Salvar sem editar não é uma edição. Sem isto, abrir a tela e clicar em
      // salvar por reflexo viraria 403 para quase todo mundo.
      expect((await salvarRegras(await logarComo(EMAIL_OUTRO), REGRAS_BASE)).statusCode).toBe(200);
    });
  });

  it("as rotas que a Fase 1b passou a cobrir negam quem não tem o papel", async () => {
    await criarPapel("SoProcesso", [{ recurso: "regras.checklistProcesso", acao: "editar" }], [
      { email: EMAIL_OUTRO },
    ]);
    const cookie = await logarComo(EMAIL_OUTRO);

    // Sempre o time DE EMAIL_OUTRO (`time-portabilidade`), nunca outro: com um
    // time alheio o 403 viria de `exigirTime` e o teste passaria sem que a
    // permissão tivesse sido consultada — mediria o portão errado. Foi o que
    // aconteceu na primeira versão deste teste.
    const chamadas = [
      ["PUT", `/perfis-time/${TIME_B}`, { tipoNo: "service", valores: {} }, "perfis-time"],
      ["POST", "/campos-aresta", { tipoAresta: "http", key: "x", label: "X", type: "text" }, "campos-aresta"],
      ["PUT", "/especificacao-template", { conteudo: "oi" }, "especificacao-template"],
      ["PUT", "/ia/credencial", { baseUrl: "https://gw/v1", chave: "k", modelo: "m" }, "credenciais-ia"],
      ["POST", `/times/${TIME_B}/membros`, { email: "novo@gerador.local" }, "membros"],
    ] as const;

    // Coletar e comparar de uma vez: `expect` dentro do laço aborta no primeiro
    // erro, e as rotas seguintes nunca seriam exercidas — um teste de cinco
    // rotas que na prática testava uma.
    const obtido = [];
    for (const [method, url, payload] of chamadas) {
      const r = await app.inject({ method, url, cookies: { gerador_sessao: cookie }, payload });
      obtido.push({ url, status: r.statusCode, corpo: r.json() });
    }
    expect(obtido).toEqual(
      chamadas.map(([, url, , recurso]) => ({
        url,
        status: 403,
        corpo: { erro: expect.stringContaining(recurso), recurso, acao: "editar" },
      }))
    );
  });

  it("MIGRAÇÃO: organização sem papel nenhum continua deixando qualquer membro editar", async () => {
    // Se este quebrar, atualizar a versão tranca todos os clientes existentes
    // para fora — o modo de falha que a §4.3 existe para impedir.
    const resposta = await criarCampo(await logarComo(EMAIL_DEV), "modo-aberto");
    expect(resposta.statusCode).toBe(201);
  });

  it("o cenário do usuário: Arquitetura edita campos, Agilidade não — cada uma 403 na área da outra", async () => {
    await criarPapel(
      "Agilidade",
      [
        { recurso: "regras.checklistProcesso", acao: "editar" },
        { recurso: "pipeline-agentes", acao: "editar" },
      ],
      [{ email: EMAIL_OUTRO }]
    );
    await criarPapel("Arquitetura", [{ recurso: "campos-no", acao: "editar" }], [{ email: EMAIL_DEV }]);

    expect((await criarCampo(await logarComo(EMAIL_DEV), "arq-pode")).statusCode).toBe(201);

    const negado = await criarCampo(await logarComo(EMAIL_OUTRO), "agil-nao-pode");
    expect(negado.statusCode).toBe(403);
    expect(negado.json()).toMatchObject({ recurso: "campos-no", acao: "editar" });
  });

  it("o MESMO papel por time: vale no time A e dá 403 no time B", async () => {
    // É a linha "em outra empresa isso ocorre por time" (§4.1) virando teste.
    await criarPapel("Agilidade", [{ recurso: "campos-no", acao: "editar" }], [
      { email: EMAIL_DEV, escopoTimeId: TIME_A },
    ]);
    const cookie = await logarComo(EMAIL_DEV);

    expect((await criarCampo(cookie, "no-time-a", TIME_A)).statusCode).toBe(201);
    expect((await criarCampo(cookie, "no-time-b", TIME_B)).statusCode).toBe(403);
  });

  it("papel de escopo ORGANIZACIONAL cobre qualquer time", async () => {
    await criarPapel("Plataforma", [{ recurso: "campos-no", acao: "editar" }], [{ email: EMAIL_DEV }]);
    const cookie = await logarComo(EMAIL_DEV);

    expect((await criarCampo(cookie, "org-time-a", TIME_A)).statusCode).toBe(201);
    expect((await criarCampo(cookie, "org-time-b", TIME_B)).statusCode).toBe(201);
  });

  it("com RBAC ligado, quem não tem papel nenhum é negado", async () => {
    await criarPapel("Arquitetura", [{ recurso: "campos-no", acao: "editar" }], [{ email: EMAIL_DEV }]);
    expect((await criarCampo(await logarComo(EMAIL_OUTRO), "sem-papel")).statusCode).toBe(403);
  });

  it("`editar` NÃO implica `ler` — as duas são concedidas explicitamente", async () => {
    await criarPapel("SoEditar", [{ recurso: "campos-no", acao: "editar" }], [{ email: EMAIL_DEV }]);
    const minhas = await app.inject({
      method: "GET",
      url: "/permissoes/minhas",
      cookies: { gerador_sessao: await logarComo(EMAIL_DEV) },
    });
    expect(minhas.json().porRecurso["campos-no"]).toEqual(["editar"]);
  });

  it("GET /permissoes/minhas diz se o RBAC está ligado — é o que a UI usa pra esconder botão", async () => {
    const cookie = await logarComo(EMAIL_DEV);
    const antes = await app.inject({ method: "GET", url: "/permissoes/minhas", cookies: { gerador_sessao: cookie } });
    expect(antes.json()).toMatchObject({ rbacAtivo: false });

    await criarPapel("Qualquer", [{ recurso: "quebras", acao: "ler" }], [{ email: EMAIL_DEV }]);
    const depois = await app.inject({ method: "GET", url: "/permissoes/minhas", cookies: { gerador_sessao: cookie } });
    expect(depois.json()).toMatchObject({ rbacAtivo: true, porRecurso: { quebras: ["ler"] } });
  });

  it("administrar acessos exige permissão de `acessos` — sem ela, 403", async () => {
    await criarPapel("Arquitetura", [{ recurso: "campos-no", acao: "editar" }], [{ email: EMAIL_DEV }]);
    const resposta = await app.inject({
      method: "POST",
      url: "/acessos/papeis",
      cookies: { gerador_sessao: await logarComo(EMAIL_DEV) },
      payload: { nome: "Novo", permissoes: [] },
    });
    expect(resposta.statusCode).toBe(403);
  });

  it("quem administra acessos cria papel pela API, e recurso inventado é 400", async () => {
    await criarPapel("Administrador", [{ recurso: "acessos", acao: "editar" }], [{ email: EMAIL_DEV }]);
    const cookie = await logarComo(EMAIL_DEV);

    const criado = await app.inject({
      method: "POST",
      url: "/acessos/papeis",
      cookies: { gerador_sessao: cookie },
      payload: { nome: "Agilidade", permissoes: [{ recurso: "regras.checklistProcesso", acao: "editar" }] },
    });
    expect(criado.statusCode).toBe(201);

    // Recurso fora do enum: rejeitado na porta. Guardar isso viraria permissão
    // que nenhuma rota checa — falha aberta e silenciosa (§4.2).
    const invalido = await app.inject({
      method: "POST",
      url: "/acessos/papeis",
      cookies: { gerador_sessao: cookie },
      payload: { nome: "Inventado", permissoes: [{ recurso: "coisa-que-nao-existe", acao: "editar" }] },
    });
    expect(invalido.statusCode).toBe(400);
  });

  it("apagar papel leva permissões e atribuições junto — nada de permissão órfã autorizando", async () => {
    await criarPapel("Administrador", [{ recurso: "acessos", acao: "editar" }], [{ email: EMAIL_DEV }]);
    const idOutro = await criarPapel(
      "Temporario",
      [{ recurso: "campos-no", acao: "editar" }],
      [{ email: EMAIL_OUTRO }]
    );

    expect((await criarCampo(await logarComo(EMAIL_OUTRO), "antes")).statusCode).toBe(201);

    const apagado = await app.inject({
      method: "DELETE",
      url: "/acessos/papeis/" + idOutro,
      cookies: { gerador_sessao: await logarComo(EMAIL_DEV) },
    });
    expect(apagado.statusCode).toBe(204);

    // O RBAC segue ligado (Administrador existe) e agora EMAIL_OUTRO não tem papel.
    expect((await criarCampo(await logarComo(EMAIL_OUTRO), "depois")).statusCode).toBe(403);
  });
});
