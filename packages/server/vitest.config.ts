import { defineConfig } from "vitest/config";

/**
 * ACHADO REAL (SPEC-33 Fase 3): a CI ficou vermelha com três sintomas
 * diferentes — `app.test.ts` vendo linhas de `campos_no` que não eram dele,
 * contagens erradas por um, e `duplicate key value violates unique constraint
 * "pg_database_datname_index"`.
 *
 * Um sintoma só: **os testes do server compartilham um banco, e o vitest roda
 * arquivos em PARALELO**. Enquanto `app.test.ts` era o único que escrevia, o
 * paralelismo era invisível. `contratoDoClienteWeb.test.ts` (#308) trouxe um
 * segundo escritor e a suposição caiu.
 *
 * Tentei antes dar um banco próprio ao contrato. Passou localmente e falhou na
 * CI: dois `CREATE DATABASE` concorrentes disputam o catálogo do Postgres.
 * Isso não corrigia a causa, mudava o lugar dela.
 *
 * `fileParallelism: false` diz a verdade sobre esta suíte: ela fala com UM
 * banco, e bancos não são paralelizáveis por wishful thinking. Custa segundos
 * numa suíte de ~8s; o que se compra é um teste que passa pelo mesmo motivo
 * toda vez.
 */
export default defineConfig({
  test: {
    fileParallelism: false,
  },
});
