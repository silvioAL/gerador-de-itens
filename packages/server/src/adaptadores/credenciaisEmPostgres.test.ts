import { sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { resolve } from "node:path";
import { testarContratoDeCredenciais } from "@gerador/aplicacao/src/portas/contratoDeCredenciais.js";
import { criarBancoDeDados, type BancoDeDados } from "../db/client.js";
import { credenciaisIa } from "../db/schema.js";
import { exigirBancoDescartavel, garantirBancoDeTeste, URL_BANCO_DE_TESTE } from "../test-support/bancoDeTeste.js";
import { organizacaoDeTeste } from "../test-support/bancoDeTeste.js";
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

  // Reusa a organização que existir. Inserir uma nova a cada execução parecia
  // inofensivo (`onConflictDoNothing`), mas `organizacoes` não tem restrição
  // única em `nome`: a linha SEMPRE entrava, e outro arquivo de teste que
  // lesse "a primeira organização" passava a depender da ordem do Postgres.
  // Isso já apareceu como uma falha isolada e não reproduzível.
  const organizacaoId = await organizacaoDeTeste(banco);

  return {
    repo: criarRepositorioDeCredenciaisEmPostgres(banco, organizacaoId),
    limpar: async () => {
      await banco.execute(sql`truncate table ${credenciaisIa}`);
    },
  };
});
