import { sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { resolve } from "node:path";
import { testarContratoDeCredenciais } from "@gerador/aplicacao/src/portas/contratoDeCredenciais.js";
import { criarBancoDeDados, type BancoDeDados } from "../db/client.js";
import { credenciaisIa, organizacoes } from "../db/schema.js";
import { exigirBancoDescartavel, garantirBancoDeTeste, URL_BANCO_DE_TESTE } from "../test-support/bancoDeTeste.js";
import { criarRepositorioDeCredenciaisEmPostgres } from "./credenciaisEmPostgres.js";

/** SPEC-31 Fase 4 — o adaptador Postgres respondendo à MESMA suíte do de arquivo. */
const DATABASE_URL = process.env.DATABASE_URL || URL_BANCO_DE_TESTE;

let db: BancoDeDados | undefined;

testarContratoDeCredenciais("postgres", async () => {
  if (!db) {
    exigirBancoDescartavel(DATABASE_URL);
    await garantirBancoDeTeste(DATABASE_URL);
    db = criarBancoDeDados(DATABASE_URL).db;
    await migrate(db, { migrationsFolder: resolve(import.meta.dirname, "../../migrations") });
  }
  const banco = db;
  await banco.execute(sql`truncate table ${credenciaisIa}`);

  const [org] = await banco.insert(organizacoes).values({ nome: "Contrato IA" }).onConflictDoNothing().returning();
  const organizacaoId = org?.id ?? (await banco.select({ id: organizacoes.id }).from(organizacoes))[0].id;

  return {
    repo: criarRepositorioDeCredenciaisEmPostgres(banco, organizacaoId),
    limpar: async () => {
      await banco.execute(sql`truncate table ${credenciaisIa}`);
    },
  };
});
