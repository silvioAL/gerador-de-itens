import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test-support/setup.ts"],
    exclude: ["**/node_modules/**", "**/e2e/**"],
  },
});
