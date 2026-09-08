import { and, eq, sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { resolve } from "node:path";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Fluxo } from "@gerador/aplicacao";
import { criarBancoDeDados, type BancoDeDados } from "../db/client.js";
import { fluxoAgendamentos } from "../db/schema.js";
import { exigirBancoDescartavel, garantirBancoDeTeste, URL_BANCO_DE_TESTE } from "../test-support/bancoDeTeste.js";
import {
  agendamentosDoFluxo,
  contarAgendamentosAtivos,
  desativarAgendamento,
  reservarVencidos,
  sincronizarAgendamentos,
} from "./agendamentos.js";

/**
 * SPEC-110 fatia E (D7) — **o relógio contra o banco de verdade.**
 *
 * O parser de cron já tem prova própria e pura. O que se prova AQUI é o que só
 * existe com tabela: a sincronização (o desenho manda) e a reserva (o UPDATE
 * atômico é o lock). Um mock de banco não provaria nenhuma das duas — a
 * primeira depende do estado anterior da linha, a segunda depende de o `WHERE`
 * não casar duas vezes.
 */

const DATABASE_URL = process.env.DATABASE_URL || URL_BANCO_DE_TESTE;

let db: BancoDeDados;

const fluxoCom = (nos: { id: string; expressao: string }[]): Fluxo => ({
  id: "f1",
  nome: "F",
  nos: nos.map((n) => ({
    id: n.id,
    tipo: "gatilho" as const,
    refId: "agendamento",
    posicao: { x: 0, y: 0 },
    parametros: { expressao: n.expressao },
  })),
  arestas: [],
});

beforeAll(async () => {
  exigirBancoDescartavel(DATABASE_URL);
  await garantirBancoDeTeste(DATABASE_URL);
  db = criarBancoDeDados(DATABASE_URL).db;
  await migrate(db, { migrationsFolder: resolve(import.meta.dirname, "../../migrations") });
});

beforeEach(async () => {
  await db.execute(sql`truncate table ${fluxoAgendamentos}`);
});

const linhas = () => db.select().from(fluxoAgendamentos).where(eq(fluxoAgendamentos.fluxoId, "f1"));

describe("o desenho manda na tabela", () => {
  it("só o nó de gatilho `agendamento` com cron válido vira agendamento", () => {
    const fluxo: Fluxo = {
      id: "f1",
      nome: "F",
      nos: [
        { id: "a", tipo: "gatilho", refId: "agendamento", posicao: { x: 0, y: 0 }, parametros: { expressao: "0 9 * * *" } },
        // O manual não tem relógio.
        { id: "b", tipo: "gatilho", refId: "manual", posicao: { x: 0, y: 0 }, parametros: {} },
        // Cron torto não vira linha morta na tabela: fica de fora.
        { id: "c", tipo: "gatilho", refId: "agendamento", posicao: { x: 0, y: 0 }, parametros: { expressao: "60 * * * *" } },
      ],
      arestas: [],
    };
    expect(agendamentosDoFluxo(fluxo)).toEqual([{ noId: "a", expressao: "0 9 * * *" }]);
  });

  it("salvar cria a linha com a próxima ocorrência já calculada", async () => {
    await sincronizarAgendamentos(db, fluxoCom([{ id: "g", expressao: "0 9 * * *" }]), "t1", "eu@x", new Date("2026-03-10T10:00:00Z"));
    const [linha] = await linhas();
    expect(linha.expressao).toBe("0 9 * * *");
    expect(linha.ativo).toBe(true);
    // 10h já passou das 9h de hoje: a próxima é amanhã.
    expect(linha.proximoEm?.toISOString()).toBe("2026-03-11T09:00:00.000Z");
  });

  it("salvar de novo SEM mexer na expressão não engole a rodada pendente", async () => {
    /**
     * O defeito que este teste tranca: recalcular a próxima a cada salvamento
     * faz um salvamento que cai na janela entre a hora marcada e o tick (30s)
     * empurrar o disparo para AMANHÃ — a rodada de hoje some, e some em
     * silêncio, porque nada falhou.
     */
    const fluxo = fluxoCom([{ id: "g", expressao: "0 9 * * *" }]);
    await sincronizarAgendamentos(db, fluxo, "t1", "eu@x", new Date("2026-03-10T07:00:00Z"));
    // Alguém move um nó às 09:00:10 — a hora já bateu, o tick ainda não veio.
    await sincronizarAgendamentos(db, fluxo, "t1", "eu@x", new Date("2026-03-10T09:00:10Z"));
    expect((await linhas())[0].proximoEm?.toISOString()).toBe("2026-03-10T09:00:00.000Z");
    // E o tick seguinte ainda encontra a rodada de hoje esperando.
    expect(await reservarVencidos(db, new Date("2026-03-10T09:00:30Z"))).toHaveLength(1);
  });

  it("mudar a expressão recalcula a próxima", async () => {
    await sincronizarAgendamentos(db, fluxoCom([{ id: "g", expressao: "0 9 * * *" }]), "t1", "eu@x", new Date("2026-03-10T07:00:00Z"));
    await sincronizarAgendamentos(db, fluxoCom([{ id: "g", expressao: "0 18 * * *" }]), "t1", "eu@x", new Date("2026-03-10T07:00:00Z"));
    const [linha] = await linhas();
    expect(linha.expressao).toBe("0 18 * * *");
    expect(linha.proximoEm?.toISOString()).toBe("2026-03-10T18:00:00.000Z");
    // Uma linha só: sincronizar é RMW, não acumula.
    expect(await linhas()).toHaveLength(1);
  });

  it("tirar o nó do desenho DESATIVA — e não apaga o histórico", async () => {
    await sincronizarAgendamentos(db, fluxoCom([{ id: "g", expressao: "0 9 * * *" }]), "t1", "eu@x", new Date("2026-03-10T07:00:00Z"));
    await sincronizarAgendamentos(db, { id: "f1", nome: "F", nos: [], arestas: [] }, "t1", "eu@x", new Date("2026-03-10T07:00:00Z"));
    const [linha] = await linhas();
    expect(linha.ativo).toBe(false);
    // A linha continua lá: `ultima_em` é a resposta de "quando isto rodou?".
    expect(linha.expressao).toBe("0 9 * * *");
    expect(await contarAgendamentosAtivos(db)).toBe(0);
  });

  it("devolver o nó ao desenho RELIGA a mesma linha", async () => {
    const fluxo = fluxoCom([{ id: "g", expressao: "0 9 * * *" }]);
    await sincronizarAgendamentos(db, fluxo, "t1", "eu@x", new Date("2026-03-10T07:00:00Z"));
    const id = (await linhas())[0].id;
    await sincronizarAgendamentos(db, { id: "f1", nome: "F", nos: [], arestas: [] }, "t1", "eu@x");
    await sincronizarAgendamentos(db, fluxo, "t1", "eu@x", new Date("2026-03-10T07:00:00Z"));
    const [linha] = await linhas();
    expect(linha.id).toBe(id);
    expect(linha.ativo).toBe(true);
  });

  it("times diferentes têm relógios diferentes para o mesmo fluxo", async () => {
    const fluxo = fluxoCom([{ id: "g", expressao: "0 9 * * *" }]);
    await sincronizarAgendamentos(db, fluxo, "t1", "eu@x");
    await sincronizarAgendamentos(db, fluxo, "t2", "eu@x");
    expect(await contarAgendamentosAtivos(db)).toBe(2);
  });
});

describe("a reserva do vencido", () => {
  it("pega quem venceu e JÁ avança o relógio na mesma instrução", async () => {
    await sincronizarAgendamentos(db, fluxoCom([{ id: "g", expressao: "0 9 * * *" }]), "t1", "eu@x", new Date("2026-03-10T07:00:00Z"));
    const vencidos = await reservarVencidos(db, new Date("2026-03-10T09:00:30Z"));
    expect(vencidos.map((v) => ({ fluxoId: v.fluxoId, noId: v.noId, timeId: v.timeId }))).toEqual([
      { fluxoId: "f1", noId: "g", timeId: "t1" },
    ]);
    const [linha] = await linhas();
    expect(linha.proximoEm?.toISOString()).toBe("2026-03-11T09:00:00.000Z");
    expect(linha.ultimaEm?.toISOString()).toBe("2026-03-10T09:00:30.000Z");
  });

  it("um segundo tick no mesmo instante NÃO pega a mesma linha de novo", async () => {
    // É a prova do disparo duplicado: sem o avanço junto da reserva, dois
    // ticks separados por segundos rodariam o fluxo duas vezes.
    await sincronizarAgendamentos(db, fluxoCom([{ id: "g", expressao: "0 9 * * *" }]), "t1", "eu@x", new Date("2026-03-10T07:00:00Z"));
    const agora = new Date("2026-03-10T09:00:30Z");
    expect(await reservarVencidos(db, agora)).toHaveLength(1);
    expect(await reservarVencidos(db, agora)).toHaveLength(0);
  });

  it("não pega quem ainda não venceu", async () => {
    await sincronizarAgendamentos(db, fluxoCom([{ id: "g", expressao: "0 9 * * *" }]), "t1", "eu@x", new Date("2026-03-10T07:00:00Z"));
    expect(await reservarVencidos(db, new Date("2026-03-10T08:59:00Z"))).toHaveLength(0);
  });

  it("não pega o desativado", async () => {
    await sincronizarAgendamentos(db, fluxoCom([{ id: "g", expressao: "0 9 * * *" }]), "t1", "eu@x", new Date("2026-03-10T07:00:00Z"));
    await desativarAgendamento(db, (await linhas())[0].id);
    expect(await reservarVencidos(db, new Date("2026-03-10T09:00:30Z"))).toHaveLength(0);
  });

  it("a linha sem próxima calculada GANHA a próxima em vez de disparar", async () => {
    // Uma linha nasce sem cálculo quando a expressão era impossível na hora do
    // salvamento (29/02, por exemplo). Ela não pode ser lida como "vencida há
    // muito tempo" e disparar de imediato.
    await db
      .insert(fluxoAgendamentos)
      .values({ fluxoId: "f1", noId: "g", timeId: "t1", expressao: "0 9 * * *", proximoEm: null, criadoPor: "eu@x" });
    expect(await reservarVencidos(db, new Date("2026-03-10T07:00:00Z"))).toHaveLength(0);
    expect((await linhas())[0].proximoEm?.toISOString()).toBe("2026-03-10T09:00:00.000Z");
    // E no tick seguinte, depois da hora, ela dispara normalmente.
    expect(await reservarVencidos(db, new Date("2026-03-10T09:00:30Z"))).toHaveLength(1);
  });

  it("um atraso longo dispara UMA vez, não uma por minuto perdido", async () => {
    // O servidor ficou fora do ar a noite toda. Ao voltar, o fluxo de hora em
    // hora não pode cuspir 8 execuções de uma vez — a próxima é calculada a
    // partir de AGORA, não do que ficou para trás.
    await sincronizarAgendamentos(db, fluxoCom([{ id: "g", expressao: "0 * * * *" }]), "t1", "eu@x", new Date("2026-03-10T00:30:00Z"));
    expect(await reservarVencidos(db, new Date("2026-03-10T08:05:00Z"))).toHaveLength(1);
    expect((await linhas())[0].proximoEm?.toISOString()).toBe("2026-03-10T09:00:00.000Z");
  });

  it("cada nó agendado do mesmo fluxo é uma reserva própria", async () => {
    await sincronizarAgendamentos(
      db,
      fluxoCom([
        { id: "g1", expressao: "0 9 * * *" },
        { id: "g2", expressao: "0 9 * * *" },
      ]),
      "t1",
      "eu@x",
      new Date("2026-03-10T07:00:00Z")
    );
    const vencidos = await reservarVencidos(db, new Date("2026-03-10T09:00:30Z"));
    expect(vencidos.map((v) => v.noId).sort()).toEqual(["g1", "g2"]);
    expect(
      (await db.select().from(fluxoAgendamentos).where(and(eq(fluxoAgendamentos.fluxoId, "f1"), eq(fluxoAgendamentos.noId, "g1")))).length
    ).toBe(1);
  });
});
