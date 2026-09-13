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
import { fluxoExecucoes, times, usuarioTime } from "../db/schema.js";

/**
 * SPEC-111 fatia A — **a tela que vale sozinha, na rota.**
 *
 * As provas puras cobrem a derivação do fluxo implícito. O que só existe aqui é
 * a consequência dela: abrir a tela é EXECUTAR esse fluxo pelo endpoint que já
 * existe — e por isso a permissão, o histórico e o recorte por time vêm de
 * graça, sem uma linha de motor novo. Estas provas são o que garante que "de
 * graça" não é figura de linguagem.
 */

const DATABASE_URL = process.env.DATABASE_URL || URL_BANCO_DE_TESTE;
let db: BancoDeDados;

const TIME = "time-standalone";
const TIME_ALHEIO = "time-standalone-alheio";
const DONA = "dona-standalone@gerador.local";
const ESTRANHA = "estranha-standalone@gerador.local";

const DOC_TELAS = {
  telas: [
    {
      id: "aprovacao",
      nome: "Aprovação de despesa",
      icone: "🧾",
      blocos: [
        { tipo: "texto", markdown: "Confira o valor e aprove." },
        { tipo: "campo", chave: "valor", rotulo: "Valor", entrada: "numero", obrigatorio: true },
      ],
    },
  ],
};
const FLUXO_DA_TELA = "tela-standalone:aprovacao";

beforeAll(async () => {
  exigirBancoDescartavel(DATABASE_URL);
  await garantirBancoDeTeste(DATABASE_URL);
  db = criarBancoDeDados(DATABASE_URL).db;
  await migrate(db, { migrationsFolder: resolve(import.meta.dirname, "../../migrations") });

  const organizacaoId = await organizacaoDeTeste(db);
  for (const id of [TIME, TIME_ALHEIO]) {
    await db.insert(times).values({ id, nome: id, organizacaoId }).onConflictDoNothing();
  }
  await db.insert(usuarioTime).values({ email: DONA, timeId: TIME, nivel: "owner" }).onConflictDoNothing();
  await db.insert(usuarioTime).values({ email: ESTRANHA, timeId: TIME_ALHEIO, nivel: "owner" }).onConflictDoNothing();
});

afterAll(async () => {
  await db.delete(fluxoExecucoes).where(eq(fluxoExecucoes.fluxoId, FLUXO_DA_TELA));
});

type App = Awaited<ReturnType<typeof buildApp>>;

async function comApp<T>(email: string, f: (app: App, cookies: Record<string, string>) => Promise<T>): Promise<T> {
  const app = await buildApp({ db, diretorioConfig: resolve(import.meta.dirname, "../../../../config") });
  await app.ready();
  try {
    const sessao = await app.inject({ method: "POST", url: "/auth/login", payload: { email } });
    const cookies = sessao.cookies.reduce((acc, c) => ({ ...acc, [c.name]: c.value }), {});
    return await f(app, cookies);
  } finally {
    await app.close();
  }
}

const semearTela = (app: App, cookies: Record<string, string>) =>
  app.inject({ method: "PUT", url: "/config/telas", cookies, payload: { timeId: TIME, documento: DOC_TELAS } });

describe("SPEC-111 A — abrir a tela sozinha", () => {
  it("a tela declarada aparece no catálogo como um fluxo IMPLÍCITO de um nó", async () => {
    await comApp(DONA, async (app, cookies) => {
      expect((await semearTela(app, cookies)).statusCode).toBe(200);

      const r = await app.inject({ method: "GET", url: `/fluxos?timeId=${TIME}`, cookies });
      const { fluxos } = r.json() as { fluxos: { id: string; nome: string; implicito?: boolean; nos: { tipo: string }[] }[] };
      const daTela = fluxos.find((f) => f.id === FLUXO_DA_TELA)!;

      expect(daTela).toBeDefined();
      expect(daTela.implicito).toBe(true);
      expect(daTela.nome).toBe("Aprovação de despesa");
      expect(daTela.nos).toHaveLength(1);
      expect(daTela.nos[0].tipo).toBe("tela");
    });
  });

  it("executá-lo PARA na tela — é o que faz a tela esperar por gente", async () => {
    await comApp(DONA, async (app, cookies) => {
      await semearTela(app, cookies);
      const r = await app.inject({
        method: "POST",
        url: `/fluxos/${encodeURIComponent(FLUXO_DA_TELA)}/executar`,
        cookies,
        payload: { timeId: TIME },
      });
      expect(r.statusCode).toBe(200);
      const corpo = r.json() as { execucaoId: string; aguardandoTela?: { noId: string; refId: string } };
      expect(corpo.aguardandoTela).toMatchObject({ noId: "tela", refId: "tela:aprovacao" });

      // E o stage serve o conteúdo dela, pela mesma rota da 110-B.
      const stage = await app.inject({ method: "GET", url: `/fluxos/execucoes/${corpo.execucaoId}/tela`, cookies });
      expect(stage.statusCode).toBe(200);
      const s = stage.json() as { tela: { nome: string; blocos?: unknown[] } };
      expect(s.tela.nome).toBe("Aprovação de despesa");
      expect(s.tela.blocos).toHaveLength(2);
    });
  });

  it("o Avançar grava a resposta no histórico — que é tudo o que a v1 promete (D4)", async () => {
    await comApp(DONA, async (app, cookies) => {
      await semearTela(app, cookies);
      const aberta = await app.inject({
        method: "POST",
        url: `/fluxos/${encodeURIComponent(FLUXO_DA_TELA)}/executar`,
        cookies,
        payload: { timeId: TIME },
      });
      const { execucaoId } = aberta.json() as { execucaoId: string };

      const avancou = await app.inject({
        method: "POST",
        url: `/fluxos/execucoes/${execucaoId}/continuar`,
        cookies,
        // A `decisao` viaja com a saída — é ela que distingue avançar de
        // retornar, e a rota recusa sem ela (110-B). O `valor` é o campo
        // obrigatório que a tela declarou.
        payload: { saidaDaTela: { decisao: "avancar", valor: 1234 } },
      });
      expect(avancou.statusCode).toBe(200);

      const [linha] = await db.select().from(fluxoExecucoes).where(eq(fluxoExecucoes.id, execucaoId));
      expect(linha.estado).toBe("concluida");
      // A resposta da pessoa é o que o rastro guarda: sem destino configurado
      // (fatia B), é aqui que ela fica — e a tela DIZ isso antes de decidir.
      const rastro = linha.nos as { noId: string; estado: string }[];
      expect(rastro.find((n) => n.noId === "tela")?.estado).toBe("sucesso");
    });
  });

  it("abrir exige nível de OPERAR no time — herdado, sem regra nova", async () => {
    await comApp(DONA, async (app, cookies) => {
      await semearTela(app, cookies);
    });
    await comApp(ESTRANHA, async (app, cookies) => {
      const r = await app.inject({
        method: "POST",
        url: `/fluxos/${encodeURIComponent(FLUXO_DA_TELA)}/executar`,
        cookies,
        payload: { timeId: TIME },
      });
      // Quem não é do time não abre a tela do time — a mesma régua da §402,
      // sem uma linha escrita para ela.
      expect(r.statusCode).toBe(403);
    });
  });

  it("a tela de um time não vira fluxo no catálogo de outro", async () => {
    await comApp(DONA, async (app, cookies) => {
      await semearTela(app, cookies);
    });
    await comApp(ESTRANHA, async (app, cookies) => {
      const r = await app.inject({ method: "GET", url: `/fluxos?timeId=${TIME_ALHEIO}`, cookies });
      const { fluxos } = r.json() as { fluxos: { id: string }[] };
      expect(fluxos.map((f) => f.id)).not.toContain(FLUXO_DA_TELA);
    });
  });

  it("apagar a tela apaga o fluxo dela: o implícito não sobrevive ao que o derivou", async () => {
    await comApp(DONA, async (app, cookies) => {
      await semearTela(app, cookies);
      await app.inject({ method: "PUT", url: "/config/telas", cookies, payload: { timeId: TIME, documento: { telas: [] } } });

      const r = await app.inject({ method: "GET", url: `/fluxos?timeId=${TIME}`, cookies });
      const { fluxos } = r.json() as { fluxos: { id: string }[] };
      expect(fluxos.map((f) => f.id)).not.toContain(FLUXO_DA_TELA);

      // E executá-lo passa a ser 404: não há fluxo, não há o que abrir.
      const exec = await app.inject({
        method: "POST",
        url: `/fluxos/${encodeURIComponent(FLUXO_DA_TELA)}/executar`,
        cookies,
        payload: { timeId: TIME },
      });
      expect(exec.statusCode).toBe(404);
    });
  });
});
