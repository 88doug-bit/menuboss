import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright config — placeholder for Wave 2 E2E (Product PRD §9.3 flows).
 * Browsers are not downloaded during scaffold; run `pnpm exec playwright install`
 * before executing specs locally / in CI.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: "html",
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
