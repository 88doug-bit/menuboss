"use client";

/**
 * Toggleable tag filter chips — shared by ContentFilters and RecipePicker.
 */
import type { TagDto } from "@/server/routers/tagMapper";

export function toggleId(ids: string[], id: string): string[] {
  return ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];
}

export function TagChipList({
  tags,
  selected,
  onToggle,
  testIdPrefix = "filter-tag",
}: {
  tags: TagDto[];
  selected: string[];
  onToggle: (id: string) => void;
  /** data-testid prefix for each chip (contract: `ideas-filter-tag-{id}` on /ideas). */
  testIdPrefix?: string;
}) {
  if (tags.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-2">
      {tags.map((tag) => {
        const on = selected.includes(tag.id);
        return (
          <li key={tag.id}>
            <button
              type="button"
              data-testid={`${testIdPrefix}-${tag.id}`}
              aria-pressed={on}
              onClick={() => onToggle(tag.id)}
              className={[
                "rounded-full px-2.5 py-1 text-xs font-medium",
                on
                  ? "bg-emerald-600 text-white"
                  : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200",
              ].join(" ")}
            >
              {tag.name}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
