import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/cli.ts"],
  format: ["esm"],
  outDir: "dist",
  clean: true,
  banner: { js: "#!/usr/bin/env node" },
  target: "node18",
  // @gerador/engine, @gerador/llm e @gerador/aplicacao são TS-fonte sem build
  // próprio (workspace link, não pacote publicado) — sem isso o tsup os trata
  // como externos por estarem em "dependencies"/"devDependencies", e o Node não
  // consegue resolver os imports .ts em runtime. Os três precisam ficar em
  // devDependencies também: em "dependencies", o npm tentaria baixá-los do
  // registro público, onde não existem, e o `npm i -g` quebraria.
  // `node-llama-cpp` (dependência real de @gerador/llm, com binário nativo)
  // fica de fora de propósito — precisa continuar em node_modules de verdade.
  noExternal: ["@gerador/engine", "@gerador/llm", "@gerador/aplicacao"],
  // ACHADO real: `undici` (o proxy do SPEC-32) NÃO sobrevive ao bundle — ele
  // usa `require` interno em módulos CJS próprios, e empacotado quebra na
  // primeira chamada, com um stack trace apontando pro dist e não pro
  // problema. Como `node-llama-cpp`, ele precisa continuar em node_modules de
  // verdade — e por isso mora em "dependencies" de packages/cli.
  external: ["undici"],
});
