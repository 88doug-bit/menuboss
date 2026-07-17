/**
 * Category tree + tag multi-select for content editors (recipe form, etc.).
 * Reuses the same tree/toggle patterns as ContentFilters without filter chrome.
 */
"use client";

import { useMemo, useState } from "react";
import type { CategoryDto } from "@/server/routers/categoryMapper";
import type { TagDto } from "@/server/routers/tagMapper";
import { slugify } from "@/lib/utils";
import { toggleId } from "@/components/shared/TagChipList";

/** Fallback group for user-created tags when no existing group fits. */
export const CUSTOM_TAG_GROUP = "custom";

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
   * When set, renders an inline "new tag" input with a group select.
   * Caller performs the create (tag.create is admin-only — gate this
   * prop on role) and returns the created tag, which is auto-selected.
   */
  onCreate?: (name: string, tagGroup: string) => Promise<TagDto>;
}) {
  const [newName, setNewName] = useState("");
  const [newGroup, setNewGroup] = useState(CUSTOM_TAG_GROUP);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // New tags join an existing group by default choice, not a forced
  // "custom" bucket that fragments the taxonomy.
  const groupOptions = useMemo(() => {
    const groups = new Set(tags.map((t) => t.tagGroup));
    groups.add(CUSTOM_TAG_GROUP);
    return [...groups].sort();
  }, [tags]);

  const trimmed = newName.trim();
  const newSlug = slugify(trimmed);
  // The DB unique key is (tag_group, slug) — guard on slug within the
  // chosen group (catches "Café" vs "Cafe"), and on name anywhere so we
  // can point at the existing chip instead of creating a twin in another
  // group. Deactivated tags aren't in `tags`; those collisions surface
  // via the friendly CONFLICT message below.
  const duplicate = tags.find(
    (t) =>
      t.name.toLowerCase() === trimmed.toLowerCase() ||
      (t.tagGroup === newGroup && t.slug === newSlug),
  );
  const canAdd =
    Boolean(onCreate) && !creating && newSlug !== "" && !duplicate;

  async function addTag() {
    if (!onCreate || !canAdd) return;
    setCreating(true);
    setCreateError(null);
    try {
      const tag = await onCreate(trimmed, newGroup);
      onChange([...selectedIds, tag.id]);
      setNewName("");
    } catch (err) {
      const code = (err as { data?: { code?: string } })?.data?.code;
      setCreateError(
        code === "CONFLICT"
          ? "A tag with this name already exists (it may be deactivated — an admin can reactivate it)."
          : err instanceof Error && err.message
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
            <select
              data-testid="tag-picker-new-group"
              aria-label="Tag group"
              value={newGroup}
              onChange={(e) => setNewGroup(e.target.value)}
              className="h-8 rounded-md border border-zinc-300 px-1.5 text-xs"
            >
              {groupOptions.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
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
