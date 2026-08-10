import { sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { resolve } from "node:path";
import { testarContratoDeTemplateEspecificacao } from "@gerador/aplicacao/src/portas/contratoDeTemplateEspecificacao.js";
import { criarBancoDeDados, type BancoDeDados } from "../db/client.js";
import { especificacaoTemplates } from "../db/schema.js";
import { exigirBancoDescartavel, garantirBancoDeTeste, URL_BANCO_DE_TESTE } from "../test-support/bancoDeTeste.js";
import { criarRepositorioDeTemplateEspecificacaoEmPostgres } from "./templateEspecificacaoEmPostgres.js";

/** SPEC-31 Fase 2 — o adaptador Postgres respondendo à MESMA suíte do de
 * arquivo, contra Postgres de verdade. */
const DATABASE_URL = process.env.DATABASE_URL || URL_BANCO_DE_TESTE;

let db: BancoDeDados | undefined;

testarContratoDeTemplateEspecificacao("postgres", async () => {
  if (!db) {
    exigirBancoDescartavel(DATABASE_URL);
    await garantirBancoDeTeste(DATABASE_URL);
    db = criarBancoDeDados(DATABASE_URL).db;
    await migrate(db, { migrationsFolder: resolve(import.meta.dirname, "../../migrations") });
  }
  const banco = db;
  return {
    repo: criarRepositorioDeTemplateEspecificacaoEmPostgres(banco),
    limpar: async () => {
      await banco.execute(sql`truncate table ${especificacaoTemplates}`);
    },
  };
});
