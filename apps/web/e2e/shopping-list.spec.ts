/**
 * Shopping list E2E — multi-plan selection.
 *
 * Asserts Optional group isolation and cross-dimension separate lines
 * (flour as mass + volume under one ingredient heading, never merged).
 *
 * Plans are created via UI if editor is available; otherwise via query
 * params handoff from calendar selection (Task 11 → Task 12).
 */
import { expect, test } from "@playwright/test";
import path from "node:path";
import { E2E_FIXTURES, PERSONAS } from "./personas";
import { e2eDescribe } from "./helpers/describe";
import { signInAs } from "./helpers/supabase";

const memberAState = path.join(__dirname, ".auth/member_a.json");

e2eDescribe("Shopping list", () => {
  test.use({ storageState: memberAState });

  test("multi-plan list: Optional group + cross-dimension separate lines", async ({
    page,
  }) => {
    // Provision two short-range plans with shopping fixtures via member_a JWT
    // (API path — no service role; UI still asserts list rendering).
    const memberA = await signInAs("member_a");
    const today = new Date();
    const iso = (d: Date) => d.toISOString().slice(0, 10);
    const start = iso(today);
    const end = iso(new Date(today.getTime() + 3 * 86_400_000));

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
      `E2E Shop A ${Date.now()}`,
      E2E_FIXTURES.shoppingRecipeAId,
    );
    const planBId = await upsertPlan(
      `E2E Shop B ${Date.now()}`,
      E2E_FIXTURES.shoppingRecipeBId,
    );

    await page.goto(
      `/shopping?mealPlanIds=${encodeURIComponent(`${planAId},${planBId}`)}`,
    );
    await expect(page.getByTestId("shopping-list")).toBeVisible({
      timeout: 10_000,
    });

    // Optional group last / visually separated
    await expect(page.getByTestId("shopping-group-optional")).toBeVisible();
    await expect(
      page
        .getByTestId("shopping-group-optional")
        .getByTestId("shopping-line")
        .filter({ hasText: /parsley/i }),
    ).toBeVisible();

    // Cross-dimension: flour has separate mass + volume lines under one heading
    const flourBlock = page.getByTestId("shopping-ingredient-block").filter({
      hasText: /all-purpose flour/i,
    });
    await expect(flourBlock).toBeVisible();
    const flourLines = flourBlock.getByTestId("shopping-line");
    await expect(flourLines).toHaveCount(2);

    // Never a single merged nonsense unit — each line shows its own unit
    const lineTexts = (await flourLines.allInnerTexts()).join(" | ");
    expect(lineTexts.toLowerCase()).toMatch(/g|kg|oz|lb/);
    expect(lineTexts.toLowerCase()).toMatch(/cup|ml|l|tbsp|tsp/);
  });
});
