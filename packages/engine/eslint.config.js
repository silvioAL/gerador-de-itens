import tsParser from "@typescript-eslint/parser";

/**
 * Regra de fronteira do engine — equivalente ao teste ArchUnit do SPEC-01 §3:
 * nenhuma classe do motor pode depender de React ou fazer I/O (arquivo/rede).
 * Isso é o que mantém a derivação testável fora de qualquer runtime específico.
 * Testes e test-support ficam de fora porque eles LEEM fixtures do disco de propósito.
 */
export default [
  {
    files: ["src/**/*.ts"],
    ignores: ["src/**/*.test.ts", "src/test-support/**"],
    languageOptions: { parser: tsParser },
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            { name: "react", message: "engine/ não pode depender de React — mantenha o motor puro." },
            { name: "node:fs", message: "engine/ não pode fazer I/O — leitura de arquivo é responsabilidade de fora (CLI/web)." },
            { name: "fs", message: "engine/ não pode fazer I/O — leitura de arquivo é responsabilidade de fora (CLI/web)." },
            { name: "node:http", message: "engine/ não pode fazer I/O de rede." },
            { name: "http", message: "engine/ não pode fazer I/O de rede." },
          ],
        },
      ],
    },
  },
];
