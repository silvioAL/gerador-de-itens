import { migrate } from "drizzle-orm/node-postgres/migrator";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { criarBancoDeDados, type BancoDeDados } from "../db/client.js";
import {
  exigirBancoDescartavel,
  garantirBancoDeTeste,
  organizacaoDeTeste,
  URL_BANCO_DE_TESTE,
} from "../test-support/bancoDeTeste.js";
import { buildApp } from "../app.js";
import { fluxoExecucoes, pdcaFeedback, times, usuarioTime } from "../db/schema.js";

/**
 * **O vazamento entre times, e como ele foi descoberto.**
 *
 * Relato real de quem usava: a pessoa abriu o fluxo de ensaio pelo time DELA,
 * o canvas listou uma execução suspensa, ela clicou em "abrir →" e caiu numa
 * tela cujos dois botões recusavam — "exige nível operar no time
 * time-pagamentos; seu nível é nenhum". Presa: não podia avançar, não podia
 * retornar.
 *
 * A recusa estava CERTA. Errado era tudo antes dela: a execução não era do
 * time da pessoa e nunca deveria ter sido listada. `ensaio-de-cenarios` é
 * fluxo de FÁBRICA — todo time tem um, com o mesmo id —, e a listagem filtrava
 * só por `fluxoId`.
 *
 * Eram QUATRO rotas com a mesma distração (`exigirSessao` e nada mais), cada
 * uma escrita numa fatia diferente. Estas provas são uma por rota, e existem
 * para que a quinta nasça certa.
 */

const DATABASE_URL = process.env.DATABASE_URL || URL_BANCO_DE_TESTE;
let db: BancoDeDados;

const TIME_DELA = "time-vaz-dela";
const TIME_ALHEIO = "time-vaz-alheio";
const ELA = "ela-vaz@gerador.local";

beforeAll(async () => {
  exigirBancoDescartavel(DATABASE_URL);
  await garantirBancoDeTeste(DATABASE_URL);
  db = criarBancoDeDados(DATABASE_URL).db;
  await migrate(db, { migrationsFolder: resolve(import.meta.dirname, "../../migrations") });

  // A organização é a que já existe: inventar uma segunda faria o RBAC e o
  // catálogo de produtos enxergarem dois mundos (a lição do `globalSetup`).
  const organizacaoId = await organizacaoDeTeste(db);
  for (const id of [TIME_DELA, TIME_ALHEIO]) {
    await db.insert(times).values({ id, nome: id, organizacaoId }).onConflictDoNothing();
  }
  // Ela é dona do time DELA e não é nada no outro — o recorte da vida real.
  await db.insert(usuarioTime).values({ email: ELA, timeId: TIME_DELA, nivel: "owner" }).onConflictDoNothing();
});

afterAll(async () => {
  await db.delete(fluxoExecucoes).where(eq(fluxoExecucoes.fluxoId, "ensaio-de-cenarios-vaz"));
  await db.delete(pdcaFeedback).where(eq(pdcaFeedback.timeId, TIME_ALHEIO));
  await db.delete(pdcaFeedback).where(eq(pdcaFeedback.timeId, TIME_DELA));
});

type App = Awaited<ReturnType<typeof buildApp>>;

async function comApp<T>(f: (app: App, cookies: Record<string, string>) => Promise<T>): Promise<T> {
  const app = await buildApp({ db, diretorioConfig: resolve(import.meta.dirname, "../../../../config") });
  await app.ready();
  try {
    const sessao = await app.inject({ method: "POST", url: "/auth/login", payload: { email: ELA } });
    const cookies = sessao.cookies.reduce((acc, c) => ({ ...acc, [c.name]: c.value }), {});
    return await f(app, cookies);
  } finally {
    await app.close();
  }
}

/** Uma execução suspensa numa tela, do time em que ela NÃO está. */
async function execucaoAlheia(): Promise<string> {
  const [linha] = await db
    .insert(fluxoExecucoes)
    .values({
      fluxoId: "ensaio-de-cenarios-vaz",
      timeId: TIME_ALHEIO,
      hash: "hash-alheio",
      email: "outra@gerador.local",
      nos: [{ noId: "demanda", tipo: "projeto", refId: "demanda-ler", estado: "sucesso", duracaoMs: 1 }],
      estado: "aguardando-tela",
      saidas: { demanda: { segredo: "o desenho do time alheio" } },
      ateNo: null,
    })
    .returning({ id: fluxoExecucoes.id });
  return linha.id;
}

describe("o histórico de execuções não atravessa o time", () => {
  it("a execução de OUTRO time não aparece na listagem do fluxo de fábrica", async () => {
    await comApp(async (app, cookies) => {
      await execucaoAlheia();
      const [minha] = await db
        .insert(fluxoExecucoes)
        .values({
          fluxoId: "ensaio-de-cenarios-vaz",
          timeId: TIME_DELA,
          hash: "hash-dela",
          email: ELA,
          nos: [],
        })
        .returning({ id: fluxoExecucoes.id });

      const r = await app.inject({ method: "GET", url: "/fluxos/ensaio-de-cenarios-vaz/execucoes", cookies });
      expect(r.statusCode).toBe(200);
      const { execucoes } = r.json() as { execucoes: { id: string; timeId: string }[] };

      // A dela está; a alheia não — e o SEGREDO dela não viaja no corpo.
      expect(execucoes.map((e) => e.id)).toContain(minha.id);
      expect(execucoes.every((e) => e.timeId === TIME_DELA)).toBe(true);
      expect(JSON.stringify(execucoes)).not.toContain("o desenho do time alheio");
    });
  });

  /**
   * O furo que a primeira versão do conserto deixou, e que só apareceu quando o
   * E2E rodou contra dados de verdade: dez ensaios suspensos gravados com
   * `__global__` continuavam aparecendo para qualquer sessão.
   *
   * A régua da POLÍTICA (sem time = da organização, todo mundo vê) estava sendo
   * aplicada a EVENTO. Execução não é política: é o registro de que alguém
   * rodou algo, com o rastro do que saiu de cada nó. Sem time, ela é de quem a
   * disparou.
   */
  it("execução SEM time é de quem a rodou — não da organização", async () => {
    await comApp(async (app, cookies) => {
      await db.insert(fluxoExecucoes).values({
        fluxoId: "ensaio-de-cenarios-vaz",
        timeId: "__global__",
        hash: "hash-global-alheio",
        email: "outra@gerador.local",
        nos: [],
        estado: "aguardando-tela",
        saidas: { demanda: { segredo: "global de outra pessoa" } },
      });
      const [minhaGlobal] = await db
        .insert(fluxoExecucoes)
        .values({
          fluxoId: "ensaio-de-cenarios-vaz",
          timeId: "__global__",
          hash: "hash-global-meu",
          email: ELA,
          nos: [],
        })
        .returning({ id: fluxoExecucoes.id });

      const r = await app.inject({ method: "GET", url: "/fluxos/ensaio-de-cenarios-vaz/execucoes", cookies });
      const { execucoes } = r.json() as { execucoes: { id: string }[] };
      expect(execucoes.map((e) => e.id)).toContain(minhaGlobal.id);
      expect(JSON.stringify(execucoes)).not.toContain("global de outra pessoa");
    });
  });

  /**
   * A exceção que a prova integral da D18 (fatia K) obrigou a abrir: o disparo
   * SEM GENTE. Quem roda um agendamento é o relógio; nenhuma sessão humana casa
   * com esse endereço, e a régua "sem time é de quem rodou" escondia de TODO
   * MUNDO a execução que ninguém consegue reproduzir à mão. O recurso existia e
   * não se auditava.
   */
  it("execução sem time disparada pelo RELÓGIO é da organização — senão ninguém a audita", async () => {
    await comApp(async (app, cookies) => {
      await db.insert(fluxoExecucoes).values({
        fluxoId: "ensaio-de-cenarios-vaz",
        timeId: "__global__",
        hash: "hash-do-relogio",
        email: "agendamento@gerador.local",
        nos: [],
      });
      const r = await app.inject({ method: "GET", url: "/fluxos/ensaio-de-cenarios-vaz/execucoes", cookies });
      const { execucoes } = r.json() as { execucoes: { email: string }[] };
      expect(execucoes.some((e) => e.email === "agendamento@gerador.local")).toBe(true);
    });
  });

  it("pedir explicitamente o time alheio não abre a porta", async () => {
    await comApp(async (app, cookies) => {
      await execucaoAlheia();
      const r = await app.inject({
        method: "GET",
        url: `/fluxos/ensaio-de-cenarios-vaz/execucoes?timeId=${TIME_ALHEIO}`,
        cookies,
      });
      expect(r.statusCode).toBe(200);
      // Lista vazia, não 403: quem pergunta pelo que não é dele recebe nada,
      // não um mapa do que existe.
      expect((r.json() as { execucoes: unknown[] }).execucoes).toEqual([]);
    });
  });
});

describe("a tela do stage tem cadeado na PORTA (SPEC-51)", () => {
  it("abrir o stage de uma execução alheia é recusado — não renderizado", async () => {
    await comApp(async (app, cookies) => {
      const id = await execucaoAlheia();
      const r = await app.inject({ method: "GET", url: `/fluxos/execucoes/${id}/tela`, cookies });

      // Antes: 200 com o conteúdo, e a pessoa só descobria o limite ao clicar
      // em Avançar/Retornar — presa numa tela sem saída.
      expect(r.statusCode).toBe(403);
      expect(JSON.stringify(r.json())).not.toContain("o desenho do time alheio");
    });
  });

  it("execução inexistente responde 404, e não 403 — a recusa não conta o que existe", async () => {
    await comApp(async (app, cookies) => {
      const r = await app.inject({
        method: "GET",
        url: "/fluxos/execucoes/00000000-0000-0000-0000-000000000000/tela",
        cookies,
      });
      expect(r.statusCode).toBe(404);
    });
  });
});

describe("o feedback do PDCA é do time — e o balão do assistente conta o do time", () => {
  it("o feedback de outro time não entra na listagem", async () => {
    await comApp(async (app, cookies) => {
      await db.insert(pdcaFeedback).values({ email: "outra@gerador.local", timeId: TIME_ALHEIO, texto: "queixa alheia" });
      await db.insert(pdcaFeedback).values({ email: ELA, timeId: TIME_DELA, texto: "queixa dela" });

      const r = await app.inject({ method: "GET", url: "/pdca/feedback", cookies });
      expect(r.statusCode).toBe(200);
      const corpo = JSON.stringify(r.json());
      expect(corpo).toContain("queixa dela");
      // Foi ESTE vazamento que acendeu o balão "Tem 1 feedback do time
      // esperando" numa sessão de outro time, e o balão chegou a cobrir o
      // botão de um teste sem relação nenhuma.
      expect(corpo).not.toContain("queixa alheia");
    });
  });

  it("o feedback SEM time continua visível: ele é da organização", async () => {
    await comApp(async (app, cookies) => {
      await db.insert(pdcaFeedback).values({ email: "qualquer@gerador.local", timeId: null, texto: "queixa da casa" });
      const r = await app.inject({ method: "GET", url: "/pdca/feedback", cookies });
      expect(JSON.stringify(r.json())).toContain("queixa da casa");
    });
  });
});

describe("a saúde das últimas execuções deixou de ser pública", () => {
  it("sem sessão, 401 — antes ela dizia a QUALQUER UM quais fluxos existem", async () => {
    await comApp(async (app) => {
      const r = await app.inject({ method: "GET", url: "/fluxos/execucoes/ultimas" });
      expect(r.statusCode).toBe(401);
    });
  });

  it("com sessão, só os fluxos dos times dela", async () => {
    await comApp(async (app, cookies) => {
      await execucaoAlheia();
      const r = await app.inject({ method: "GET", url: "/fluxos/execucoes/ultimas", cookies });
      expect(r.statusCode).toBe(200);
      const { ultimas } = r.json() as { ultimas: { fluxoId: string }[] };
      // O fluxo só existe com execução alheia: ele não pode aparecer.
      expect(ultimas.map((u) => u.fluxoId)).not.toContain("ensaio-de-cenarios-vaz");
    });
  });
});
