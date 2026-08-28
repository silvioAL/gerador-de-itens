import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { and, eq, sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { resolve } from "node:path";
import { buildApp } from "./app.js";
import { LIMITE_DE_HISTORICO, registrarExecucao, ultimaExecucaoPorPapel } from "./execucoes.js";
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
  credenciaisIa,
  execucoesIa,
  papeisAcesso,
  papelPermissao,
  produtos,
  stacks,
  configDocumentos,
  pdcaFeedback,
  pdcaUsos,
  quebras,
  solicitacoesAjuste,
  timePapel,
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
    // §272 — `configDocumentos` entrou aqui. Ele não era limpo, e config
    // gravada por um teste sobrevivia à execução INTEIRA e à seguinte: o
    // "nunca editada devolve o template" passava na primeira rodada contra um
    // banco novo e falhava na segunda, sem nada ter mudado no produto. Mesma
    // classe do resíduo do §262 — e o mesmo estrago, porque um vermelho que
    // depende de quantas vezes a suíte já rodou ensina a reexecutar em vez de
    // ler.
    sql`truncate table ${quebras}, ${stacks}, ${camposNo}, ${convitesTime}, ${auditoria}, ${usuarioPapel}, ${papelPermissao}, ${papeisAcesso}, ${timePapel}, ${produtos}, ${configDocumentos} cascade`
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

describe("/stacks (SPEC-43 — catálogo global, sem vínculo por time)", () => {
  it("capturar declara uma stack com nome derivado dos valores; sugestões agregam pra todo mundo", async () => {
    const cookie = await logarComo(EMAIL_DEV);
    const captura = await app.inject({
      method: "POST",
      url: "/stacks/capturar",
      cookies: { gerador_sessao: cookie },
      payload: { tipoNo: "service", valores: { linguagem: "Java" } },
    });
    expect(captura.statusCode).toBe(200);
    expect(captura.json().nome).toBe("Java");
    expect(captura.json().tipoNo).toBe("service");

    const sugestoes = (await app.inject({ method: "GET", url: "/stacks/sugestoes" })).json();
    expect(sugestoes.service.linguagem).toContain("Java");

    const catalogo = (await app.inject({ method: "GET", url: "/stacks" })).json();
    expect(catalogo.stacks.some((st: { nome: string }) => st.nome === "Java")).toBe(true);
  });

  it("editar valor sobrescreve na stack, não duplica", async () => {
    const cookie = await logarComo(EMAIL_DEV);
    const criada = (
      await app.inject({ method: "POST", url: "/stacks", cookies: { gerador_sessao: cookie }, payload: { tipoNo: "service", nome: "JVM" } })
    ).json();
    await app.inject({
      method: "PUT", url: `/stacks/${criada.id}/valores`, cookies: { gerador_sessao: cookie },
      payload: { valores: { linguagem: "Java" } },
    });
    await app.inject({
      method: "PUT", url: `/stacks/${criada.id}/valores`, cookies: { gerador_sessao: cookie },
      payload: { valores: { linguagem: "Kotlin" } },
    });

    const catalogo = (await app.inject({ method: "GET", url: "/stacks" })).json();
    const jvm = catalogo.stacks.find((st: { id: string }) => st.id === criada.id);
    expect(jvm.valores).toEqual({ linguagem: "Kotlin" });
  });

  it("401 sem sessão na escrita; leitura é aberta", async () => {
    const semSessao = await app.inject({
      method: "POST",
      url: "/stacks/capturar",
      payload: { tipoNo: "service", valores: { linguagem: "Java" } },
    });
    expect(semSessao.statusCode).toBe(401);

    expect((await app.inject({ method: "GET", url: "/stacks" })).statusCode).toBe(200);
    expect((await app.inject({ method: "GET", url: "/stacks/sugestoes" })).statusCode).toBe(200);
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

  it("achado real (§191): salvar com a chave VAZIA mantém a salva — trocar de modelo não exige redigitar a chave", async () => {
    const cookieDev = await logarComo(EMAIL_DEV);
    await app.inject({
      method: "PUT",
      url: "/ia/credencial",
      cookies: { gerador_sessao: cookieDev },
      payload: { baseUrl: "http://ollama:11434/v1", chave: "qualquer-coisa", modelo: "qwen3:8b" },
    });

    // O fluxo do usuário: o campo de chave fica vazio (placeholder mostra a
    // atual), só o modelo muda. Antes: 400; a chave salva tem que permanecer.
    const troca = await app.inject({
      method: "PUT",
      url: "/ia/credencial",
      cookies: { gerador_sessao: cookieDev },
      payload: { baseUrl: "http://ollama:11434/v1", chave: "", modelo: "qwen2.5:7b" },
    });
    expect(troca.statusCode).toBe(200);
    expect(troca.json().modelo).toBe("qwen2.5:7b");

    const [linha] = await db.select().from(credenciaisIa);
    expect(linha.modelo).toBe("qwen2.5:7b");
    expect(linha.chave).toBe("qualquer-coisa");
  });

  it("chave vazia SEM nenhuma salva é 400 com mensagem legível", async () => {
    await db.delete(credenciaisIa);
    const resposta = await app.inject({
      method: "PUT",
      url: "/ia/credencial",
      cookies: { gerador_sessao: await logarComo(EMAIL_DEV) },
      payload: { baseUrl: "http://ollama:11434/v1", chave: "", modelo: "qwen2.5:7b" },
    });
    expect(resposta.statusCode).toBe(400);
    expect(resposta.json().erro).toContain("informe a chave");
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

  /**
   * SPEC-74 fatia D — com a credencial simulada GRAVADA, o servidor diz que é
   * simulada.
   *
   * Este caminho não podia ser conferido à mão contra a stack de trabalho: a
   * credencial é da organização inteira, e gravá-la ali por cima de um gateway
   * de verdade destruiria a chave de quem estava usando (ela não volta por
   * HTTP, por decisão do §... acima — então não haveria como restaurá-la).
   * Aqui o banco é descartável e a gravação é o próprio teste, que é onde essa
   * conferência deveria morar desde o começo.
   */
  it("credencial que aponta para o dublê chega ao /ia/status marcada como simulada", async () => {
    const cookieDev = await logarComo(EMAIL_DEV);

    const antes = await app.inject({ method: "GET", url: "/ia/status" });
    expect(antes.json().simulado).toBe(false);

    await app.inject({
      method: "PUT",
      url: "/ia/credencial",
      cookies: { gerador_sessao: cookieDev },
      payload: {
        baseUrl: "http://gateway-falso:4123/v1",
        chave: "chave-de-mentira-do-e2e",
        modelo: "modelo-de-mentira",
      },
    });

    const depois = await app.inject({ method: "GET", url: "/ia/status" });
    expect(depois.json().simulado).toBe(true);
    // E continua pronto: o modo sem custo não é um estado degradado, é um
    // destino. A tela desenha tudo, e só acrescenta a marca.
    expect(depois.json().pronto).toBe(true);
  });

  it("e o destino de verdade volta a NÃO ser simulado quando substitui o dublê", async () => {
    // O controle negativo do teste acima. Sem ele, um `simulado: true` fixo
    // passaria nos dois — e marcar como inventado o que veio de um modelo de
    // verdade é o erro caro desta fatia.
    const cookieDev = await logarComo(EMAIL_DEV);

    await app.inject({
      method: "PUT",
      url: "/ia/credencial",
      cookies: { gerador_sessao: cookieDev },
      payload: { baseUrl: "http://gateway-falso:4123/v1", chave: "k", modelo: "modelo-de-mentira" },
    });
    expect((await app.inject({ method: "GET", url: "/ia/status" })).json().simulado).toBe(true);

    await app.inject({
      method: "PUT",
      url: "/ia/credencial",
      cookies: { gerador_sessao: cookieDev },
      payload: { baseUrl: "https://api.anthropic.com/v1", chave: "sk-real", modelo: "claude-sonnet-5" },
    });

    expect((await app.inject({ method: "GET", url: "/ia/status" })).json().simulado).toBe(false);
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
    // O que foi gravado volta intacto…
    expect(get.json().documento).toMatchObject(documento);
    expect(get.json().personalizado).toBe(true);
    expect(get.json().diagnostico).toHaveProperty("possivelmenteDesatualizada");
    // …e as seções que este documento NEM TEM vêm do padrão (§272). É o que
    // conserta a config gravada antes de a seção existir, sem tocar em nada
    // que alguém tenha editado.
    expect(get.json().documento.percursos.length).toBeGreaterThan(0);
  });

  it("§272: seção ESVAZIADA de propósito continua vazia — ausente é uma coisa, zerada é outra", async () => {
    // Sem esta distinção, completar viraria "devolver o que você apagou", que
    // é o oposto da promessa de nunca sobrescrever a edição de ninguém.
    const cookieDev = await logarComo(EMAIL_DEV);
    await app.inject({
      method: "PUT",
      url: "/config/regras",
      cookies: { gerador_sessao: cookieDev },
      payload: { documento: { porTech: {}, percursos: [] } },
    });

    const get = await app.inject({ method: "GET", url: "/config/regras" });

    expect(get.json().documento.percursos).toEqual([]);
    // E o diagnóstico volta a avisar: é a única coisa que ele ainda tem a dizer.
    expect(get.json().diagnostico.possivelmenteDesatualizada).toBe(true);
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
      .onConflictDoUpdate({
        // SPEC-47: a chave natural agora é (timeId, tipo).
        target: [especificacaoTemplates.timeId, especificacaoTemplates.tipo],
        set: { conteudo: CONTEUDO_GLOBAL },
      });
  });

  it("SPEC-47 — o template do ITEM é outro documento, no mesmo lugar: salvar um não pisa no outro", async () => {
    const cookie = await logarComo(EMAIL_DEV);
    const doItem = ["### {{rotulo}}", "", "{{historiaUsuario}}", "", "#### Entrega final", "", "{{entregaFinal}}"].join("\n");

    const salvo = await app.inject({
      method: "PUT",
      url: "/especificacao-template",
      cookies: { gerador_sessao: cookie },
      payload: { conteudo: doItem, tipo: "item" },
    });
    expect(salvo.statusCode).toBe(200);
    expect(salvo.json().tipo).toBe("item");

    const lidoItem = await app.inject({ method: "GET", url: "/especificacao-template?tipo=item" });
    expect(lidoItem.json().conteudo).toContain("{{entregaFinal}}");

    // O do documento continua o que era — dois templates, mesma tabela.
    const lidoDocumento = await app.inject({ method: "GET", url: "/especificacao-template" });
    expect(lidoDocumento.json().conteudo).toContain("{{titulo}}");
    expect(lidoDocumento.json().tipo).toBe("documento");
  });

  it("SPEC-47 — variável inventada no template do item é recusada com a lista do que vale", async () => {
    const resposta = await app.inject({
      method: "PUT",
      url: "/especificacao-template",
      cookies: { gerador_sessao: await logarComo(EMAIL_DEV) },
      payload: { conteudo: "### {{rotulo}} {{naoExiste}}", tipo: "item" },
    });
    expect(resposta.statusCode).toBe(400);
    expect(JSON.stringify(resposta.json())).toContain("naoExiste");
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
      payload: { timeId: TIME_A, conteudo: "{{titulo}} — molde do time\n{{itens}}" },
    });
    expect(put.statusCode).toBe(200);
    expect(put.json().timeId).toBe(TIME_A);

    const efetivo = await app.inject({ method: "GET", url: `/especificacao-template?timeId=${TIME_A}` });
    expect(efetivo.json().conteudo).toBe("{{titulo}} — molde do time\n{{itens}}");

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
      payload: { timeId: TIME_C, conteudo: "{{titulo}} v1\n{{itens}}" },
    });
    const segunda = await app.inject({
      method: "PUT",
      url: "/especificacao-template",
      cookies: { gerador_sessao: cookieDev },
      payload: { timeId: TIME_C, conteudo: "{{titulo}} v2\n{{itens}}" },
    });
    expect(segunda.statusCode).toBe(200);

    const efetivo = await app.inject({ method: "GET", url: `/especificacao-template?timeId=${TIME_C}` });
    expect(efetivo.json().conteudo).toBe("{{titulo}} v2\n{{itens}}");
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
    // Owner, como o criador de um time de verdade seria (SPEC-38).
    await db
      .insert(usuarioTime)
      .values({ email: EMAIL_DEV, timeId: TIME_CONVITE, nivel: "owner" })
      .onConflictDoNothing();
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
    // SPEC-38 — a lista carrega níveis: o convite sem nível explícito entra
    // como `operar` (o default do dia a dia), nunca como owner.
    expect(membros.json()).toEqual(
      expect.arrayContaining([
        { email: "novo-convidado@gerador.local", nivel: "operar" },
        { email: EMAIL_DEV, nivel: "owner" },
      ])
    );
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
    // SPEC-38 — administrar membros virou ato de owner; o primeiro membro dos
    // testes precisa sê-lo (era o poder implícito de todo membro, antes).
    await db
      .insert(usuarioTime)
      .values({ email: EMAIL_DEV, timeId: TIME_MEMBROS, nivel: "owner" })
      .onConflictDoNothing();
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
    expect(listar.json()).toEqual(
      expect.arrayContaining([
        { email: "adicionado-direto@gerador.local", nivel: "operar" },
        { email: EMAIL_DEV, nivel: "owner" },
      ])
    );

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
    expect(listarDepois.json()).toEqual([{ email: EMAIL_DEV, nivel: "owner" }]);
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

describe("SPEC-38 Fase 1 — níveis de participação no time", () => {
  const TIME_NIVEIS = "time-teste-niveis";
  const EMAIL_OPERAR = "operar@gerador.local";
  const EMAIL_VISUALIZAR = "visualizar@gerador.local";

  beforeEach(async () => {
    await garantirTime(TIME_NIVEIS);
    await db.delete(usuarioTime).where(eq(usuarioTime.timeId, TIME_NIVEIS));
    await db.insert(usuarioTime).values([
      { email: EMAIL_DEV, timeId: TIME_NIVEIS, nivel: "owner" },
      { email: EMAIL_OPERAR, timeId: TIME_NIVEIS, nivel: "operar" },
      { email: EMAIL_VISUALIZAR, timeId: TIME_NIVEIS, nivel: "visualizar" },
    ]);
  });

  afterEach(async () => {
    await db.delete(usuarioTime).where(eq(usuarioTime.timeId, TIME_NIVEIS));
  });

  it("convite tem TETO: operar não convida owner (403), e o aceite entra com o nível do convite", async () => {
    const cookieOperar = await logarComo(EMAIL_OPERAR);

    // Acima do próprio nível: 403, não clamp — rebaixar em silêncio seria
    // surpresa pra quem convidou E pra quem aceitou.
    const acimaDoTeto = await app.inject({
      method: "POST",
      url: `/times/${TIME_NIVEIS}/convites`,
      cookies: { gerador_sessao: cookieOperar },
      payload: { nivel: "owner" },
    });
    expect(acimaDoTeto.statusCode).toBe(403);

    const dentroDoTeto = await app.inject({
      method: "POST",
      url: `/times/${TIME_NIVEIS}/convites`,
      cookies: { gerador_sessao: cookieOperar },
      payload: { nivel: "visualizar" },
    });
    expect(dentroDoTeto.statusCode).toBe(201);

    const cookieNovo = await logarComo("convidado-visualizar@gerador.local");
    const aceitar = await app.inject({
      method: "POST",
      url: `/convites/${dentroDoTeto.json().token}/aceitar`,
      cookies: { gerador_sessao: cookieNovo },
    });
    expect(aceitar.statusCode).toBe(200);

    const membros = await app.inject({
      method: "GET",
      url: `/times/${TIME_NIVEIS}/membros`,
      cookies: { gerador_sessao: await logarComo(EMAIL_DEV) },
    });
    expect(membros.json()).toEqual(
      expect.arrayContaining([{ email: "convidado-visualizar@gerador.local", nivel: "visualizar" }])
    );
    // Limpeza do vazamento (usuario_time não é truncado entre testes).
    await db.delete(usuarioTime).where(eq(usuarioTime.email, "convidado-visualizar@gerador.local"));
  });

  it("escrita de quebra exige `operar`: visualizar leva 403, operar grava", async () => {
    const quebraDoTime = { time: TIME_NIVEIS, diagrama: { nodes: [], edges: [] } };

    const negado = await app.inject({
      method: "POST",
      url: "/quebras",
      cookies: { gerador_sessao: await logarComo(EMAIL_VISUALIZAR) },
      payload: quebraDoTime,
    });
    expect(negado.statusCode).toBe(403);
    expect(negado.json().nivelExigido).toBe("operar");

    // Quebra SEM time também não escapa: vale o MAIOR nível da pessoa, e quem
    // é visualizar em tudo não opera em lugar nenhum.
    const semTime = await app.inject({
      method: "POST",
      url: "/quebras",
      cookies: { gerador_sessao: await logarComo(EMAIL_VISUALIZAR) },
      payload: { diagrama: { nodes: [], edges: [] } },
    });
    expect(semTime.statusCode).toBe(403);

    const criado = await app.inject({
      method: "POST",
      url: "/quebras",
      cookies: { gerador_sessao: await logarComo(EMAIL_OPERAR) },
      payload: quebraDoTime,
    });
    expect(criado.statusCode).toBe(201);

    const editado = await app.inject({
      method: "PUT",
      url: `/quebras/${criado.json().id}`,
      cookies: { gerador_sessao: await logarComo(EMAIL_VISUALIZAR) },
      payload: quebraDoTime,
    });
    expect(editado.statusCode).toBe(403);
  });

  it("configuração é ato de OWNER (D3): operar leva 403 mesmo com RBAC desligado; owner grava", async () => {
    const payload = { tipoNo: "service", valores: { linguagem: "Kotlin" } };

    const negado = await app.inject({
      method: "POST",
      url: "/stacks/capturar",
      cookies: { gerador_sessao: await logarComo(EMAIL_OPERAR) },
      payload,
    });
    expect(negado.statusCode).toBe(403);

    const gravado = await app.inject({
      method: "POST",
      url: "/stacks/capturar",
      cookies: { gerador_sessao: await logarComo(EMAIL_DEV) },
      payload,
    });
    expect(gravado.statusCode).toBe(200);
  });

  it("regras (o documento por diferença) também exige owner sem RBAC — o caminho de `primeiroRecursoNegado`", async () => {
    const base = {
      tipos: ["Story"],
      tamanhos: ["P"],
      porTech: { java: { checklistProcesso: [{ texto: "abrir mudança", contextos: [] }] } },
    };
    const salvar = (cookie: string, documento: unknown) =>
      app.inject({ method: "PUT", url: "/config/regras", cookies: { gerador_sessao: cookie }, payload: { documento } });

    expect((await salvar(await logarComo(EMAIL_DEV), base)).statusCode).toBe(200);

    const doc = structuredClone(base);
    doc.porTech.java.checklistProcesso = [{ texto: "abrir mudança no ServiceNow", contextos: [] }];
    expect((await salvar(await logarComo(EMAIL_OPERAR), doc)).statusCode).toBe(403);
    expect((await salvar(await logarComo(EMAIL_DEV), doc)).statusCode).toBe(200);
  });

  it("mudar nível é ato de owner; rebaixar o último owner é 400", async () => {
    // Operar não muda nível de ninguém.
    const negado = await app.inject({
      method: "PUT",
      url: `/times/${TIME_NIVEIS}/membros/${EMAIL_VISUALIZAR}/nivel`,
      cookies: { gerador_sessao: await logarComo(EMAIL_OPERAR) },
      payload: { nivel: "operar" },
    });
    expect(negado.statusCode).toBe(403);

    // Owner promove; o promovido aparece com o nível novo.
    const cookieDev = await logarComo(EMAIL_DEV);
    const promovido = await app.inject({
      method: "PUT",
      url: `/times/${TIME_NIVEIS}/membros/${EMAIL_OPERAR}/nivel`,
      cookies: { gerador_sessao: cookieDev },
      payload: { nivel: "owner" },
    });
    expect(promovido.statusCode).toBe(200);

    // Com DOIS owners, rebaixar um deles pode; aí o que sobrou vira o último
    // e não pode mais ser rebaixado nem removido.
    const rebaixaDev = await app.inject({
      method: "PUT",
      url: `/times/${TIME_NIVEIS}/membros/${EMAIL_DEV}/nivel`,
      cookies: { gerador_sessao: cookieDev },
      payload: { nivel: "operar" },
    });
    expect(rebaixaDev.statusCode).toBe(200);

    const cookieNovoOwner = await logarComo(EMAIL_OPERAR);
    const rebaixaUltimo = await app.inject({
      method: "PUT",
      url: `/times/${TIME_NIVEIS}/membros/${EMAIL_OPERAR}/nivel`,
      cookies: { gerador_sessao: cookieNovoOwner },
      payload: { nivel: "operar" },
    });
    expect(rebaixaUltimo.statusCode).toBe(400);

    const removeUltimo = await app.inject({
      method: "DELETE",
      url: `/times/${TIME_NIVEIS}/membros/${EMAIL_OPERAR}`,
      cookies: { gerador_sessao: cookieNovoOwner },
    });
    expect(removeUltimo.statusCode).toBe(400);
    expect(removeUltimo.json().erro).toContain("owner");
  });

  it("GET /permissoes/minhas carrega o nível — é o que a UI usa pra esconder o botão de salvar", async () => {
    const minhas = await app.inject({
      method: "GET",
      url: `/permissoes/minhas?timeId=${TIME_NIVEIS}`,
      cookies: { gerador_sessao: await logarComo(EMAIL_VISUALIZAR) },
    });
    expect(minhas.json().nivel).toBe("visualizar");
  });
});

describe("SPEC-49 — exportação dos itens pro tracker", () => {
  async function quebraComItens(cookie: string, itens: Record<string, unknown>[]) {
    const quebra = (
      await app.inject({
        method: "POST",
        url: "/quebras",
        cookies: { gerador_sessao: cookie },
        payload: { titulo: "quebra de exportação", diagrama: { nodes: [], edges: [] } },
      })
    ).json();
    await app.inject({
      method: "PUT",
      url: `/quebras/${quebra.id}/itens`,
      cookies: { gerador_sessao: cookie },
      payload: { itens },
    });
    return quebra.id as string;
  }

  const itemPronto = {
    chave: "a",
    titulo: "Item pronto",
    tipo: "Task",
    tamanho: "P",
    dependencias: [],
    corpoMarkdown: "### 1. Item pronto",
    pendencias: 0,
    sugestoes: 0,
  };
  const itemComPendencia = { ...itemPronto, chave: "b", titulo: "Item pela metade", pendencias: 2 };

  it("sem destino configurado, a resposta DIZ onde configurar — não é erro genérico", async () => {
    const cookie = await logarComo(EMAIL_DEV);
    await app.inject({
      method: "PUT",
      url: "/config/exportador",
      cookies: { gerador_sessao: cookie },
      payload: { documento: { endpoint: "", rotulo: "", cabecalhos: {} } },
    });
    const quebraId = await quebraComItens(cookie, [itemPronto]);

    const r = await app.inject({ method: "POST", url: `/quebras/${quebraId}/itens/exportar`, cookies: { gerador_sessao: cookie } });
    expect(r.statusCode).toBe(409);
    expect(r.json().erro).toContain("Configurações → Exportação");
  });

  it("endereço inválido é barrado na CONFIGURAÇÃO, não na hora de exportar com item na mão", async () => {
    const r = await app.inject({
      method: "PUT",
      url: "/config/exportador",
      cookies: { gerador_sessao: await logarComo(EMAIL_DEV) },
      payload: { documento: { endpoint: "jira.empresa", rotulo: "Jira", cabecalhos: {} } },
    });
    expect(r.statusCode).toBe(400);
    expect(JSON.stringify(r.json())).toContain("http://");
  });
});

describe("SPEC-45 — a jornada do PDCA (feedback → ajuste → aplicado)", () => {
  it("o feedback do agente APARECE numa listagem — era escrita-só (o relato do §194)", async () => {
    const cookie = await logarComo(EMAIL_DEV);
    await app.inject({
      method: "POST",
      url: "/pdca/feedback",
      cookies: { gerador_sessao: cookie },
      payload: { texto: "sobrou volumetria nos itens de fila" },
    });

    const lista = await app.inject({ method: "GET", url: "/pdca/feedback", cookies: { gerador_sessao: cookie } });
    expect(lista.statusCode).toBe(200);
    const meu = lista.json().find((f: { texto: string }) => f.texto === "sobrou volumetria nos itens de fila");
    expect(meu).toBeDefined();
    expect(meu.estado).toBe("novo");
  });

  it("virar solicitação LIGA o feedback ao pedido — a ponte que não existia", async () => {
    const cookie = await logarComo(EMAIL_DEV);
    const feedback = (
      await app.inject({
        method: "POST",
        url: "/pdca/feedback",
        cookies: { gerador_sessao: cookie },
        payload: { texto: "faltou item de DLQ" },
      })
    ).json();

    const criada = await app.inject({
      method: "POST",
      url: "/ajustes",
      cookies: { gerador_sessao: cookie },
      payload: {
        recurso: "regras",
        descricao: "Adicionar DLQ ao checklist",
        feedbackId: feedback.id,
        operacao: { tipo: "adicionar-checklist", tech: "java", contextos: [], texto: "Política de DLQ definida" },
      },
    });
    expect(criada.statusCode).toBe(201);
    expect(criada.json().operacao).toMatchObject({ tipo: "adicionar-checklist", texto: "Política de DLQ definida" });

    const lista = (await app.inject({ method: "GET", url: "/pdca/feedback", cookies: { gerador_sessao: cookie } })).json();
    const tratado = lista.find((f: { id: string }) => f.id === feedback.id);
    expect(tratado.estado).toBe("virou-ajuste");
    expect(tratado.solicitacaoId).toBe(criada.json().id);
  });

  it("descartar registra a decisão de NÃO tratar", async () => {
    const cookie = await logarComo(EMAIL_DEV);
    const feedback = (
      await app.inject({ method: "POST", url: "/pdca/feedback", cookies: { gerador_sessao: cookie }, payload: { texto: "nada a ver" } })
    ).json();

    const r = await app.inject({
      method: "POST",
      url: `/pdca/feedback/${feedback.id}/descartar`,
      cookies: { gerador_sessao: cookie },
    });
    expect(r.statusCode).toBe(200);
    expect(r.json().estado).toBe("descartado");
  });

  /**
   * SPEC-62 — os dois "não" do ciclo tinham volta em lugar nenhum.
   *
   * RELATO REAL do usuário: *"se rejeito simplesmente some para sempre"*. O
   * feedback descartado sumia da tela (ia para o histórico fechado) e a
   * solicitação recusada devolvia 409 a qualquer nova decisão — nem pela API
   * havia caminho de volta.
   */
  it("§278 — o feedback descartado REABRE; o que já virou ajuste, não", async () => {
    const cookie = await logarComo(EMAIL_DEV);
    const feedback = (
      await app.inject({ method: "POST", url: "/pdca/feedback", cookies: { gerador_sessao: cookie }, payload: { texto: "pensando melhor, faz falta" } })
    ).json();

    await app.inject({ method: "POST", url: `/pdca/feedback/${feedback.id}/descartar`, cookies: { gerador_sessao: cookie } });
    const reaberto = await app.inject({
      method: "POST",
      url: `/pdca/feedback/${feedback.id}/reabrir`,
      cookies: { gerador_sessao: cookie },
    });
    expect(reaberto.statusCode).toBe(200);
    expect(reaberto.json().estado).toBe("novo");

    // Reabrir o que já virou solicitação criaria dois pedidos para a mesma frase.
    const dobrado = await app.inject({
      method: "POST",
      url: `/pdca/feedback/${feedback.id}/reabrir`,
      cookies: { gerador_sessao: cookie },
    });
    expect(dobrado.statusCode).toBe(409);
  });

  it("§278 — recusar GRAVA o motivo, e reconsiderar devolve a pendente sem apagar o 'não'", async () => {
    const cookie = await logarComo(EMAIL_DEV);
    const criada = (
      await app.inject({
        method: "POST",
        url: "/ajustes",
        cookies: { gerador_sessao: cookie },
        payload: {
          recurso: "regras",
          descricao: "Adicionar DLQ ao checklist",
          operacao: { tipo: "adicionar-checklist", tech: "java", contextos: [], texto: "DLQ monitorada" },
        },
      })
    ).json();

    const recusa = await app.inject({
      method: "POST",
      url: `/ajustes/${criada.id}/decidir`,
      cookies: { gerador_sessao: cookie },
      payload: { aprovar: false, motivo: "já existe um item equivalente em 'observabilidade'" },
    });
    expect(recusa.statusCode).toBe(200);
    expect(recusa.json().estado).toBe("rejeitada");

    const depoisDaRecusa = (await app.inject({ method: "GET", url: "/ajustes", cookies: { gerador_sessao: cookie } }))
      .json()
      .find((a: { id: string }) => a.id === criada.id);
    expect(depoisDaRecusa.motivoDaDecisao).toContain("já existe um item equivalente");
    expect(depoisDaRecusa.decididoPor).toBe(EMAIL_DEV);

    const reconsiderada = await app.inject({
      method: "POST",
      url: `/ajustes/${criada.id}/reconsiderar`,
      cookies: { gerador_sessao: cookie },
    });
    expect(reconsiderada.statusCode).toBe(200);
    expect(reconsiderada.json().estado).toBe("pendente");

    // O "não" anterior NÃO se apaga — mesma disciplina de `substituidaPor`
    // (SPEC-57): quem apaga a decisão revista faz o time repetir o ciclo.
    const voltou = (await app.inject({ method: "GET", url: "/ajustes", cookies: { gerador_sessao: cookie } }))
      .json()
      .find((a: { id: string }) => a.id === criada.id);
    expect(voltou.estado).toBe("pendente");
    expect(voltou.motivoDaDecisao).toContain("já existe um item equivalente");
  });

  it("§278 — só recusada ou invalidada reconsidera; pendente e aplicada, não", async () => {
    const cookie = await logarComo(EMAIL_DEV);
    const criada = (
      await app.inject({
        method: "POST",
        url: "/ajustes",
        cookies: { gerador_sessao: cookie },
        payload: { recurso: "regras", descricao: "pedido só em texto" },
      })
    ).json();

    const cedo = await app.inject({
      method: "POST",
      url: `/ajustes/${criada.id}/reconsiderar`,
      cookies: { gerador_sessao: cookie },
    });
    expect(cedo.statusCode).toBe(409);
    expect(cedo.json().erro).toMatch(/pendente/);
  });

  /**
   * A mensagem do 409 de invalidação manda *"reavalie sobre o estado atual"* —
   * e não havia como reavaliar. Reconsiderar retoma a versão-alvo de AGORA;
   * sem isso o pedido voltaria a pendente só para invalidar de novo, para
   * sempre.
   */
  it("§278 — pedido invalidado reconsidera e passa a valer sobre a config de agora", async () => {
    const cookie = await logarComo(EMAIL_DEV);
    await app.inject({
      method: "PUT",
      url: "/config/regras",
      cookies: { gerador_sessao: cookie },
      payload: { documento: { porTech: { java: { checklistTecnico: [], testes: [] } } } },
    });
    const criada = (
      await app.inject({
        method: "POST",
        url: "/ajustes",
        cookies: { gerador_sessao: cookie },
        payload: {
          recurso: "regras",
          descricao: "Adicionar item",
          operacao: { tipo: "adicionar-checklist", tech: "java", contextos: [], texto: "item novo" },
        },
      })
    ).json();

    // A config muda entre o pedido e a decisão: aprovar invalida.
    await app.inject({
      method: "PUT",
      url: "/config/regras",
      cookies: { gerador_sessao: cookie },
      payload: { documento: { porTech: { java: { checklistTecnico: [{ texto: "outro", contextos: [] }], testes: [] } } } },
    });
    const invalidada = await app.inject({
      method: "POST",
      url: `/ajustes/${criada.id}/decidir`,
      cookies: { gerador_sessao: cookie },
      payload: { aprovar: true },
    });
    expect(invalidada.statusCode).toBe(409);
    expect(invalidada.json().estado).toBe("invalida");

    expect(
      (await app.inject({ method: "POST", url: `/ajustes/${criada.id}/reconsiderar`, cookies: { gerador_sessao: cookie } }))
        .statusCode
    ).toBe(200);
    // E agora a aprovação passa: a validade foi retomada sobre o estado novo.
    const aprovada = await app.inject({
      method: "POST",
      url: `/ajustes/${criada.id}/decidir`,
      cookies: { gerador_sessao: cookie },
      payload: { aprovar: true },
    });
    expect(aprovada.statusCode).toBe(200);
    expect(aprovada.json().estado).toBe("aprovada");
  });

  it("aprovada + aplicar MUDA o documento de regras de verdade — o Act que faltava", async () => {
    const cookie = await logarComo(EMAIL_DEV);
    // O documento precisa existir (a validade compara a versão dele).
    await app.inject({
      method: "PUT",
      url: "/config/regras",
      cookies: { gerador_sessao: cookie },
      payload: { documento: { tipos: ["Story"], tamanhos: ["P"], porTech: { java: { checklistTecnico: [] } } } },
    });

    const criada = (
      await app.inject({
        method: "POST",
        url: "/ajustes",
        cookies: { gerador_sessao: cookie },
        payload: {
          recurso: "regras",
          descricao: "DLQ no checklist",
          operacao: { tipo: "adicionar-checklist", tech: "java", contextos: [], texto: "Política de DLQ definida" },
        },
      })
    ).json();

    // Aplicar antes de aprovar é 409 — o estado manda.
    const cedo = await app.inject({ method: "POST", url: `/ajustes/${criada.id}/aplicar`, cookies: { gerador_sessao: cookie } });
    expect(cedo.statusCode).toBe(409);

    expect(
      (
        await app.inject({
          method: "POST",
          url: `/ajustes/${criada.id}/decidir`,
          cookies: { gerador_sessao: cookie },
          payload: { aprovar: true },
        })
      ).statusCode
    ).toBe(200);

    const aplicada = await app.inject({ method: "POST", url: `/ajustes/${criada.id}/aplicar`, cookies: { gerador_sessao: cookie } });
    expect(aplicada.statusCode).toBe(200);
    expect(aplicada.json().estado).toBe("aplicada");

    // O documento MUDOU — é o ponto do ciclo inteiro.
    const regras = (await app.inject({ method: "GET", url: "/config/regras" })).json();
    expect(regras.documento.porTech.java.checklistTecnico).toContainEqual({
      texto: "Política de DLQ definida",
      contextos: [],
    });
  });

  it("SPEC-46 — o ajuste vale para as QUATRO seções: processo aplicado muda o checklist de processo", async () => {
    const cookie = await logarComo(EMAIL_DEV);
    await app.inject({
      method: "PUT",
      url: "/config/regras",
      cookies: { gerador_sessao: cookie },
      payload: { documento: { tipos: ["Story"], tamanhos: ["P"], porTech: { java: { checklistTecnico: [], testes: [] } } } },
    });

    const criada = (
      await app.inject({
        method: "POST",
        url: "/ajustes",
        cookies: { gerador_sessao: cookie },
        payload: {
          recurso: "regras",
          descricao: "faltou repontar massa",
          operacao: {
            tipo: "adicionar-checklist",
            secao: "checklistProcesso",
            tech: "java",
            contextos: [],
            texto: "Repontar massa de teste",
          },
        },
      })
    ).json();
    await app.inject({
      method: "POST",
      url: `/ajustes/${criada.id}/decidir`,
      cookies: { gerador_sessao: cookie },
      payload: { aprovar: true },
    });
    expect((await app.inject({ method: "POST", url: `/ajustes/${criada.id}/aplicar`, cookies: { gerador_sessao: cookie } })).statusCode).toBe(200);

    const regras = (await app.inject({ method: "GET", url: "/config/regras" })).json();
    expect(regras.documento.porTech.java.checklistProcesso).toContainEqual({ texto: "Repontar massa de teste", contextos: [] });
    // Sem invadir a seção vizinha — cada uma tem dono próprio (SPEC-28).
    expect(regras.documento.porTech.java.checklistTecnico).toEqual([]);
  });

  /**
   * §303 — aplicar numa organização que NUNCA salvou regras.
   *
   * Todos os testes de aplicar acima começam com um `PUT /config/regras`, e é
   * por isso que nenhum pegava isto: o `aplicar` lia a linha GLOBAL direto e
   * devolvia 409 quando ela não existia — o estado de toda instalação nova.
   *
   * O sintoma não era um erro na tela: era um ajuste APROVADO que ficava
   * "aprovada" para sempre, com um botão que parecia não fazer nada (§244).
   *
   * A ausência do `PUT` aqui é o teste. Ela é fácil de "consertar" por engano
   * na próxima leitura, então: NÃO grave config antes deste caso.
   */
  it("§303 — sem config gravada, aplicar parte do TEMPLATE em vez de recusar com 409", async () => {
    const cookie = await logarComo(EMAIL_DEV);

    const criada = (
      await app.inject({
        method: "POST",
        url: "/ajustes",
        cookies: { gerador_sessao: cookie },
        payload: {
          recurso: "regras",
          descricao: "primeira régua da casa",
          operacao: {
            tipo: "adicionar-checklist",
            secao: "checklistTecnico",
            tech: "java",
            contextos: [],
            texto: "Definir política de DLQ",
          },
        },
      })
    ).json();
    await app.inject({
      method: "POST",
      url: `/ajustes/${criada.id}/decidir`,
      cookies: { gerador_sessao: cookie },
      payload: { aprovar: true },
    });

    const aplicada = await app.inject({
      method: "POST",
      url: `/ajustes/${criada.id}/aplicar`,
      cookies: { gerador_sessao: cookie },
    });
    expect(aplicada.statusCode, aplicada.body).toBe(200);
    expect(aplicada.json().estado).toBe("aplicada");

    // E a régua chegou ao documento de verdade — 200 sozinho não prova gravação.
    const regras = (await app.inject({ method: "GET", url: "/config/regras" })).json();
    expect(regras.documento.porTech.java.checklistTecnico).toContainEqual({
      texto: "Definir política de DLQ",
      contextos: [],
    });
  });

  it("SPEC-46 — ciclo de teste e volumetria também aplicam de verdade", async () => {
    const cookie = await logarComo(EMAIL_DEV);
    await app.inject({
      method: "PUT",
      url: "/config/regras",
      cookies: { gerador_sessao: cookie },
      payload: { documento: { tipos: ["Story"], tamanhos: ["P"], porTech: { java: { checklistTecnico: [], testes: [] } } } },
    });

    for (const operacao of [
      { tipo: "adicionar-teste", tech: "java", contextos: [], tipoTeste: "Teste de contrato", validacao: "pacto verde", dev: true, hlg: false },
      { tipo: "definir-volumetria", tech: "java", contextos: [] },
    ]) {
      const criada = (
        await app.inject({
          method: "POST",
          url: "/ajustes",
          cookies: { gerador_sessao: cookie },
          payload: { recurso: "regras", descricao: `pedido ${operacao.tipo}`, operacao },
        })
      ).json();
      await app.inject({
        method: "POST",
        url: `/ajustes/${criada.id}/decidir`,
        cookies: { gerador_sessao: cookie },
        payload: { aprovar: true },
      });
      expect((await app.inject({ method: "POST", url: `/ajustes/${criada.id}/aplicar`, cookies: { gerador_sessao: cookie } })).statusCode).toBe(200);
    }

    const regras = (await app.inject({ method: "GET", url: "/config/regras" })).json();
    expect(regras.documento.porTech.java.testes).toContainEqual({
      tipo: "Teste de contrato",
      validacao: "pacto verde",
      contextos: [],
      dev: true,
      hlg: false,
    });
    expect(regras.documento.porTech.java.volumetria).toEqual({ contextos: [] });
  });

  it("SPEC-50 — ajuste de PAPEL aplica no pipeline de agentes, não nas regras", async () => {
    const cookie = await logarComo(EMAIL_DEV);
    await app.inject({
      method: "PUT",
      url: "/config/pipeline-agentes",
      cookies: { gerador_sessao: cookie },
      payload: {
        documento: {
          confirmacaoObrigatoria: true,
          papeis: [
            { id: "po", nome: "PO", grupo: "po", ativo: true, contextos: [] },
            { id: "qa", nome: "QA", grupo: "qa", ativo: true, contextos: [] },
          ],
        },
      },
    });

    const criada = (
      await app.inject({
        method: "POST",
        url: "/ajustes",
        cookies: { gerador_sessao: cookie },
        payload: {
          recurso: "pipeline-agentes",
          descricao: "o QA sobra nos itens de infra",
          operacao: { tipo: "desativar-papel", papelId: "qa", papelNome: "QA" },
        },
      })
    ).json();

    await app.inject({
      method: "POST",
      url: `/ajustes/${criada.id}/decidir`,
      cookies: { gerador_sessao: cookie },
      payload: { aprovar: true },
    });
    const aplicada = await app.inject({ method: "POST", url: `/ajustes/${criada.id}/aplicar`, cookies: { gerador_sessao: cookie } });
    expect(aplicada.statusCode).toBe(200);

    const pipeline = (await app.inject({ method: "GET", url: "/config/pipeline-agentes" })).json();
    expect(pipeline.documento.papeis.find((p: { id: string }) => p.id === "qa").ativo).toBe(false);
    expect(pipeline.documento.papeis.find((p: { id: string }) => p.id === "po").ativo).toBe(true);
    expect(pipeline.documento.confirmacaoObrigatoria).toBe(true);
  });

  /**
   * SPEC-52 — o *Act* alcança a FICHA. Campos por componente e por conexão são
   * tabela, não documento: aplicar aqui grava linha, e o que se prova é que o
   * ciclo fecha sozinho (sem "edite à mão") e que o escopo é respeitado.
   */
  it("SPEC-52 — ajuste de campo aprovado CRIA o campo na ficha do componente", async () => {
    const cookie = await logarComo(EMAIL_DEV);

    const criada = (
      await app.inject({
        method: "POST",
        url: "/ajustes",
        cookies: { gerador_sessao: cookie },
        payload: {
          recurso: "campos-no",
          descricao: "falta onde declarar o SLA do serviço",
          operacao: {
            tipo: "adicionar-campo-no",
            tipoNo: "service",
            campo: { key: "sla52", label: "SLA acordado", tipoCampo: "text", obrigatorio: true, ajuda: "em ms" },
          },
        },
      })
    ).json();

    await app.inject({
      method: "POST",
      url: `/ajustes/${criada.id}/decidir`,
      cookies: { gerador_sessao: cookie },
      payload: { aprovar: true },
    });
    const aplicada = await app.inject({ method: "POST", url: `/ajustes/${criada.id}/aplicar`, cookies: { gerador_sessao: cookie } });
    expect(aplicada.statusCode).toBe(200);
    expect(aplicada.json().criados).toEqual(["sla52"]);

    const campos = (await app.inject({ method: "GET", url: "/campos-no" })).json();
    expect(campos).toContainEqual(
      expect.objectContaining({ tipoNo: "service", key: "sla52", label: "SLA acordado", required: true, ajuda: "em ms" })
    );
  });

  it("SPEC-52 — aplicar duas vezes não duplica campo (a idempotência faz as vezes da validade por versão)", async () => {
    const cookie = await logarComo(EMAIL_DEV);
    const operacao = {
      tipo: "adicionar-campo-aresta",
      tipoAresta: "sync",
      campo: { key: "timeout52", label: "Timeout", tipoCampo: "number", obrigatorio: false },
    };

    for (const vez of [1, 2]) {
      const criada = (
        await app.inject({
          method: "POST",
          url: "/ajustes",
          cookies: { gerador_sessao: cookie },
          payload: { recurso: "campos-aresta", descricao: `timeout na conexão (vez ${vez})`, operacao },
        })
      ).json();
      await app.inject({
        method: "POST",
        url: `/ajustes/${criada.id}/decidir`,
        cookies: { gerador_sessao: cookie },
        payload: { aprovar: true },
      });
      expect(
        (await app.inject({ method: "POST", url: `/ajustes/${criada.id}/aplicar`, cookies: { gerador_sessao: cookie } })).statusCode
      ).toBe(200);
    }

    const campos = (await app.inject({ method: "GET", url: "/campos-aresta" })).json();
    expect(campos.filter((c: { key: string }) => c.key === "timeout52")).toHaveLength(1);
  });

  it("SPEC-52 — um pedido de TIME não apaga o campo de todo mundo: recusa com o motivo", async () => {
    const cookie = await logarComo(EMAIL_DEV);
    // Campo GLOBAL — aparece na ficha do time por sobreposição, e é isso que
    // torna a remoção perigosa se ninguém checar o escopo.
    await app.inject({
      method: "POST",
      url: "/campos-no",
      cookies: { gerador_sessao: cookie },
      payload: { tipoNo: "service", key: "detodos52", label: "De todos", type: "text" },
    });

    const criada = (
      await app.inject({
        method: "POST",
        url: "/ajustes",
        cookies: { gerador_sessao: cookie },
        payload: {
          recurso: "campos-no",
          descricao: "esse campo não serve pro meu time",
          timeId: TIME_A,
          operacao: { tipo: "remover-campo-no", tipoNo: "service", key: "detodos52", label: "De todos" },
        },
      })
    ).json();
    await app.inject({
      method: "POST",
      url: `/ajustes/${criada.id}/decidir`,
      cookies: { gerador_sessao: cookie },
      payload: { aprovar: true },
    });

    const recusa = await app.inject({ method: "POST", url: `/ajustes/${criada.id}/aplicar`, cookies: { gerador_sessao: cookie } });
    expect(recusa.statusCode).toBe(409);
    expect(recusa.json().erro).toContain("todo mundo");

    // E o campo continua lá, para todos — a recusa não é cosmética.
    const campos = (await app.inject({ method: "GET", url: "/campos-no" })).json();
    expect(campos.some((c: { key: string }) => c.key === "detodos52")).toBe(true);
  });

  it("SPEC-50 — quem decide um ajuste de papel é o dono do PIPELINE, não o do checklist", async () => {
    const [org] = await db.select().from(organizacoes).limit(1);
    const [papel] = await db.insert(papeisAcesso).values({ organizacaoId: org.id, nome: "Arquitetura da esteira" }).returning();
    await db.insert(papelPermissao).values({ papelId: papel.id, recurso: "pipeline-agentes", acao: "editar" });
    await db.insert(usuarioPapel).values({ email: EMAIL_OUTRO, papelId: papel.id, escopoTimeId: null });
    await db.update(usuarioTime).set({ nivel: "operar" }).where(eq(usuarioTime.email, EMAIL_OUTRO));
    const cookieDono = await logarComo(EMAIL_OUTRO);
    const cookieDev = await logarComo(EMAIL_DEV);

    const doPipeline = (
      await app.inject({
        method: "POST",
        url: "/ajustes",
        cookies: { gerador_sessao: cookieDev },
        payload: {
          recurso: "pipeline-agentes",
          descricao: "desligar QA",
          operacao: { tipo: "desativar-papel", papelId: "qa" },
        },
      })
    ).json();
    const deRegras = (
      await app.inject({
        method: "POST",
        url: "/ajustes",
        cookies: { gerador_sessao: cookieDev },
        payload: {
          recurso: "regras",
          descricao: "checklist",
          operacao: { tipo: "adicionar-checklist", tech: "java", contextos: [], texto: "DLQ" },
        },
      })
    ).json();

    expect(
      (
        await app.inject({
          method: "POST",
          url: `/ajustes/${doPipeline.id}/decidir`,
          cookies: { gerador_sessao: cookieDono },
          payload: { aprovar: true },
        })
      ).statusCode
    ).toBe(200);
    expect(
      (
        await app.inject({
          method: "POST",
          url: `/ajustes/${deRegras.id}/decidir`,
          cookies: { gerador_sessao: cookieDono },
          payload: { aprovar: true },
        })
      ).statusCode
    ).toBe(403);

    await db.update(usuarioTime).set({ nivel: "owner" }).where(eq(usuarioTime.email, EMAIL_OUTRO));
  });

  it("SPEC-46 — quem decide é o dono da SEÇÃO: curador de processo aprova o pedido de processo e é barrado no técnico", async () => {
    const [org] = await db.select().from(organizacoes).limit(1);
    const [papel] = await db.insert(papeisAcesso).values({ organizacaoId: org.id, nome: "Agilidade" }).returning();
    await db.insert(papelPermissao).values({ papelId: papel.id, recurso: "regras.checklistProcesso", acao: "editar" });
    await db.insert(usuarioPapel).values({ email: EMAIL_OUTRO, papelId: papel.id, escopoTimeId: null });
    // A delegação é o caminho de quem NÃO é owner: owner passa por bypass
    // (SPEC-38) e o teste mediria o portão errado.
    await db.update(usuarioTime).set({ nivel: "operar" }).where(eq(usuarioTime.email, EMAIL_OUTRO));
    const cookieCurador = await logarComo(EMAIL_OUTRO);
    const cookieDev = await logarComo(EMAIL_DEV);

    const pedidoDeProcesso = (
      await app.inject({
        method: "POST",
        url: "/ajustes",
        cookies: { gerador_sessao: cookieDev },
        payload: {
          recurso: "regras",
          descricao: "processo",
          operacao: { tipo: "adicionar-checklist", secao: "checklistProcesso", tech: "java", contextos: [], texto: "Abrir mudança" },
        },
      })
    ).json();
    const pedidoTecnico = (
      await app.inject({
        method: "POST",
        url: "/ajustes",
        cookies: { gerador_sessao: cookieDev },
        payload: {
          recurso: "regras",
          descricao: "tecnico",
          operacao: { tipo: "adicionar-checklist", tech: "java", contextos: [], texto: "DLQ" },
        },
      })
    ).json();

    // O dono do PROCESSO decide o de processo...
    expect(
      (
        await app.inject({
          method: "POST",
          url: `/ajustes/${pedidoDeProcesso.id}/decidir`,
          cookies: { gerador_sessao: cookieCurador },
          payload: { aprovar: true },
        })
      ).statusCode
    ).toBe(200);

    // ...e leva 403 no TÉCNICO, que é de outro dono. Antes desta fase o
    // recurso era fixo em checklistTecnico: os dois iam para a pessoa errada.
    expect(
      (
        await app.inject({
          method: "POST",
          url: `/ajustes/${pedidoTecnico.id}/decidir`,
          cookies: { gerador_sessao: cookieCurador },
          payload: { aprovar: true },
        })
      ).statusCode
    ).toBe(403);

    await db.update(usuarioTime).set({ nivel: "owner" }).where(eq(usuarioTime.email, EMAIL_OUTRO));
  });

  it("pedido só em texto (sem operação) não aplica sozinho — e diz o porquê", async () => {
    const cookie = await logarComo(EMAIL_DEV);
    const criada = (
      await app.inject({
        method: "POST",
        url: "/ajustes",
        cookies: { gerador_sessao: cookie },
        payload: { recurso: "regras", descricao: "mudar alguma coisa por favor" },
      })
    ).json();
    await app.inject({
      method: "POST",
      url: `/ajustes/${criada.id}/decidir`,
      cookies: { gerador_sessao: cookie },
      payload: { aprovar: true },
    });

    const r = await app.inject({ method: "POST", url: `/ajustes/${criada.id}/aplicar`, cookies: { gerador_sessao: cookie } });
    expect(r.statusCode).toBe(409);
    expect(r.json().erro).toContain("só texto");
  });
});

describe("SPEC-43 — stacks conhecidas (catálogo global, curadoria como na SPEC-38)", () => {
  const TIME_STACK = "time-teste-stack";
  const EMAIL_OPERAR2 = "operar-stack@gerador.local";

  beforeEach(async () => {
    await garantirTime(TIME_STACK);
    await db.delete(usuarioTime).where(eq(usuarioTime.timeId, TIME_STACK));
    await db.insert(usuarioTime).values([
      { email: EMAIL_DEV, timeId: TIME_STACK, nivel: "owner" },
      { email: EMAIL_OPERAR2, timeId: TIME_STACK, nivel: "operar" },
    ]);
  });

  afterEach(async () => {
    await db.delete(usuarioTime).where(eq(usuarioTime.timeId, TIME_STACK));
    await db.update(usuarioTime).set({ nivel: "owner" }).where(eq(usuarioTime.email, EMAIL_DEV));
  });

  it("catálogo ABERTO (sem papel curador): owner cria stack; operar leva 403", async () => {
    const negado = await app.inject({
      method: "POST",
      url: "/stacks",
      cookies: { gerador_sessao: await logarComo(EMAIL_OPERAR2) },
      payload: { tipoNo: "service", nome: "Node" },
    });
    expect(negado.statusCode).toBe(403);

    const criado = await app.inject({
      method: "POST",
      url: "/stacks",
      cookies: { gerador_sessao: await logarComo(EMAIL_DEV) },
      payload: { tipoNo: "service", nome: "Java + Spring Boot" },
    });
    expect(criado.statusCode).toBe(201);
    expect(criado.json().nome).toBe("Java + Spring Boot");
    expect(criado.json().tipoNo).toBe("service");
  });

  it("curadoria LIGADA (papel com perfis-stack existe): owner comum leva 403; o curador edita — é a exceção ao owner-bypass (D1)", async () => {
    const [org] = await db.select().from(organizacoes).limit(1);
    const [papel] = await db.insert(papeisAcesso).values({ organizacaoId: org.id, nome: "Curadoria" }).returning();
    await db.insert(papelPermissao).values({ papelId: papel.id, recurso: "perfis-stack", acao: "editar" });
    await db.insert(usuarioPapel).values({ email: EMAIL_OUTRO, papelId: papel.id, escopoTimeId: null });

    // EMAIL_DEV é owner — e mesmo assim 403: a curadoria manda.
    const ownerNegado = await app.inject({
      method: "POST",
      url: "/stacks",
      cookies: { gerador_sessao: await logarComo(EMAIL_DEV) },
      payload: { tipoNo: "service", nome: "Kotlin" },
    });
    expect(ownerNegado.statusCode).toBe(403);
    expect(ownerNegado.json().erro).toContain("curadoria");

    const curador = await app.inject({
      method: "POST",
      url: "/stacks",
      cookies: { gerador_sessao: await logarComo(EMAIL_OUTRO) },
      payload: { tipoNo: "service", nome: "Kotlin" },
    });
    expect(curador.statusCode).toBe(201);
  });

  it("sugestões agregam TODAS as stacks do componente — nenhum filtro por time (SPEC-43)", async () => {
    const cookieDev = await logarComo(EMAIL_DEV);
    const java = (
      await app.inject({ method: "POST", url: "/stacks", cookies: { gerador_sessao: cookieDev }, payload: { tipoNo: "service", nome: "Java" } })
    ).json();
    const node = (
      await app.inject({ method: "POST", url: "/stacks", cookies: { gerador_sessao: cookieDev }, payload: { tipoNo: "service", nome: "Node" } })
    ).json();
    await app.inject({
      method: "PUT", url: `/stacks/${java.id}/valores`, cookies: { gerador_sessao: cookieDev },
      payload: { valores: { linguagem: "Java" } },
    });
    await app.inject({
      method: "PUT", url: `/stacks/${node.id}/valores`, cookies: { gerador_sessao: cookieDev },
      payload: { valores: { linguagem: "Node" } },
    });

    const sugestoes = (await app.inject({ method: "GET", url: "/stacks/sugestoes" })).json();
    expect(sugestoes.service.linguagem).toEqual(expect.arrayContaining(["Java", "Node"]));
  });

  it("capturar o MESMO ambiente duas vezes não duplica: mescla na stack de nome derivado", async () => {
    const cookieDev = await logarComo(EMAIL_DEV);
    const payload = { tipoNo: "service", valores: { linguagem: "Java", framework: "Spring Boot" } };

    const primeira = await app.inject({
      method: "POST", url: "/stacks/capturar", cookies: { gerador_sessao: cookieDev }, payload,
    });
    expect(primeira.statusCode).toBe(200);
    // Nome derivado dos valores, em ordem natural (linguagem antes de framework).
    expect(primeira.json().nome).toBe("Java + Spring Boot");

    await app.inject({ method: "POST", url: "/stacks/capturar", cookies: { gerador_sessao: cookieDev }, payload });
    const catalogo = (await app.inject({ method: "GET", url: "/stacks" })).json();
    expect(catalogo.stacks.filter((st: { nome: string }) => st.nome === "Java + Spring Boot").length).toBe(1);
  });
});

describe("SPEC-38 Fase 3 — papel portado por time (owners herdam)", () => {
  const TIME_PORTADOR = "time-teste-portador";
  const EMAIL_OWNER_ARQ = "owner-arq@gerador.local";
  const EMAIL_OPERAR_ARQ = "operar-arq@gerador.local";

  beforeEach(async () => {
    await garantirTime(TIME_PORTADOR);
    await db.delete(usuarioTime).where(eq(usuarioTime.timeId, TIME_PORTADOR));
    await db.insert(usuarioTime).values([
      { email: EMAIL_OWNER_ARQ, timeId: TIME_PORTADOR, nivel: "owner" },
      { email: EMAIL_OPERAR_ARQ, timeId: TIME_PORTADOR, nivel: "operar" },
    ]);
  });

  afterEach(async () => {
    await db.delete(usuarioTime).where(eq(usuarioTime.timeId, TIME_PORTADOR));
  });

  it("o cenário literal da SPEC: papel Curadoria portado pelo time — owner do time herda (edita catálogo), operar não, e owner de FORA continua barrado", async () => {
    const [org] = await db.select().from(organizacoes).limit(1);
    const [papel] = await db.insert(papeisAcesso).values({ organizacaoId: org.id, nome: "Curadoria" }).returning();
    await db.insert(papelPermissao).values({ papelId: papel.id, recurso: "perfis-stack", acao: "editar" });

    // Atribuição a TIME pela rota (dev é owner → o eixo de nível do exigirPermissao autoriza `acessos`).
    const atribuir = await app.inject({
      method: "POST",
      url: `/acessos/papeis/${papel.id}/times`,
      cookies: { gerador_sessao: await logarComo(EMAIL_DEV) },
      payload: { timeId: TIME_PORTADOR },
    });
    expect(atribuir.statusCode).toBe(201);

    // A herança aparece no /permissoes/minhas do owner do time portador…
    const minhas = await app.inject({
      method: "GET",
      url: "/permissoes/minhas",
      cookies: { gerador_sessao: await logarComo(EMAIL_OWNER_ARQ) },
    });
    expect(minhas.json().porRecurso["perfis-stack"]).toEqual(["editar"]);

    // …e funciona numa rota REAL onde só o grant vale (curadoria ligada barra
    // até owners): o herdeiro cria perfil no catálogo.
    const criaHerdeiro = await app.inject({
      method: "POST",
      url: "/stacks",
      cookies: { gerador_sessao: await logarComo(EMAIL_OWNER_ARQ) },
      payload: { tipoNo: "service", nome: "Perfil da curadoria" },
    });
    expect(criaHerdeiro.statusCode).toBe(201);

    // Operar do MESMO time não herda (D3: delegação é para quem lida com config).
    const criaOperar = await app.inject({
      method: "POST",
      url: "/stacks",
      cookies: { gerador_sessao: await logarComo(EMAIL_OPERAR_ARQ) },
      payload: { tipoNo: "service", nome: "não deveria" },
    });
    expect(criaOperar.statusCode).toBe(403);

    // Owner de OUTRO time, sem o papel: a curadoria continua barrando.
    const criaDev = await app.inject({
      method: "POST",
      url: "/stacks",
      cookies: { gerador_sessao: await logarComo(EMAIL_DEV) },
      payload: { tipoNo: "service", nome: "também não" },
    });
    expect(criaDev.statusCode).toBe(403);

    // Rebaixado a operar, o ex-owner PERDE a herança na hora — o papel
    // acompanha a composição do time, sem atribuição pra limpar.
    await db
      .update(usuarioTime)
      .set({ nivel: "operar" })
      .where(and(eq(usuarioTime.email, EMAIL_OWNER_ARQ), eq(usuarioTime.timeId, TIME_PORTADOR)));
    const criaRebaixado = await app.inject({
      method: "POST",
      url: "/stacks",
      cookies: { gerador_sessao: await logarComo(EMAIL_OWNER_ARQ) },
      payload: { tipoNo: "service", nome: "perdeu" },
    });
    expect(criaRebaixado.statusCode).toBe(403);
  });

  it("GET /acessos/papeis lista os times portadores; remover a atribuição corta a herança", async () => {
    const [org] = await db.select().from(organizacoes).limit(1);
    const [papel] = await db.insert(papeisAcesso).values({ organizacaoId: org.id, nome: "Curadoria" }).returning();
    await db.insert(papelPermissao).values({ papelId: papel.id, recurso: "perfis-stack", acao: "editar" });
    const cookieDev = await logarComo(EMAIL_DEV);
    await app.inject({
      method: "POST",
      url: `/acessos/papeis/${papel.id}/times`,
      cookies: { gerador_sessao: cookieDev },
      payload: { timeId: TIME_PORTADOR },
    });

    const papeis = (await app.inject({ method: "GET", url: "/acessos/papeis", cookies: { gerador_sessao: cookieDev } })).json();
    expect(papeis.find((p: { id: string }) => p.id === papel.id).times).toEqual([TIME_PORTADOR]);

    await app.inject({
      method: "DELETE",
      url: `/acessos/papeis/${papel.id}/times/${TIME_PORTADOR}`,
      cookies: { gerador_sessao: cookieDev },
    });
    const minhas = await app.inject({
      method: "GET",
      url: "/permissoes/minhas",
      cookies: { gerador_sessao: await logarComo(EMAIL_OWNER_ARQ) },
    });
    expect(minhas.json().porRecurso["perfis-stack"]).toBeUndefined();
  });
});

describe("SPEC-39 — PDCA de configurações", () => {
  beforeEach(async () => {
    await db.execute(sql`truncate table ${pdcaUsos}, ${pdcaFeedback}, ${solicitacoesAjuste}`);
    await db.delete(configDocumentos).where(eq(configDocumentos.chave, "pdca"));
  });

  it("a cadência morde no uso certo: default 5, e a config do admin muda o passo", async () => {
    const cookie = await logarComo(EMAIL_DEV);
    const usar = () =>
      app.inject({ method: "POST", url: "/pdca/uso", cookies: { gerador_sessao: cookie }, payload: { tipo: "derivacao", timeId: TIME_A } });

    for (let i = 1; i <= 4; i++) expect((await usar()).json().momento).toBe(false);
    const quinto = (await usar()).json();
    expect(quinto.momento).toBe(true);

    // O admin muda a cadência pra 2 (gate: acessos — dev é owner, passa).
    const configurar = await app.inject({
      method: "PUT",
      url: "/pdca/config",
      cookies: { gerador_sessao: cookie },
      payload: { cadenciaUsos: 2, cadenciaFeedback: 3 },
    });
    expect(configurar.statusCode).toBe(200);
    expect((await usar()).json().momento).toBe(true); // 6º (6 % 2 = 0)
    expect((await usar()).json().momento).toBe(false); // 7º
    expect((await usar()).json().momento).toBe(true); // 8º
  });

  it("no momento da entrevista, os últimos itens do TIME vêm junto — a âncora de memória", async () => {
    const cookie = await logarComo(EMAIL_DEV);
    await app.inject({
      method: "POST",
      url: "/quebras",
      cookies: { gerador_sessao: cookie },
      payload: { titulo: "Fatura mensal em lote", time: TIME_A, diagrama: { nodes: [], edges: [] } },
    });
    await app.inject({
      method: "PUT",
      url: "/pdca/config",
      cookies: { gerador_sessao: cookie },
      payload: { cadenciaUsos: 1, cadenciaFeedback: 3 },
    });

    const uso = (
      await app.inject({ method: "POST", url: "/pdca/uso", cookies: { gerador_sessao: cookie }, payload: { tipo: "derivacao", timeId: TIME_A } })
    ).json();
    expect(uso.momento).toBe(true);
    expect(uso.ultimosItens).toContain("Fatura mensal em lote");
  });

  it("VALIDADE: aprovar depois que o documento mudou invalida o pedido (409) — sem mudança, aprova", async () => {
    const cookie = await logarComo(EMAIL_DEV);
    const salvarRegras = (documento: unknown) =>
      app.inject({ method: "PUT", url: "/config/regras", cookies: { gerador_sessao: cookie }, payload: { documento } });
    const base = { tipos: ["Story"], tamanhos: ["P"], porTech: { java: { checklistProcesso: [{ texto: "abrir mudança", contextos: [] }] } } };
    await salvarRegras(base);

    const criar = () =>
      app.inject({
        method: "POST",
        url: "/ajustes",
        cookies: { gerador_sessao: cookie },
        payload: { recurso: "regras", descricao: "faltou item de DLQ no checklist", timeId: TIME_A },
      });

    // Pedido 1: o documento MUDA antes da decisão → aprovar invalida.
    const pedido1 = (await criar()).json();
    const doc2 = structuredClone(base);
    doc2.porTech.java.checklistProcesso.push({ texto: "novo item no meio do caminho", contextos: [] });
    await salvarRegras(doc2);

    const aprovacaoTardia = await app.inject({
      method: "POST",
      url: `/ajustes/${pedido1.id}/decidir`,
      cookies: { gerador_sessao: cookie },
      payload: { aprovar: true },
    });
    expect(aprovacaoTardia.statusCode).toBe(409);
    expect(aprovacaoTardia.json().estado).toBe("invalida");
    const lista = (await app.inject({ method: "GET", url: "/ajustes", cookies: { gerador_sessao: cookie } })).json();
    expect(lista.find((s: { id: string }) => s.id === pedido1.id).estado).toBe("invalida");

    // Pedido 2: nada mudou → aprovada.
    const pedido2 = (await criar()).json();
    const aprovacao = await app.inject({
      method: "POST",
      url: `/ajustes/${pedido2.id}/decidir`,
      cookies: { gerador_sessao: cookie },
      payload: { aprovar: true },
    });
    expect(aprovacao.statusCode).toBe(200);
    expect(aprovacao.json().estado).toBe("aprovada");
  });

  it("decidir exige a permissão do RECURSO pedido (owner ou grant) — operar sem grant leva 403", async () => {
    const cookieDev = await logarComo(EMAIL_DEV);
    const pedido = (
      await app.inject({
        method: "POST",
        url: "/ajustes",
        cookies: { gerador_sessao: cookieDev },
        payload: { recurso: "pipeline-agentes", descricao: "prompt do QA verboso demais" },
      })
    ).json();

    await db.update(usuarioTime).set({ nivel: "operar" }).where(eq(usuarioTime.email, EMAIL_OUTRO));
    try {
      const negado = await app.inject({
        method: "POST",
        url: `/ajustes/${pedido.id}/decidir`,
        cookies: { gerador_sessao: await logarComo(EMAIL_OUTRO) },
        payload: { aprovar: false },
      });
      expect(negado.statusCode).toBe(403);
    } finally {
      await db.update(usuarioTime).set({ nivel: "owner" }).where(eq(usuarioTime.email, EMAIL_OUTRO));
    }
  });

  it("feedback livre é gravado com autor e time", async () => {
    const cookie = await logarComo(EMAIL_DEV);
    const resposta = await app.inject({
      method: "POST",
      url: "/pdca/feedback",
      cookies: { gerador_sessao: cookie },
      payload: { texto: "sobrou o campo de volumetria no formulário", timeId: TIME_A },
    });
    expect(resposta.statusCode).toBe(201);
    const [linha] = await db.select().from(pdcaFeedback);
    expect(linha).toMatchObject({ email: EMAIL_DEV, timeId: TIME_A, texto: "sobrou o campo de volumetria no formulário" });
  });
});

describe("§184 — a especificação gerada fica salva NA quebra", () => {
  it("PUT com especificacao grava o markdown e carimba a versão; o GET devolve tudo", async () => {
    const cookie = await logarComo(EMAIL_DEV);
    const criada = (
      await app.inject({
        method: "POST",
        url: "/quebras",
        cookies: { gerador_sessao: cookie },
        payload: { titulo: "Com especificação", time: TIME_A, diagrama: { nodes: [], edges: [] } },
      })
    ).json();
    expect(criada.especificacao ?? null).toBeNull();

    const md = "# Especificação de solução\n\n## Itens\n1. Criar fila";
    const atualizada = await app.inject({
      method: "PUT",
      url: `/quebras/${criada.id}`,
      cookies: { gerador_sessao: cookie },
      payload: { titulo: "Com especificação", time: TIME_A, diagrama: { nodes: [], edges: [] }, especificacao: md },
    });
    expect(atualizada.statusCode).toBe(200);

    const lida = (await app.inject({ method: "GET", url: `/quebras/${criada.id}` })).json();
    expect(lida.especificacao).toBe(md);
    expect(lida.especificacaoGeradaEm).toBeTruthy();
  });
});

describe("auditoria", () => {
  it("grava quem/quando depois de uma escrita ter sucesso (ex.: capturar stack)", async () => {
    const cookieDev = await logarComo(EMAIL_DEV);
    const captura = await app.inject({
      method: "POST",
      url: "/stacks/capturar",
      cookies: { gerador_sessao: cookieDev },
      payload: { tipoNo: "service", valores: { linguagem: "Java" } },
    });
    const stackId = captura.json().id;

    const linha = await esperarLinhaAuditoria(
      (l) => l.recurso === "stacks" && l.recursoId === stackId && l.acao === "capturar"
    );
    expect(linha).toMatchObject({ email: EMAIL_DEV, acao: "capturar", recurso: "stacks", recursoId: stackId });
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
  /**
   * SPEC-38 (D3) mudou a semântica de escrita: OWNER do escopo edita mesmo com
   * RBAC ligado — a delegação por papel passou a ser o caminho de quem NÃO é
   * owner. Os seeds da migração viraram owner, então os testes que medem a
   * negação RBAC rebaixam o usuário para `operar` antes (e o afterEach
   * restaura, porque `usuario_time` não é truncado entre testes).
   */
  async function nivelDoSeed(email: string, nivel: string) {
    await db.update(usuarioTime).set({ nivel }).where(eq(usuarioTime.email, email));
  }

  afterEach(async () => {
    await nivelDoSeed(EMAIL_DEV, "owner");
    await nivelDoSeed(EMAIL_OUTRO, "owner");
  });

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
      await salvarRegras(await logarComo(EMAIL_DEV), REGRAS_BASE); // dev é owner: pode
      await nivelDoSeed(EMAIL_OUTRO, "operar"); // a delegação é o caminho de quem NÃO é owner
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
      await nivelDoSeed(EMAIL_OUTRO, "operar");
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
      await nivelDoSeed(EMAIL_OUTRO, "operar");
      await criarPapel("SoCampos", [{ recurso: "campos-no", acao: "editar" }], [{ email: EMAIL_OUTRO }]);

      // Salvar sem editar não é uma edição. Sem isto, abrir a tela e clicar em
      // salvar por reflexo viraria 403 para quase todo mundo.
      expect((await salvarRegras(await logarComo(EMAIL_OUTRO), REGRAS_BASE)).statusCode).toBe(200);
    });
  });

  it("as rotas que a Fase 1b passou a cobrir negam quem não tem o papel", async () => {
    await nivelDoSeed(EMAIL_OUTRO, "operar");
    await criarPapel("SoProcesso", [{ recurso: "regras.checklistProcesso", acao: "editar" }], [
      { email: EMAIL_OUTRO },
    ]);
    const cookie = await logarComo(EMAIL_OUTRO);

    // Sempre o time DE EMAIL_OUTRO (`time-portabilidade`), nunca outro: com um
    // time alheio o 403 viria de `exigirTime` e o teste passaria sem que a
    // permissão tivesse sido consultada — mediria o portão errado. Foi o que
    // aconteceu na primeira versão deste teste.
    const chamadas = [
      ["POST", "/stacks/capturar", { tipoNo: "service", valores: { linguagem: "x" } }, "perfis-stack"],
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

  it("MIGRAÇÃO: organização sem papel nenhum continua deixando o OWNER editar", async () => {
    // Se este quebrar, atualizar a versão tranca todos os clientes existentes
    // para fora — o modo de falha que a §4.3 existe para impedir. Com a
    // SPEC-38, quem a migração 0019 preservou com esse poder é o owner (todos
    // os membros pré-existentes), não mais "qualquer membro" novo.
    const resposta = await criarCampo(await logarComo(EMAIL_DEV), "modo-aberto");
    expect(resposta.statusCode).toBe(201);
  });

  it("o cenário do usuário: Arquitetura edita campos, Agilidade não — cada uma 403 na área da outra", async () => {
    // Ambos operar: o que está sendo medido é a DELEGAÇÃO por papel, não o
    // poder de owner (que passaria por cima e o teste mediria o portão errado).
    await nivelDoSeed(EMAIL_DEV, "operar");
    await nivelDoSeed(EMAIL_OUTRO, "operar");
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
    await nivelDoSeed(EMAIL_DEV, "operar");
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

  it("com RBAC ligado, quem não tem papel nenhum (nem é owner) é negado", async () => {
    await nivelDoSeed(EMAIL_OUTRO, "operar");
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

  /**
   * §220 — sem `curados` a tela não tem como espelhar o owner-bypass: ela sabe
   * o que ELA tem (`porRecurso`), nunca se OUTRO papel carrega o recurso. Foi
   * essa metade faltando que fez um owner ver cadeado em tudo enquanto o
   * servidor aceitava a escrita.
   */
  it("GET /permissoes/minhas diz ONDE a curadoria está ligada, não só o que eu tenho", async () => {
    const cookie = await logarComo(EMAIL_DEV);
    const antes = await app.inject({ method: "GET", url: "/permissoes/minhas", cookies: { gerador_sessao: cookie } });
    expect(antes.json().curados).toEqual([]);

    // Papel de OUTRA pessoa: não entra no meu `porRecurso`, mas liga a
    // curadoria do recurso para todo mundo — inclusive para owners.
    await criarPapel("Curador de stack", [{ recurso: "perfis-stack", acao: "editar" }], [{ email: "outra@gerador.local" }]);

    const depois = (await app.inject({ method: "GET", url: "/permissoes/minhas", cookies: { gerador_sessao: cookie } })).json();
    expect(depois.porRecurso["perfis-stack"]).toBeUndefined();
    expect(depois.curados).toEqual(["perfis-stack"]);
  });

  it("administrar acessos exige permissão de `acessos` — sem ela, 403", async () => {
    await nivelDoSeed(EMAIL_DEV, "operar");
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
    await nivelDoSeed(EMAIL_OUTRO, "operar");
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

/**
 * SPEC-35 — salvar configuração de prompt inválida recusa com o motivo. O
 * portão mora na aplicação; aqui se prova a TRADUÇÃO: 400 com a frase que a
 * tela mostra, por qualquer caminho (tab, painel Configurar ou API direta).
 */
describe("SPEC-35 — validação de escrita de prompts/templates", () => {
  it("template sem {{itens}} é 400 com a consequência escrita — o corpo do documento não pode sumir em silêncio", async () => {
    const resposta = await app.inject({
      method: "PUT",
      url: "/especificacao-template",
      cookies: { gerador_sessao: await logarComo(EMAIL_DEV) },
      payload: { conteudo: "# {{titulo}}\n{{contexto}}" },
    });
    expect(resposta.statusCode).toBe(400);
    expect(resposta.json().erro).toContain("{{itens}}");
    expect(resposta.json().erro).toContain("corpo do documento");
  });

  it("pipeline com id duplicado é 400 nomeando o papel — antes o segundo era descartado em silêncio", async () => {
    const papel = { nome: "PO", grupo: "po", ativo: true, contextos: [] };
    const resposta = await app.inject({
      method: "PUT",
      url: "/config/pipeline-agentes",
      cookies: { gerador_sessao: await logarComo(EMAIL_DEV) },
      payload: { documento: { confirmacaoObrigatoria: true, papeis: [{ id: "po", ...papel }, { id: "po", ...papel }] } },
    });
    expect(resposta.statusCode).toBe(400);
    expect(resposta.json().erro).toContain('"po"');
  });

  it("pipeline com `papeis` vazio é 400 — apagar a esteira exige intenção, e a mensagem diz como", async () => {
    const resposta = await app.inject({
      method: "PUT",
      url: "/config/pipeline-agentes",
      cookies: { gerador_sessao: await logarComo(EMAIL_DEV) },
      payload: { documento: { confirmacaoObrigatoria: true, papeis: [] } },
    });
    expect(resposta.statusCode).toBe(400);
    expect(resposta.json().erro).toContain("esteira");
  });

  it("regras sem `porTech` é 400, não 500 — a rota nunca capturava ConfigInvalida e o motivo morria no log", async () => {
    const resposta = await app.inject({
      method: "PUT",
      url: "/config/regras",
      cookies: { gerador_sessao: await logarComo(EMAIL_DEV) },
      payload: { documento: { qualquerCoisa: true } },
    });
    expect(resposta.statusCode).toBe(400);
    expect(resposta.json().erro).toContain("porTech");
  });
});

/**
 * SPEC-53 Fase 1 — o produto como entidade. O que se prova aqui é a
 * modelagem: produto atravessa times, o vínculo com a quebra sobrevive ao
 * ida-e-volta (foi o que a SPEC-31 apanhou de campo morrendo na borda), e
 * escrever exige o recurso próprio.
 */
describe("produtos (SPEC-53)", () => {
  it("cria com o mínimo e o contexto nasce vazio — cadastro não pode ser um formulário de seis campos", async () => {
    const cookie = await logarComo(EMAIL_DEV);
    const criado = await app.inject({
      method: "POST",
      url: "/produtos",
      cookies: { gerador_sessao: cookie },
      payload: { nome: "Portabilidade" },
    });

    expect(criado.statusCode).toBe(201);
    expect(criado.json()).toMatchObject({ nome: "Portabilidade", objetivo: "", glossario: [], timeIds: [] });
  });

  it("o contexto sobrevive ao ida-e-volta, seção por seção", async () => {
    const cookie = await logarComo(EMAIL_DEV);
    const { id } = (
      await app.inject({ method: "POST", url: "/produtos", cookies: { gerador_sessao: cookie }, payload: { nome: "Fatura" } })
    ).json();

    const atualizado = await app.inject({
      method: "PUT",
      url: `/produtos/${id}`,
      cookies: { gerador_sessao: cookie },
      payload: {
        objetivo: "Cobrar o que foi consumido no mês.",
        quemUsa: "Cliente final e o time de atendimento.",
        regrasDeNegocio: "Fatura fechada não muda de valor.",
        sistemas: "ERP e o gateway de pagamento.",
        restricoes: "Retenção fiscal de 5 anos.",
      },
    });

    expect(atualizado.statusCode).toBe(200);
    expect(atualizado.json()).toMatchObject({
      objetivo: "Cobrar o que foi consumido no mês.",
      restricoes: "Retenção fiscal de 5 anos.",
    });
    const relido = (await app.inject({ method: "GET", url: `/produtos/${id}`, cookies: { gerador_sessao: cookie } })).json();
    expect(relido.regrasDeNegocio).toBe("Fatura fechada não muda de valor.");
  });

  it("o glossário é upsert pelo termo — corrigir uma definição não cria um segundo verbete", async () => {
    const cookie = await logarComo(EMAIL_DEV);
    const { id } = (
      await app.inject({ method: "POST", url: "/produtos", cookies: { gerador_sessao: cookie }, payload: { nome: "Carteira" } })
    ).json();

    for (const definicao of ["saldo disponível", "saldo disponível MENOS o bloqueado"]) {
      const r = await app.inject({
        method: "POST",
        url: `/produtos/${id}/glossario`,
        cookies: { gerador_sessao: cookie },
        payload: { termo: "Saldo", definicao },
      });
      expect(r.statusCode).toBe(201);
    }

    const produto = (await app.inject({ method: "GET", url: `/produtos/${id}`, cookies: { gerador_sessao: cookie } })).json();
    expect(produto.glossario).toHaveLength(1);
    expect(produto.glossario[0].definicao).toBe("saldo disponível MENOS o bloqueado");
  });

  it("produto atravessa times, e a lista por time RESTRINGE (sem time amarrado, aparece pra todos)", async () => {
    const cookie = await logarComo(EMAIL_DEV);
    const doDois = (
      await app.inject({ method: "POST", url: "/produtos", cookies: { gerador_sessao: cookie }, payload: { nome: "Compartilhado" } })
    ).json();
    const solto = (
      await app.inject({ method: "POST", url: "/produtos", cookies: { gerador_sessao: cookie }, payload: { nome: "Recém-criado" } })
    ).json();

    const vinculado = await app.inject({
      method: "PUT",
      url: `/produtos/${doDois.id}/times`,
      cookies: { gerador_sessao: cookie },
      payload: { timeIds: [TIME_A, "time-checkout", TIME_A] },
    });
    expect(vinculado.statusCode).toBe(200);
    // Duplicata do cliente é ruído, não intenção.
    expect(vinculado.json().timeIds.sort()).toEqual([TIME_A, "time-checkout"].sort());

    const doTimeA = (
      await app.inject({ method: "GET", url: `/produtos?timeId=${TIME_A}`, cookies: { gerador_sessao: cookie } })
    ).json();
    expect(doTimeA.map((p: { nome: string }) => p.nome).sort()).toEqual(["Compartilhado", "Recém-criado"]);

    const doPortabilidade = (
      await app.inject({ method: "GET", url: "/produtos?timeId=time-portabilidade", cookies: { gerador_sessao: cookie } })
    ).json();
    expect(doPortabilidade.map((p: { nome: string }) => p.nome)).toEqual(["Recém-criado"]);
  });

  it("o vínculo da QUEBRA com o produto sobrevive ao ida-e-volta — o campo que morria na borda (SPEC-31)", async () => {
    const cookie = await logarComo(EMAIL_DEV);
    const produto = (
      await app.inject({ method: "POST", url: "/produtos", cookies: { gerador_sessao: cookie }, payload: { nome: "Cobrança" } })
    ).json();

    const criada = await app.inject({
      method: "POST",
      url: "/quebras",
      cookies: { gerador_sessao: cookie },
      payload: { titulo: "demanda com produto", time: TIME_A, diagrama: { nodes: [], edges: [] }, produtoId: produto.id },
    });
    expect(criada.statusCode).toBe(201);
    expect(criada.json().produtoId).toBe(produto.id);

    const relida = await app.inject({ method: "GET", url: `/quebras/${criada.json().id}`, cookies: { gerador_sessao: cookie } });
    expect(relida.json().produtoId).toBe(produto.id);
  });

  it("SPEC-57 fatia A: o propósito da demanda atravessa a borda inteira", async () => {
    // A borda é onde campo novo morre: o Zod de `/quebras` descartou em
    // silêncio três campos até a migração 0011, e a SPEC-53 repetiu a lição.
    // Este teste existe para a terceira vez não acontecer.
    const cookie = await logarComo(EMAIL_DEV);
    const necessidades = [
      { id: "r1", texto: "não cobrar duas vezes", prioridade: "alta", origem: "manual", atendidaPor: ["n1"] },
      { id: "r2", texto: "sugestão do agente", origem: "sugerido", confirmado: false, atendidaPor: [] },
    ];

    const criada = await app.inject({
      method: "POST",
      url: "/quebras",
      cookies: { gerador_sessao: cookie },
      payload: { titulo: "demanda com propósito", time: TIME_A, diagrama: { nodes: [], edges: [] }, necessidades },
    });
    expect(criada.statusCode).toBe(201);
    expect(criada.json().necessidades).toEqual(necessidades);

    const relida = await app.inject({ method: "GET", url: `/quebras/${criada.json().id}`, cookies: { gerador_sessao: cookie } });
    expect(relida.json().necessidades).toEqual(necessidades);
  });

  it("origem inventada numa necessidade é 400 — a lista é FECHADA como a de recursos", async () => {
    const cookie = await logarComo(EMAIL_DEV);
    const resposta = await app.inject({
      method: "POST",
      url: "/quebras",
      cookies: { gerador_sessao: cookie },
      payload: {
        titulo: "propósito inválido",
        time: TIME_A,
        diagrama: { nodes: [], edges: [] },
        necessidades: [{ id: "r1", texto: "x", origem: "chutado", atendidaPor: [] }],
      },
    });
    expect(resposta.statusCode).toBe(400);
  });

  it("quebra sem necessidade nenhuma continua funcionando — propósito não vira obrigação retroativa", async () => {
    const cookie = await logarComo(EMAIL_DEV);
    const criada = await app.inject({
      method: "POST",
      url: "/quebras",
      cookies: { gerador_sessao: cookie },
      payload: { titulo: "demanda sem propósito", time: TIME_A, diagrama: { nodes: [], edges: [] } },
    });
    expect(criada.statusCode).toBe(201);
    expect(criada.json().necessidades).toEqual([]);
  });

  it("quebra SEM produto continua funcionando — a ferramenta não passa a exigir cadastro", async () => {
    const cookie = await logarComo(EMAIL_DEV);
    const criada = await app.inject({
      method: "POST",
      url: "/quebras",
      cookies: { gerador_sessao: cookie },
      payload: { titulo: "demanda sem produto", time: TIME_A, diagrama: { nodes: [], edges: [] } },
    });
    expect(criada.statusCode).toBe(201);
    expect(criada.json().produtoId).toBeNull();
  });

  it("escrever exige o recurso `produtos`: quem não tem leva 403, e continua LENDO", async () => {
    const [org] = await db.select().from(organizacoes).limit(1);
    const [papel] = await db.insert(papeisAcesso).values({ organizacaoId: org.id, nome: "Só campos" }).returning();
    await db.insert(papelPermissao).values({ papelId: papel.id, recurso: "campos-no", acao: "editar" });
    await db.insert(usuarioPapel).values({ email: EMAIL_OUTRO, papelId: papel.id, escopoTimeId: null });
    await db.update(usuarioTime).set({ nivel: "operar" }).where(eq(usuarioTime.email, EMAIL_OUTRO));
    const cookieSemPermissao = await logarComo(EMAIL_OUTRO);

    const negado = await app.inject({
      method: "POST",
      url: "/produtos",
      cookies: { gerador_sessao: cookieSemPermissao },
      payload: { nome: "Não deveria nascer" },
    });
    expect(negado.statusCode).toBe(403);

    // Ler é de todo mundo com sessão: contexto de produto serve a quem escreve
    // o item, não só a quem administra.
    const leitura = await app.inject({ method: "GET", url: "/produtos", cookies: { gerador_sessao: cookieSemPermissao } });
    expect(leitura.statusCode).toBe(200);
  });

  it("sem sessão, nem ler — é vocabulário e regra de negócio da empresa, não config técnica pública", async () => {
    expect((await app.inject({ method: "GET", url: "/produtos" })).statusCode).toBe(401);
  });
});

/**
 * SPEC-60 fatia B (§265) — o rastro da esteira.
 *
 * O que se prova aqui é o contrato do rastro contra o banco de verdade: a poda
 * que impede o histórico de crescer para sempre, a leitura que devolve a ÚLTIMA
 * de cada papel, e a regra de que "sem credencial" não é execução.
 */
describe("rastro das execuções da esteira", () => {
  beforeEach(async () => {
    await db.delete(execucoesIa);
  });

  async function anotar(dados: Parameters<typeof registrarExecucao>[1]) {
    registrarExecucao(db, dados);
    // `registrarExecucao` é fire-and-forget de propósito (nunca derruba a
    // resposta ao usuário). O teste espera a linha aparecer em vez de dormir.
    await vi.waitFor(async () => {
      expect((await db.select().from(execucoesIa)).length).toBeGreaterThan(0);
    });
  }

  it("guarda o que responde à pergunta, e nada além", async () => {
    await anotar({ rotulo: "ia/pipeline/po", papel: "po", ok: true, duracaoMs: 1234, email: "quem@exemplo" });

    const [linha] = await db.select().from(execucoesIa);
    expect(linha).toMatchObject({ rotulo: "ia/pipeline/po", papel: "po", ok: true, duracaoMs: 1234 });
    // A régua da fatia escrita como teste: prompt e resposta NÃO estão aqui, e
    // é isso que dispensa esta tabela de ter uma conversa sobre privacidade.
    expect(Object.keys(linha)).toEqual(["id", "rotulo", "papel", "ok", "erro", "duracaoMs", "email", "em"]);
  });

  it("a leitura devolve a ÚLTIMA de cada papel, não o histórico", async () => {
    await anotar({ rotulo: "ia/pipeline/po", papel: "po", ok: false, erro: "502", duracaoMs: 10 });
    await anotar({ rotulo: "ia/pipeline/po", papel: "po", ok: true, duracaoMs: 20 });
    await anotar({ rotulo: "ia/pipeline/qa", papel: "qa", ok: false, erro: "timeout", duracaoMs: 30 });

    await vi.waitFor(async () => {
      const porPapel = await ultimaExecucaoPorPapel(db);
      expect(porPapel).toHaveLength(2);
      expect(porPapel.find((e) => e.papel === "po")).toMatchObject({ ok: true, duracaoMs: 20 });
      expect(porPapel.find((e) => e.papel === "qa")).toMatchObject({ ok: false, erro: "timeout" });
    });
  });

  it("chamada que não é de papel fica registrada e NÃO aparece por papel", async () => {
    // O funil é um só: `ia/sugerir` também deixa rastro. Ele só não acende
    // avatar nenhum, porque não é papel da esteira.
    await anotar({ rotulo: "ia/sugerir", ok: true, duracaoMs: 5 });

    expect(await ultimaExecucaoPorPapel(db)).toEqual([]);
    expect((await db.select().from(execucoesIa)).length).toBe(1);
  });

  it("o histórico é podado — rastro que cresce para sempre vira problema de operação", async () => {
    for (let i = 0; i < LIMITE_DE_HISTORICO + 15; i++) {
      registrarExecucao(db, { rotulo: "ia/sugerir", ok: true, duracaoMs: i });
    }

    await vi.waitFor(
      async () => {
        const linhas = await db.select().from(execucoesIa);
        expect(linhas.length).toBeGreaterThan(0);
        expect(linhas.length).toBeLessThanOrEqual(LIMITE_DE_HISTORICO);
      },
      { timeout: 15000 }
    );
  });

  it("a rota devolve a última por papel", async () => {
    await anotar({ rotulo: "ia/pipeline/po", papel: "po", ok: false, erro: "502 do gateway", duracaoMs: 40 });

    await vi.waitFor(async () => {
      const resposta = await app.inject({ method: "GET", url: "/ia/execucoes" });
      expect(resposta.statusCode).toBe(200);
      expect(resposta.json().porPapel).toMatchObject([{ papel: "po", ok: false, erro: "502 do gateway" }]);
    });
  });

  /** A rota do diagrama, e não a do papel: o funil é o MESMO
   * (`executarPedido`), e a rota do papel lê a config da esteira antes de
   * chegar nele — sujaria o estado de outro teste deste arquivo para provar
   * exatamente a mesma coisa. */
  const pedirDiagrama = () =>
    app.inject({
      method: "POST",
      url: "/ia/diagrama",
      payload: { descricao: "um serviço de crédito", tiposDeNo: [{ id: "servico", rotulo: "Serviço" }] },
    });

  it("falha do gateway VIRA rastro — é o que acende o avatar", async () => {
    // A credencial gravada por um teste anterior aponta para um gateway que
    // recusa: 502 de verdade, atravessando o provedor. É o caminho que o
    // usuário vive quando a chave expira, e o que precisa deixar marca.
    const resposta = await pedirDiagrama();
    expect(resposta.statusCode).toBe(502);

    await vi.waitFor(async () => {
      const [linha] = await db.select().from(execucoesIa);
      expect(linha).toMatchObject({ rotulo: "ia/diagrama", ok: false });
      expect(linha.erro).toBeTruthy();
      // A duração é medida, não inventada: um zero aqui significaria que o
      // cronômetro nasceu no lugar errado.
      expect(linha.duracaoMs).toBeGreaterThan(0);
    });
  });

  it("sem credencial NÃO é execução — o avatar não pode acusar o papel por uma config que não é dele", async () => {
    const guardadas = await db.select().from(credenciaisIa);
    await db.delete(credenciaisIa);
    try {
      const resposta = await pedirDiagrama();

      expect(resposta.statusCode).toBe(503);
      expect(await db.select().from(execucoesIa)).toEqual([]);
    } finally {
      // Devolve o que estava lá: este bloco é o último do arquivo, mas contar
      // com isso é o tipo de aposta que estraga a suíte quando alguém
      // acrescenta um `describe` embaixo.
      if (guardadas.length > 0) await db.insert(credenciaisIa).values(guardadas);
    }
  });
});

/**
 * §273 — a lista de ajustes é dos SEUS times.
 *
 * ACHADO REAL (print do usuário): a tela do PDCA mostrava solicitações de um
 * time que a pessoa não tinha escolhido, e agir sobre uma delas trazia um 403
 * citando esse time. O 403 estava certo — a lista é que não deveria ter
 * colocado aquilo ali.
 */
describe("GET /ajustes — escopo por time", () => {
  beforeEach(async () => {
    await db.delete(solicitacoesAjuste);
  });

  async function pedir(cookie: string, timeId: string | null, descricao: string) {
    const resposta = await app.inject({
      method: "POST",
      url: "/ajustes",
      cookies: { gerador_sessao: cookie },
      payload: {
        recurso: "regras",
        descricao,
        ...(timeId ? { timeId } : {}),
        operacao: { tipo: "adicionar-checklist", tech: "java", contextos: [], texto: descricao },
      },
    });
    expect(resposta.statusCode).toBe(201);
  }

  it("com `timeId`, devolve só o daquele time — e o da organização inteira", async () => {
    const cookie = await logarComo(EMAIL_DEV);
    await pedir(cookie, TIME_A, "do time A");
    await pedir(cookie, TIME_B, "do time B");
    await pedir(cookie, null, "da organização");

    const lista = (
      await app.inject({ method: "GET", url: `/ajustes?timeId=${TIME_A}`, cookies: { gerador_sessao: cookie } })
    ).json() as { descricao: string }[];

    expect(lista.map((s) => s.descricao).sort()).toEqual(["da organização", "do time A"]);
  });

  it("`timeId` de time que não é seu não abre porta nenhuma", async () => {
    // A interseção com os times da SESSÃO é a garantia que não depende de a
    // tela mandar o parâmetro certo.
    const cookie = await logarComo(EMAIL_DEV);
    await pedir(cookie, TIME_A, "do time A");
    const cookieDeFora = await logarComo("de-fora@gerador.local");

    const lista = (
      await app.inject({ method: "GET", url: `/ajustes?timeId=${TIME_A}`, cookies: { gerador_sessao: cookieDeFora } })
    ).json() as unknown[];

    expect(lista).toEqual([]);
  });

  it("sem `timeId`, devolve os dos times da sessão", async () => {
    const cookie = await logarComo(EMAIL_DEV);
    await pedir(cookie, TIME_A, "do time A");
    await pedir(cookie, TIME_B, "do time B");

    const lista = (await app.inject({ method: "GET", url: "/ajustes", cookies: { gerador_sessao: cookie } })).json() as {
      descricao: string;
    }[];

    expect(lista.map((s) => s.descricao).sort()).toEqual(["do time A", "do time B"]);
  });
});
