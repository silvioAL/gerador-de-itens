import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { buildApp } from "./app.js";
import { criarBancoDeDados, type BancoDeDados } from "./db/client.js";
import { camposNo } from "./db/schema.js";
import { exigirBancoDescartavel, garantirBancoDeTeste, URL_BANCO_DE_TESTE } from "./test-support/bancoDeTeste.js";

/**
 * Banco PRÓPRIO, e não o `gerador_test` compartilhado.
 *
 * O vitest roda arquivos em paralelo, e `app.test.ts` trunca `campos_no` no
 * meio da corrida deste — a primeira versão passava ou falhava conforme o
 * interleaving. Um teste que depende de quem chegou primeiro é pior que
 * nenhum: ensina a equipe a re-rodar até passar.
 *
 * O sufixo `_test` é obrigatório — é o que `exigirBancoDescartavel` exige, e
 * foi a trava criada depois de o E2E apagar o banco de trabalho do usuário.
 */

/**
 * #308 — o contrato do lado CONDUTOR, que a revisão da SPEC-31 (§11) apontou
 * como o maior buraco que sobrou.
 *
 * `packages/web/src/api/client.ts` tem 883 linhas de adaptador HTTP escrito à
 * mão, e o `client.test.ts` dele valida contra `fetch` MOCKADO: afirma o que o
 * cliente faz com uma resposta IMAGINADA, nunca com a real. Nada no projeto
 * comparava as duas pontas — exatamente a mesma classe de defeito do dublê de
 * `@xyflow/react` que não recusava `Delete` (§148) e do `page.route` que
 * derrubava a própria aplicação (§152). O teste do lado errado da fronteira.
 *
 * Aqui o servidor é o de verdade (Fastify + Postgres + migrações) e o cliente é
 * o de verdade, importado do `packages/web`. Se alguém renomear um campo de
 * resposta, mudar um status, ou trocar o envelope de uma rota, este arquivo
 * fica vermelho — e não a tela do usuário três semanas depois.
 *
 * Mora em `packages/server` porque é aqui que subir a app com banco já
 * funciona; o import relativo do cliente segue o precedente do
 * `web/e2e/globalSetup.ts`, que importa `test-support/bancoDeTeste` na direção
 * contrária pelo mesmo motivo: a regra é UMA só, e copiá-la é o defeito.
 */
const DIRETORIO_CONFIG = resolve(import.meta.dirname, "../../../config");

let app: FastifyInstance;
let db: BancoDeDados;
let cliente: typeof import("../../web/src/api/client.js");

/**
 * O `fetch` do Node não guarda cookie, e o cliente manda `credentials:
 * "include"` — sem isto, toda rota autenticada responderia 401 e o contrato
 * cobriria só o que não importa. Emula o que o navegador faz, no TESTE, sem
 * tocar no código de produção.
 */
function instalarPoteDeCookies() {
  const original = globalThis.fetch;
  let cookie = "";
  globalThis.fetch = (async (entrada: RequestInfo | URL, init?: RequestInit) => {
    const cabecalhos = new Headers(init?.headers);
    if (cookie) cabecalhos.set("cookie", cookie);
    const resposta = await original(entrada, { ...init, headers: cabecalhos });
    const emitido = resposta.headers.getSetCookie?.() ?? [];
    for (const bruto of emitido) {
      const par = bruto.split(";")[0];
      if (par) cookie = cookie ? `${cookie}; ${par}` : par;
    }
    return resposta;
  }) as typeof fetch;
  return () => {
    globalThis.fetch = original;
  };
}

let restaurarFetch: () => void;

beforeAll(async () => {
  exigirBancoDescartavel(URL_BANCO_DE_TESTE);
  await garantirBancoDeTeste(URL_BANCO_DE_TESTE);
  const banco = criarBancoDeDados(URL_BANCO_DE_TESTE);
  db = banco.db;
  await migrate(db, { migrationsFolder: resolve(import.meta.dirname, "../migrations") });
  process.env.RATE_LIMIT_LOGIN_MAX = "1000";
  process.env.RATE_LIMIT_GLOBAL_MAX = "10000";

  app = await buildApp({ db, diretorioConfig: DIRETORIO_CONFIG });
  // Porta 0 = efêmera: dois arquivos de teste rodando junto não brigam.
  const endereco = await app.listen({ port: 0, host: "127.0.0.1" });

  // O `BASE_URL` do cliente é `const` de módulo, avaliado no import — stubar o
  // ambiente ANTES do import é o que faz ele apontar para esta instância.
  vi.stubEnv("VITE_API_URL", endereco);
  restaurarFetch = instalarPoteDeCookies();
  cliente = await import("../../web/src/api/client.js");
}, 60_000);

afterAll(async () => {
  restaurarFetch?.();
  vi.unstubAllEnvs();
  await app?.close();
});

describe("o cliente do web contra o servidor de verdade (#308)", () => {
  it("login devolve a sessão na forma que a tela consome", async () => {
    const sessao = await cliente.apiAuth.entrarDev("dev@gerador.local");

    // `email` e `timeIds` são o que `App.tsx` usa pra decidir entre a tela de
    // escolha de time e o canvas. Um rename aqui hoje só aparece em produção.
    expect(sessao.email).toBe("dev@gerador.local");
    expect(Array.isArray(sessao.timeIds)).toBe(true);
    expect(sessao.timeIds).toContain("time-pagamentos");
  });

  it("a sessão sobrevive à requisição seguinte — é o que o F5 exercita (#280)", async () => {
    const eu = await cliente.apiAuth.me();
    expect(eu?.email).toBe("dev@gerador.local");
  });

  it("campos-no volta como LISTA já com a sobreposição do time resolvida", async () => {
    // Insere pelo BANCO, não pelo cliente: escrever exigiria sessão com time e
    // papel, e o estado de RBAC que `app.test.ts` cria fazia este contrato
    // depender da ORDEM dos arquivos de teste — acaso, não contrato. O que se
    // afirma aqui é a FORMA DA RESPOSTA no caminho de leitura, que é o do
    // cliente. A seed 0016 também não serve: `app.test.ts` trunca a tabela.
    const chave = `contrato-${Date.now()}`;
    await db.insert(camposNo).values({
      timeId: "time-pagamentos",
      tipoNo: "service",
      key: chave,
      label: "Campo do contrato",
      type: "text",
      required: true,
      ordem: 99,
    });

    const campos = await cliente.apiCamposNo.listar("time-pagamentos");
    expect(Array.isArray(campos)).toBe(true);
    // Se o servidor mudar a forma, a aba "Padrões por componente" volta a
    // mostrar (0) e ninguém sabe por quê.
    expect(campos.find((c) => c.key === chave)).toMatchObject({
      tipoNo: "service",
      type: "text",
      required: true,
    });
  });

  it("regras vem no ENVELOPE {documento, diagnostico} que a aba espera", async () => {
    const envelope = await cliente.apiRegras.obterComDiagnostico();

    // A aba de Regras lê `envelope.documento.porTech`. Um dia esta rota
    // devolveu o documento cru; o envelope é o que sustenta o aviso de config
    // desatualizada (SPEC-31 Fase 3).
    expect(envelope.documento).toBeDefined();
    expect(typeof envelope.documento.porTech).toBe("object");
    expect(envelope.diagnostico).toHaveProperty("possivelmenteDesatualizada");
  });

  it("pipeline-agentes idem — mesmo envelope, mesma aba de configuração", async () => {
    const envelope = await cliente.apiPipelineAgentes.obterComDiagnostico();
    expect(envelope.documento).toBeDefined();
    expect(envelope.diagnostico).toHaveProperty("possivelmenteDesatualizada");
  });

  it("perfis de time volta como mapa tipoNo -> campo -> valor", async () => {
    const perfis = await cliente.apiPerfisTime.listar("time-pagamentos");
    expect(typeof perfis).toBe("object");
  });

  it("template de especificação traz `conteudo` — é o que a aba edita", async () => {
    const template = await cliente.apiEspecificacaoTemplate.buscar("time-pagamentos");
    expect(typeof template.conteudo).toBe("string");
  });

  it("listar quebras devolve array — a tela de abrir depende disso pra buscar", async () => {
    const quebras = await cliente.apiQuebras.listar("time-pagamentos");
    expect(Array.isArray(quebras)).toBe(true);
  });
});
