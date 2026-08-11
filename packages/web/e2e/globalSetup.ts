import { Client } from "pg";
// Caminho relativo, e não uma cópia: a regra de "banco descartável" precisa ser
// UMA só. Duplicá-la aqui é exatamente o tipo de coisa que deixou o Playwright
// de fora da trava original.
import { exigirBancoDescartavel } from "../../server/src/test-support/bancoDeTeste.js";

/**
 * Limpa o banco antes da suíte E2E e reaplica o mesmo seed da migração inicial
 * (packages/server/migrations/0000_init.sql) — sem isso, truncar sozinho
 * também apagaria "time-pagamentos", que várias specs dependem (a migração só
 * semeia uma vez, no primeiro boot, nunca de novo depois de um truncate).
 * `usuario_time` fica de fora do truncate de propósito — é a seed de login
 * (0001_auth_e_campos_no.sql), não dado de teste mutável; specs fazem login
 * como um dos usuários já seedados.
 */
export default async function globalSetup() {
  const url = process.env.DATABASE_URL ?? "postgres://gerador:gerador@localhost:5433/gerador_e2e_test";
  // Antes de qualquer TRUNCATE. Sem isto, apontar a suíte pro banco errado
  // apaga o ambiente de alguém em silêncio — foi o que aconteceu.
  exigirBancoDescartavel(url);
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    await client.query('TRUNCATE TABLE "quebras", "perfis_time", "campos_no"');
    // `credenciais_ia` entra na limpeza porque `ia-hospedada.spec.ts` afere o
    // estado "nenhuma credencial ainda" — o primeiro "Testar conexão" da vida,
    // que é exatamente onde estava um dos defeitos. Sem truncar, a suíte passa
    // na primeira rodada e mente na segunda.
    //
    // Numa tabela separada porque ela não existe em banco novo (a migração 0013
    // cria) — junto com as outras, o TRUNCATE inteiro falharia e cairia no
    // `catch` de "banco sem tabelas", deixando as três primeiras sujas.
    await client.query('TRUNCATE TABLE "credenciais_ia"').catch(() => undefined);

    await client.query(
      `INSERT INTO "perfis_time" ("time_id", "tipo_no", "campo", "valor") VALUES
        ('time-pagamentos', 'service', 'linguagem', 'Java'),
        ('time-pagamentos', 'service', 'framework', 'Spring Boot'),
        ('time-pagamentos', 'camunda', 'framework', 'Camunda 7'),
        ('time-pagamentos', 'fico', 'motorPadrao', 'FICO Blaze Advisor'),
        ('time-portabilidade', 'service', 'linguagem', 'Node')`
    );
  } catch {
    // banco novo, sem tabelas ainda — as migrações do @gerador/server (webServer
    // desta config) criam e semeiam tudo no boot; nada pra fazer na primeira rodada.
  }
  await client.end();
}
