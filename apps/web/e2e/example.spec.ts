import { expect, test } from "@playwright/test";

/**
 * Placeholder spec. Real E2E (plan-a-shared-meal, §9.3) arrives in Wave 2.
 * Skipped so `playwright test` is green without a running dev server / browsers.
 */
test.skip("home page renders", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/MenuBoss/i);
});
