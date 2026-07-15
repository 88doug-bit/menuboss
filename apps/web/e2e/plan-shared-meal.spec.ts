/**
 * §9.3 Flow 1 — Plan a Shared Meal
 *
 * member_a: calendar → day → add plan → search/select seafood recipe
 * (safety note visible) → portion counts (live total = portion-calc) →
 * share Household B → save.
 * member_b (second context): plan visible within §12 P5 budget (≤ 2 s).
 *
 * Also asserts §12 P1 calendar interactive < 1.5 s on a warm navigation.
 *
 * Mobile project: iPhone 14 (playwright.config projects).
 */
import { expect, test } from "@playwright/test";
import path from "node:path";
import {
  E2E_FIXTURES,
  PERSONAS,
  PLAN_FLOW_EXPECTED_PROTEIN_OZ,
} from "./personas";
import { e2eDescribe } from "./helpers/describe";

const memberAState = path.join(__dirname, ".auth/member_a.json");
const memberBState = path.join(__dirname, ".auth/member_b.json");

e2eDescribe("Plan a Shared Meal (§9.3)", () => {
  test.use({ storageState: memberAState });

  test("member_a plans shared meal; member_b sees it within 2s (P5)", async ({
    page,
    browser,
  }) => {
    const planTitle = `E2E Shared Plan ${Date.now()}`;

    // --- P1 warm calendar interactive budget (< 1.5 s) ---
    await page.goto("/calendar");
    await page.waitForLoadState("networkidle");
    const warmStart = Date.now();
    await page.goto("/calendar");
    await expect(page.getByTestId("calendar-week-grid")).toBeVisible({
      timeout: 5000,
    });
    const warmMs = Date.now() - warmStart;
    expect(
      warmMs,
      `§12 P1 calendar interactive budget: ${warmMs}ms (limit 1500ms)`,
    ).toBeLessThan(1500);

    // --- Day → Add to plan ---
    await page.getByTestId("calendar-day-cell").first().click();
    await page.getByTestId("calendar-add-to-plan").click();

    // Editor shell
    await expect(page.getByTestId("meal-plan-editor")).toBeVisible();
    await page.getByTestId("meal-plan-title-input").fill(planTitle);

    // Recipe search + select seafood fixture; assert safety note
    await page.getByTestId("assignment-add-row").click();
    await page.getByTestId("recipe-picker-search").fill(E2E_FIXTURES.seafoodRecipeTitle);
    await page
      .getByTestId("recipe-picker-result")
      .filter({ hasText: E2E_FIXTURES.seafoodRecipeTitle })
      .click();
    await expect(page.getByTestId("food-safety-note")).toBeVisible();
    await expect(page.getByTestId("food-safety-note")).toContainText(/mercury|serving per week|good_choices/i);

    // Portion counts: Adult Male count=2 athlete=1 → live total 15 oz
    const adultMaleRow = page.getByTestId(
      `portion-row-${E2E_FIXTURES.adultMaleId}`,
    );
    await adultMaleRow.getByTestId("portion-count-input").fill("2");
    await adultMaleRow.getByTestId("portion-athlete-input").fill("1");

    const liveTotal = page.getByTestId("portion-live-total");
    await expect(liveTotal).toBeVisible();
    await expect
      .poll(async () => {
        const text = await liveTotal.innerText();
        const match = text.replace(/,/g, "").match(/(\d+(\.\d+)?)/);
        return match ? Number(match[1]) : NaN;
      })
      .toBeCloseTo(PLAN_FLOW_EXPECTED_PROTEIN_OZ, 5);

    // Share with Household B
    await page
      .getByTestId(`share-household-${PERSONAS.member_b.householdId}`)
      .check();

    await page.getByTestId("meal-plan-save").click();
    await expect(page.getByTestId("meal-plan-save-success")).toBeVisible({
      timeout: 10_000,
    });

    // --- Second context as member_b: P5 ≤ 2 s ---
    const bContext = await browser.newContext({ storageState: memberBState });
    const bPage = await bContext.newPage();
    const observeStart = Date.now();
    await bPage.goto("/calendar");
    await expect(bPage.getByTestId("calendar-week-grid")).toBeVisible();

    // Prefer realtime; fall back to soft reload polling within budget via expect.poll
    await expect
      .poll(
        async () => {
          const visible = await bPage
            .getByTestId("calendar-plan-event")
            .filter({ hasText: planTitle })
            .count();
          if (visible > 0) return true;
          // Soft reload path still counts toward ≤ 2 s budget on first observation cycle
          if (Date.now() - observeStart < 1500) {
            await bPage.reload();
            await bPage
              .getByTestId("calendar-week-grid")
              .waitFor({ state: "visible" })
              .catch(() => undefined);
          }
          return (
            (await bPage
              .getByTestId("calendar-plan-event")
              .filter({ hasText: planTitle })
              .count()) > 0
          );
        },
        {
          timeout: 2000,
          intervals: [100, 200, 300, 400],
          message: "§12 P5: shared plan must appear for member_b within 2 s",
        },
      )
      .toBe(true);

    const observeMs = Date.now() - observeStart;
    expect(
      observeMs,
      `§12 P5 realtime propagation: ${observeMs}ms (limit 2000ms)`,
    ).toBeLessThanOrEqual(2000);

    await bContext.close();
  });
});
