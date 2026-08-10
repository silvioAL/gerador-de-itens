import { sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { resolve } from "node:path";
import { testarContratoDeQuebras } from "@gerador/aplicacao/src/portas/contratoDeQuebras.js";
import { criarBancoDeDados, type BancoDeDados } from "../db/client.js";
import { quebras } from "../db/schema.js";
import { exigirBancoDescartavel, garantirBancoDeTeste, URL_BANCO_DE_TESTE } from "../test-support/bancoDeTeste.js";
import { criarRepositorioDeQuebrasEmPostgres } from "./quebrasEmPostgres.js";

/**
 * SPEC-31 Fase 1 — o adaptador Postgres respondendo à MESMA suíte do de
 * arquivo, contra Postgres de verdade.
 *
 * **Este teste reprovava antes da migração 0011.** A tabela tinha seis colunas
 * e o caso "o que a esteira escreveu SOBREVIVE ao salvar e voltar" falhava —
 * que é precisamente o defeito que a porta expôs e a migração conserta. É o
 * argumento da SPEC-31 §8 funcionando: a mesma pergunta feita aos dois.
 */
const DATABASE_URL = process.env.DATABASE_URL || URL_BANCO_DE_TESTE;

let db: BancoDeDados | undefined;

testarContratoDeQuebras("postgres", async () => {
  if (!db) {
    exigirBancoDescartavel(DATABASE_URL);
    await garantirBancoDeTeste(DATABASE_URL);
    db = criarBancoDeDados(DATABASE_URL).db;
    await migrate(db, { migrationsFolder: resolve(import.meta.dirname, "../../migrations") });
  }
  const banco = db;
  return {
    repo: criarRepositorioDeQuebrasEmPostgres(banco),
    limpar: async () => {
      await banco.execute(sql`truncate table ${quebras}`);
    },
  };
});
