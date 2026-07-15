/**
 * Pure shopping-list view helpers — grouping, line keys, plain-text export.
 * Cross-dimension lines stay separate under one ingredient heading (D12).
 */

export type ShoppingListLineView = {
  ingredientId: string;
  ingredientName: string;
  dimension: string;
  totalQuantityBase: number | null;
  displayQuantity: number | null;
  displayUnitAbbreviation: string | null;
  displayUnitName: string | null;
  isOptional: boolean;
  categoryName: string | null;
  sourceRecipeIds: string[];
  includesDeletedRecipe: boolean;
};

export type ShoppingListIngredientGroupView = {
  ingredientId: string;
  ingredientName: string;
  categoryName: string | null;
  isOptional: boolean;
  lines: ShoppingListLineView[];
};

export type ShoppingListViewModel = {
  required: ShoppingListIngredientGroupView[];
  optional: ShoppingListIngredientGroupView[];
};

export type CategorySection = {
  /** Display label; "Uncategorized" when null category. */
  categoryName: string;
  groups: ShoppingListIngredientGroupView[];
  isOptional: boolean;
};

/**
 * Group required lines by category_name (store aisle), then isolate Optional last.
 * Never merges cross-dimension lines — groups already hold separate `lines`.
 */
export function buildCategorySections(
  list: ShoppingListViewModel,
): CategorySection[] {
  const sections: CategorySection[] = [];

  const byCategory = new Map<string, ShoppingListIngredientGroupView[]>();
  for (const group of list.required) {
    const key = group.categoryName?.trim() || "Uncategorized";
    const bucket = byCategory.get(key) ?? [];
    bucket.push(group);
    byCategory.set(key, bucket);
  }

  const categoryNames = [...byCategory.keys()].sort((a, b) =>
    a.localeCompare(b),
  );
  for (const name of categoryNames) {
    sections.push({
      categoryName: name,
      groups: byCategory.get(name)!,
      isOptional: false,
    });
  }

  if (list.optional.length > 0) {
    // Optional stays one visual block last, still ordered by category inside.
    const optByCat = new Map<string, ShoppingListIngredientGroupView[]>();
    for (const group of list.optional) {
      const key = group.categoryName?.trim() || "Uncategorized";
      const bucket = optByCat.get(key) ?? [];
      bucket.push(group);
      optByCat.set(key, bucket);
    }
    const flat = [...optByCat.keys()]
      .sort((a, b) => a.localeCompare(b))
      .flatMap((k) => optByCat.get(k)!);
    sections.push({
      categoryName: "Optional",
      groups: flat,
      isOptional: true,
    });
  }

  return sections;
}

/** Stable check-off key: ingredient + dimension + optional flag (cross-dim separate). */
export function shoppingLineKey(line: ShoppingListLineView): string {
  return `${line.ingredientId}::${line.dimension}::${line.isOptional ? "opt" : "req"}`;
}

export function formatLineQuantity(line: ShoppingListLineView): string {
  if (line.displayQuantity == null) return "—";
  const unit =
    line.displayUnitAbbreviation ?? line.displayUnitName ?? line.dimension;
  return `${line.displayQuantity} ${unit}`.trim();
}

/** Plain-text grouped list for clipboard / print-friendly copy. */
export function shoppingListToPlainText(
  sections: CategorySection[],
  checked: Record<string, boolean> = {},
): string {
  const parts: string[] = [];
  for (const section of sections) {
    parts.push(section.isOptional ? "Optional" : section.categoryName);
    parts.push("─".repeat(Math.min(section.categoryName.length + 4, 40)));
    for (const group of section.groups) {
      if (group.lines.length === 1) {
        const line = group.lines[0]!;
        const mark = checked[shoppingLineKey(line)] ? "[x]" : "[ ]";
        const del = line.includesDeletedRecipe ? " (deleted recipe)" : "";
        parts.push(
          `${mark} ${group.ingredientName}: ${formatLineQuantity(line)}${del}`,
        );
      } else {
        parts.push(`    ${group.ingredientName}:`);
        for (const line of group.lines) {
          const mark = checked[shoppingLineKey(line)] ? "[x]" : "[ ]";
          const del = line.includesDeletedRecipe ? " (deleted recipe)" : "";
          parts.push(`  ${mark} ${formatLineQuantity(line)}${del}`);
        }
      }
    }
    parts.push("");
  }
  return parts.join("\n").trimEnd();
}

export function isShoppingListEmpty(list: ShoppingListViewModel): boolean {
  return list.required.length === 0 && list.optional.length === 0;
}
