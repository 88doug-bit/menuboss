import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ShoppingListView } from "./ShoppingListView";
import {
  buildCategorySections,
  isShoppingListEmpty,
  shoppingLineKey,
  shoppingListToPlainText,
  type ShoppingListViewModel,
} from "./shoppingListUtils";

const sampleList: ShoppingListViewModel = {
  required: [
    {
      ingredientId: "ing-flour",
      ingredientName: "Flour",
      categoryName: "Baking",
      isOptional: false,
      lines: [
        {
          ingredientId: "ing-flour",
          ingredientName: "Flour",
          dimension: "mass",
          totalQuantityBase: 500,
          displayQuantity: 500,
          displayUnitAbbreviation: "g",
          displayUnitName: "gram",
          isOptional: false,
          categoryName: "Baking",
          sourceRecipeIds: ["r1"],
          includesDeletedRecipe: false,
        },
        {
          ingredientId: "ing-flour",
          ingredientName: "Flour",
          dimension: "volume",
          totalQuantityBase: 480,
          displayQuantity: 2,
          displayUnitAbbreviation: "cups",
          displayUnitName: "cup",
          isOptional: false,
          categoryName: "Baking",
          sourceRecipeIds: ["r2"],
          includesDeletedRecipe: true,
        },
      ],
    },
    {
      ingredientId: "ing-milk",
      ingredientName: "Milk",
      categoryName: "Dairy",
      isOptional: false,
      lines: [
        {
          ingredientId: "ing-milk",
          ingredientName: "Milk",
          dimension: "volume",
          totalQuantityBase: 1000,
          displayQuantity: 1,
          displayUnitAbbreviation: "L",
          displayUnitName: "liter",
          isOptional: false,
          categoryName: "Dairy",
          sourceRecipeIds: ["r1"],
          includesDeletedRecipe: false,
        },
      ],
    },
  ],
  optional: [
    {
      ingredientId: "ing-parsley",
      ingredientName: "Parsley",
      categoryName: "Produce",
      isOptional: true,
      lines: [
        {
          ingredientId: "ing-parsley",
          ingredientName: "Parsley",
          dimension: "count",
          totalQuantityBase: 1,
          displayQuantity: 1,
          displayUnitAbbreviation: "bunch",
          displayUnitName: "bunch",
          isOptional: true,
          categoryName: "Produce",
          sourceRecipeIds: ["r1"],
          includesDeletedRecipe: false,
        },
      ],
    },
  ],
};

describe("shoppingListUtils", () => {
  it("groups required by category and isolates Optional last", () => {
    const sections = buildCategorySections(sampleList);
    expect(sections.map((s) => s.categoryName)).toEqual([
      "Baking",
      "Dairy",
      "Optional",
    ]);
    expect(sections[sections.length - 1]!.isOptional).toBe(true);
    expect(sections[0]!.groups[0]!.ingredientName).toBe("Flour");
  });

  it("keeps cross-dimension lines separate under one ingredient", () => {
    const sections = buildCategorySections(sampleList);
    const flour = sections
      .flatMap((s) => s.groups)
      .find((g) => g.ingredientName === "Flour")!;
    expect(flour.lines).toHaveLength(2);
    expect(flour.lines.map((l) => l.dimension)).toEqual(["mass", "volume"]);
    expect(shoppingLineKey(flour.lines[0]!)).not.toBe(
      shoppingLineKey(flour.lines[1]!),
    );
  });

  it("plain text export includes deleted badge marker and optional section", () => {
    const text = shoppingListToPlainText(buildCategorySections(sampleList));
    expect(text).toContain("Flour");
    expect(text).toContain("500 g");
    expect(text).toContain("2 cups");
    expect(text).toContain("(deleted recipe)");
    expect(text).toMatch(/Optional/);
    expect(text).toContain("Parsley");
  });

  it("empty list helper treats empty required+optional as empty (not error)", () => {
    expect(
      isShoppingListEmpty({ required: [], optional: [] }),
    ).toBe(true);
    expect(isShoppingListEmpty(sampleList)).toBe(false);
  });
});

describe("ShoppingListView", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("renders category groups with Optional last and deleted badge", () => {
    render(<ShoppingListView list={sampleList} planIds={["plan-a"]} />);

    const optional = screen.getByTestId("shopping-section-optional");
    expect(optional).toHaveTextContent("Parsley");

    // Optional section appears after required content in the DOM
    const view = screen.getByTestId("shopping-list-view");
    const sections = within(view).getAllByRole("heading", { level: 2 });
    expect(sections.map((h) => h.textContent)).toEqual([
      "Baking",
      "Dairy",
      "Optional",
    ]);

    expect(screen.getAllByTestId("deleted-badge").length).toBeGreaterThan(0);

    const flourGroup = screen
      .getAllByTestId("shopping-ingredient-group")
      .find((el) => el.textContent?.includes("Flour"))!;
    const dims = within(flourGroup)
      .getAllByTestId("shopping-line")
      .map((el) => el.getAttribute("data-dimension"));
    expect(dims).toEqual(["mass", "volume"]);
  });

  it("toggles check-off and persists to localStorage by plan id set", async () => {
    const user = userEvent.setup();
    render(<ShoppingListView list={sampleList} planIds={["b", "a"]} />);

    const line = sampleList.required[1]!.lines[0]!;
    const key = shoppingLineKey(line);
    const checkbox = screen.getByTestId(`check-${key}`);

    await user.click(checkbox);
    expect(checkbox).toBeChecked();

    const stored = window.localStorage.getItem(
      "menuboss:shopping-checkoff:a,b",
    );
    expect(stored).toBeTruthy();
    expect(JSON.parse(stored!)).toMatchObject({ [key]: true });
  });

  it("shows empty state when list has no lines", () => {
    render(
      <ShoppingListView
        list={{ required: [], optional: [] }}
        planIds={["p1"]}
      />,
    );
    expect(screen.getByText(/Shopping list is empty/i)).toBeInTheDocument();
  });

  it("copy to clipboard uses plain text export", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", {
      ...navigator,
      clipboard: { writeText },
    });

    render(<ShoppingListView list={sampleList} planIds={["p1"]} />);
    await user.click(screen.getByTestId("shopping-copy"));
    expect(writeText).toHaveBeenCalled();
    const text = writeText.mock.calls[0]![0] as string;
    expect(text).toContain("Flour");
    expect(text).toContain("Optional");
    vi.unstubAllGlobals();
  });
});

