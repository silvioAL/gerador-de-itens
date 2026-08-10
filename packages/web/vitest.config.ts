import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test-support/setup.ts"],
    exclude: ["**/node_modules/**", "**/e2e/**"],
    // ACHADO REAL: a suíte falhava com um conjunto DIFERENTE de testes a cada
    // rodada — CamposArestaTab numa, AbrirQuebraScreen na outra, ReviewScreen
    // na terceira. Nenhum deles era regressão: rodando isolado, o mesmo teste
    // passa em ~5,1s. O teto padrão do vitest é 5000ms, e vários testes de
    // `userEvent` (que avança timers de verdade, tecla a tecla, sobre árvores
    // grandes) encostam nele — sob carga de arquivos em paralelo, encostar
    // vira estourar. Falha intermitente não é sinal, é ruído: ensina a ignorar
    // vermelho, que é o oposto do que a suíte serve.
    testTimeout: 20_000,
    hookTimeout: 20_000,
  },
});
