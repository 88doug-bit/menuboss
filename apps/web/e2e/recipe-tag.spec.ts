/**
 * Recipe editor inline tag creation (UI refinement).
 *
 * admin_a can add a new tag from /recipes/new; it is created via
 * tag.create (admin-only) and auto-selected. member_a (non-admin) does
 * not see the new-tag input at all. Created tags are deactivated in
 * afterAll (tag has no delete policy — deactivate is the app's own
 * lifecycle for tags).
 */
import { expect, test } from "@playwright/test";
import path from "node:path";
import { e2eDescribe } from "./helpers/describe";
import { signInAs } from "./helpers/supabase";
import { isE2EEnabled } from "./helpers/env";

const adminState = path.join(__dirname, ".auth/admin_a.json");
const memberState = path.join(__dirname, ".auth/member_a.json");

const tagName = `E2E Tag ${Date.now()}`;

e2eDescribe("Recipe editor — inline tag creation", () => {
  test.afterAll(async () => {
    if (!isE2EEnabled()) return;
    const admin = await signInAs("admin_a");
    const { error } = await admin
      .from("tag")
      .update({ is_active: false })
      .like("name", "E2E Tag %");
    if (error) {
      console.warn(`[e2e recipe-tag] cleanup failed: ${error.message}`);
    }
  });

  test("admin adds a new tag and it is auto-selected", async ({ browser }) => {
    const context = await browser.newContext({ storageState: adminState });
    const page = await context.newPage();
    await page.goto("/recipes/new");

    const input = page.getByTestId("tag-picker-new-name");
    await expect(input).toBeVisible();
    await input.fill(tagName);
    await page.getByTestId("tag-picker-add").click();

    // The created tag appears as a chip, already selected (emerald).
    const chip = page.getByRole("button", { name: tagName });
    await expect(chip).toBeVisible();
    await expect(chip).toHaveClass(/bg-emerald-600/);
    await expect(input).toHaveValue("");

    await context.close();
  });

  test("non-admin does not see the new-tag input", async ({ browser }) => {
    const context = await browser.newContext({ storageState: memberState });
    const page = await context.newPage();
    await page.goto("/recipes/new");

    await expect(page.getByTestId("tag-picker")).toBeVisible();
    await expect(page.getByTestId("tag-picker-new-name")).toHaveCount(0);

    await context.close();
  });
});
