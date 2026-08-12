import { sql, eq, and } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { resolve } from "node:path";
import { testarContratoDeItensGerados } from "@gerador/aplicacao/src/portas/contratoDeItensGerados.js";
import { criarBancoDeDados, type BancoDeDados } from "../db/client.js";
import { itensGerados, quebras } from "../db/schema.js";
import { exigirBancoDescartavel, garantirBancoDeTeste, URL_BANCO_DE_TESTE } from "../test-support/bancoDeTeste.js";
import { criarRepositorioDeItensGeradosEmPostgres } from "./itensGeradosEmPostgres.js";

/** SPEC-41 Parte B — o adaptador Postgres respondendo à suíte de contrato da porta. */
const DATABASE_URL = process.env.DATABASE_URL || URL_BANCO_DE_TESTE;

let db: BancoDeDados | undefined;

testarContratoDeItensGerados("postgres", async () => {
  if (!db) {
    exigirBancoDescartavel(DATABASE_URL);
    await garantirBancoDeTeste(DATABASE_URL);
    db = criarBancoDeDados(DATABASE_URL).db;
    await migrate(db, { migrationsFolder: resolve(import.meta.dirname, "../../migrations") });
  }
  const banco = db;
  return {
    repo: criarRepositorioDeItensGeradosEmPostgres(banco),
    criarQuebra: async () => {
      const [criada] = await banco
        .insert(quebras)
        .values({ diagrama: { nodes: [], edges: [] } })
        .returning({ id: quebras.id });
      return criada.id;
    },
    limpar: async () => {
      await banco.execute(sql`truncate table ${itensGerados} cascade`);
      await banco.execute(sql`truncate table ${quebras} cascade`);
    },
    marcarExportado: async (quebraId, chave, link) => {
      await banco
        .update(itensGerados)
        .set({ estado: "exportado", linkExterno: link })
        .where(and(eq(itensGerados.quebraId, quebraId), eq(itensGerados.chave, chave)));
    },
  };
});
