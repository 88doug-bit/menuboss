/**
 * §12 P1–P5 performance-budget E2E (Task 16).
 *
 * Env-gated like Wave 2 E2E (E2E_SUPABASE_URL). Budgets live in ./budgets.ts.
 * Soft-warn at 1× budget; hard-fail at 2×. Always logs raw timings.
 *
 * CI: run after Wave 2 E2E in the database-gates job (see NOTES in
 * drafts/grok_out_pwa_search_perf.md).
 *
 * P3 is covered by Vitest: src/lib/perf/portionPreview.bench.test.ts
 */
import { expect, test } from "@playwright/test";
import path from "node:path";
import { assertPerfBudget, PERF_BUDGETS } from "./budgets";
import { e2eDescribe } from "./helpers/describe";
import { signInAs } from "./helpers/supabase";
import { E2E_FIXTURES, PERSONAS } from "./personas";

const memberAState = path.join(__dirname, ".auth/member_a.json");
const memberBState = path.join(__dirname, ".auth/member_b.json");

e2eDescribe("§12 performance budgets (P1–P5)", () => {
  test.use({ storageState: memberAState });

  test("P1 calendar interactive < 1.5s (warm, hard at 2×)", async ({
    page,
  }) => {
    // Cold-ish first hit to populate shell / auth cookies
    await page.goto("/calendar");
    await expect(page.getByTestId("calendar-week-grid")).toBeVisible({
      timeout: 15_000,
    });
    await page.waitForLoadState("networkidle");

    // Warm run: bracket with performance.now inside the page when possible,
    // wall clock across navigation for cross-document accuracy.
    const t0 = Date.now();
    await page.goto("/calendar");
    await expect(page.getByTestId("calendar-week-grid")).toBeVisible({
      timeout: 10_000,
    });
    // Controls usable: desktop calendar or mobile week list
    await expect(
      page
        .getByTestId("calendar-desktop")
        .or(page.getByTestId("calendar-mobile")),
    ).toBeVisible();
    const p1Ms = Date.now() - t0;

    assertPerfBudget(
      "P1_CALENDAR_INTERACTIVE",
      p1Ms,
      PERF_BUDGETS.P1_CALENDAR_INTERACTIVE_MS,
    );
  });

  test("P2 shopping list generation < 2s (seeded multi-plan)", async ({
    page,
  }) => {
    const memberA = await signInAs("member_a");
    const today = new Date();
    const iso = (d: Date) => d.toISOString().slice(0, 10);
    const start = iso(today);
    const end = iso(new Date(today.getTime() + 6 * 86_400_000));

    async function upsertPlan(
      title: string,
      recipeId: string,
    ): Promise<string> {
      const { data, error } = await memberA.rpc("meal_plan_create_or_update", {
        p_payload: {
          title,
          startDate: start,
          endDate: end,
          householdIds: [PERSONAS.member_a.householdId],
          portionRequirements: [
            {
              portionCategoryId: E2E_FIXTURES.adultMaleId,
              count: 2,
              athleteCount: 0,
            },
          ],
          assignments: [
            {
              recipeId,
              assignmentDate: start,
              mealSlot: "dinner",
              servings: 4,
            },
          ],
        },
      });
      if (error) throw new Error(`upsertPlan(${title}): ${error.message}`);
      return data as string;
    }

    const planAId = await upsertPlan(
      `E2E Perf Shop A ${Date.now()}`,
      E2E_FIXTURES.shoppingRecipeAId,
    );
    const planBId = await upsertPlan(
      `E2E Perf Shop B ${Date.now()}`,
      E2E_FIXTURES.shoppingRecipeBId,
    );

    const t0 = Date.now();
    await page.goto(
      `/shopping?mealPlanIds=${encodeURIComponent(`${planAId},${planBId}`)}`,
    );
    await expect(page.getByTestId("shopping-list")).toBeVisible({
      timeout: 15_000,
    });
    const p2Ms = Date.now() - t0;

    assertPerfBudget(
      "P2_SHOPPING_LIST",
      p2Ms,
      PERF_BUDGETS.P2_SHOPPING_LIST_MS,
    );
  });

  test("P4 search results < 500ms", async ({ page }) => {
    await page.goto("/calendar");
    await expect(page.getByTestId("global-search")).toBeVisible({
      timeout: 10_000,
    });

    const desktopInput = page.locator(
      '[data-testid="global-search"] .sm\\:block [data-testid="global-search-input"]',
    );
    // Prefer desktop combobox when visible; else open mobile sheet.
    if (await page.getByTestId("global-search-input").first().isVisible()) {
      // may be hidden by CSS on mobile viewport — check effective visibility
    }
    const mobileOpen = page.getByTestId("global-search-mobile-open");
    if (await mobileOpen.isVisible()) {
      await mobileOpen.click();
      await expect(page.getByTestId("global-search-sheet")).toBeVisible();
    } else {
      await page.getByTestId("global-search-input").first().click();
    }

    const input = page.getByTestId("global-search-input").last();

    // Warm the code path + connection with one term...
    await input.fill("Tuna");
    await page
      .getByTestId("global-search-hit")
      .or(page.getByTestId("global-search-empty"))
      .first()
      .waitFor({ state: "visible", timeout: 10_000 });
    await input.fill("");

    // ...then MEASURE a never-before-queried term so the timing includes the
    // real network round-trip (repeating the warmed term would only measure
    // the 30s staleTime cache: debounce + render, and could never fail).
    const measuredQuery = `Roast ${Date.now() % 100000}`;
    const t0 = Date.now();
    await input.fill(measuredQuery);
    await expect(
      page
        .getByTestId("global-search-hit")
        .or(page.getByTestId("global-search-empty"))
        .first(),
    ).toBeVisible({ timeout: 10_000 });
    const p4Ms = Date.now() - t0;

    assertPerfBudget(
      "P4_SEARCH_RESULTS",
      p4Ms,
      PERF_BUDGETS.P4_SEARCH_RESULTS_MS,
    );
    void desktopInput;
  });

  test("P5 realtime propagation < 2s (two contexts)", async ({ browser }) => {
    const memberA = await signInAs("member_a");
    const title = `E2E Perf RT ${Date.now()}`;
    const today = new Date();
    const iso = (d: Date) => d.toISOString().slice(0, 10);
    const start = iso(today);
    const end = iso(new Date(today.getTime() + 6 * 86_400_000));

    const { data: planId, error } = await memberA.rpc(
      "meal_plan_create_or_update",
      {
        p_payload: {
          title,
          startDate: start,
          endDate: end,
          householdIds: [
            PERSONAS.member_a.householdId,
            PERSONAS.member_b.householdId,
          ],
          portionRequirements: [],
          assignments: [
            {
              recipeId: E2E_FIXTURES.seafoodRecipeId,
              assignmentDate: start,
              mealSlot: "dinner",
              servings: 2,
            },
          ],
        },
      },
    );
    if (error) throw new Error(`create plan: ${error.message}`);

    const contextB = await browser.newContext({ storageState: memberBState });
    const pageB = await contextB.newPage();

    try {
      // Observer warms calendar + realtime subscription (Wave 2 two-context pattern).
      await pageB.goto("/calendar");
      await expect(pageB.getByTestId("calendar-week-grid")).toBeVisible({
        timeout: 15_000,
      });
      // Ensure initial shared plan is visible before measuring edit propagation.
      await expect
        .poll(async () => pageB.getByText(title).count(), {
          timeout: 10_000,
          intervals: [200, 400, 800],
        })
        .toBeGreaterThan(0);

      const newTitle = `${title} · edited`;
      const t0 = Date.now();
      const { error: editErr } = await memberA
        .from("meal_plan")
        .update({ title: newTitle })
        .eq("id", planId as string);
      if (editErr) throw new Error(`edit: ${editErr.message}`);

      await expect
        .poll(
          async () => {
            const n = await pageB.getByText(newTitle).count();
            if (n > 0) return true;
            // Soft reload within budget window (same as plan-shared-meal).
            if (Date.now() - t0 < PERF_BUDGETS.P5_REALTIME_PROPAGATION_MS) {
              await pageB.reload();
              await pageB
                .getByTestId("calendar-week-grid")
                .waitFor({ state: "visible" })
                .catch(() => undefined);
            }
            return (await pageB.getByText(newTitle).count()) > 0;
          },
          {
            timeout: PERF_BUDGETS.P5_REALTIME_PROPAGATION_MS * 2 + 500,
            intervals: [100, 200, 300, 400],
            message: "§12 P5: member_b must see shared-plan title update",
          },
        )
        .toBe(true);

      const p5Ms = Date.now() - t0;
      assertPerfBudget(
        "P5_REALTIME_PROPAGATION",
        p5Ms,
        PERF_BUDGETS.P5_REALTIME_PROPAGATION_MS,
      );
    } finally {
      await contextB.close();
      await memberA
        .from("meal_plan")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", planId as string);
    }
  });
});
