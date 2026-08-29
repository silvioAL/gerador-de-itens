import { sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { criarBancoDeDados, type BancoDeDados } from "../db/client.js";
import { exigirBancoDescartavel, garantirBancoDeTeste, URL_BANCO_DE_TESTE } from "../test-support/bancoDeTeste.js";

/**
 * SPEC-80 fatia A — **a conversão de dado, testada.**
 *
 * ## Por que este arquivo existe, e por que ele é o primeiro do tipo
 *
 * Este repositório tem 39 migrações e **nenhum teste de migração**. Passou
 * despercebido porque quase todas só acrescentam coluna: se `ADD COLUMN`
 * estivesse errado, tudo quebraria alto e na hora.
 *
 * Duas delas não são assim. A **0037** (SPEC-71) converteu `anexos_contexto` de
 * `string[]` para `{nome, conteudo}[]`, e esta converte `documento_escrito` de
 * um conjunto de seções para um mapa por artefato. **Conversão que erra não
 * quebra: ela apaga.** O servidor sobe, a tela abre, e o que a pessoa escreveu
 * simplesmente não está mais lá — o pior modo de falhar que este produto tem, e
 * exatamente o que a SPEC-71 gastou uma rodada inteira consertando.
 *
 * A suíte de contrato roda contra um banco recém-migrado, onde **não existe
 * linha em formato antigo**. Ela prova que a forma nova funciona; não prova que
 * a antiga chega na nova. É esse buraco que este arquivo fecha.
 *
 * ## Como ele mede
 *
 * Escreve a forma ANTIGA direto na tabela por SQL — o drizzle não deixaria,
 * porque o tipo dele já é o novo, e é justamente esse o ponto — e roda a
 * conversão da 0039. É a única maneira de exercitar o caminho de quem já tinha
 * dado salvo antes da SPEC-80.
 */

const DATABASE_URL = process.env.DATABASE_URL || URL_BANCO_DE_TESTE;

/** O `UPDATE` da migração 0039, palavra por palavra. Copiado de propósito: um
 * teste que importasse o arquivo `.sql` provaria que o arquivo roda, não que a
 * conversão está certa — e se a migração mudar, este teste tem que ser lido de
 * novo por alguém, não seguir junto em silêncio. */
const CONVERSAO = sql`
  UPDATE "quebras"
  SET "documento_escrito" = jsonb_build_object('documento', "documento_escrito")
  WHERE "documento_escrito" IS NOT NULL
    AND jsonb_typeof("documento_escrito") = 'object'
    AND "documento_escrito" <> '{}'::jsonb
    AND NOT ("documento_escrito" ? 'documento')
`;

let db: BancoDeDados;

async function inserirComFormaAntiga(conteudo: string): Promise<string> {
  const linha = await db.execute(sql`
    INSERT INTO "quebras" ("titulo", "diagrama", "documento_escrito")
    VALUES ('conversão', '{"nodes":[],"edges":[]}'::jsonb, ${conteudo}::jsonb)
    RETURNING "id"
  `);
  return (linha.rows[0] as { id: string }).id;
}

async function lerEscrito(id: string): Promise<Record<string, unknown>> {
  const linha = await db.execute(sql`SELECT "documento_escrito" FROM "quebras" WHERE "id" = ${id}::uuid`);
  return (linha.rows[0] as { documento_escrito: Record<string, unknown> }).documento_escrito;
}

describe("a conversão da 0039 não pode perder o que a pessoa escreveu (SPEC-80 fatia A)", () => {
  beforeAll(async () => {
    exigirBancoDescartavel(DATABASE_URL);
    await garantirBancoDeTeste(DATABASE_URL);
    db = criarBancoDeDados(DATABASE_URL).db;
    await migrate(db, { migrationsFolder: resolve(import.meta.dirname, "../../migrations") });
  });

  it("as seções antigas viram as seções do artefato `documento`, inteiras", async () => {
    const id = await inserirComFormaAntiga(
      JSON.stringify({ visaoGeral: "Como analista…", tradeOffs: "aceitamos latência", riscos: "o parceiro muda" })
    );

    await db.execute(CONVERSAO);

    expect(await lerEscrito(id)).toEqual({
      documento: { visaoGeral: "Como analista…", tradeOffs: "aceitamos latência", riscos: "o parceiro muda" },
    });
  });

  it("quebra que nunca teve seção escrita continua vazia — a conversão não inventa artefato", async () => {
    const id = await inserirComFormaAntiga("{}");

    await db.execute(CONVERSAO);

    expect(await lerEscrito(id)).toEqual({});
  });

  it("rodar duas vezes não aninha — a segunda passada não acha o que converter", async () => {
    /**
     * O caso que uma migração precisa aguentar por natureza: reexecução. Sem a
     * guarda `NOT (… ? 'documento')`, a segunda passada produziria
     * `{ documento: { documento: {...} } }` e o dado sumiria da tela sem erro
     * nenhum — o modo de falhar que este arquivo existe para impedir.
     */
    const id = await inserirComFormaAntiga(JSON.stringify({ riscos: "o parceiro muda" }));

    await db.execute(CONVERSAO);
    await db.execute(CONVERSAO);

    expect(await lerEscrito(id)).toEqual({ documento: { riscos: "o parceiro muda" } });
  });

  it("e o que JÁ está na forma nova passa intocado", async () => {
    // Uma quebra salva depois da SPEC-80 não pode ser reembrulhada por uma
    // migração que rode atrasada num ambiente qualquer.
    const novo = { documento: { riscos: "o parceiro muda" }, spec: { origem: "pedido do time" } };
    const id = await inserirComFormaAntiga(JSON.stringify(novo));

    await db.execute(CONVERSAO);

    expect(await lerEscrito(id)).toEqual(novo);
  });
});
