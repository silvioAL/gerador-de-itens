import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/cli.ts"],
  format: ["esm"],
  outDir: "dist",
  clean: true,
  banner: { js: "#!/usr/bin/env node" },
  target: "node18",
  // @gerador/engine é TS-fonte sem build próprio (workspace link, não pacote
  // publicado) — sem isso o tsup o trata como externo por estar em
  // "dependencies", e o Node não consegue resolver os imports .ts em runtime.
  noExternal: ["@gerador/engine"],
});
