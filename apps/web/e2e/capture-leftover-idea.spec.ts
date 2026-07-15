/**
 * §9.3 Flow 2 — Capture & Use a Leftover Idea
 *
 * member_a opens cooked seafood recipe → adds decay-path entry linking to
 * another recipe. member_b (family-global content) views and navigates the link.
 */
import { expect, test } from "@playwright/test";
import path from "node:path";
import { E2E_FIXTURES } from "./personas";
import { e2eDescribe } from "./helpers/describe";

const memberAState = path.join(__dirname, ".auth/member_a.json");
const memberBState = path.join(__dirname, ".auth/member_b.json");

e2eDescribe("Capture leftover idea (§9.3)", () => {
  test("member_a adds decay path; member_b navigates linked recipe", async ({
    browser,
  }) => {
    const useNote = `E2E leftover use ${Date.now()}`;

    const aContext = await browser.newContext({ storageState: memberAState });
    const aPage = await aContext.newPage();

    await aPage.goto(`/recipes/${E2E_FIXTURES.seafoodRecipeId}`);
    await expect(aPage.getByTestId("recipe-detail")).toBeVisible();
    await expect(aPage.getByTestId("recipe-title")).toContainText(
      E2E_FIXTURES.seafoodRecipeTitle,
    );

    // Expand Creative Leftovers and add entry
    await aPage.getByTestId("leftover-section-toggle").click();
    await expect(aPage.getByTestId("leftover-decay-path")).toBeVisible();
    await aPage.getByTestId("leftover-add-entry").click();
    await aPage.getByTestId("leftover-use-input").fill(useNote);
    await aPage
      .getByTestId("leftover-notes-input")
      .fill("Use within 2 days; E2E fixture.");
    await aPage
      .getByTestId("leftover-link-recipe-search")
      .fill(E2E_FIXTURES.linkedRecipeTitle);
    await aPage
      .getByTestId("leftover-link-recipe-result")
      .filter({ hasText: E2E_FIXTURES.linkedRecipeTitle })
      .click();
    await aPage.getByTestId("leftover-save-entry").click();

    await expect(
      aPage.getByTestId("leftover-entry").filter({ hasText: useNote }),
    ).toBeVisible({ timeout: 10_000 });

    await aContext.close();

    // Another persona views and navigates the linked entry
    const bContext = await browser.newContext({ storageState: memberBState });
    const bPage = await bContext.newPage();

    await bPage.goto(`/recipes/${E2E_FIXTURES.seafoodRecipeId}`);
    await bPage.getByTestId("leftover-section-toggle").click();
    const entry = bPage.getByTestId("leftover-entry").filter({ hasText: useNote });
    await expect(entry).toBeVisible();

    await entry.getByTestId("leftover-linked-recipe").click();
    await expect(bPage.getByTestId("recipe-detail")).toBeVisible();
    await expect(bPage.getByTestId("recipe-title")).toContainText(
      E2E_FIXTURES.linkedRecipeTitle,
    );

    await bContext.close();
  });
});
