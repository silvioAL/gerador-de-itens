import { defineConfig } from "@playwright/test";

// Precisa de Postgres real já rodando antes de `npm run test:e2e`
// (`docker compose up -d db`, mesma exigência de packages/server/src/app.test.ts)
// — a app agora carrega perfisTime/referencias/quebras do @gerador/server, não
// mais de arquivo local, então o server precisa estar de pé pra qualquer E2E
// passar da tela de carregamento.
/**
 * ACHADO REAL: este default era o banco de DESENVOLVIMENTO
 * (`localhost:5432/gerador`). A suíte truncava as tabelas do ambiente em uso e
 * deixava para trás a credencial do gateway falso — encontrada no banco de
 * trabalho do usuário, derrubando toda chamada de IA.
 *
 * Mesma armadilha que `test-support/bancoDeTeste.ts` já tinha corrigido para o
 * vitest; o Playwright escapava da trava porque nunca passava por lá.
 *
 * Agora o padrão é a stack dedicada (`docker-compose.e2e.yml`): porta 5433,
 * banco próprio. E `globalSetup` chama `exigirBancoDescartavel`, então apontar
 * para um banco sem sufixo `_test` faz a suíte se recusar a rodar.
 */
const DATABASE_URL_TESTE =
  process.env.DATABASE_URL ?? "postgres://gerador:gerador@localhost:5433/gerador_e2e_test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  /**
   * §203 — dois projetos, e o segundo depende do primeiro.
   *
   * O spec de RBAC precisa LIGAR o controle de acesso, que é da organização
   * inteira: com ele rodando em paralelo, qualquer spec vizinho que assume o
   * modo aberto passa a levar 403 (é a mesma contaminação que
   * `app.test.ts` documenta pro vitest). `dependencies` faz esse spec rodar
   * sozinho, depois que todo o resto terminou.
   */
  projects: [
    { name: "app", testIgnore: /rbac-.*\.spec\.ts/ },
    { name: "rbac", testMatch: /rbac-.*\.spec\.ts/, dependencies: ["app"] },
  ],
  reporter: "list",
  globalSetup: "./e2e/globalSetup.ts",
  use: {
    baseURL: "http://localhost:5190",
    screenshot: "only-on-failure",
    // Sem isto, uma ação que espera por um elemento inexistente consome o
    // timeout do TESTE e o relatório mostra só o erro do `finally` — foi o que
    // escondeu, por várias rodadas, um `click()` num botão que nunca ia
    // aparecer. Alto o bastante pros passos legitimamente lentos (geração via
    // IA falsa) e ainda assim menor que o teste.
    actionTimeout: 30000,
    // SPEC-30 Fase 1a — microfone falso do Chromium: `getUserMedia` devolve um
    // tom sintético e a permissão é concedida sem diálogo. Fica aqui, e não no
    // `test.use()` do spec, porque `launchOptions` num describe forçaria um
    // worker novo (o Playwright recusa). É inofensivo pros outros specs: sem
    // ninguém chamar `getUserMedia`, nada muda.
    launchOptions: {
      args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"],
    },
  },
  webServer: [
    {
      command: "npm run dev --workspace=packages/server",
      cwd: "../..",
      // Porta 4100, não 4000: a stack de TRABALHO (docker-compose.yml) publica
      // o servidor em 4000, e rodar o E2E com o ambiente de pé morria com
      // "port already used". Isolar o banco e deixar a porta em conflito é
      // isolamento pela metade — foi o que a primeira versão desta stack fez.
      url: "http://localhost:4100/health",
      reuseExistingServer: false,
      timeout: 30000,
      // RATE_LIMIT_LOGIN_MAX alto de propósito: o default de produção (10/5min,
      // ver routes/auth.ts) é pensado pra uma pessoa, não pra uma suíte com 14
      // specs e 6 workers logando em paralelo — sem isso, os primeiros 10 logins
      // passam e o resto esbarra em 429 (SPEC-10 §2.1 continua exercido pelo
      // teste dedicado em packages/server/src/app.test.ts, isolado do E2E).
      env: {
        DATABASE_URL: DATABASE_URL_TESTE,
        PORT: "4100",
        RATE_LIMIT_LOGIN_MAX: "1000",
        RATE_LIMIT_GLOBAL_MAX: "10000",
      },
    },
    {
      command: "npm run dev -- --port 5190 --strictPort",
      url: "http://localhost:5190",
      reuseExistingServer: false,
      timeout: 30000,
      env: { VITE_API_URL: "http://localhost:4100" },
    },
    // Gateway de IA falso. Sobe sempre, mesmo pros specs que não usam IA: é um
    // processo sem estado, e deixá-lo condicional traria um modo de falha novo
    // ("o spec de IA falha quando rodado sozinho") em troca de nada.
    //
    // SPEC-74 — ele deixou de morar em `e2e/` e virou `packages/gateway-falso`,
    // pra poder subir também no `docker compose` (quem trabalha na stack não
    // tinha dublê nenhum, e gastava token de API pra ver uma tela). Daqui a
    // única diferença é o endereço: mesmo processo, mesmas respostas.
    {
      command: "npm run dev --workspace=packages/gateway-falso",
      cwd: "../..",
      url: "http://127.0.0.1:4123/health",
      reuseExistingServer: false,
      timeout: 30000,
    },
  ],
});
