import { sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { resolve } from "node:path";
import {
  testarContratoDePerfisTime,
  TIMES_DO_CONTRATO,
} from "@gerador/aplicacao/src/portas/contratoDePerfisTime.js";
import { criarBancoDeDados, type BancoDeDados } from "../db/client.js";
import { organizacoes, perfisTime, times } from "../db/schema.js";
import { exigirBancoDescartavel, garantirBancoDeTeste, URL_BANCO_DE_TESTE } from "../test-support/bancoDeTeste.js";
import { criarRepositorioDePerfisTimeEmPostgres } from "./perfisTimeEmPostgres.js";

/**
 * SPEC-31 Fase 2 — o adaptador Postgres respondendo à MESMA suíte do de
 * arquivo, contra Postgres de verdade.
 *
 * Diferente do de arquivo, este precisa dos times existindo antes: há uma
 * chave estrangeira de `perfis_time` para `times`. É a restrição que faz
 * sentido no modo hospedado e que o arquivo não tem como ter — por isso a
 * suíte publica `TIMES_DO_CONTRATO` em vez de esconder ids nos casos.
 */
const DATABASE_URL = process.env.DATABASE_URL || URL_BANCO_DE_TESTE;

let db: BancoDeDados | undefined;

testarContratoDePerfisTime("postgres", async () => {
  if (!db) {
    exigirBancoDescartavel(DATABASE_URL);
    await garantirBancoDeTeste(DATABASE_URL);
    db = criarBancoDeDados(DATABASE_URL).db;
    await migrate(db, { migrationsFolder: resolve(import.meta.dirname, "../../migrations") });
  }
  const banco = db;
  return {
    repo: criarRepositorioDePerfisTimeEmPostgres(banco),
    limpar: async () => {
      await banco.execute(sql`truncate table ${perfisTime}`);

      const [org] = await banco
        .insert(organizacoes)
        .values({ nome: "Contrato" })
        .onConflictDoNothing()
        .returning();
      const organizacaoId = org?.id ?? (await banco.select({ id: organizacoes.id }).from(organizacoes))[0].id;

      for (const id of TIMES_DO_CONTRATO) {
        await banco.insert(times).values({ id, organizacaoId, nome: id }).onConflictDoNothing();
      }
    },
  };
});
