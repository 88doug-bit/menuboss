/**
 * Shared filter surface for recipes + chef ideas (categories, tags, time, rating).
 */
"use client";

import type { CategoryDto } from "@/server/routers/categoryMapper";
import type { TagDto } from "@/server/routers/tagMapper";
import { TagChipList, toggleId } from "@/components/shared/TagChipList";

export type ContentFilterState = {
  q: string;
  categoryIds: string[];
  tagIds: string[];
  maxTotalMinutes: string;
  minRating: string;
  /** Client-side / future server filter — not on recipe.list yet. */
  hasSafetyFlags: boolean;
};

export const emptyFilters: ContentFilterState = {
  q: "",
  categoryIds: [],
  tagIds: [],
  maxTotalMinutes: "",
  minRating: "",
  hasSafetyFlags: false,
};

function CategoryTreeNodes({
  nodes,
  selected,
  onToggle,
  depth = 0,
}: {
  nodes: CategoryDto[];
  selected: string[];
  onToggle: (id: string) => void;
  depth?: number;
}) {
  return (
    <ul className={depth === 0 ? "space-y-1" : "ml-3 mt-1 space-y-1 border-l border-zinc-200 pl-2"}>
      {nodes.map((node) => (
        <li key={node.id}>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-zinc-700">
            <input
              type="checkbox"
              checked={selected.includes(node.id)}
              onChange={() => onToggle(node.id)}
              className="h-3.5 w-3.5 rounded border-zinc-300"
            />
            <span>{node.name}</span>
          </label>
          {node.children?.length ? (
            <CategoryTreeNodes
              nodes={node.children}
              selected={selected}
              onToggle={onToggle}
              depth={depth + 1}
            />
          ) : null}
        </li>
      ))}
    </ul>
  );
}

export function ContentFilters({
  value,
  onChange,
  categories = [],
  tags = [],
  showTimeAndRating = true,
  showSafetyFlag = true,
  searchPlaceholder = "Search…",
  tagTestIdPrefix = "filter-tag",
  tagsDefaultOpen = false,
}: {
  value: ContentFilterState;
  onChange: (next: ContentFilterState) => void;
  categories?: CategoryDto[];
  tags?: TagDto[];
  showTimeAndRating?: boolean;
  showSafetyFlag?: boolean;
  searchPlaceholder?: string;
  /** data-testid prefix for tag filter chips (contract: `ideas-filter-tag-{id}` on /ideas). */
  tagTestIdPrefix?: string;
  /** Render the Tags disclosure expanded initially (contract: /ideas chips are directly clickable). */
  tagsDefaultOpen?: boolean;
}) {
  return (
    <div
      data-testid="content-filters"
      className="space-y-3 rounded-xl border border-zinc-200 bg-white p-3"
    >
      <label className="block">
        <span className="sr-only">Search</span>
        <input
          type="search"
          data-testid="filter-search"
          placeholder={searchPlaceholder}
          value={value.q}
          onChange={(e) => onChange({ ...value, q: e.target.value })}
          className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
        />
      </label>

      {showTimeAndRating ? (
        <div className="flex flex-wrap gap-3">
          <label className="flex items-center gap-2 text-sm text-zinc-700">
            Max time (min)
            <input
              type="number"
              min={0}
              data-testid="filter-max-time"
              value={value.maxTotalMinutes}
              onChange={(e) =>
                onChange({ ...value, maxTotalMinutes: e.target.value })
              }
              className="w-20 rounded border border-zinc-300 px-2 py-1 text-sm"
            />
          </label>
          <label className="flex items-center gap-2 text-sm text-zinc-700">
            Min rating
            <select
              data-testid="filter-min-rating"
              value={value.minRating}
              onChange={(e) =>
                onChange({ ...value, minRating: e.target.value })
              }
              className="rounded border border-zinc-300 px-2 py-1 text-sm"
            >
              <option value="">Any</option>
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={String(n)}>
                  {n}+
                </option>
              ))}
            </select>
          </label>
          {showSafetyFlag ? (
            <label className="flex items-center gap-2 text-sm text-zinc-700">
              <input
                type="checkbox"
                data-testid="filter-safety"
                checked={value.hasSafetyFlags}
                onChange={(e) =>
                  onChange({ ...value, hasSafetyFlags: e.target.checked })
                }
                className="h-3.5 w-3.5 rounded border-zinc-300"
              />
              Has safety flags
              {/* <!-- TODO(coordinator): server-side hasSafetyFlags on recipe.list --> */}
            </label>
          ) : null}
        </div>
      ) : null}

      {categories.length > 0 ? (
        <details className="text-sm">
          <summary className="cursor-pointer font-medium text-zinc-800">
            Categories
          </summary>
          <div className="mt-2 max-h-48 overflow-y-auto">
            <CategoryTreeNodes
              nodes={categories}
              selected={value.categoryIds}
              onToggle={(id) =>
                onChange({
                  ...value,
                  categoryIds: toggleId(value.categoryIds, id),
                })
              }
            />
          </div>
        </details>
      ) : null}

      {tags.length > 0 ? (
        <details className="text-sm" open={tagsDefaultOpen}>
          <summary className="cursor-pointer font-medium text-zinc-800">
            Tags
          </summary>
          <div className="mt-2">
            <TagChipList
              tags={tags}
              selected={value.tagIds}
              testIdPrefix={tagTestIdPrefix}
              onToggle={(id) =>
                onChange({ ...value, tagIds: toggleId(value.tagIds, id) })
              }
            />
          </div>
        </details>
      ) : null}
    </div>
  );
}
