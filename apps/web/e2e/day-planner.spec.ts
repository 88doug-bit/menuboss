/**
 * UI Increment 1 — Day Planner flow.
 *
 * Calendar day click routes to /day/[date] (replaces the old day modal);
 * the page shows Morning / Mid-day / Evening zones; "Add meal" opens the
 * Menu Planner dialog. With no covering plan, saving auto-creates a
 * single-day plan (hybrid attachment rule) — asserted via the visible
 * note. Clicking an existing meal re-opens the dialog in change-recipe
 * mode.
 *
 * Runs on a far-future date so the covering-plans set is deterministic
 * (empty). The auto-created plan's title is date-derived (not "E2E "-
 * prefixed), so this spec cleans it up itself in afterAll.
 */
import { expect, test } from "@playwright/test";
import path from "node:path";
import { addDays, format } from "date-fns";
import { E2E_FIXTURES } from "./personas";
import { e2eDescribe } from "./helpers/describe";
import { signInAs } from "./helpers/supabase";
import { isE2EEnabled } from "./helpers/env";

const memberAState = path.join(__dirname, ".auth/member_a.json");

const futureDay = addDays(new Date(), 400);
const futureIso = format(futureDay, "yyyy-MM-dd");
// Must match autoPlanTitle() in dayPlanPayload.ts.
const autoTitle = format(futureDay, "EEE MMM d, yyyy");

e2eDescribe("Day Planner (UI Increment 1)", () => {
  test.use({ storageState: memberAState });
  // create → change-recipe share one auto-created plan; keep them ordered.
  test.describe.configure({ mode: "serial" });

  test.afterAll(async () => {
    if (!isE2EEnabled()) return;
    const memberA = await signInAs("member_a");
    const { error } = await memberA
      .from("meal_plan")
      .update({ deleted_at: new Date().toISOString() })
      .eq("title", autoTitle)
      .is("deleted_at", null);
    if (error) {
      console.warn(`[e2e day-planner] cleanup failed: ${error.message}`);
    }
  });

  test("calendar day click opens the day planner (band zones, single view toggle)", async ({
    page,
  }) => {
    await page.goto("/calendar");
    await expect(page.getByTestId("calendar-week-grid")).toBeVisible();

    // Spec item 1: the redundant custom toggle is gone — only rbc's
    // toolbar renders Week/Month (desktop calendar only).
    if ((await page.getByTestId("calendar-desktop").count()) > 0) {
      await expect(page.getByRole("button", { name: "Week" })).toHaveCount(1);
      await expect(page.getByRole("button", { name: "Month" })).toHaveCount(1);
      // Spec item 2: band rows replace the 24-hour gutter.
      await expect(page.getByTestId("calendar-band-week")).toBeVisible();
      await expect(page.locator(".rbc-time-gutter")).toHaveCount(0);
    }

    // Spec item 3: day click routes to the Day Planner page.
    await page.getByTestId("calendar-day-cell").first().click();
    await expect(page).toHaveURL(/\/day\/\d{4}-\d{2}-\d{2}$/);
    await expect(page.getByTestId("day-planner")).toBeVisible();
    for (const band of ["morning", "midday", "evening"] as const) {
      await expect(page.getByTestId(`day-band-${band}`)).toBeVisible();
    }
  });

  test("adds a meal from a band zone — auto-creates a single-day plan", async ({
    page,
  }) => {
    await page.goto(`/day/${futureIso}`);
    await expect(page.getByTestId("day-planner")).toBeVisible();

    // Each day is pre-populated with default slot placeholders.
    for (const slot of ["breakfast", "lunch", "dinner"] as const) {
      await expect(
        page.getByTestId(`day-slot-placeholder-${slot}`),
      ).toBeVisible();
    }

    // Clicking the dinner placeholder opens the dialog pre-set to dinner.
    await page.getByTestId("day-slot-placeholder-dinner").click();
    await expect(page.getByTestId("meal-dialog")).toBeVisible();
    // Evening zone pre-selects dinner (band default slot).
    await expect(page.getByTestId("meal-dialog-slot")).toHaveValue("dinner");
    // No covering plan → the hybrid rule announces the auto-created plan.
    await expect(
      page.getByTestId("meal-dialog-autocreate-note"),
    ).toContainText(autoTitle);

    await page
      .getByTestId("recipe-picker-search")
      .fill(E2E_FIXTURES.seafoodRecipeTitle);
    await page
      .getByTestId("recipe-picker-result")
      .filter({ hasText: E2E_FIXTURES.seafoodRecipeTitle })
      .click();
    await expect(
      page.getByTestId("meal-dialog-recipe-selected"),
    ).toContainText(E2E_FIXTURES.seafoodRecipeTitle);

    await page.getByTestId("meal-dialog-save").click();
    // Dialog closes; focus returns to the day planner (spec line 9).
    await expect(page.getByTestId("meal-dialog")).toHaveCount(0);

    const evening = page.getByTestId("day-band-evening");
    await expect(evening.getByTestId("day-meal-item")).toContainText(
      E2E_FIXTURES.seafoodRecipeTitle,
    );
    // The dinner slot is filled — its placeholder is gone.
    await expect(page.getByTestId("day-slot-placeholder-dinner")).toHaveCount(
      0,
    );

    // Survives a reload (really persisted, not local state).
    await page.reload();
    await expect(
      page.getByTestId("day-band-evening").getByTestId("day-meal-item"),
    ).toContainText(E2E_FIXTURES.seafoodRecipeTitle);
  });

  test("clicking a meal opens the menu planner and changes its recipe", async ({
    page,
  }) => {
    await page.goto(`/day/${futureIso}`);
    const evening = page.getByTestId("day-band-evening");
    await evening.getByTestId("calendar-plan-event").click();

    await expect(page.getByTestId("meal-dialog")).toBeVisible();
    await expect(page.getByTestId("meal-dialog-slot")).toHaveValue("dinner");

    await page
      .getByTestId("recipe-picker-search")
      .fill(E2E_FIXTURES.linkedRecipeTitle);
    await page
      .getByTestId("recipe-picker-result")
      .filter({ hasText: E2E_FIXTURES.linkedRecipeTitle })
      .click();
    await page.getByTestId("meal-dialog-save").click();
    await expect(page.getByTestId("meal-dialog")).toHaveCount(0);

    await expect(evening.getByTestId("day-meal-item")).toContainText(
      E2E_FIXTURES.linkedRecipeTitle,
    );
    await expect(evening.getByTestId("day-meal-item")).not.toContainText(
      E2E_FIXTURES.seafoodRecipeTitle,
    );
  });

  test("deletes the covering plan from the day planner", async ({ page }) => {
    await page.goto(`/day/${futureIso}`);
    const deleteButton = page.getByTestId(/^plan-delete-/);
    await expect(deleteButton).toBeVisible();

    page.once("dialog", (dialog) => dialog.accept());
    await deleteButton.click();

    // Plan and its meals disappear from the page.
    await expect(page.getByTestId(/^plan-delete-/)).toHaveCount(0);
    await expect(page.getByTestId("day-meal-item")).toHaveCount(0);
  });

  test("saves an empty plan for later editing (no recipe picked)", async ({
    page,
  }) => {
    await page.goto(`/day/${futureIso}`);
    await page.getByTestId("day-band-add-morning").click();
    await expect(page.getByTestId("meal-dialog")).toBeVisible();

    const save = page.getByTestId("meal-dialog-save");
    await expect(save).toHaveText(/save empty plan/i);
    await save.click();
    await expect(page.getByTestId("meal-dialog")).toHaveCount(0);

    // The empty plan now covers the day (marker chip + covering plan row).
    const deleteButton = page.getByTestId(/^plan-delete-/);
    await expect(deleteButton).toBeVisible();

    // Clean up through the UI.
    page.once("dialog", (dialog) => dialog.accept());
    await deleteButton.click();
    await expect(page.getByTestId(/^plan-delete-/)).toHaveCount(0);
  });
});
