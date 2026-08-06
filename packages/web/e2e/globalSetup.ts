import { Client } from "pg";

/**
 * Limpa o banco antes da suíte E2E e reaplica o mesmo seed da migração inicial
 * (packages/server/migrations/0000_init.sql) — sem isso, truncar sozinho
 * também apagaria "time-pagamentos" e a referência ilustrativa do Graphify,
 * que várias specs dependem (a migração só semeia uma vez, no primeiro boot,
 * nunca de novo depois de um truncate). `usuario_time` fica de fora do truncate
 * de propósito — é a seed de login (0001_auth_e_campos_no.sql), não dado de
 * teste mutável; specs fazem login como um dos usuários já seedados.
 */
export default async function globalSetup() {
  const url = process.env.DATABASE_URL ?? "postgres://gerador:gerador@localhost:5432/gerador";
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    await client.query('TRUNCATE TABLE "quebras", "perfis_time", "referencias", "campos_no"');

    await client.query(
      `INSERT INTO "perfis_time" ("time_id", "tipo_no", "campo", "valor") VALUES
        ('time-pagamentos', 'service', 'linguagem', 'Java'),
        ('time-pagamentos', 'service', 'framework', 'Spring Boot'),
        ('time-pagamentos', 'camunda', 'framework', 'Camunda 7'),
        ('time-pagamentos', 'fico', 'motorPadrao', 'FICO Blaze Advisor'),
        ('time-portabilidade', 'service', 'linguagem', 'Node')`
    );

    await client.query(
      `INSERT INTO "referencias" ("titulo", "racional", "design_patterns") VALUES ($1, $2, $3::jsonb)`,
      [
        "Import Graphify -> nós tipados (mapeamento por regra, sem inferência)",
        'Como este próprio projeto traduz o graph.json que o Graphify produz (que não tem "tipo de entidade" nenhum, só rótulo + arquivo-fonte) em nós tipados do diagrama. É um exemplo real do padrão "tabela de regras".',
        JSON.stringify(["Rule table / strategy", "Anti-corruption layer", "Fail loud sobre inferência"]),
      ]
    );
  } catch {
    // banco novo, sem tabelas ainda — as migrações do @gerador/server (webServer
    // desta config) criam e semeiam tudo no boot; nada pra fazer na primeira rodada.
  }
  await client.end();
}
