/**
 * Category tree + tag multi-select for content editors (recipe form, etc.).
 * Reuses the same tree/toggle patterns as ContentFilters without filter chrome.
 */
"use client";

import type { CategoryDto } from "@/server/routers/categoryMapper";
import type { TagDto } from "@/server/routers/tagMapper";

function toggleId(ids: string[], id: string): string[] {
  return ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];
}

function CategoryTreeNodes({
  nodes,
  selected,
  onToggle,
  depth = 0,
  testIdPrefix = "cat-pick",
}: {
  nodes: CategoryDto[];
  selected: string[];
  onToggle: (id: string) => void;
  depth?: number;
  testIdPrefix?: string;
}) {
  return (
    <ul
      className={
        depth === 0
          ? "space-y-1"
          : "ml-3 mt-1 space-y-1 border-l border-zinc-200 pl-2"
      }
    >
      {nodes.map((node) => (
        <li key={node.id}>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-zinc-700">
            <input
              type="checkbox"
              data-testid={`${testIdPrefix}-${node.id}`}
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
              testIdPrefix={testIdPrefix}
            />
          ) : null}
        </li>
      ))}
    </ul>
  );
}

export function CategoryPicker({
  categories,
  selectedIds,
  onChange,
}: {
  categories: CategoryDto[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}) {
  return (
    <div data-testid="category-picker" className="space-y-2">
      <p className="text-sm font-medium text-zinc-800">Categories</p>
      {categories.length === 0 ? (
        <p className="text-xs text-zinc-500">No categories available.</p>
      ) : (
        <div className="max-h-48 overflow-y-auto rounded-lg border border-zinc-200 p-2">
          <CategoryTreeNodes
            nodes={categories}
            selected={selectedIds}
            onToggle={(id) => onChange(toggleId(selectedIds, id))}
          />
        </div>
      )}
    </div>
  );
}

export function TagPicker({
  tags,
  selectedIds,
  onChange,
}: {
  tags: TagDto[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}) {
  return (
    <div data-testid="tag-picker" className="space-y-2">
      <p className="text-sm font-medium text-zinc-800">Tags</p>
      {tags.length === 0 ? (
        <p className="text-xs text-zinc-500">No tags available.</p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {tags.map((tag) => {
            const on = selectedIds.includes(tag.id);
            return (
              <li key={tag.id}>
                <button
                  type="button"
                  data-testid={`tag-pick-${tag.id}`}
                  onClick={() => onChange(toggleId(selectedIds, tag.id))}
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
      )}
    </div>
  );
}
