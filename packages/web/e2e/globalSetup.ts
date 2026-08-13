import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
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
    // CASCADE porque `itens_gerados` referencia `quebras` (migração 0025): sem
    // ele o TRUNCATE falha, cai no `catch` lá embaixo e PULA todo o resto do
    // setup — a seed dos padrões por componente e a limpeza dos papéis nunca
    // rodaram, e a suíte ficava vermelha em 18 specs por um erro que ninguém
    // via.
    await client.query('TRUNCATE TABLE "quebras", "perfis_time", "campos_no" CASCADE');
    // `credenciais_ia` entra na limpeza porque `ia-hospedada.spec.ts` afere o
    // estado "nenhuma credencial ainda" — o primeiro "Testar conexão" da vida,
    // que é exatamente onde estava um dos defeitos. Sem truncar, a suíte passa
    // na primeira rodada e mente na segunda.
    //
    // Numa tabela separada porque ela não existe em banco novo (a migração 0013
    // cria) — junto com as outras, o TRUNCATE inteiro falharia e cairia no
    // `catch` de "banco sem tabelas", deixando as três primeiras sujas.
    await client.query('TRUNCATE TABLE "credenciais_ia"').catch(() => undefined);

    // §203 — o RBAC volta DESLIGADO em toda rodada. Existir um papel é o que
    // liga o controle de acesso da organização inteira, então um papel deixado
    // para trás por um spec que morreu no meio faz o spec do vizinho levar 403
    // por um motivo que não é dele (aconteceu: um "Administrador" residual
    // derrubou `fluxo-basico` com "só quem cura edita").
    //
    // Uma query por tabela, filhos primeiro: em multi-statement o Postgres abre
    // transação implícita, então esquecer UMA referência (foi `time_papel`)
    // aborta o bloco inteiro e o RBAC fica ligado do mesmo jeito.
    for (const tabela of ["usuario_papel", "time_papel", "papel_permissao", "papeis_acesso"]) {
      await client.query(`DELETE FROM "${tabela}"`).catch(() => undefined);
    }
    // E a limpeza tem que ser AFERIDA, não presumida: o `catch` acima existe
    // pro banco novo (sem as tabelas ainda) e engoliria em silêncio justamente
    // a falha que faz a suíte inteira ficar vermelha por 403.
    const restantes = await client
      .query('SELECT count(*)::int AS n FROM "papeis_acesso"')
      .then((r) => r.rows[0].n as number)
      .catch(() => 0);
    if (restantes > 0) {
      throw new Error(
        `E2E: ${restantes} papel(éis) de acesso sobraram no banco de teste — o RBAC ficaria LIGADO e os specs levariam 403 sem relação com o que testam.`
      );
    }
    // O membro do spec de RBAC também sai — `usuario_time` escapa do TRUNCATE
    // por ser seed de login, e só este e-mail é lixo de teste.
    await client.query(`DELETE FROM "usuario_time" WHERE "email" LIKE '%-e2e@gerador.local'`).catch(() => undefined);

    await client.query(
      `INSERT INTO "perfis_time" ("time_id", "tipo_no", "campo", "valor") VALUES
        ('time-pagamentos', 'service', 'linguagem', 'Java'),
        ('time-pagamentos', 'service', 'framework', 'Spring Boot'),
        ('time-pagamentos', 'camunda', 'framework', 'Camunda 7'),
        ('time-pagamentos', 'fico', 'motorPadrao', 'FICO Blaze Advisor'),
        ('time-portabilidade', 'service', 'linguagem', 'Node')`
    );

    // #301 — os padrões por componente também morrem no TRUNCATE acima, e sem
    // eles `padroes-por-componente.spec.ts` testaria uma tabela vazia.
    //
    // Lendo o ARQUIVO da migração em vez de recopiar o INSERT: o bloco de
    // `perfis_time` logo acima é uma cópia à mão do 0000_init e já é a segunda
    // versão de uma verdade só — quando alguém mexer num, o outro fica para
    // trás em silêncio. Aqui a seed tem um dono só.
    const seed = await readFile(
      resolve(import.meta.dirname, "..", "..", "server", "migrations", "0016_padroes_por_componente_demo.sql"),
      "utf-8"
    );
    await client.query(seed);
  } catch (erro) {
    // banco novo, sem tabelas ainda — as migrações do @gerador/server (webServer
    // desta config) criam e semeiam tudo no boot; nada pra fazer na primeira rodada.
    //
    // Só ESSE caso é tolerado. O `catch` vazio original engolia qualquer erro,
    // e uma FK nova (itens_gerados → quebras) fez o setup inteiro virar no-op
    // sem uma linha de aviso: a suíte reportava 18 falhas espalhadas em vez de
    // "o setup não rodou".
    if ((erro as { code?: string }).code !== "42P01") {
      await client.end().catch(() => undefined);
      throw erro;
    }
  }
  await client.end();
}
