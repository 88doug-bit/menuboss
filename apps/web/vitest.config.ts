import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    // Unit tests only. Playwright specs live in ./e2e and run via `test:e2e`.
    include: ["src/**/*.test.ts"],
  },
});
