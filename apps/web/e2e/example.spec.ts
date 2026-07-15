import { expect, test } from "@playwright/test";

/**
 * Placeholder kept for smoke discovery. Real §9.3 flows live in sibling specs.
 * Always skipped — does not require E2E_SUPABASE_URL or a running app.
 */
test.skip("home page renders (placeholder)", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/MenuBoss/i);
});
