import { defineConfig } from "@playwright/test";

// Precisa de Postgres real já rodando antes de `npm run test:e2e`
// (`docker compose up -d db`, mesma exigência de packages/server/src/app.test.ts)
// — a app agora carrega perfisTime/referencias/quebras do @gerador/server, não
// mais de arquivo local, então o server precisa estar de pé pra qualquer E2E
// passar da tela de carregamento.
const DATABASE_URL_TESTE = process.env.DATABASE_URL ?? "postgres://gerador:gerador@localhost:5432/gerador";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  reporter: "list",
  globalSetup: "./e2e/globalSetup.ts",
  use: {
    baseURL: "http://localhost:5190",
    screenshot: "only-on-failure",
  },
  webServer: [
    {
      command: "npm run dev --workspace=packages/server",
      cwd: "../..",
      url: "http://localhost:4000/health",
      reuseExistingServer: false,
      timeout: 30000,
      // RATE_LIMIT_LOGIN_MAX alto de propósito: o default de produção (10/5min,
      // ver routes/auth.ts) é pensado pra uma pessoa, não pra uma suíte com 14
      // specs e 6 workers logando em paralelo — sem isso, os primeiros 10 logins
      // passam e o resto esbarra em 429 (SPEC-10 §2.1 continua exercido pelo
      // teste dedicado em packages/server/src/app.test.ts, isolado do E2E).
      env: {
        DATABASE_URL: DATABASE_URL_TESTE,
        PORT: "4000",
        RATE_LIMIT_LOGIN_MAX: "1000",
        RATE_LIMIT_GLOBAL_MAX: "10000",
      },
    },
    {
      command: "npm run dev -- --port 5190 --strictPort",
      url: "http://localhost:5190",
      reuseExistingServer: false,
      timeout: 30000,
      env: { VITE_API_URL: "http://localhost:4000" },
    },
    // Gateway de IA falso (ver e2e/gatewayFalso.ts). Sobe sempre, mesmo pros
    // specs que não usam IA: é um processo de ~50 linhas sem estado, e deixá-lo
    // condicional traria um modo de falha novo ("o spec de IA falha quando
    // rodado sozinho") em troca de nada.
    {
      command: "npx tsx e2e/gatewayFalso.bin.ts",
      url: "http://127.0.0.1:4123/health",
      reuseExistingServer: false,
      timeout: 30000,
    },
  ],
});
