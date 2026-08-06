import { describe, expect, it } from "vitest";
import { ESLint } from "eslint";

// Sanidade da regra de fronteira (eslint.config.js): confirma que ela FALHA de
// propósito quando violada, e não bloqueia o próprio test-support que precisa de fs.
describe("regra de fronteira do engine (equivalente ao ArchUnit do SPEC-01)", () => {
  it("reprova import de node:fs em src/ fora de test-support", async () => {
    const eslint = new ESLint();
    const [resultado] = await eslint.lintText('import { readFileSync } from "node:fs";\n', {
      filePath: "src/__boundary_violation__.ts",
    });
    expect(resultado.errorCount).toBeGreaterThan(0);
    expect(resultado.messages.some((m) => m.ruleId === "no-restricted-imports")).toBe(true);
  });

  it("reprova import de react em src/", async () => {
    const eslint = new ESLint();
    const [resultado] = await eslint.lintText('import React from "react";\n', {
      filePath: "src/__boundary_violation_react__.ts",
    });
    expect(resultado.errorCount).toBeGreaterThan(0);
  });

  it("permite node:fs dentro de test-support", async () => {
    const eslint = new ESLint();
    const [resultado] = await eslint.lintText('import { readFileSync } from "node:fs";\n', {
      filePath: "src/test-support/__ok__.ts",
    });
    expect(resultado.errorCount).toBe(0);
  });
});
