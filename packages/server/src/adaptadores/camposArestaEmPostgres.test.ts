import { sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { resolve } from "node:path";
import { testarContratoDeCamposAresta } from "@gerador/aplicacao/src/portas/contratoDeCamposAresta.js";
import { criarBancoDeDados, type BancoDeDados } from "../db/client.js";
import { camposAresta } from "../db/schema.js";
import { exigirBancoDescartavel, garantirBancoDeTeste, URL_BANCO_DE_TESTE } from "../test-support/bancoDeTeste.js";
import { criarRepositorioDeCamposArestaEmPostgres } from "./camposArestaEmPostgres.js";

/** #303 — o adaptador Postgres respondendo à suíte de contrato, contra
 * Postgres de verdade (mesmo arranjo de camposNoEmPostgres.test.ts). */
const DATABASE_URL = process.env.DATABASE_URL || URL_BANCO_DE_TESTE;

let db: BancoDeDados | undefined;

testarContratoDeCamposAresta("postgres", async () => {
  if (!db) {
    exigirBancoDescartavel(DATABASE_URL);
    await garantirBancoDeTeste(DATABASE_URL);
    db = criarBancoDeDados(DATABASE_URL).db;
    await migrate(db, { migrationsFolder: resolve(import.meta.dirname, "../../migrations") });
  }
  const banco = db;
  return {
    repo: criarRepositorioDeCamposArestaEmPostgres(banco),
    limpar: async () => {
      await banco.execute(sql`truncate table ${camposAresta}`);
    },
  };
});
