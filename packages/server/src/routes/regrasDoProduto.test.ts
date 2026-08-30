import { sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { resolve } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { criarBancoDeDados, type BancoDeDados } from "../db/client.js";
import { configDocumentos, organizacoes, produtos, times, usuarioTime } from "../db/schema.js";
import { exigirBancoDescartavel, garantirBancoDeTeste, URL_BANCO_DE_TESTE } from "../test-support/bancoDeTeste.js";
import { buildApp } from "../app.js";

/**
 * SPEC-86 fatias B e D — **o eixo do produto, contra o banco de verdade.**
 *
 * A demanda do usuário: *"o que tem é checklist por processo, mas uma das
 * demandas que precisamos atender também é estender para produto."*
 *
 * O unitário do engine prova a soma. O que só o banco prova é a outra metade,
 * e ela é a que a migração 0040 arrisca: **o documento do produto e o do time
 * dividem `chave` e `time_id`**, e antes desta rodada uma consulta por esses dois
 * campos devolvia uma linha só porque só existia uma. Se o `isNull` do adaptador
 * estiver errado, o time passa a receber o checklist de um produto qualquer — e
 * nenhum teste de unidade veria isso.
 */

const DATABASE_URL = process.env.DATABASE_URL || URL_BANCO_DE_TESTE;
const TIME = "time-regras-produto";

let db: BancoDeDados;
let app: Awaited<ReturnType<typeof buildApp>>;
let sessao: string;
let produtoId: string;

const REGRAS_DO_TIME = {
  tipos: ["História"],
  tamanhos: ["P", "M"],
  porTech: {
    Backend: {
      checklistTecnico: [{ texto: "DLQ configurada", contextos: [] }],
      checklistProcesso: [],
      testes: [],
    },
  },
};

beforeAll(async () => {
  exigirBancoDescartavel(DATABASE_URL);
  await garantirBancoDeTeste(DATABASE_URL);
  db = criarBancoDeDados(DATABASE_URL).db;
  await migrate(db, { migrationsFolder: resolve(import.meta.dirname, "../../migrations") });
  app = await buildApp({ db, diretorioConfig: resolve(import.meta.dirname, "../../../../config") });
  await app.ready();

  const [org] = await db.select().from(organizacoes).limit(1);
  await db.insert(times).values({ id: TIME, organizacaoId: org.id, nome: TIME }).onConflictDoNothing();
  await db
    .insert(usuarioTime)
    .values({ email: "regras@teste.local", timeId: TIME, nivel: "owner" })
    .onConflictDoNothing();

  const login = await app.inject({ method: "POST", url: "/auth/login", payload: { email: "regras@teste.local" } });
  sessao = String(login.cookies.find((c) => c.name === "gerador_sessao")!.value);
});

afterAll(async () => {
  await app?.close();
});

beforeEach(async () => {
  await db.execute(sql`truncate table ${produtos} cascade`);
  await db.execute(sql`delete from ${configDocumentos} where chave = 'regras'`);

  const [org] = await db.select().from(organizacoes).limit(1);
  const p = await db
    .insert(produtos)
    .values({ organizacaoId: org.id, nome: "Vitrine", objetivo: "", criadoPor: "regras@teste.local" })
    .returning({ id: produtos.id });
  produtoId = p[0].id;

  await app.inject({
    method: "PUT",
    url: "/config/regras",
    cookies: { gerador_sessao: sessao },
    payload: { documento: REGRAS_DO_TIME, timeId: TIME },
  });
});

const emVigor = () =>
  app.inject({ method: "GET", url: `/config/regras/produto/${produtoId}?timeId=${TIME}` });

const declarar = (documento: unknown) =>
  app.inject({
    method: "PUT",
    url: `/config/regras/produto/${produtoId}`,
    cookies: { gerador_sessao: sessao },
    payload: { documento, timeId: TIME },
  });

describe("o eixo do produto nas regras (SPEC-86)", () => {
  it("produto sem nada declarado vê o checklist do time inteiro", async () => {
    // O caso mais comum, e o que não pode regredir: a maioria dos produtos vive
    // só com o checklist do time.
    const r = await emVigor();
    const corpo = r.json();

    expect(r.statusCode).toBe(200);
    expect(corpo.documento.porTech.Backend.checklistTecnico.map((i: { texto: string }) => i.texto)).toEqual([
      "DLQ configurada",
    ]);
    expect(corpo.doProduto).toBe(0);
    expect(corpo.declaradoNoProduto).toBeNull();
  });

  it("o que o produto declara SOMA — e a procedência diz de onde veio", async () => {
    await declarar({
      ...REGRAS_DO_TIME,
      porTech: {
        Backend: { checklistTecnico: [{ texto: "Acessibilidade AA conferida", contextos: [] }], testes: [] },
      },
    });

    const corpo = (await emVigor()).json();

    expect(corpo.documento.porTech.Backend.checklistTecnico.map((i: { texto: string }) => i.texto)).toEqual([
      "DLQ configurada",
      "Acessibilidade AA conferida",
    ]);
    expect(corpo.origemDe["Backend|checklistTecnico|Acessibilidade AA conferida"]).toBe("produto");
    expect(corpo.doProduto).toBe(1);
  });

  it("o documento do produto NÃO vaza para a leitura do time", async () => {
    /**
     * O risco que a migração 0040 introduz, e a razão de este arquivo existir.
     *
     * Antes dela, `(chave, time_id)` identificava uma linha só. Agora o produto
     * tem uma com a mesma chave e o mesmo time — e sem o `isNull` no adaptador a
     * consulta do time devolveria ora uma, ora outra, dependendo do plano. O
     * time receberia o checklist de um produto sem nada acusar.
     */
    await declarar({
      ...REGRAS_DO_TIME,
      porTech: { Backend: { checklistTecnico: [{ texto: "SÓ DO PRODUTO", contextos: [] }], testes: [] } },
    });

    const doTime = (await app.inject({ method: "GET", url: `/config/regras?timeId=${TIME}` })).json();

    expect(JSON.stringify(doTime.documento)).not.toContain("SÓ DO PRODUTO");
    expect(doTime.documento.porTech.Backend.checklistTecnico.map((i: { texto: string }) => i.texto)).toEqual([
      "DLQ configurada",
    ]);
  });

  it("o herdado NÃO congela: mudar a regra do time muda o que o produto vê", async () => {
    /**
     * SPEC-86 fatia D — a prova que impede esta rodada de criar o defeito que
     * ela existe para evitar. É o teste do §306 neste eixo: se o produto
     * guardasse uma CÓPIA do checklist do time, a regra nova do time nunca
     * chegaria nele, e ninguém notaria até ela não cobrar nada.
     */
    await declarar({
      ...REGRAS_DO_TIME,
      porTech: { Backend: { checklistTecnico: [{ texto: "SEO conferido", contextos: [] }], testes: [] } },
    });

    await app.inject({
      method: "PUT",
      url: "/config/regras",
      cookies: { gerador_sessao: sessao },
      payload: {
        documento: {
          ...REGRAS_DO_TIME,
          porTech: {
            Backend: {
              ...REGRAS_DO_TIME.porTech.Backend,
              checklistTecnico: [
                { texto: "DLQ configurada", contextos: [] },
                { texto: "Trilha de auditoria", contextos: [] },
              ],
            },
          },
        },
        timeId: TIME,
      },
    });

    const textos = (await emVigor())
      .json()
      .documento.porTech.Backend.checklistTecnico.map((i: { texto: string }) => i.texto);

    expect(textos).toContain("Trilha de auditoria");
    expect(textos).toContain("SEO conferido");
  });

  it("o que o produto declara SOBREVIVE ao PUT — e volta como declarado", async () => {
    // A regra 3 da SPEC-58 neste eixo: o que se escreve tem que voltar.
    await declarar({
      ...REGRAS_DO_TIME,
      porTech: { Backend: { checklistTecnico: [{ texto: "LGPD do catálogo", contextos: [] }], testes: [] } },
    });

    const corpo = (await emVigor()).json();

    expect(corpo.declaradoNoProduto.porTech.Backend.checklistTecnico[0].texto).toBe("LGPD do catálogo");
  });

  it("chave sem eixo de produto responde 404 dizendo isso", async () => {
    // Melhor que devolver um documento somado que ninguém sabe interpretar.
    const r = await app.inject({ method: "GET", url: `/config/pipeline-agentes/produto/${produtoId}` });

    expect(r.statusCode).toBe(404);
    expect(r.json().erro).toMatch(/não tem eixo de produto/);
  });

  it("gravar sem sessão é recusado — é config, como qualquer outra", async () => {
    const r = await app.inject({
      method: "PUT",
      url: `/config/regras/produto/${produtoId}`,
      payload: { documento: REGRAS_DO_TIME, timeId: TIME },
    });

    expect(r.statusCode).toBe(401);
  });

  it("apagar o produto leva o documento dele junto", async () => {
    /**
     * `ON DELETE CASCADE` na migração 0040. Sem isso, o documento ficaria órfão
     * apontando para um produto que não existe — e voltaria a valer no dia em
     * que um `uuid` fosse reaproveitado, que é o pior jeito de uma regra
     * reaparecer.
     */
    await declarar({
      ...REGRAS_DO_TIME,
      porTech: { Backend: { checklistTecnico: [{ texto: "some junto", contextos: [] }], testes: [] } },
    });

    await db.execute(sql`delete from ${produtos} where id = ${produtoId}`);
    const restantes = await db.select().from(configDocumentos);

    expect(restantes.filter((l) => l.produtoId !== null)).toEqual([]);
  });
});
