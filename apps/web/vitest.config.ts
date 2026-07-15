import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // Next's tsconfig uses jsx: "preserve"; vitest's esbuild must transform it.
  esbuild: { jsx: "automatic" },
  resolve: {
    // Mirror tsconfig's "@/*" alias (Next resolves it; vitest needs it explicit).
    alias: { "@": path.resolve(__dirname, "src") },
  },
  test: {
    globals: true,
    // Unit + component tests. Playwright specs live in ./e2e via `test:e2e`.
    include: ["src/**/*.test.{ts,tsx}"],
    environmentMatchGlobs: [
      ["src/components/**", "jsdom"],
      ["src/**", "node"],
    ],
    setupFiles: ["./vitest.setup.ts"],
  },
});
