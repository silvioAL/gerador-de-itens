import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema.js";

/**
 * `DATABASE_URL` é a única forma de configurar a conexão — nunca host/porta/senha
 * soltos em variáveis separadas, pra combinar com o formato padrão que qualquer
 * provedor gerenciado de Postgres já entrega pronto.
 */
function urlDoBanco(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL não definida. Ex.: postgres://gerador:gerador@localhost:5432/gerador"
    );
  }
  return url;
}

export function criarBancoDeDados(connectionString = urlDoBanco()) {
  const pool = new Pool({ connectionString });
  return { db: drizzle(pool, { schema }), pool };
}

export type BancoDeDados = ReturnType<typeof criarBancoDeDados>["db"];
