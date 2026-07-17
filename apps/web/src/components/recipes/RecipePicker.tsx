"use client";

/**
 * Shared recipe picker — debounced search + tag filter chips + result list.
 * Used by the meal-plan editor's assignment rows and the day-planner meal
 * dialog. E2E contract: `recipe-picker-search` / `recipe-picker-result`
 * (and `recipe-picker-tag-{id}` for filter chips).
 */
import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc/client";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { Input } from "@/components/ui/input";
import { TagChipList, toggleId } from "@/components/shared/TagChipList";

export type RecipePickerRecipe = { id: string; title: string };

export function RecipePicker({
  onPick,
  limit = 8,
  showIdleResults = true,
}: {
  onPick: (recipe: RecipePickerRecipe) => void;
  limit?: number;
  /**
   * Render a browsable result list before any search/filter (default).
   * Pass false where the picker appears once per row (e.g. plan-editor
   * assignment rows) — a persistent list per row is clutter and makes the
   * result testids multi-match.
   */
  showIdleResults?: boolean;
}) {
  const trpc = useTRPC();
  const [q, setQ] = useState("");
  const [tagIds, setTagIds] = useState<string[]>([]);
  const debouncedQ = useDebouncedValue(q.trim(), 250);

  const tagsQuery = useQuery(trpc.tag.list.queryOptions({ activeOnly: true }));
  const tags = Array.isArray(tagsQuery.data) ? tagsQuery.data : [];

  // With no search/filter the first recipes are still browsable (unless
  // showIdleResults is off) — a picker that renders nothing until a search
  // matches is a dead end when the user doesn't know the recipe titles.
  const filtered = debouncedQ.length > 0 || tagIds.length > 0;
  const active = filtered || showIdleResults;
  const searchQuery = useQuery({
    ...trpc.recipe.list.queryOptions({
      q: debouncedQ || undefined,
      tagIds: tagIds.length ? tagIds : undefined,
      limit,
    }),
    enabled: active,
    placeholderData: keepPreviousData,
  });

  const results: RecipePickerRecipe[] =
    active ? (searchQuery.data?.items ?? []) : [];

  return (
    <div className="flex flex-col gap-2" data-testid="recipe-picker">
      <Input
        data-testid="recipe-picker-search"
        placeholder="Search recipes…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      <TagChipList
        tags={tags}
        selected={tagIds}
        testIdPrefix="recipe-picker-tag"
        onToggle={(id) => setTagIds((prev) => toggleId(prev, id))}
      />
      {active ? (
        results.length > 0 ? (
          <ul className="max-h-48 overflow-y-auto rounded-lg border border-zinc-200 bg-white shadow-sm">
            {results.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  data-testid="recipe-picker-result"
                  className="w-full px-3 py-2 text-left text-sm hover:bg-emerald-50"
                  onClick={() => {
                    onPick(r);
                    setQ("");
                  }}
                >
                  {r.title}
                </button>
              </li>
            ))}
          </ul>
        ) : searchQuery.isLoading ? (
          <p className="text-xs text-zinc-500">Searching…</p>
        ) : (
          <p
            className="text-xs text-zinc-500"
            data-testid="recipe-picker-empty"
          >
            {filtered ? "No recipes match." : "No recipes yet."}
          </p>
        )
      ) : null}
    </div>
  );
}
