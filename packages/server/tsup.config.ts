import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/server.ts"],
  // cjs (não esm) porque bundlar fastify inteiro puxa avvio/pino, que fazem
  // require() dinâmico de módulos node internos (ex.: "events") — em ESM isso
  // não tem como funcionar (sem require de verdade), em CJS funciona nativo.
  format: ["cjs"],
  outDir: "dist",
  clean: true,
  target: "node18",
  // @gerador/engine é TS-fonte sem build próprio (workspace link, não pacote
  // publicado) — mesmo motivo de packages/cli/tsup.config.ts. As demais deps
  // também entram no bundle pra dist/server.js rodar sozinho, sem node_modules
  // na imagem de runtime — deploy fica só "copia um arquivo e roda".
  noExternal: [
    "@gerador/engine",
    // SPEC-31: os dois workspaces novos entram pelo mesmo motivo do engine —
    // são TS-fonte sem build próprio, e a imagem de runtime não tem
    // `node_modules`. Faltando aqui, o `dist/server.cjs` sobe e morre no
    // primeiro require com "Cannot find module '@gerador/aplicacao'".
    // `@gerador/llm` só é alcançado pelo caminho de gateway (ver
    // `gateway.fronteira.test.ts`), então bundlá-lo NÃO traz binário nativo.
    "@gerador/aplicacao",
    "@gerador/llm",
    "@fastify/cookie",
    "@fastify/cors",
    "@fastify/helmet",
    "@fastify/rate-limit",
    "drizzle-orm",
    "fastify",
    "jose",
    "openid-client",
    "pg",
    "zod",
  ],
  // package.json declara "type": "module" (pros scripts de dev via tsx) —
  // .cjs força Node a tratar esse arquivo de saída como CommonJS mesmo assim.
  outExtension: () => ({ js: ".cjs" }),
});
