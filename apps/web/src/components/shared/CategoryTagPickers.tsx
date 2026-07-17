/**
 * Category tree + tag multi-select for content editors (recipe form, etc.).
 * Reuses the same tree/toggle patterns as ContentFilters without filter chrome.
 */
"use client";

import { useState } from "react";
import type { CategoryDto } from "@/server/routers/categoryMapper";
import type { TagDto } from "@/server/routers/tagMapper";
import { slugify } from "@/lib/utils";

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
  onCreate,
}: {
  tags: TagDto[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  /**
   * When set, renders an inline "new tag" input. Caller performs the
   * create (tag.create is admin-only — gate this prop on role) and
   * returns the created tag, which is auto-selected.
   */
  onCreate?: (name: string) => Promise<TagDto>;
}) {
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const trimmed = newName.trim();
  const duplicate = tags.find(
    (t) => t.name.toLowerCase() === trimmed.toLowerCase(),
  );
  const canAdd =
    Boolean(onCreate) && !creating && slugify(trimmed) !== "" && !duplicate;

  async function addTag() {
    if (!onCreate || !canAdd) return;
    setCreating(true);
    setCreateError(null);
    try {
      const tag = await onCreate(trimmed);
      onChange([...selectedIds, tag.id]);
      setNewName("");
    } catch (err) {
      setCreateError(
        err instanceof Error && err.message
          ? err.message
          : "Could not create the tag.",
      );
    } finally {
      setCreating(false);
    }
  }

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
      {onCreate ? (
        <div className="space-y-1">
          <div className="flex gap-2">
            <input
              type="text"
              data-testid="tag-picker-new-name"
              placeholder="New tag…"
              value={newName}
              onChange={(e) => {
                setNewName(e.target.value);
                setCreateError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void addTag();
                }
              }}
              className="h-8 w-40 rounded-md border border-zinc-300 px-2 text-sm"
            />
            <button
              type="button"
              data-testid="tag-picker-add"
              disabled={!canAdd}
              onClick={() => void addTag()}
              className="rounded-md bg-emerald-600 px-2.5 text-xs font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {creating ? "Adding…" : "Add tag"}
            </button>
          </div>
          {duplicate && trimmed ? (
            <p className="text-xs text-zinc-500">
              “{duplicate.name}” already exists — click it above to select.
            </p>
          ) : null}
          {createError ? (
            <p className="text-xs text-red-600" role="alert">
              {createError}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
