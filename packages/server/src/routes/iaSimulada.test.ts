import { sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarBancoDeDados, type BancoDeDados } from "../db/client.js";
import { exigirBancoDescartavel, garantirBancoDeTeste, URL_BANCO_DE_TESTE } from "../test-support/bancoDeTeste.js";
import { buildApp } from "../app.js";
import { credenciaisIa } from "../db/schema.js";

/**
 * SPEC-89 fatia D — **a trava que impede o silêncio.**
 *
 * O risco desta rodada não é a IA não responder: é ela responder **texto
 * inventado sem dizer que é inventado**. Estes testes travam as duas pontas.
 *
 * Rodam contra o banco de verdade porque a pergunta é sobre o que a ROTA
 * devolve com e sem credencial gravada — e "sem credencial" é um estado do
 * banco, não um parâmetro.
 */

const DATABASE_URL = process.env.DATABASE_URL || URL_BANCO_DE_TESTE;
let db: BancoDeDados;

beforeAll(async () => {
  exigirBancoDescartavel(DATABASE_URL);
  await garantirBancoDeTeste(DATABASE_URL);
  db = criarBancoDeDados(DATABASE_URL).db;
  await migrate(db, { migrationsFolder: resolve(import.meta.dirname, "../../migrations") });
});

afterAll(() => {
  delete process.env.GATEWAY_FALSO_URL;
});

/**
 * Uma instalação NOVA de verdade.
 *
 * O banco de teste é compartilhado, e outras suítes gravam credencial nele — a
 * primeira escrita deste arquivo passou verde por acidente e vermelha por
 * acidente, dependendo da ordem. "Sem credencial" é o estado que estes testes
 * afirmam; ele precisa ser construído, não torcido para acontecer.
 */
async function semCredencialGravada() {
  await db.execute(sql`delete from ${credenciaisIa}`);
}

async function statusCom(url?: string) {
  await semCredencialGravada();
  if (url) process.env.GATEWAY_FALSO_URL = url;
  else delete process.env.GATEWAY_FALSO_URL;

  const app = await buildApp({ db, diretorioConfig: resolve(import.meta.dirname, "../../../../config") });
  await app.ready();
  const r = await app.inject({ method: "GET", url: "/ia/status" });
  await app.close();
  return r.json();
}

describe("a instalação nova, e a marca que não pode faltar (SPEC-89 fatia D)", () => {
  it("SEM a declaração, o status diz que NÃO está pronto — como sempre disse", async () => {
    /**
     * A garantia de que nada muda para quem não tem o dublê. Uma implantação de
     * produção sem gateway continua recusando, e é ela que esta asserção
     * protege — não o caso de demonstração.
     */
    const s = await statusCom();

    expect(s.pronto).toBe(false);
    expect(s.simulado).toBe(false);
  });

  it("COM a declaração, o status diz pronto E diz simulado — nunca um sem o outro", async () => {
    /**
     * **A asserção que define a fatia.**
     *
     * `pronto: true` sem `simulado: true` seria o produto respondendo com texto
     * inventado sem marca nenhuma — o defeito que a SPEC-74 fatia D existe para
     * evitar, reintroduzido pela porta dos fundos.
     *
     * E `simulado` saía de `resumo.baseUrl`, que é vazio quando não há
     * credencial gravada: sem esta rodada tocar nele, a instalação nova
     * responderia calada.
     */
    const s = await statusCom("http://127.0.0.1:4123/v1");

    expect(s.pronto).toBe(true);
    expect(s.simulado).toBe(true);
  });

  it("o status e as ROTAS contam a mesma história", async () => {
    /**
     * Duas leituras da mesma pergunta divergindo é o §263. Aqui ela apareceria
     * como "não tem IA" numa instalação que tem: a tela esconderia os botões de
     * uma IA funcionando, e o passo do tour prometeria o que a interface acabou
     * de desligar.
     *
     * Não chamamos o dublê de verdade (isso é o E2E): o que se afirma é que a
     * rota **não recusa por falta de credencial** quando o status diz pronto.
     */
    await semCredencialGravada();
    process.env.GATEWAY_FALSO_URL = "http://127.0.0.1:4123/v1";
    const app = await buildApp({ db, diretorioConfig: resolve(import.meta.dirname, "../../../../config") });
    await app.ready();

    const r = await app.inject({
      method: "POST",
      url: "/ia/sugerir",
      payload: { tech: "Backend", rotulo: "definir DLQ" },
    });
    await app.close();

    expect(r.statusCode, "503 aqui significa que a rota recusou o que o status prometeu").not.toBe(503);
  });
});
