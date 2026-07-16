/**
 * Shopping list UI: category groups, Optional last, cross-dimension lines,
 * deleted-recipe badge, check-off, print + clipboard.
 */
"use client";

import { useMemo } from "react";

import { DeletedBadge } from "@/components/shared/DeletedBadge";
import { EmptyState } from "@/components/shell/EmptyState";

import {
  buildCategorySections,
  formatLineQuantity,
  isShoppingListEmpty,
  shoppingLineKey,
  shoppingListToPlainText,
  type ShoppingListViewModel,
} from "./shoppingListUtils";
import { useShoppingCheckoff } from "./useShoppingCheckoff";

export function ShoppingListView({
  list,
  planIds,
}: {
  list: ShoppingListViewModel;
  planIds: string[];
}) {
  const sections = useMemo(() => buildCategorySections(list), [list]);
  const { checked, toggle, clearAll } = useShoppingCheckoff(planIds);

  async function copyToClipboard() {
    const text = shoppingListToPlainText(sections, checked);
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Fallback for older browsers / denied permission
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
  }

  if (isShoppingListEmpty(list)) {
    return (
      <EmptyState
        title="Shopping list is empty"
        description="Nothing to buy for the selected plans — not an error. Pick plans from the calendar or enter plan ids."
      />
    );
  }

  return (
    // Contract root id (E2E: shopping-list) wraps the legacy view id, which
    // print CSS and unit tests still target — one testid per element.
    <div data-testid="shopping-list">
      <div data-testid="shopping-list-view" className="space-y-6">
        <div className="print:hidden flex flex-wrap gap-2">
          <button
            type="button"
            data-testid="shopping-print"
            className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-800 hover:bg-zinc-50"
            onClick={() => window.print()}
          >
            Print
          </button>
          <button
            type="button"
            data-testid="shopping-copy"
            className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-800 hover:bg-zinc-50"
            onClick={() => void copyToClipboard()}
          >
            Copy to clipboard
          </button>
          <button
            type="button"
            data-testid="shopping-clear-checks"
            className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-50"
            onClick={clearAll}
          >
            Clear checks
          </button>
        </div>

        {/* <!-- TODO(coordinator): Phase 2 check-state sync --> */}

        {sections.map((section) => (
          <section
            key={`${section.isOptional ? "opt" : "req"}-${section.categoryName}`}
            data-testid={
              section.isOptional
                ? "shopping-section-optional"
                : `shopping-section-${section.categoryName}`
            }
            className={
              section.isOptional
                ? "rounded-xl border-2 border-dashed border-zinc-300 bg-zinc-50/80 p-4"
                : "space-y-3"
            }
          >
            <h2
              className={[
                "text-sm font-semibold uppercase tracking-wide",
                section.isOptional ? "text-zinc-600" : "text-zinc-800",
              ].join(" ")}
            >
              {section.categoryName}
            </h2>

            <ul
              // Contract id (E2E: shopping-group-optional) lives on the item
              // list of the Optional section; the section keeps its legacy
              // shopping-section-optional id (print CSS + unit tests).
              data-testid={
                section.isOptional ? "shopping-group-optional" : undefined
              }
              className="divide-y divide-zinc-100 rounded-xl border border-zinc-200 bg-white"
            >
              {section.groups.map((group) => (
                <li
                  key={`${group.ingredientId}-${group.isOptional}`}
                  data-testid="shopping-ingredient-group"
                  className="px-3 py-2"
                >
                  {/* Contract id (E2E: shopping-ingredient-block): heading +
                      dimension lines together; the li keeps its legacy
                      shopping-ingredient-group id (unit tests). */}
                  <div data-testid="shopping-ingredient-block">
                    <p className="text-sm font-medium text-zinc-900">
                      {group.ingredientName}
                    </p>
                    <ul className="mt-1 space-y-1">
                      {group.lines.map((line) => {
                        const key = shoppingLineKey(line);
                        const isOn = Boolean(checked[key]);
                        return (
                          <li
                            key={key}
                            data-testid="shopping-line"
                            data-dimension={line.dimension}
                            className="flex items-center gap-2 text-sm"
                          >
                            <input
                              type="checkbox"
                              data-testid={`check-${key}`}
                              checked={isOn}
                              onChange={() => toggle(key)}
                              className="h-4 w-4 rounded border-zinc-300"
                              aria-label={`Check off ${group.ingredientName} ${formatLineQuantity(line)}`}
                            />
                            <span
                              className={
                                isOn
                                  ? "text-zinc-400 line-through"
                                  : "tabular-nums text-zinc-800"
                              }
                            >
                              {formatLineQuantity(line)}
                            </span>
                            {/* Line is self-describing (E2E filters lines by
                                ingredient name; heading is outside the line). */}
                            <span className="sr-only">
                              {group.ingredientName}
                            </span>
                            {line.includesDeletedRecipe ? (
                              <DeletedBadge />
                            ) : null}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
