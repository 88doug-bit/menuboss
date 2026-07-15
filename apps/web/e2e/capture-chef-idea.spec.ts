/**
 * §9.3 Flow 3 — Capture a ChefIdea
 *
 * Capture idea with tags → find via browse filter and via global search.
 * Mobile project: iPhone 14 (playwright.config projects).
 */
import { expect, test } from "@playwright/test";
import path from "node:path";
import { E2E_FIXTURES } from "./personas";
import { e2eDescribe } from "./helpers/describe";

const memberAState = path.join(__dirname, ".auth/member_a.json");

e2eDescribe("Capture ChefIdea (§9.3)", () => {
  test.use({ storageState: memberAState });

  test("capture idea with tags; find via browse filter and global search", async ({
    page,
  }) => {
    const ideaTitle = `E2E Chef Idea ${Date.now()}`;

    await page.goto("/ideas");
    await expect(page.getByTestId("ideas-browser")).toBeVisible();

    await page.getByTestId("capture-idea-open").click();
    await expect(page.getByTestId("capture-idea-form")).toBeVisible();

    await page.getByTestId("chef-idea-title-input").fill(ideaTitle);
    await page
      .getByTestId("chef-idea-notes-input")
      .fill("Promising weeknight protein idea — E2E.");
    await page.getByTestId("chef-idea-source-input").fill("E2E podcast");

    // Tag pickers (dinner + easy from seed)
    await page.getByTestId(`tag-picker-${E2E_FIXTURES.tagDinnerId}`).click();
    await page.getByTestId(`tag-picker-${E2E_FIXTURES.tagEasyId}`).click();

    await page.getByTestId("chef-idea-save").click();
    await expect(page.getByTestId("capture-idea-success")).toBeVisible({
      timeout: 10_000,
    });

    // Browse filter by tag
    await page.goto("/ideas");
    await page.getByTestId(`ideas-filter-tag-${E2E_FIXTURES.tagDinnerId}`).click();
    await expect(
      page.getByTestId("idea-card").filter({ hasText: ideaTitle }),
    ).toBeVisible({ timeout: 10_000 });

    // Global search surfaces the idea
    await page.getByTestId("global-search-input").fill(ideaTitle);
    await expect
      .poll(
        async () =>
          page
            .getByTestId("global-search-result")
            .filter({ hasText: ideaTitle })
            .count(),
        { timeout: 5000, intervals: [100, 200, 400] },
      )
      .toBeGreaterThan(0);

    await page
      .getByTestId("global-search-result")
      .filter({ hasText: ideaTitle })
      .click();
    await expect(page.getByTestId("chef-idea-detail")).toBeVisible();
    await expect(page.getByTestId("chef-idea-title")).toContainText(ideaTitle);
  });
});
