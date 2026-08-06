import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { buildApp } from "./app.js";
import { criarBancoDeDados } from "./db/client.js";

// `npm run dev` roda via tsx em ESM (package.json "type": "module", sem
// __dirname); o build de produção bundla em CJS (dist/server.cjs, pra rodar
// sem node_modules — ver tsup.config.ts), onde só __dirname existe e
// `import.meta` fica vazio. Os dois precisam funcionar com o mesmo código-fonte.
const diretorioAtual =
  typeof __dirname !== "undefined" ? __dirname : dirname(fileURLToPath(import.meta.url));

async function main() {
  const { db } = criarBancoDeDados();
  // Roda migrações pendentes no boot — não existe passo de deploy separado pra
  // isso (Fase D pede "deploy muito simples"); `migrate` é idempotente, então
  // reiniciar o container sem migração nova é um no-op seguro.
  await migrate(db, { migrationsFolder: resolve(diretorioAtual, "../migrations") });

  const porta = Number(process.env.PORT ?? 4000);
  const diretorioConfig = resolve(process.env.CONFIG_DIR ?? "config");

  const app = await buildApp({
    db,
    diretorioConfig,
    origemPermitida: process.env.ORIGEM_WEB,
  });

  await app.listen({ port: porta, host: "0.0.0.0" });
  console.log(`@gerador/server em http://localhost:${porta}`);
}

main().catch((erro: unknown) => {
  console.error(erro);
  process.exit(1);
});
