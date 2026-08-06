import { migrate } from "drizzle-orm/node-postgres/migrator";
import { criarBancoDeDados } from "./client.js";

/** Roda as migrações geradas em migrations/ contra o DATABASE_URL atual — chamado
 * no start do container (Fase D) e localmente via `npm run db:migrate`. */
async function main() {
  const { db, pool } = criarBancoDeDados();
  await migrate(db, { migrationsFolder: "./migrations" });
  await pool.end();
  console.log("Migrações aplicadas.");
}

main().catch((erro: unknown) => {
  console.error(erro);
  process.exit(1);
});
