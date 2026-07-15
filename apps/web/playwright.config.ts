import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright config — Product PRD §9.3 E2E + Scenario 11 realtime suite.
 *
 * Suites skip unless E2E_SUPABASE_URL is set (global-setup also no-ops).
 * Browsers: run `pnpm exec playwright install chromium` (CI installs chromium only).
 */
export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    /**
     * Mobile-first mandate (§11): iPhone 14 for Flow 1 + Flow 3 only.
     */
    {
      name: "Mobile Chrome",
      use: { ...devices["iPhone 14"] },
      testMatch: /plan-shared-meal\.spec\.ts|capture-chef-idea\.spec\.ts/,
    },
  ],
  /* Start dev server only when explicitly requested (CI starts the built app). */
  webServer: process.env.E2E_WEB_SERVER
    ? {
        command: process.env.E2E_WEB_SERVER,
        url: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000",
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      }
    : undefined,
});
