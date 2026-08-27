import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Client } from "pg";
// Caminho relativo, e não uma cópia: a regra de "banco descartável" precisa ser
// UMA só. Duplicá-la aqui é exatamente o tipo de coisa que deixou o Playwright
// de fora da trava original.
import { exigirBancoDescartavel } from "../../server/src/test-support/bancoDeTeste.js";
// O e-mail vem de quem LOGA com ele. Duas cópias divergem na primeira mudança
// (§263), e a divergência aqui seria muda: o setup criaria o vínculo para um
// e-mail e o spec entraria com outro.
import { EMAIL_DAS_REGRAS } from "./auth.js";

/**
 * Limpa o banco antes da suíte E2E.
 *
 * `usuario_time` fica de fora do truncate de propósito — é a seed de login
 * (0001_auth_e_campos_no.sql), não dado de teste mutável; specs fazem login
 * como um dos usuários já seedados.
 *
 * ## §303 — este arquivo inteiro foi um no-op silencioso por 6 migrações
 *
 * O `TRUNCATE` abaixo citava `perfis_time`, que a migração **0020** apagou (o
 * perfil de stack virou catálogo, e depois `stacks`/`stack_valores` no 0026).
 * Tabela que não existe é erro **42P01** — exatamente o código que o `catch` no
 * fim tratava como "banco novo, nada a fazer".
 *
 * Resultado: desde o 0020, nenhuma linha deste setup rodava. Sem limpeza de
 * `quebras` e `campos_no`, sem limpeza de `credenciais_ia`, sem a remoção dos
 * papéis do RBAC (§203) — e sem a asserção que existia justamente para provar
 * que ela aconteceu. A suíte carregava o resíduo de todas as rodadas
 * anteriores, e falhas "aleatórias" em specs que ninguém tinha tocado eram o
 * sintoma.
 *
 * O erro não estava no `catch`: estava em usar o **código do erro** para
 * distinguir "banco novo" de "código velho". Os dois produzem 42P01. Agora a
 * pergunta é feita direto — a tabela existe? — e qualquer outra falha estoura.
 */
export default async function globalSetup() {
  const url = process.env.DATABASE_URL ?? "postgres://gerador:gerador@localhost:5433/gerador_e2e_test";
  // Antes de qualquer TRUNCATE. Sem isto, apontar a suíte pro banco errado
  // apaga o ambiente de alguém em silêncio — foi o que aconteceu.
  exigirBancoDescartavel(url);
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    // §303 — a pergunta explícita, ANTES de tudo. Na primeira rodada da vida o
    // banco está vazio e são as migrações do @gerador/server (webServer desta
    // config) que criam e semeiam tudo no boot; não há o que limpar.
    //
    // Depois disso, TODA falha é falha de verdade. Nada de código de erro como
    // heurística: uma tabela renomeada tem que quebrar a suíte no primeiro
    // segundo, e não silenciá-la por seis migrações.
    const bancoNovo = await client
      .query(`SELECT to_regclass('public.quebras') AS t`)
      .then((r) => r.rows[0].t === null);
    if (bancoNovo) {
      await client.end();
      return;
    }

    // CASCADE porque `itens_gerados` referencia `quebras` (migração 0025): sem
    // ele o TRUNCATE falha e leva o resto do setup junto.
    await client.query('TRUNCATE TABLE "quebras", "campos_no" CASCADE');
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

    // §303 — a seed de `perfis_time` que existia aqui SAIU, e não foi trocada
    // por outra. Ela era uma cópia à mão do 0000_init para sobreviver ao
    // TRUNCATE; hoje a stack do time mora em `stacks`/`stack_valores` (0020 →
    // 0026), que este setup não trunca — o seed das migrações 0021/0026
    // permanece. Recopiá-lo aqui recriaria a segunda versão de uma verdade só,
    // que é o defeito que a leitura do arquivo de migração (mais abaixo) evita.

    /**
     * §303 — um time por spec que ESCREVE no documento de regras.
     *
     * O documento de regras é global, e seis specs escreviam nele com seis
     * workers em paralelo. Cada rodada um perdia — é a classe do §281,
     * remendada spec a spec desde então, e que já bloqueou três PRs.
     *
     * Cinco mudaram de endereço. O sexto (`pdca-jornada`) fica no global porque
     * quem grava lá é o `POST /ajustes/:id/aplicar`, que é global por desenho —
     * e sozinho no global ele não disputa com ninguém.
     *
     * O remédio não é mais um remendo: o servidor **sempre** modelou config por
     * time (`obter` resolve time → global → template), e o cliente é que não
     * mandava o `timeId`. Com ele mandando, cada spec grava no seu time e a
     * colisão deixa de existir **por construção** — não por ordem de execução,
     * não por `finally` bem escrito.
     *
     * Os times moram aqui, e não numa migração: são de teste, e não têm por que
     * existir num banco de produção. `ON CONFLICT` porque nem `times` nem
     * `usuario_time` entram no TRUNCATE e este setup roda a cada suíte.
     *
     * A ordem importa: `usuario_time.time_id` tem chave estrangeira para
     * `times`, então o time precisa EXISTIR antes de alguém pertencer a ele.
     * A organização é a mesma de `time-pagamentos` — inventar uma segunda faria
     * o RBAC e o catálogo de produtos enxergarem dois mundos.
     *
     * ## Por que um e-mail SÓ para isto, e não `dev@gerador.local`
     *
     * Pendurar cinco times no `dev@gerador.local` levou a lista dele de 6 para
     * 11 — e `ListaDeTimes` liga o campo de busca acima de 8
     * (`LIMITE_SEM_BUSCA`). A tela de escolher time de TODA a suíte mudava de
     * forma por causa de um dado de teste, e o caminho comum (poucos times,
     * sem busca) deixava de ser exercido por qualquer spec.
     *
     * Um e-mail próprio resolve: o `dev` volta aos 6 dele e este fica com 5 —
     * os dois abaixo do limite. O sufixo `-e2e@gerador.local` é o que a limpeza
     * logo acima já varre, então ele não sobrevive de uma rodada para a outra.
     */
    const timesDeSpec = [
      "time-e2e-abas",
      "time-e2e-conformidade",
      "time-e2e-por-componente",
      "time-e2e-forma",
      "time-e2e-leitura",
    ];
    // Ninguém ALÉM deste e-mail pertence a estes times. Sem esta linha, uma
    // rodada antiga que os pendurou noutro usuário deixa a lista dele maior
    // para sempre — e o banco de CI (novo) e o local (velho) passam a testar
    // coisas diferentes, que é o pior tipo de divergência.
    await client.query(`DELETE FROM "usuario_time" WHERE "time_id" = ANY($1) AND "email" <> $2`, [
      timesDeSpec,
      EMAIL_DAS_REGRAS,
    ]);
    for (const time of timesDeSpec) {
      await client.query(
        `INSERT INTO "times" ("id", "organizacao_id", "nome")
         SELECT $1, "organizacao_id", $1 FROM "times" WHERE "id" = 'time-pagamentos'
         ON CONFLICT ("id") DO NOTHING`,
        [time]
      );
      // `owner`, e não o `operar` do default da coluna: editar config de um time
      // exige nível de owner naquele time (`primeiroRecursoNegado` devolve o
      // recurso negado para qualquer nível menor, mesmo com o RBAC desligado).
      // É o que quem cria um time de verdade recebe, e sem isso o spec leva 403
      // no primeiro `PUT` — que foi exatamente o que aconteceu.
      await client.query(
        `INSERT INTO "usuario_time" ("email", "time_id", "nivel") VALUES ($2, $1, 'owner')
         ON CONFLICT ("email", "time_id") DO UPDATE SET "nivel" = 'owner'`,
        [time, EMAIL_DAS_REGRAS]
      );
    }
    // E a criação é AFERIDA: o `INSERT` acima depende de `time-pagamentos`
    // existir, e um `SELECT` que não casa insere ZERO linhas sem erro nenhum.
    // Sem esta conta, o sintoma seria o mesmo de sempre — cinco specs presos na
    // tela de escolher time, apontando para o lugar errado.
    const criados = await client
      .query(`SELECT count(*)::int AS n FROM "usuario_time" WHERE "time_id" = ANY($1) AND "email" = $2`, [
        timesDeSpec,
        EMAIL_DAS_REGRAS,
      ])
      .then((r) => r.rows[0].n as number);
    if (criados !== timesDeSpec.length) {
      throw new Error(
        `E2E: ${criados} de ${timesDeSpec.length} times de spec foram criados — os specs de regras não conseguiriam entrar no time deles.`
      );
    }
    // E a config que eles gravaram na rodada anterior sai: documento de time que
    // sobrevive faz a suíte passar na primeira e mentir na segunda — a mesma
    // razão do `credenciais_ia` acima.
    await client
      .query(`DELETE FROM "config_documentos" WHERE "time_id" LIKE 'time-e2e-%'`)
      .catch(() => undefined);

    // #301 — os padrões por componente também morrem no TRUNCATE acima, e sem
    // eles `padroes-por-componente.spec.ts` testaria uma tabela vazia.
    //
    // Lendo o ARQUIVO da migração em vez de recopiar o INSERT: a seed tem um
    // dono só. Copiá-la para cá seria a segunda versão de uma verdade — e o
    // §303 mostrou como isso termina, com a cópia citando uma tabela que a
    // migração já tinha apagado.
    const seed = await readFile(
      resolve(import.meta.dirname, "..", "..", "server", "migrations", "0016_padroes_por_componente_demo.sql"),
      "utf-8"
    );
    await client.query(seed);
  } catch (erro) {
    // §303 — SEM tolerância. O "banco novo" já foi respondido lá em cima, com
    // uma pergunta em vez de uma heurística.
    //
    // Aqui morava `if (código !== "42P01") throw`, escrito para deixar passar
    // só o banco vazio. Só que tabela APAGADA por migração devolve o mesmo
    // 42P01 que tabela ainda-não-criada, e foi assim que o setup inteiro ficou
    // mudo por seis migrações. Um `catch` que decide por código de erro sempre
    // vai confundir dois mundos que o código não distingue.
    await client.end().catch(() => undefined);
    throw erro;
  }
  await client.end();
}
