# Grok Task 14 — Recipe & Ingredient editors

**Branch:** `implement/grok-14-recipe-editors`

## NOTES

- No new tRPC routers/procedures.
- Units: `SEED_UNITS` from `supabase/seed.sql` fixed UUIDs (`apps/web/src/lib/units.ts`). <!-- TODO(coordinator): unit.list / family.units when admin vocab CRUD ships -->
- Ingredient list `user-added` filter is client-side. <!-- TODO(coordinator): server-side isUserAdded on ingredient.list -->
- `nutrition_data` advanced textarea is display-oriented; not on create/update schemas. <!-- TODO(coordinator): nutrition_data write path on ingredient schemas -->
- CONFLICT merge: tRPC cause may not serialize; client falls back to `ingredient.list` by name.
- Also materialized missing `/recipes/[id]` detail page (Wave 2 component existed without a route).
- Component tests: instruction reorder, quantity 0 rejected, merge suggestion, safety editor hidden for non-admin — all green (62 passed, 5 skipped).
- Extensionless relative imports; RHF + Zod `@menu-boss/schemas`; tRPC via `@/lib/trpc/client`; `data-testid` on interactive elements.

---

### FILE: apps/web/src/lib/units.ts

```ts
/**
 * Active unit catalog for recipe/ingredient editors.
 *
 * <!-- TODO(coordinator): no unit.list tRPC procedure exists (Task 14 constraint:
 * no new routers/procedures). IDs match supabase/seed.sql fixed UUIDs so
 * create/update payloads resolve FKs in local + seeded envs. When admin unit
 * CRUD ships, replace with a thin family.units (or unit.list) query. -->
 */

export type UnitDimension = "mass" | "volume" | "count";

export type UnitOption = {
  id: string;
  name: string;
  abbreviation: string;
  dimension: UnitDimension;
  sortOrder: number;
};

/** Deterministic seed units (see supabase/seed.sql). */
export const SEED_UNITS: readonly UnitOption[] = [
  {
    id: "00000000-0000-4000-8000-000000000101",
    name: "gram",
    abbreviation: "g",
    dimension: "mass",
    sortOrder: 10,
  },
  {
    id: "00000000-0000-4000-8000-000000000102",
    name: "kilogram",
    abbreviation: "kg",
    dimension: "mass",
    sortOrder: 20,
  },
  {
    id: "00000000-0000-4000-8000-000000000103",
    name: "ounce",
    abbreviation: "oz",
    dimension: "mass",
    sortOrder: 30,
  },
  {
    id: "00000000-0000-4000-8000-000000000104",
    name: "pound",
    abbreviation: "lb",
    dimension: "mass",
    sortOrder: 40,
  },
  {
    id: "00000000-0000-4000-8000-000000000111",
    name: "milliliter",
    abbreviation: "ml",
    dimension: "volume",
    sortOrder: 50,
  },
  {
    id: "00000000-0000-4000-8000-000000000112",
    name: "liter",
    abbreviation: "l",
    dimension: "volume",
    sortOrder: 60,
  },
  {
    id: "00000000-0000-4000-8000-000000000113",
    name: "teaspoon",
    abbreviation: "tsp",
    dimension: "volume",
    sortOrder: 70,
  },
  {
    id: "00000000-0000-4000-8000-000000000114",
    name: "tablespoon",
    abbreviation: "tbsp",
    dimension: "volume",
    sortOrder: 80,
  },
  {
    id: "00000000-0000-4000-8000-000000000115",
    name: "cup",
    abbreviation: "cup",
    dimension: "volume",
    sortOrder: 90,
  },
  {
    id: "00000000-0000-4000-8000-000000000116",
    name: "fluid_ounce",
    abbreviation: "fl_oz",
    dimension: "volume",
    sortOrder: 100,
  },
  {
    id: "00000000-0000-4000-8000-000000000121",
    name: "each",
    abbreviation: "ea",
    dimension: "count",
    sortOrder: 110,
  },
  {
    id: "00000000-0000-4000-8000-000000000122",
    name: "dozen",
    abbreviation: "doz",
    dimension: "count",
    sortOrder: 120,
  },
  {
    id: "00000000-0000-4000-8000-000000000123",
    name: "clove",
    abbreviation: "clove",
    dimension: "count",
    sortOrder: 130,
  },
  {
    id: "00000000-0000-4000-8000-000000000124",
    name: "head",
    abbreviation: "head",
    dimension: "count",
    sortOrder: 140,
  },
] as const;

export const DEFAULT_UNIT_ID = SEED_UNITS.find((u) => u.name === "each")!.id;

const DIMENSION_ORDER: UnitDimension[] = ["mass", "volume", "count"];

/** Units grouped by dimension for <optgroup> selects. */
export function unitsByDimension(
  units: readonly UnitOption[] = SEED_UNITS,
): Array<{ dimension: UnitDimension; units: UnitOption[] }> {
  return DIMENSION_ORDER.map((dimension) => ({
    dimension,
    units: units
      .filter((u) => u.dimension === dimension)
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder),
  })).filter((g) => g.units.length > 0);
}

export function unitLabel(unit: UnitOption): string {
  return `${unit.name} (${unit.abbreviation})`;
}
```

### FILE: apps/web/src/components/shared/CategoryTagPickers.tsx

```tsx
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
```

### FILE: apps/web/src/components/recipes/InstructionStepsEditor.tsx

```tsx
/**
 * Structured instruction steps editor: add / remove / reorder (up-down).
 * Optional timerMinutes + temperature per step (Â§8.1).
 */
"use client";

import type { InstructionStep } from "@menu-boss/schemas";

export type InstructionStepsEditorProps = {
  value: InstructionStep[];
  onChange: (next: InstructionStep[]) => void;
  disabled?: boolean;
};

function emptyStep(): InstructionStep {
  return { text: "" };
}

export function InstructionStepsEditor({
  value,
  onChange,
  disabled = false,
}: InstructionStepsEditorProps) {
  function updateAt(index: number, patch: Partial<InstructionStep>) {
    onChange(
      value.map((step, i) => (i === index ? { ...step, ...patch } : step)),
    );
  }

  function removeAt(index: number) {
    onChange(value.filter((_, i) => i !== index));
  }

  function move(index: number, dir: -1 | 1) {
    const target = index + dir;
    if (target < 0 || target >= value.length) return;
    const next = [...value];
    const tmp = next[index]!;
    next[index] = next[target]!;
    next[target] = tmp;
    onChange(next);
  }

  function addStep() {
    onChange([...value, emptyStep()]);
  }

  return (
    <section data-testid="instruction-steps-editor" className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-zinc-900">Instructions</h3>
        <button
          type="button"
          data-testid="instruction-add"
          disabled={disabled}
          onClick={addStep}
          className="rounded-md border border-zinc-300 bg-white px-2.5 py-1 text-xs font-medium text-zinc-800 hover:bg-zinc-50 disabled:opacity-50"
        >
          Add step
        </button>
      </div>

      {value.length === 0 ? (
        <p className="text-sm text-zinc-500" data-testid="instruction-empty">
          No steps yet â€” add structured instructions with optional timer and
          temperature.
        </p>
      ) : (
        <ol className="space-y-3">
          {value.map((step, index) => (
            <li
              key={index}
              data-testid={`instruction-step-${index}`}
              className="rounded-lg border border-zinc-200 bg-white p-3"
            >
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-100 text-sm font-semibold text-emerald-800">
                  {index + 1}
                </span>
                <div className="flex gap-1">
                  <button
                    type="button"
                    data-testid={`instruction-up-${index}`}
                    aria-label={`Move step ${index + 1} up`}
                    disabled={disabled || index === 0}
                    onClick={() => move(index, -1)}
                    className="rounded border border-zinc-300 px-2 py-0.5 text-xs disabled:opacity-40"
                  >
                    Up
                  </button>
                  <button
                    type="button"
                    data-testid={`instruction-down-${index}`}
                    aria-label={`Move step ${index + 1} down`}
                    disabled={disabled || index === value.length - 1}
                    onClick={() => move(index, 1)}
                    className="rounded border border-zinc-300 px-2 py-0.5 text-xs disabled:opacity-40"
                  >
                    Down
                  </button>
                  <button
                    type="button"
                    data-testid={`instruction-remove-${index}`}
                    disabled={disabled}
                    onClick={() => removeAt(index)}
                    className="rounded border border-red-200 px-2 py-0.5 text-xs text-red-700 disabled:opacity-40"
                  >
                    Remove
                  </button>
                </div>
              </div>

              <label className="block text-xs font-medium text-zinc-600">
                Step text
                <textarea
                  data-testid={`instruction-text-${index}`}
                  rows={2}
                  disabled={disabled}
                  value={step.text}
                  onChange={(e) => updateAt(index, { text: e.target.value })}
                  className="mt-1 w-full rounded border border-zinc-300 px-2 py-1.5 text-sm outline-none focus:border-emerald-500"
                  placeholder="Describe this stepâ€¦"
                />
              </label>

              <div className="mt-2 flex flex-wrap gap-3">
                <label className="text-xs font-medium text-zinc-600">
                  Timer (min)
                  <input
                    type="number"
                    min={0}
                    data-testid={`instruction-timer-${index}`}
                    disabled={disabled}
                    value={step.timerMinutes ?? ""}
                    onChange={(e) => {
                      const raw = e.target.value;
                      if (raw === "") {
                        updateAt(index, { timerMinutes: undefined });
                        return;
                      }
                      const n = Number(raw);
                      updateAt(index, {
                        timerMinutes: Number.isFinite(n)
                          ? Math.max(0, Math.floor(n))
                          : undefined,
                      });
                    }}
                    className="mt-1 block w-24 rounded border border-zinc-300 px-2 py-1 text-sm"
                  />
                </label>
                <label className="text-xs font-medium text-zinc-600">
                  Temperature
                  <input
                    type="text"
                    data-testid={`instruction-temp-${index}`}
                    disabled={disabled}
                    value={step.temperature ?? ""}
                    onChange={(e) =>
                      updateAt(index, {
                        temperature: e.target.value || undefined,
                      })
                    }
                    placeholder="e.g. 350Â°F"
                    className="mt-1 block w-32 rounded border border-zinc-300 px-2 py-1 text-sm"
                  />
                </label>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

/** Pure reorder helper (exported for unit tests). */
export function reorderSteps(
  steps: InstructionStep[],
  fromIndex: number,
  direction: -1 | 1,
): InstructionStep[] {
  const target = fromIndex + direction;
  if (target < 0 || target >= steps.length) return steps;
  const next = [...steps];
  const tmp = next[fromIndex]!;
  next[fromIndex] = next[target]!;
  next[target] = tmp;
  return next;
}
```

### FILE: apps/web/src/components/recipes/IngredientLinesEditor.tsx

```tsx
/**
 * Recipe ingredient lines: search picker, quantity/unit/prep/optional,
 * sequence reorder, inline create + CONFLICT merge suggestion (Â§8.1 AC).
 *
 * Pure presentational + injected callbacks so component tests don't need tRPC.
 */
"use client";

import { useMemo, useState } from "react";
import { recipeIngredientInputSchema } from "@menu-boss/schemas";

import {
  DEFAULT_UNIT_ID,
  unitLabel,
  unitsByDimension,
  type UnitOption,
} from "@/lib/units";

export type IngredientPickOption = {
  id: string;
  name: string;
  defaultUnitId?: string | null;
};

export type IngredientLineDraft = {
  /** Stable local key for React lists. */
  key: string;
  ingredientId: string;
  ingredientName: string;
  quantity: number | "";
  unitId: string;
  preparationNote: string;
  isOptional: boolean;
};

export type CreateIngredientResult =
  | { ok: true; id: string; name: string; defaultUnitId?: string | null }
  | {
      ok: false;
      conflict: true;
      existingId: string;
      existingName: string;
      message: string;
    }
  | { ok: false; conflict?: false; message: string };

export type IngredientLinesEditorProps = {
  value: IngredientLineDraft[];
  onChange: (next: IngredientLineDraft[]) => void;
  units?: readonly UnitOption[];
  /** Live search results for the picker. */
  searchResults?: IngredientPickOption[];
  searchQuery: string;
  onSearchQueryChange: (q: string) => void;
  searchLoading?: boolean;
  /** Create ingredient (name + default unit). Parent maps CONFLICT â†’ merge. */
  onCreateIngredient: (input: {
    name: string;
    defaultUnitId: string;
  }) => Promise<CreateIngredientResult>;
  createPending?: boolean;
  disabled?: boolean;
  /** When true, surface field-level quantity errors (e.g. on form submit). */
  showValidation?: boolean;
};

let lineKeySeq = 0;
export function nextLineKey(): string {
  lineKeySeq += 1;
  return `ing-line-${lineKeySeq}`;
}

export function emptyIngredientLine(
  partial?: Partial<IngredientLineDraft>,
): IngredientLineDraft {
  return {
    key: nextLineKey(),
    ingredientId: "",
    ingredientName: "",
    quantity: "",
    unitId: DEFAULT_UNIT_ID,
    preparationNote: "",
    isOptional: false,
    ...partial,
  };
}

/** Validate a single line against recipeIngredientInputSchema (quantity > 0). */
export function validateIngredientLine(
  line: IngredientLineDraft,
): { ok: true } | { ok: false; message: string } {
  if (!line.ingredientId) {
    return { ok: false, message: "Select an ingredient" };
  }
  const qty =
    line.quantity === "" ? Number.NaN : Number(line.quantity);
  const parsed = recipeIngredientInputSchema.safeParse({
    ingredientId: line.ingredientId,
    quantity: qty,
    unitId: line.unitId,
    preparationNote: line.preparationNote.trim() || undefined,
    sequenceOrder: 0,
    isOptional: line.isOptional,
  });
  if (!parsed.success) {
    const msg =
      parsed.error.issues[0]?.message ?? "Invalid ingredient line";
    return { ok: false, message: msg };
  }
  return { ok: true };
}

export function linesToPayload(lines: IngredientLineDraft[]) {
  return lines.map((line, index) => ({
    ingredientId: line.ingredientId,
    quantity: Number(line.quantity),
    unitId: line.unitId,
    preparationNote: line.preparationNote.trim() || undefined,
    sequenceOrder: index,
    isOptional: line.isOptional,
  }));
}

export function IngredientLinesEditor({
  value,
  onChange,
  units,
  searchResults = [],
  searchQuery,
  onSearchQueryChange,
  searchLoading = false,
  onCreateIngredient,
  createPending = false,
  disabled = false,
  showValidation = false,
}: IngredientLinesEditorProps) {
  const unitList = units ?? [];
  const grouped = useMemo(() => unitsByDimension(unitList), [unitList]);

  const [mergeSuggestion, setMergeSuggestion] = useState<{
    existingId: string;
    existingName: string;
    message: string;
    defaultUnitId: string;
  } | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const [inlineUnitId, setInlineUnitId] = useState(DEFAULT_UNIT_ID);

  function updateLine(index: number, patch: Partial<IngredientLineDraft>) {
    onChange(value.map((l, i) => (i === index ? { ...l, ...patch } : l)));
  }

  function removeLine(index: number) {
    onChange(value.filter((_, i) => i !== index));
  }

  function move(index: number, dir: -1 | 1) {
    const target = index + dir;
    if (target < 0 || target >= value.length) return;
    const next = [...value];
    const tmp = next[index]!;
    next[index] = next[target]!;
    next[target] = tmp;
    onChange(next);
  }

  function selectIngredient(opt: IngredientPickOption) {
    const unitId = opt.defaultUnitId || DEFAULT_UNIT_ID;
    onChange([
      ...value,
      emptyIngredientLine({
        ingredientId: opt.id,
        ingredientName: opt.name,
        quantity: 1,
        unitId,
      }),
    ]);
    onSearchQueryChange("");
    setMergeSuggestion(null);
    setCreateError(null);
  }

  async function handleCreateInline() {
    const name = searchQuery.trim();
    if (!name) return;
    setCreateError(null);
    setMergeSuggestion(null);
    const result = await onCreateIngredient({
      name,
      defaultUnitId: inlineUnitId,
    });
    if (result.ok) {
      selectIngredient({
        id: result.id,
        name: result.name,
        defaultUnitId: result.defaultUnitId ?? inlineUnitId,
      });
      return;
    }
    if (result.conflict) {
      setMergeSuggestion({
        existingId: result.existingId,
        existingName: result.existingName,
        message: result.message,
        defaultUnitId: inlineUnitId,
      });
      return;
    }
    setCreateError(result.message);
  }

  function acceptMerge() {
    if (!mergeSuggestion) return;
    selectIngredient({
      id: mergeSuggestion.existingId,
      name: mergeSuggestion.existingName,
      defaultUnitId: mergeSuggestion.defaultUnitId,
    });
  }

  const noSearchHits =
    searchQuery.trim().length > 0 &&
    !searchLoading &&
    searchResults.length === 0;

  return (
    <section data-testid="ingredient-lines-editor" className="space-y-3">
      <h3 className="text-sm font-semibold text-zinc-900">Ingredients</h3>

      {value.length === 0 ? (
        <p className="text-sm text-zinc-500" data-testid="ingredient-lines-empty">
          No ingredient lines yet â€” search or create an ingredient below.
        </p>
      ) : (
        <ul className="space-y-3">
          {value.map((line, index) => {
            const validation = validateIngredientLine(line);
            const showErr = showValidation && !validation.ok;
            return (
              <li
                key={line.key}
                data-testid={`ingredient-line-edit-${index}`}
                className="rounded-lg border border-zinc-200 bg-white p-3"
              >
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium text-zinc-900">
                    {line.ingredientName || "Ingredient"}
                  </p>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      data-testid={`ingredient-line-up-${index}`}
                      aria-label={`Move ingredient ${index + 1} up`}
                      disabled={disabled || index === 0}
                      onClick={() => move(index, -1)}
                      className="rounded border border-zinc-300 px-2 py-0.5 text-xs disabled:opacity-40"
                    >
                      Up
                    </button>
                    <button
                      type="button"
                      data-testid={`ingredient-line-down-${index}`}
                      aria-label={`Move ingredient ${index + 1} down`}
                      disabled={disabled || index === value.length - 1}
                      onClick={() => move(index, 1)}
                      className="rounded border border-zinc-300 px-2 py-0.5 text-xs disabled:opacity-40"
                    >
                      Down
                    </button>
                    <button
                      type="button"
                      data-testid={`ingredient-line-remove-${index}`}
                      disabled={disabled}
                      onClick={() => removeLine(index)}
                      className="rounded border border-red-200 px-2 py-0.5 text-xs text-red-700 disabled:opacity-40"
                    >
                      Remove
                    </button>
                  </div>
                </div>

                <div className="flex flex-wrap gap-3">
                  <label className="text-xs font-medium text-zinc-600">
                    Quantity
                    <input
                      type="number"
                      min={0}
                      step="any"
                      data-testid={`ingredient-qty-${index}`}
                      disabled={disabled}
                      value={line.quantity}
                      onChange={(e) => {
                        const raw = e.target.value;
                        if (raw === "") {
                          updateLine(index, { quantity: "" });
                          return;
                        }
                        const n = Number(raw);
                        updateLine(index, {
                          quantity: Number.isFinite(n) ? n : "",
                        });
                      }}
                      className={[
                        "mt-1 block w-24 rounded border px-2 py-1 text-sm",
                        showErr
                          ? "border-red-400 focus:border-red-500"
                          : "border-zinc-300",
                      ].join(" ")}
                    />
                  </label>

                  <label className="text-xs font-medium text-zinc-600">
                    Unit
                    <select
                      data-testid={`ingredient-unit-${index}`}
                      disabled={disabled}
                      value={line.unitId}
                      onChange={(e) =>
                        updateLine(index, { unitId: e.target.value })
                      }
                      className="mt-1 block min-w-[9rem] rounded border border-zinc-300 px-2 py-1 text-sm"
                    >
                      {grouped.map((g) => (
                        <optgroup
                          key={g.dimension}
                          label={g.dimension.toUpperCase()}
                        >
                          {g.units.map((u) => (
                            <option key={u.id} value={u.id}>
                              {unitLabel(u)}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  </label>

                  <label className="min-w-[10rem] flex-1 text-xs font-medium text-zinc-600">
                    Preparation note
                    <input
                      type="text"
                      data-testid={`ingredient-prep-${index}`}
                      disabled={disabled}
                      value={line.preparationNote}
                      onChange={(e) =>
                        updateLine(index, { preparationNote: e.target.value })
                      }
                      placeholder="e.g. minced"
                      className="mt-1 block w-full rounded border border-zinc-300 px-2 py-1 text-sm"
                    />
                  </label>

                  <label className="flex items-end gap-2 pb-1 text-xs font-medium text-zinc-700">
                    <input
                      type="checkbox"
                      data-testid={`ingredient-optional-${index}`}
                      disabled={disabled}
                      checked={line.isOptional}
                      onChange={(e) =>
                        updateLine(index, { isOptional: e.target.checked })
                      }
                      className="h-3.5 w-3.5 rounded border-zinc-300"
                    />
                    Optional
                  </label>
                </div>

                {showErr ? (
                  <p
                    className="mt-2 text-xs text-red-600"
                    role="alert"
                    data-testid={`ingredient-line-error-${index}`}
                  >
                    {validation.message}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      {/* Search / create picker */}
      <div
        data-testid="ingredient-picker"
        className="space-y-2 rounded-lg border border-dashed border-zinc-300 bg-zinc-50/60 p-3"
      >
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
          Add ingredient
        </p>
        <label className="block text-xs font-medium text-zinc-600">
          Search catalog
          <input
            type="search"
            data-testid="ingredient-search"
            disabled={disabled}
            value={searchQuery}
            onChange={(e) => {
              onSearchQueryChange(e.target.value);
              setMergeSuggestion(null);
              setCreateError(null);
            }}
            placeholder="Type to search or createâ€¦"
            className="mt-1 w-full rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm"
          />
        </label>

        {searchLoading ? (
          <p className="text-xs text-zinc-500">Searchingâ€¦</p>
        ) : null}

        {searchResults.length > 0 ? (
          <ul
            data-testid="ingredient-search-results"
            className="max-h-40 overflow-y-auto rounded border border-zinc-200 bg-white"
          >
            {searchResults.map((opt) => (
              <li key={opt.id}>
                <button
                  type="button"
                  data-testid={`ingredient-pick-${opt.id}`}
                  disabled={disabled}
                  onClick={() => selectIngredient(opt)}
                  className="block w-full px-3 py-2 text-left text-sm hover:bg-emerald-50"
                >
                  {opt.name}
                </button>
              </li>
            ))}
          </ul>
        ) : null}

        {noSearchHits ? (
          <div
            data-testid="ingredient-create-inline"
            className="space-y-2 rounded border border-amber-200 bg-amber-50/50 p-2"
          >
            <p className="text-sm text-zinc-700">
              No match for &ldquo;{searchQuery.trim()}&rdquo; â€” create it?
            </p>
            <label className="block text-xs font-medium text-zinc-600">
              Default unit
              <select
                data-testid="ingredient-create-unit"
                disabled={disabled || createPending}
                value={inlineUnitId}
                onChange={(e) => setInlineUnitId(e.target.value)}
                className="mt-1 block w-full rounded border border-zinc-300 bg-white px-2 py-1 text-sm"
              >
                {grouped.map((g) => (
                  <optgroup key={g.dimension} label={g.dimension.toUpperCase()}>
                    {g.units.map((u) => (
                      <option key={u.id} value={u.id}>
                        {unitLabel(u)}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </label>
            <button
              type="button"
              data-testid="ingredient-create-submit"
              disabled={disabled || createPending || !searchQuery.trim()}
              onClick={() => void handleCreateInline()}
              className="rounded bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
            >
              {createPending
                ? "Creatingâ€¦"
                : `Create â€œ${searchQuery.trim()}â€`}
            </button>
          </div>
        ) : null}

        {mergeSuggestion ? (
          <div
            data-testid="ingredient-merge-suggestion"
            role="alert"
            className="space-y-2 rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950"
          >
            <p className="font-medium">{mergeSuggestion.message}</p>
            <p>
              Use existing{" "}
              <strong>{mergeSuggestion.existingName}</strong> instead?
            </p>
            <button
              type="button"
              data-testid="ingredient-merge-accept"
              disabled={disabled}
              onClick={acceptMerge}
              className="rounded bg-amber-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-800"
            >
              Use existing ingredient
            </button>
          </div>
        ) : null}

        {createError ? (
          <p className="text-xs text-red-600" role="alert">
            {createError}
          </p>
        ) : null}
      </div>
    </section>
  );
}
```

### FILE: apps/web/src/components/recipes/FoodSafetyProfileEditor.tsx

```tsx
/**
 * Food-safety profile editor â€” admin-gated writes (Â§8.1 / setFoodSafetyProfile).
 * Non-admins see a read-only summary; the structured editor is hidden.
 */
"use client";

import { useState } from "react";
import type {
  ContaminantProfile,
  FoodSafetyProfile,
} from "@menu-boss/schemas";

import { SafetyNoteCallout, hasMercuryProfile } from "./SafetyNoteCallout";

const FDA_CATEGORIES = [
  { value: "Best Choices", label: "Best Choices" },
  { value: "Good Choices", label: "Good Choices" },
  { value: "Choices to Avoid", label: "Choices to Avoid / Avoid" },
] as const;

export type FoodSafetyProfileEditorProps = {
  value: FoodSafetyProfile | null | undefined;
  onChange?: (next: FoodSafetyProfile) => void;
  /** When false, hide the editable form; show read-only only. */
  isAdmin: boolean;
  disabled?: boolean;
};

/** Loose editable shape â€” Zod catchall makes FoodSafetyProfile awkward to spread. */
type SafetyDraft = {
  mercury?: ContaminantProfile;
  general?: Record<string, unknown>;
  [key: string]: ContaminantProfile | Record<string, unknown> | undefined;
};

function asProfile(value: FoodSafetyProfile | null | undefined): SafetyDraft {
  if (!value || typeof value !== "object") return {};
  return value as SafetyDraft;
}

function contaminantEntries(
  profile: SafetyDraft,
): Array<{ key: string; profile: ContaminantProfile }> {
  const out: Array<{ key: string; profile: ContaminantProfile }> = [];
  for (const [key, val] of Object.entries(profile)) {
    if (key === "general") continue;
    if (val && typeof val === "object") {
      out.push({ key, profile: val as ContaminantProfile });
    }
  }
  return out;
}

function toFoodSafetyProfile(draft: SafetyDraft): FoodSafetyProfile {
  return draft as FoodSafetyProfile;
}

function ReadOnlySafety({ profile }: { profile: SafetyDraft }) {
  const entries = contaminantEntries(profile);
  if (entries.length === 0 && !profile.general) {
    return (
      <p className="text-sm text-zinc-500" data-testid="safety-readonly-empty">
        No food-safety profile on file.
      </p>
    );
  }
  return (
    <div data-testid="safety-readonly" className="space-y-2">
      {hasMercuryProfile(profile) ? (
        <SafetyNoteCallout mercury={profile.mercury!} />
      ) : null}
      {entries
        .filter((e) => e.key !== "mercury")
        .map(({ key, profile: c }) => (
          <div
            key={key}
            className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm"
          >
            <p className="font-semibold capitalize text-zinc-900">{key}</p>
            <ul className="mt-1 list-inside list-disc text-zinc-700">
              {c.fda_category ? <li>FDA: {c.fda_category}</li> : null}
              {c.risk_level ? <li>Risk: {c.risk_level}</li> : null}
              {c.recommended_frequency ? (
                <li>Frequency: {c.recommended_frequency}</li>
              ) : null}
              {c.notes ? <li>{c.notes}</li> : null}
              {c.source ? <li>Source: {c.source}</li> : null}
              {c.last_reviewed ? <li>Reviewed: {c.last_reviewed}</li> : null}
            </ul>
          </div>
        ))}
      {profile.general ? (
        <div className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm">
          <p className="font-semibold text-zinc-900">General guidance</p>
          <pre className="mt-1 whitespace-pre-wrap text-xs text-zinc-700">
            {JSON.stringify(profile.general, null, 2)}
          </pre>
        </div>
      ) : null}
    </div>
  );
}

export function FoodSafetyProfileEditor({
  value,
  onChange,
  isAdmin,
  disabled = false,
}: FoodSafetyProfileEditorProps) {
  const profile = asProfile(value);
  const mercury: ContaminantProfile = profile.mercury ?? {};
  const [newKey, setNewKey] = useState("");

  function emit(next: SafetyDraft) {
    onChange?.(toFoodSafetyProfile(next));
  }

  function patchMercury(patch: Partial<ContaminantProfile>) {
    emit({
      ...profile,
      mercury: { ...mercury, ...patch },
    });
  }

  function patchContaminant(
    key: string,
    patch: Partial<ContaminantProfile>,
  ) {
    const current = (profile[key] as ContaminantProfile | undefined) ?? {};
    emit({
      ...profile,
      [key]: { ...current, ...patch },
    });
  }

  function removeContaminant(key: string) {
    const next = { ...profile };
    delete next[key];
    emit(next);
  }

  function addContaminant() {
    const key = newKey.trim().toLowerCase().replace(/\s+/g, "_");
    if (!key || key === "general") return;
    if (profile[key]) {
      setNewKey("");
      return;
    }
    emit({
      ...profile,
      [key]: {},
    });
    setNewKey("");
  }

  const otherContaminants = contaminantEntries(profile).filter(
    (e) => e.key !== "mercury",
  );

  return (
    <section data-testid="food-safety-section" className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-zinc-900">
          Food safety profile
        </h3>
        {!isAdmin ? (
          <span
            data-testid="safety-admin-only-badge"
            className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-600"
          >
            Admin edit only
          </span>
        ) : null}
      </div>

      {!isAdmin ? <ReadOnlySafety profile={profile} /> : null}

      {isAdmin ? (
        <div
          data-testid="safety-editor"
          className="space-y-4 rounded-lg border border-zinc-200 bg-white p-3"
        >
          <fieldset disabled={disabled} className="space-y-3">
            <legend className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Mercury
            </legend>

            <label className="block text-xs font-medium text-zinc-600">
              FDA category
              <select
                data-testid="safety-mercury-fda"
                value={mercury.fda_category ?? ""}
                onChange={(e) =>
                  patchMercury({
                    fda_category: e.target.value || undefined,
                  })
                }
                className="mt-1 w-full rounded border border-zinc-300 px-2 py-1.5 text-sm"
              >
                <option value="">â€” Select â€”</option>
                {FDA_CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="block text-xs font-medium text-zinc-600">
              Risk level
              <input
                type="text"
                data-testid="safety-mercury-risk"
                value={mercury.risk_level ?? ""}
                onChange={(e) =>
                  patchMercury({ risk_level: e.target.value || undefined })
                }
                placeholder="e.g. moderate"
                className="mt-1 w-full rounded border border-zinc-300 px-2 py-1.5 text-sm"
              />
            </label>

            <label className="block text-xs font-medium text-zinc-600">
              Recommended frequency
              <input
                type="text"
                data-testid="safety-mercury-frequency"
                value={mercury.recommended_frequency ?? ""}
                onChange={(e) =>
                  patchMercury({
                    recommended_frequency: e.target.value || undefined,
                  })
                }
                placeholder="e.g. 2â€“3 servings per week"
                className="mt-1 w-full rounded border border-zinc-300 px-2 py-1.5 text-sm"
              />
            </label>

            <label className="block text-xs font-medium text-zinc-600">
              Notes
              <textarea
                data-testid="safety-mercury-notes"
                rows={2}
                value={mercury.notes ?? ""}
                onChange={(e) =>
                  patchMercury({ notes: e.target.value || undefined })
                }
                className="mt-1 w-full rounded border border-zinc-300 px-2 py-1.5 text-sm"
              />
            </label>

            <label className="block text-xs font-medium text-zinc-600">
              Source
              <input
                type="text"
                data-testid="safety-mercury-source"
                value={mercury.source ?? ""}
                onChange={(e) =>
                  patchMercury({ source: e.target.value || undefined })
                }
                placeholder="e.g. FDA 2024"
                className="mt-1 w-full rounded border border-zinc-300 px-2 py-1.5 text-sm"
              />
            </label>

            <label className="block text-xs font-medium text-zinc-600">
              Last reviewed
              <input
                type="date"
                data-testid="safety-mercury-reviewed"
                value={mercury.last_reviewed ?? ""}
                onChange={(e) =>
                  patchMercury({
                    last_reviewed: e.target.value || undefined,
                  })
                }
                className="mt-1 w-full rounded border border-zinc-300 px-2 py-1.5 text-sm"
              />
            </label>
          </fieldset>

          <div className="space-y-2 border-t border-zinc-100 pt-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Other contaminants
            </p>
            {otherContaminants.map(({ key, profile: c }) => (
              <div
                key={key}
                data-testid={`safety-contaminant-${key}`}
                className="space-y-2 rounded border border-zinc-200 p-2"
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium capitalize text-zinc-800">
                    {key}
                  </span>
                  <button
                    type="button"
                    data-testid={`safety-remove-${key}`}
                    disabled={disabled}
                    onClick={() => removeContaminant(key)}
                    className="text-xs text-red-700 underline"
                  >
                    Remove
                  </button>
                </div>
                <label className="block text-xs font-medium text-zinc-600">
                  Notes
                  <input
                    type="text"
                    data-testid={`safety-contaminant-notes-${key}`}
                    disabled={disabled}
                    value={c.notes ?? ""}
                    onChange={(e) =>
                      patchContaminant(key, {
                        notes: e.target.value || undefined,
                      })
                    }
                    className="mt-1 w-full rounded border border-zinc-300 px-2 py-1 text-sm"
                  />
                </label>
                <label className="block text-xs font-medium text-zinc-600">
                  Risk level
                  <input
                    type="text"
                    data-testid={`safety-contaminant-risk-${key}`}
                    disabled={disabled}
                    value={c.risk_level ?? ""}
                    onChange={(e) =>
                      patchContaminant(key, {
                        risk_level: e.target.value || undefined,
                      })
                    }
                    className="mt-1 w-full rounded border border-zinc-300 px-2 py-1 text-sm"
                  />
                </label>
              </div>
            ))}

            <div className="flex flex-wrap items-end gap-2">
              <label className="text-xs font-medium text-zinc-600">
                Add contaminant key
                <input
                  type="text"
                  data-testid="safety-add-contaminant-key"
                  disabled={disabled}
                  value={newKey}
                  onChange={(e) => setNewKey(e.target.value)}
                  placeholder="e.g. lead, pfas"
                  className="mt-1 block w-40 rounded border border-zinc-300 px-2 py-1 text-sm"
                />
              </label>
              <button
                type="button"
                data-testid="safety-add-contaminant"
                disabled={disabled || !newKey.trim()}
                onClick={addContaminant}
                className="rounded border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium disabled:opacity-50"
              >
                Add
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
```

### FILE: apps/web/src/components/recipes/RecipeEditor.tsx

```tsx
/**
 * Full recipe create/edit form (Â§8.1): fields, instruction reorder,
 * ingredient lines, category/tag pickers, leftover decay path.
 * Save via recipe.create / recipe.update.
 */
"use client";

import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  recipeCreateInputSchema,
  type InstructionStep,
  type LeftoverDecayPathEntry,
  type RecipeCreateInput,
} from "@menu-boss/schemas";
import { useRouter } from "next/navigation";
import Link from "next/link";

import { LeftoverDecayPath } from "@/components/recipes/LeftoverDecayPath";
import {
  CategoryPicker,
  TagPicker,
} from "@/components/shared/CategoryTagPickers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useTRPC } from "@/lib/trpc/client";
import { SEED_UNITS } from "@/lib/units";
import { parseInstructions } from "@/components/recipes/InstructionSteps";

import { InstructionStepsEditor } from "./InstructionStepsEditor";
import {
  IngredientLinesEditor,
  linesToPayload,
  validateIngredientLine,
  type CreateIngredientResult,
  type IngredientLineDraft,
  nextLineKey,
} from "./IngredientLinesEditor";

export type RecipeEditorProps = {
  /** Existing recipe id for edit; omit for create. */
  recipeId?: string;
};

type FormValues = {
  title: string;
  description: string;
  prepTimeMinutes: string;
  cookTimeMinutes: string;
  totalTimeMinutes: string;
  yieldServings: string;
  sourceUrl: string;
  sourceBook: string;
  isTemplate: boolean;
};

function optionalInt(raw: string): number | undefined {
  if (raw.trim() === "") return undefined;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return undefined;
  return Math.floor(n);
}

function parseDecay(raw: unknown): LeftoverDecayPathEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: LeftoverDecayPathEntry[] = [];
  for (const e of raw) {
    if (!e || typeof e !== "object") continue;
    const o = e as Record<string, unknown>;
    if (typeof o.use !== "string" || !o.use.trim()) continue;
    const entry: LeftoverDecayPathEntry = { use: o.use };
    if (typeof o.notes === "string") entry.notes = o.notes;
    if (Array.isArray(o.linkedRecipeIds)) {
      entry.linkedRecipeIds = o.linkedRecipeIds.filter(
        (id): id is string => typeof id === "string",
      );
    }
    out.push(entry);
  }
  return out;
}

export function RecipeEditor({ recipeId }: RecipeEditorProps) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const router = useRouter();
  const isEdit = Boolean(recipeId);

  const [formError, setFormError] = useState<string | null>(null);
  const [showValidation, setShowValidation] = useState(false);
  const [instructions, setInstructions] = useState<InstructionStep[]>([]);
  const [ingredientLines, setIngredientLines] = useState<IngredientLineDraft[]>(
    [],
  );
  const [categoryIds, setCategoryIds] = useState<string[]>([]);
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [decayPath, setDecayPath] = useState<LeftoverDecayPathEntry[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [nameMap, setNameMap] = useState<Record<string, string>>({});

  const detailQuery = useQuery({
    ...trpc.recipe.byId.queryOptions({ id: recipeId! }),
    enabled: isEdit,
  });

  const categoriesQuery = useQuery(
    trpc.category.list.queryOptions({ activeOnly: true }),
  );
  const tagsQuery = useQuery(trpc.tag.list.queryOptions({ activeOnly: true }));

  const searchQueryEnabled = searchQuery.trim().length > 0;
  const ingredientSearch = useQuery({
    ...trpc.ingredient.list.queryOptions({
      q: searchQuery.trim() || undefined,
      limit: 15,
    }),
    enabled: searchQueryEnabled,
  });

  const form = useForm<FormValues>({
    defaultValues: {
      title: "",
      description: "",
      prepTimeMinutes: "",
      cookTimeMinutes: "",
      totalTimeMinutes: "",
      yieldServings: "1",
      sourceUrl: "",
      sourceBook: "",
      isTemplate: false,
    },
  });

  // Hydrate edit form once detail loads.
  useEffect(() => {
    if (!detailQuery.data) return;
    const r = detailQuery.data;
    form.reset({
      title: r.title,
      description: r.description ?? "",
      prepTimeMinutes:
        r.prepTimeMinutes != null ? String(r.prepTimeMinutes) : "",
      cookTimeMinutes:
        r.cookTimeMinutes != null ? String(r.cookTimeMinutes) : "",
      totalTimeMinutes:
        r.totalTimeMinutes != null ? String(r.totalTimeMinutes) : "",
      yieldServings: String(r.yieldServings ?? 1),
      sourceUrl: r.sourceUrl ?? "",
      sourceBook: r.sourceBook ?? "",
      isTemplate: r.isTemplate,
    });
    setInstructions(parseInstructions(r.instructions) as InstructionStep[]);
    setCategoryIds(r.categoryIds ?? []);
    setTagIds(r.tagIds ?? []);
    setDecayPath(parseDecay(r.leftoverDecayPath));

    const lines: IngredientLineDraft[] = [...(r.ingredients ?? [])]
      .sort((a, b) => a.sequenceOrder - b.sequenceOrder)
      .map((ing) => ({
        key: nextLineKey(),
        ingredientId: ing.ingredientId,
        ingredientName: nameMap[ing.ingredientId] ?? "â€¦",
        quantity: ing.quantity,
        unitId: ing.unitId,
        preparationNote: ing.preparationNote ?? "",
        isOptional: ing.isOptional,
      }));
    setIngredientLines(lines);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- hydrate once per recipe payload
  }, [detailQuery.data]);

  // Resolve ingredient names for hydrated lines.
  const lineIds = useMemo(
    () =>
      [
        ...new Set(
          ingredientLines
            .map((l) => l.ingredientId)
            .filter((id) => id && !nameMap[id]),
        ),
      ],
    [ingredientLines, nameMap],
  );

  const nameQueries = useQuery({
    ...trpc.ingredient.list.queryOptions({ limit: 100 }),
    enabled: lineIds.length > 0 && isEdit,
  });

  useEffect(() => {
    if (!nameQueries.data?.items) return;
    const map: Record<string, string> = {};
    for (const item of nameQueries.data.items) {
      map[item.id] = item.name;
    }
    if (Object.keys(map).length === 0) return;
    setNameMap((prev) => ({ ...prev, ...map }));
    setIngredientLines((prev) =>
      prev.map((l) =>
        map[l.ingredientId] && l.ingredientName === "â€¦"
          ? { ...l, ingredientName: map[l.ingredientId]! }
          : l,
      ),
    );
  }, [nameQueries.data]);

  // Prefer byId for missing names when list page is incomplete.
  useEffect(() => {
    if (!detailQuery.data?.ingredients) return;
    const missing = detailQuery.data.ingredients
      .map((i) => i.ingredientId)
      .filter((id) => !nameMap[id]);
    if (missing.length === 0) return;
    let cancelled = false;
    void (async () => {
      const entries: Record<string, string> = {};
      for (const id of missing.slice(0, 20)) {
        try {
          const row = await queryClient.fetchQuery(
            trpc.ingredient.byId.queryOptions({ id }),
          );
          if (row?.name) entries[id] = row.name;
        } catch {
          // ignore missing ingredients
        }
      }
      if (cancelled || Object.keys(entries).length === 0) return;
      setNameMap((prev) => ({ ...prev, ...entries }));
      setIngredientLines((prev) =>
        prev.map((l) =>
          entries[l.ingredientId]
            ? { ...l, ingredientName: entries[l.ingredientId]! }
            : l,
        ),
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [detailQuery.data, nameMap, queryClient, trpc]);

  const createIngredient = useMutation(
    trpc.ingredient.create.mutationOptions(),
  );

  const createRecipe = useMutation(
    trpc.recipe.create.mutationOptions({
      onSuccess: async (created) => {
        await queryClient.invalidateQueries(trpc.recipe.list.queryFilter());
        router.push(`/recipes/${created.id}`);
        router.refresh();
      },
      onError: (err) => setFormError(err.message ?? "Create failed"),
    }),
  );

  const updateRecipe = useMutation(
    trpc.recipe.update.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries(
          trpc.recipe.byId.queryFilter({ id: recipeId! }),
        );
        await queryClient.invalidateQueries(trpc.recipe.list.queryFilter());
        router.push(`/recipes/${recipeId}`);
        router.refresh();
      },
      onError: (err) => setFormError(err.message ?? "Update failed"),
    }),
  );

  async function handleCreateIngredient(input: {
    name: string;
    defaultUnitId: string;
  }): Promise<CreateIngredientResult> {
    try {
      const created = await createIngredient.mutateAsync({
        name: input.name,
        defaultUnitId: input.defaultUnitId,
        isUserAdded: true,
      });
      setNameMap((prev) => ({ ...prev, [created.id]: created.name }));
      return {
        ok: true,
        id: created.id,
        name: created.name,
        defaultUnitId: created.defaultUnitId,
      };
    } catch (err) {
      const e = err as {
        data?: { code?: string };
        message?: string;
        cause?: { existingId?: string; existingName?: string };
      };
      const code = e.data?.code;
      if (code === "CONFLICT") {
        // cause may not serialize; fall back to search by name
        let existingId = e.cause?.existingId ?? "";
        let existingName = e.cause?.existingName ?? input.name;
        if (!existingId) {
          try {
            const listed = await queryClient.fetchQuery(
              trpc.ingredient.list.queryOptions({
                q: input.name,
                limit: 10,
              }),
            );
            const match = listed.items.find(
              (i) => i.name.toLowerCase() === input.name.toLowerCase(),
            );
            if (match) {
              existingId = match.id;
              existingName = match.name;
            }
          } catch {
            // leave empty
          }
        }
        if (existingId) {
          return {
            ok: false,
            conflict: true,
            existingId,
            existingName,
            message:
              e.message ??
              `Ingredient name already exists: "${input.name}"`,
          };
        }
      }
      return {
        ok: false,
        message: e.message ?? "Could not create ingredient",
      };
    }
  }

  function buildPayload(values: FormValues): RecipeCreateInput | null {
    const title = values.title.trim();
    if (!title) {
      setFormError("Title is required");
      return null;
    }

    const cleanedInstructions = instructions
      .map((s) => ({
        text: s.text.trim(),
        timerMinutes: s.timerMinutes,
        temperature: s.temperature?.trim() || undefined,
      }))
      .filter((s) => s.text.length > 0);

    for (const line of ingredientLines) {
      const v = validateIngredientLine(line);
      if (!v.ok) {
        setShowValidation(true);
        setFormError(v.message);
        return null;
      }
    }

    const yieldRaw = Number(values.yieldServings);
    if (!Number.isFinite(yieldRaw) || yieldRaw <= 0) {
      setFormError("Yield servings must be greater than 0");
      return null;
    }

    // Validate top-level with schema defaults
    const candidate = {
      title,
      description: values.description.trim() || undefined,
      instructions: cleanedInstructions,
      prepTimeMinutes: optionalInt(values.prepTimeMinutes),
      cookTimeMinutes: optionalInt(values.cookTimeMinutes),
      totalTimeMinutes: optionalInt(values.totalTimeMinutes),
      yieldServings: yieldRaw,
      sourceUrl: values.sourceUrl.trim() || undefined,
      sourceBook: values.sourceBook.trim() || undefined,
      isTemplate: values.isTemplate,
      leftoverDecayPath: decayPath,
      ingredients: linesToPayload(ingredientLines),
      categoryIds,
      tagIds,
    };

    const parsed = recipeCreateInputSchema.safeParse(candidate);
    if (!parsed.success) {
      setFormError(
        parsed.error.issues[0]?.message ?? "Invalid recipe form",
      );
      return null;
    }
    return parsed.data;
  }

  async function onSubmit(values: FormValues) {
    setFormError(null);
    const payload = buildPayload(values);
    if (!payload) return;

    if (isEdit && recipeId) {
      await updateRecipe.mutateAsync({ id: recipeId, ...payload });
    } else {
      await createRecipe.mutateAsync(payload);
    }
  }

  const saving = createRecipe.isPending || updateRecipe.isPending;
  const catTree = categoriesQuery.data?.tree ?? [];
  const tags = Array.isArray(tagsQuery.data) ? tagsQuery.data : [];
  const searchResults = (ingredientSearch.data?.items ?? []).map((i) => ({
    id: i.id,
    name: i.name,
    defaultUnitId: i.defaultUnitId,
  }));

  if (isEdit && detailQuery.isLoading) {
    return <p className="p-4 text-sm text-zinc-500">Loading recipeâ€¦</p>;
  }

  if (isEdit && (detailQuery.isError || !detailQuery.data)) {
    return (
      <p className="p-4 text-sm text-red-600" role="alert">
        Recipe not found or inaccessible.
      </p>
    );
  }

  if (isEdit && detailQuery.data?.isDeleted) {
    return (
      <div className="space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
        <p className="text-sm text-amber-950">
          This recipe is soft-deleted. Restore it from the detail page before
          editing.
        </p>
        <Link
          href={`/recipes/${recipeId}`}
          className="text-sm font-medium text-emerald-800 underline"
        >
          Back to detail
        </Link>
      </div>
    );
  }

  return (
    <form
      data-testid="recipe-editor"
      className="mx-auto max-w-2xl space-y-6"
      onSubmit={form.handleSubmit((v) => void onSubmit(v))}
      noValidate
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold text-zinc-900">
          {isEdit ? "Edit recipe" : "New recipe"}
        </h1>
        {isEdit ? (
          <Link
            href={`/recipes/${recipeId}`}
            className="text-sm text-zinc-600 underline"
          >
            Cancel
          </Link>
        ) : (
          <Link href="/recipes" className="text-sm text-zinc-600 underline">
            Cancel
          </Link>
        )}
      </div>

      {formError ? (
        <p
          className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
          role="alert"
          data-testid="recipe-form-error"
        >
          {formError}
        </p>
      ) : null}

      <div className="space-y-3 rounded-xl border border-zinc-200 bg-white p-4">
        <div>
          <Label htmlFor="recipe-title">Title</Label>
          <Input
            id="recipe-title"
            data-testid="recipe-title"
            {...form.register("title", { required: true })}
            disabled={saving}
            className="mt-1"
          />
        </div>
        <div>
          <Label htmlFor="recipe-description">Description</Label>
          <textarea
            id="recipe-description"
            data-testid="recipe-description"
            rows={3}
            disabled={saving}
            className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
            {...form.register("description")}
          />
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div>
            <Label htmlFor="prep">Prep (min)</Label>
            <Input
              id="prep"
              type="number"
              min={0}
              data-testid="recipe-prep"
              disabled={saving}
              className="mt-1"
              {...form.register("prepTimeMinutes")}
            />
          </div>
          <div>
            <Label htmlFor="cook">Cook (min)</Label>
            <Input
              id="cook"
              type="number"
              min={0}
              data-testid="recipe-cook"
              disabled={saving}
              className="mt-1"
              {...form.register("cookTimeMinutes")}
            />
          </div>
          <div>
            <Label htmlFor="total">Total (min)</Label>
            <Input
              id="total"
              type="number"
              min={0}
              data-testid="recipe-total"
              disabled={saving}
              className="mt-1"
              {...form.register("totalTimeMinutes")}
            />
          </div>
          <div>
            <Label htmlFor="yield">Yield servings</Label>
            <Input
              id="yield"
              type="number"
              min={0}
              step="any"
              data-testid="recipe-yield"
              disabled={saving}
              className="mt-1"
              {...form.register("yieldServings")}
            />
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="source-url">Source URL</Label>
            <Input
              id="source-url"
              type="url"
              data-testid="recipe-source-url"
              disabled={saving}
              className="mt-1"
              placeholder="https://â€¦"
              {...form.register("sourceUrl")}
            />
          </div>
          <div>
            <Label htmlFor="source-book">Source book</Label>
            <Input
              id="source-book"
              data-testid="recipe-source-book"
              disabled={saving}
              className="mt-1"
              {...form.register("sourceBook")}
            />
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm text-zinc-700">
          <input
            type="checkbox"
            data-testid="recipe-is-template"
            disabled={saving}
            {...form.register("isTemplate")}
            className="h-3.5 w-3.5 rounded border-zinc-300"
          />
          Save as template
        </label>

        {/* Phase 2 â€” image upload slot
            <div data-testid="recipe-image-slot">Image upload (deferred)</div>
        */}
      </div>

      <div className="rounded-xl border border-zinc-200 bg-white p-4">
        <InstructionStepsEditor
          value={instructions}
          onChange={setInstructions}
          disabled={saving}
        />
      </div>

      <div className="rounded-xl border border-zinc-200 bg-white p-4">
        <IngredientLinesEditor
          value={ingredientLines}
          onChange={setIngredientLines}
          units={SEED_UNITS}
          searchResults={searchResults}
          searchQuery={searchQuery}
          onSearchQueryChange={setSearchQuery}
          searchLoading={ingredientSearch.isFetching}
          onCreateIngredient={handleCreateIngredient}
          createPending={createIngredient.isPending}
          disabled={saving}
          showValidation={showValidation}
        />
      </div>

      <div className="space-y-4 rounded-xl border border-zinc-200 bg-white p-4">
        <CategoryPicker
          categories={catTree}
          selectedIds={categoryIds}
          onChange={setCategoryIds}
        />
        <TagPicker tags={tags} selectedIds={tagIds} onChange={setTagIds} />
      </div>

      <LeftoverDecayPath
        entries={decayPath}
        onSave={(next) => {
          setDecayPath(next as LeftoverDecayPathEntry[]);
        }}
        saving={false}
      />

      <div className="flex flex-wrap gap-2">
        <Button
          type="submit"
          data-testid="recipe-save"
          disabled={saving}
        >
          {saving ? "Savingâ€¦" : isEdit ? "Save changes" : "Create recipe"}
        </Button>
      </div>
    </form>
  );
}
```

### FILE: apps/web/src/components/recipes/IngredientManager.tsx

```tsx
/**
 * Ingredient manager list + edit drawer (/recipes/ingredients).
 * Food-safety profile editor is admin-gated (family.me.role).
 */
"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { FoodSafetyProfile } from "@menu-boss/schemas";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useTRPC } from "@/lib/trpc/client";
import {
  DEFAULT_UNIT_ID,
  SEED_UNITS,
  unitLabel,
  unitsByDimension,
} from "@/lib/units";

import { FoodSafetyProfileEditor } from "./FoodSafetyProfileEditor";

type DrawerMode = "closed" | "edit" | "create";

type SelectedIngredient = {
  id: string;
  name: string;
  description: string | null;
  defaultUnitId: string | null;
  nutritionData: unknown;
  foodSafetyProfile: unknown;
  isUserAdded: boolean;
};

export function IngredientManager() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const [q, setQ] = useState("");
  const [userAddedOnly, setUserAddedOnly] = useState(false);
  const [drawer, setDrawer] = useState<DrawerMode>("closed");
  const [selected, setSelected] = useState<SelectedIngredient | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [defaultUnitId, setDefaultUnitId] = useState(DEFAULT_UNIT_ID);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [nutritionJson, setNutritionJson] = useState("");
  const [safetyProfile, setSafetyProfile] = useState<FoodSafetyProfile>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [mergeHint, setMergeHint] = useState<{
    id: string;
    name: string;
  } | null>(null);

  const meQuery = useQuery(trpc.family.me.queryOptions());
  const isAdmin = meQuery.data?.profile.role === "admin";

  const listQuery = useQuery(
    trpc.ingredient.list.queryOptions({
      q: q.trim() || undefined,
      limit: 50,
    }),
  );

  const items = useMemo(() => {
    const raw = listQuery.data?.items ?? [];
    if (!userAddedOnly) return raw;
    return raw.filter((i) => i.isUserAdded);
  }, [listQuery.data, userAddedOnly]);

  const grouped = unitsByDimension(SEED_UNITS);

  function openCreate() {
    setSelected(null);
    setName("");
    setDescription("");
    setDefaultUnitId(DEFAULT_UNIT_ID);
    setNutritionJson("");
    setSafetyProfile({});
    setAdvancedOpen(false);
    setFormError(null);
    setMergeHint(null);
    setDrawer("create");
  }

  function openEdit(ing: SelectedIngredient) {
    setSelected(ing);
    setName(ing.name);
    setDescription(ing.description ?? "");
    setDefaultUnitId(ing.defaultUnitId ?? DEFAULT_UNIT_ID);
    setNutritionJson(
      ing.nutritionData != null
        ? JSON.stringify(ing.nutritionData, null, 2)
        : "",
    );
    setSafetyProfile(
      (ing.foodSafetyProfile as FoodSafetyProfile | null) ?? {},
    );
    setAdvancedOpen(false);
    setFormError(null);
    setMergeHint(null);
    setDrawer("edit");
  }

  function closeDrawer() {
    setDrawer("closed");
    setSelected(null);
    setFormError(null);
    setMergeHint(null);
  }

  const createMutation = useMutation(
    trpc.ingredient.create.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries(trpc.ingredient.list.queryFilter());
        closeDrawer();
      },
      onError: async (err) => {
        const code = err.data?.code;
        if (code === "CONFLICT") {
          setFormError(err.message);
          try {
            const listed = await queryClient.fetchQuery(
              trpc.ingredient.list.queryOptions({
                q: name.trim(),
                limit: 10,
              }),
            );
            const match = listed.items.find(
              (i) => i.name.toLowerCase() === name.trim().toLowerCase(),
            );
            if (match) {
              setMergeHint({ id: match.id, name: match.name });
            }
          } catch {
            // ignore
          }
          return;
        }
        setFormError(err.message ?? "Create failed");
      },
    }),
  );

  const updateMutation = useMutation(
    trpc.ingredient.update.mutationOptions({
      onSuccess: async (updated) => {
        await queryClient.invalidateQueries(trpc.ingredient.list.queryFilter());
        await queryClient.invalidateQueries(
          trpc.ingredient.byId.queryFilter({ id: updated.id }),
        );
        // Keep drawer open with refreshed fields if still editing
        setSelected((prev) =>
          prev
            ? {
                ...prev,
                name: updated.name,
                description: updated.description,
                defaultUnitId: updated.defaultUnitId,
              }
            : prev,
        );
        setFormError(null);
      },
      onError: (err) => setFormError(err.message ?? "Update failed"),
    }),
  );

  const safetyMutation = useMutation(
    trpc.ingredient.setFoodSafetyProfile.mutationOptions({
      onSuccess: async (updated) => {
        await queryClient.invalidateQueries(trpc.ingredient.list.queryFilter());
        await queryClient.invalidateQueries(
          trpc.ingredient.byId.queryFilter({ id: updated.id }),
        );
        setSafetyProfile(
          (updated.foodSafetyProfile as FoodSafetyProfile) ?? {},
        );
        setFormError(null);
      },
      onError: (err) => {
        const code = err.data?.code;
        if (code === "FORBIDDEN") {
          setFormError("Only family admins can edit food-safety profiles.");
        } else {
          setFormError(err.message ?? "Safety profile save failed");
        }
      },
    }),
  );

  const softDeleteMutation = useMutation(
    trpc.ingredient.softDelete.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries(trpc.ingredient.list.queryFilter());
        closeDrawer();
      },
      onError: (err) => setFormError(err.message ?? "Delete failed"),
    }),
  );

  async function saveCore() {
    setFormError(null);
    setMergeHint(null);
    const trimmed = name.trim();
    if (!trimmed) {
      setFormError("Name is required");
      return;
    }

    // <!-- TODO(coordinator): nutrition_data not on ingredient.create/update schemas â€”
    // advanced textarea is display-only until Wave/admin schema extends write path. -->
    if (drawer === "create") {
      await createMutation.mutateAsync({
        name: trimmed,
        description: description.trim() || undefined,
        defaultUnitId: defaultUnitId || undefined,
        isUserAdded: true,
      });
      return;
    }

    if (drawer === "edit" && selected) {
      await updateMutation.mutateAsync({
        id: selected.id,
        name: trimmed,
        description: description.trim() || undefined,
        defaultUnitId: defaultUnitId || null,
      });
    }
  }

  async function saveSafety() {
    if (!selected || !isAdmin) return;
    setFormError(null);
    await safetyMutation.mutateAsync({
      id: selected.id,
      foodSafetyProfile: safetyProfile,
    });
  }

  const busy =
    createMutation.isPending ||
    updateMutation.isPending ||
    safetyMutation.isPending ||
    softDeleteMutation.isPending;

  return (
    <div data-testid="ingredient-manager" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900">Ingredients</h1>
          <p className="text-sm text-zinc-500">
            Family-global catalog Â·{" "}
            <Link href="/recipes" className="underline">
              Back to recipes
            </Link>
          </p>
        </div>
        <Button
          type="button"
          data-testid="ingredient-new"
          onClick={openCreate}
        >
          New ingredient
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-zinc-200 bg-white p-3">
        <label className="min-w-[12rem] flex-1">
          <span className="sr-only">Search ingredients</span>
          <Input
            type="search"
            data-testid="ingredient-manager-search"
            placeholder="Search ingredientsâ€¦"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </label>
        <label className="flex items-center gap-2 text-sm text-zinc-700">
          <input
            type="checkbox"
            data-testid="ingredient-user-added-filter"
            checked={userAddedOnly}
            onChange={(e) => setUserAddedOnly(e.target.checked)}
            className="h-3.5 w-3.5 rounded border-zinc-300"
          />
          User-added only
          {/* <!-- TODO(coordinator): server-side isUserAdded filter on ingredient.list --> */}
        </label>
      </div>

      {listQuery.isLoading ? (
        <p className="text-sm text-zinc-500">Loading ingredientsâ€¦</p>
      ) : null}
      {listQuery.isError ? (
        <p className="text-sm text-red-600" role="alert">
          Could not load ingredients.
        </p>
      ) : null}

      <ul
        data-testid="ingredient-list"
        className="divide-y divide-zinc-100 rounded-xl border border-zinc-200 bg-white"
      >
        {items.length === 0 && !listQuery.isLoading ? (
          <li className="px-4 py-6 text-sm text-zinc-500">
            No ingredients match.
          </li>
        ) : (
          items.map((ing) => (
            <li key={ing.id}>
              <button
                type="button"
                data-testid={`ingredient-row-${ing.id}`}
                onClick={() =>
                  openEdit({
                    id: ing.id,
                    name: ing.name,
                    description: ing.description,
                    defaultUnitId: ing.defaultUnitId,
                    nutritionData: ing.nutritionData,
                    foodSafetyProfile: ing.foodSafetyProfile,
                    isUserAdded: ing.isUserAdded,
                  })
                }
                className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left hover:bg-zinc-50"
              >
                <div>
                  <p className="font-medium text-zinc-900">{ing.name}</p>
                  {ing.description ? (
                    <p className="line-clamp-1 text-xs text-zinc-500">
                      {ing.description}
                    </p>
                  ) : null}
                </div>
                <div className="flex shrink-0 gap-1">
                  {ing.isUserAdded ? (
                    <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-sky-800">
                      User
                    </span>
                  ) : null}
                  {ing.foodSafetyProfile &&
                  typeof ing.foodSafetyProfile === "object" &&
                  Object.keys(ing.foodSafetyProfile as object).length > 0 ? (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-amber-900">
                      Safety
                    </span>
                  ) : null}
                </div>
              </button>
            </li>
          ))
        )}
      </ul>

      {drawer !== "closed" ? (
        <div
          className="fixed inset-0 z-40 flex justify-end bg-black/30"
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeDrawer();
          }}
        >
          <aside
            data-testid="ingredient-drawer"
            role="dialog"
            aria-modal="true"
            aria-label={
              drawer === "create" ? "Create ingredient" : "Edit ingredient"
            }
            className="flex h-full w-full max-w-md flex-col overflow-y-auto bg-white shadow-xl"
          >
            <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3">
              <h2 className="font-semibold text-zinc-900">
                {drawer === "create" ? "New ingredient" : "Edit ingredient"}
              </h2>
              <button
                type="button"
                data-testid="ingredient-drawer-close"
                onClick={closeDrawer}
                className="text-sm text-zinc-600 underline"
              >
                Close
              </button>
            </div>

            <div className="flex-1 space-y-4 p-4">
              {formError ? (
                <p
                  className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
                  role="alert"
                  data-testid="ingredient-drawer-error"
                >
                  {formError}
                </p>
              ) : null}

              {mergeHint ? (
                <div
                  data-testid="ingredient-drawer-merge"
                  className="space-y-2 rounded border border-amber-300 bg-amber-50 p-3 text-sm"
                >
                  <p>
                    Use existing <strong>{mergeHint.name}</strong>?
                  </p>
                  <button
                    type="button"
                    data-testid="ingredient-drawer-merge-accept"
                    className="rounded bg-amber-700 px-3 py-1.5 text-white"
                    onClick={() => {
                      const match = items.find((i) => i.id === mergeHint.id);
                      if (match) {
                        openEdit({
                          id: match.id,
                          name: match.name,
                          description: match.description,
                          defaultUnitId: match.defaultUnitId,
                          nutritionData: match.nutritionData,
                          foodSafetyProfile: match.foodSafetyProfile,
                          isUserAdded: match.isUserAdded,
                        });
                      } else {
                        // fetch full row
                        void queryClient
                          .fetchQuery(
                            trpc.ingredient.byId.queryOptions({
                              id: mergeHint.id,
                            }),
                          )
                          .then((row) => {
                            openEdit({
                              id: row.id,
                              name: row.name,
                              description: row.description,
                              defaultUnitId: row.defaultUnitId,
                              nutritionData: row.nutritionData,
                              foodSafetyProfile: row.foodSafetyProfile,
                              isUserAdded: row.isUserAdded,
                            });
                          });
                      }
                    }}
                  >
                    Open existing
                  </button>
                </div>
              ) : null}

              <div>
                <Label htmlFor="ing-name">Name</Label>
                <Input
                  id="ing-name"
                  data-testid="ingredient-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={busy}
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="ing-desc">Description</Label>
                <textarea
                  id="ing-desc"
                  data-testid="ingredient-description"
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  disabled={busy}
                  className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <Label htmlFor="ing-unit">Default unit</Label>
                <select
                  id="ing-unit"
                  data-testid="ingredient-default-unit"
                  value={defaultUnitId}
                  onChange={(e) => setDefaultUnitId(e.target.value)}
                  disabled={busy}
                  className="mt-1 w-full rounded-md border border-zinc-300 px-2 py-2 text-sm"
                >
                  {grouped.map((g) => (
                    <optgroup
                      key={g.dimension}
                      label={g.dimension.toUpperCase()}
                    >
                      {g.units.map((u) => (
                        <option key={u.id} value={u.id}>
                          {unitLabel(u)}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>

              <details
                open={advancedOpen}
                onToggle={(e) =>
                  setAdvancedOpen((e.target as HTMLDetailsElement).open)
                }
              >
                <summary
                  data-testid="ingredient-advanced-toggle"
                  className="cursor-pointer text-sm font-medium text-zinc-800"
                >
                  Advanced â€” nutrition JSON
                </summary>
                <div className="mt-2 space-y-1">
                  <p className="text-xs text-zinc-500">
                    Phase 2 structured nutrition. Write path not on
                    ingredient.update yet â€” shown for reference.
                  </p>
                  <textarea
                    data-testid="ingredient-nutrition-json"
                    rows={5}
                    value={nutritionJson}
                    onChange={(e) => setNutritionJson(e.target.value)}
                    disabled={busy}
                    className="w-full rounded-md border border-zinc-300 px-2 py-1.5 font-mono text-xs"
                    placeholder="{}"
                  />
                </div>
              </details>

              {drawer === "edit" && selected ? (
                <div className="space-y-2 border-t border-zinc-100 pt-4">
                  <FoodSafetyProfileEditor
                    value={safetyProfile}
                    onChange={setSafetyProfile}
                    isAdmin={isAdmin}
                    disabled={busy}
                  />
                  {isAdmin ? (
                    <Button
                      type="button"
                      data-testid="ingredient-save-safety"
                      variant="outline"
                      disabled={busy}
                      onClick={() => void saveSafety()}
                    >
                      {safetyMutation.isPending
                        ? "Saving safetyâ€¦"
                        : "Save food-safety profile"}
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </div>

            <div className="flex flex-wrap gap-2 border-t border-zinc-200 p-4">
              <Button
                type="button"
                data-testid="ingredient-save"
                disabled={busy}
                onClick={() => void saveCore()}
              >
                {busy && !safetyMutation.isPending
                  ? "Savingâ€¦"
                  : drawer === "create"
                    ? "Create"
                    : "Save"}
              </Button>
              {drawer === "edit" && selected ? (
                <Button
                  type="button"
                  variant="destructive"
                  data-testid="ingredient-soft-delete"
                  disabled={busy}
                  onClick={() => {
                    if (
                      window.confirm(
                        `Soft-delete â€œ${selected.name}â€? Recipes that reference it will show a deleted-ingredient badge.`,
                      )
                    ) {
                      void softDeleteMutation.mutateAsync({ id: selected.id });
                    }
                  }}
                >
                  Soft-delete
                </Button>
              ) : null}
            </div>
          </aside>
        </div>
      ) : null}
    </div>
  );
}
```

### FILE: apps/web/src/components/recipes/RecipeDetail.tsx

```tsx
/**
 * Recipe detail: ingredients + safety callouts, instructions, rating,
 * leftovers decay path, soft-delete badge, Add to Plan / Combination,
 * edit + softDelete confirm + restore.
 */
"use client";

import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { DeletedBadge } from "@/components/shared/DeletedBadge";
import { useTRPC } from "@/lib/trpc/client";
import type { LeftoverDecayPathEntry } from "@menu-boss/schemas";

import { IngredientLine } from "./IngredientLine";
import { InstructionSteps, parseInstructions } from "./InstructionSteps";
import {
  LeftoverDecayPath,
  type DecayPathEntry,
} from "./LeftoverDecayPath";
import { MakeAgainRating, useOptimisticRating } from "./MakeAgainRating";

function parseDecayPath(raw: unknown): DecayPathEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: DecayPathEntry[] = [];
  for (const e of raw) {
    if (!e || typeof e !== "object") continue;
    const o = e as Record<string, unknown>;
    if (typeof o.use !== "string" || !o.use.trim()) continue;
    const entry: DecayPathEntry = { use: o.use };
    if (typeof o.notes === "string") entry.notes = o.notes;
    if (Array.isArray(o.linkedRecipeIds)) {
      entry.linkedRecipeIds = o.linkedRecipeIds.filter(
        (id): id is string => typeof id === "string",
      );
    }
    out.push(entry);
  }
  return out;
}

export function RecipeDetail({ recipeId }: { recipeId: string }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const router = useRouter();
  const [actionError, setActionError] = useState<string | null>(null);

  const detailQuery = useQuery(trpc.recipe.byId.queryOptions({ id: recipeId }));

  const ingredientIds = useMemo(
    () =>
      (detailQuery.data?.ingredients ?? []).map((i) => i.ingredientId),
    [detailQuery.data?.ingredients],
  );

  const ingredientQueries = useQueries({
    queries: ingredientIds.map((id) =>
      trpc.ingredient.byId.queryOptions({ id }),
    ),
  });

  const ingredientById = useMemo(() => {
    const map = new Map<
      string,
      { name: string; foodSafetyProfile: unknown }
    >();
    for (const q of ingredientQueries) {
      if (q.data) {
        map.set(q.data.id, {
          name: q.data.name,
          foodSafetyProfile: q.data.foodSafetyProfile,
        });
      }
    }
    return map;
  }, [ingredientQueries]);

  const rateMutation = useMutation(
    trpc.recipe.rate.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries(
          trpc.recipe.byId.queryFilter({ id: recipeId }),
        );
      },
    }),
  );

  const decayMutation = useMutation(
    trpc.recipe.setLeftoverDecayPath.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries(
          trpc.recipe.byId.queryFilter({ id: recipeId }),
        );
      },
    }),
  );

  const softDeleteMutation = useMutation(
    trpc.recipe.softDelete.mutationOptions({
      onSuccess: async () => {
        setActionError(null);
        await queryClient.invalidateQueries(
          trpc.recipe.byId.queryFilter({ id: recipeId }),
        );
        await queryClient.invalidateQueries(trpc.recipe.list.queryFilter());
        router.refresh();
      },
      onError: (err) => setActionError(err.message ?? "Delete failed"),
    }),
  );

  const restoreMutation = useMutation(
    trpc.recipe.restore.mutationOptions({
      onSuccess: async () => {
        setActionError(null);
        await queryClient.invalidateQueries(
          trpc.recipe.byId.queryFilter({ id: recipeId }),
        );
        await queryClient.invalidateQueries(trpc.recipe.list.queryFilter());
        router.refresh();
      },
      onError: (err) => setActionError(err.message ?? "Restore failed"),
    }),
  );

  const {
    value: ratingValue,
    pending: ratingPending,
    error: ratingError,
    rate,
  } = useOptimisticRating(
    detailQuery.data?.makeAgainRating,
    async (makeAgainRating) => {
      await rateMutation.mutateAsync({ id: recipeId, makeAgainRating });
    },
  );

  if (detailQuery.isLoading) {
    return <p className="text-sm text-zinc-500">Loading recipeâ€¦</p>;
  }
  if (detailQuery.isError || !detailQuery.data) {
    return (
      <p className="text-sm text-red-600" role="alert">
        Recipe not found or inaccessible.
      </p>
    );
  }

  const recipe = detailQuery.data;
  const steps = parseInstructions(recipe.instructions);
  const decay = parseDecayPath(recipe.leftoverDecayPath);
  const linkedIds = decay.flatMap((e) => e.linkedRecipeIds ?? []);
  // Titles for linked recipes â€” best-effort via parallel queries would be heavy;
  // links still navigate by id.
  const recipeTitles: Record<string, string> = {};
  for (const id of linkedIds) {
    recipeTitles[id] = "Linked recipe";
  }

  return (
    <article data-testid="recipe-detail" className="mx-auto max-w-2xl space-y-6">
      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-bold text-zinc-900">{recipe.title}</h1>
          {recipe.isDeleted ? <DeletedBadge /> : null}
        </div>
        {recipe.description ? (
          <p className="text-zinc-600">{recipe.description}</p>
        ) : null}
        <div className="flex flex-wrap gap-3 text-sm text-zinc-500">
          {recipe.totalTimeMinutes != null ? (
            <span>{recipe.totalTimeMinutes} min total</span>
          ) : null}
          {recipe.prepTimeMinutes != null ? (
            <span>Prep {recipe.prepTimeMinutes} min</span>
          ) : null}
          {recipe.cookTimeMinutes != null ? (
            <span>Cook {recipe.cookTimeMinutes} min</span>
          ) : null}
          <span>Serves {recipe.yieldServings}</span>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-4">
        <div>
          <p className="mb-1 text-xs font-medium uppercase text-zinc-500">
            Make again
          </p>
          <MakeAgainRating
            value={ratingValue}
            onRate={rate}
            pending={ratingPending}
            disabled={recipe.isDeleted}
          />
          {ratingError ? (
            <p className="mt-1 text-xs text-red-600" role="alert">
              {ratingError}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          {!recipe.isDeleted ? (
            <Link
              href={`/recipes/${recipe.id}/edit`}
              data-testid="recipe-edit-link"
              className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50"
            >
              Edit
            </Link>
          ) : null}
          <Link
            href={`/calendar?addRecipe=${recipe.id}`}
            className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700"
          >
            Add to Plan
          </Link>
          {/* <!-- TODO(coordinator): Task 11 plan editor preselect via ?addRecipe= --> */}
          <Link
            href={`/recipes/combinations/new?recipeId=${recipe.id}`}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50"
          >
            Add to Combination
          </Link>
          {recipe.isDeleted ? (
            <button
              type="button"
              data-testid="recipe-restore"
              disabled={restoreMutation.isPending}
              className="rounded-lg border border-emerald-600 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-900 hover:bg-emerald-100 disabled:opacity-50"
              onClick={() => void restoreMutation.mutateAsync({ id: recipeId })}
            >
              {restoreMutation.isPending ? "Restoringâ€¦" : "Restore recipe"}
            </button>
          ) : (
            <button
              type="button"
              data-testid="recipe-soft-delete"
              disabled={softDeleteMutation.isPending}
              className="rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
              onClick={() => {
                if (
                  window.confirm(
                    `Soft-delete â€œ${recipe.title}â€? It will leave browse/search but stay on existing plans with a deleted badge.`,
                  )
                ) {
                  void softDeleteMutation.mutateAsync({ id: recipeId });
                }
              }}
            >
              {softDeleteMutation.isPending ? "Deletingâ€¦" : "Soft-delete"}
            </button>
          )}
        </div>
      </div>

      {actionError ? (
        <p className="text-sm text-red-600" role="alert" data-testid="recipe-action-error">
          {actionError}
        </p>
      ) : null}

      <section>
        <h2 className="mb-2 text-lg font-semibold text-zinc-900">Ingredients</h2>
        <ul className="divide-y divide-zinc-100 rounded-xl border border-zinc-200 bg-white px-3">
          {[...(recipe.ingredients ?? [])]
            .sort((a, b) => a.sequenceOrder - b.sequenceOrder)
            .map((ing) => {
              const meta = ingredientById.get(ing.ingredientId);
              return (
                <IngredientLine
                  key={ing.id}
                  name={meta?.name ?? "Ingredient"}
                  quantity={ing.quantity}
                  unitLabel={null}
                  preparationNote={ing.preparationNote}
                  isOptional={ing.isOptional}
                  foodSafetyProfile={meta?.foodSafetyProfile}
                />
              );
            })}
        </ul>
      </section>

      <section>
        <h2 className="mb-2 text-lg font-semibold text-zinc-900">Instructions</h2>
        <InstructionSteps steps={steps} />
      </section>

      <LeftoverDecayPath
        entries={decay}
        saving={decayMutation.isPending}
        recipeTitles={recipeTitles}
        onSave={async (next) => {
          await decayMutation.mutateAsync({
            id: recipeId,
            leftoverDecayPath: next as LeftoverDecayPathEntry[],
          });
        }}
      />
    </article>
  );
}
```

### FILE: apps/web/src/components/recipes/RecipeBrowser.tsx

```tsx
/**
 * Recipe browser: filters, interleaved ChefIdeas on search, Meals tab, load more.
 */
"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useMemo, useState } from "react";

import {
  ContentFilters,
  emptyFilters,
  type ContentFilterState,
} from "@/components/shared/ContentFilters";
import { EmptyState } from "@/components/shell/EmptyState";
import { useTRPC } from "@/lib/trpc/client";

import { CombinationCard } from "@/components/combinations/CombinationCard";
import { ChefIdeaSearchCard, RecipeCard } from "./RecipeCard";

type Tab = "recipes" | "meals";

export function RecipeBrowser() {
  const trpc = useTRPC();
  const [tab, setTab] = useState<Tab>("recipes");
  const [filters, setFilters] = useState<ContentFilterState>(emptyFilters);
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [pages, setPages] = useState<
    Array<{ items: Array<Record<string, unknown>>; nextCursor: string | null }>
  >([]);

  const listInput = useMemo(() => {
    const input: {
      q?: string;
      categoryIds?: string[];
      tagIds?: string[];
      maxTotalMinutes?: number;
      minRating?: number;
      cursor?: string;
      limit: number;
    } = { limit: 20 };
    if (filters.q.trim()) input.q = filters.q.trim();
    if (filters.categoryIds.length) input.categoryIds = filters.categoryIds;
    if (filters.tagIds.length) input.tagIds = filters.tagIds;
    if (filters.maxTotalMinutes !== "") {
      const n = Number(filters.maxTotalMinutes);
      if (!Number.isNaN(n)) input.maxTotalMinutes = n;
    }
    if (filters.minRating !== "") {
      const n = Number(filters.minRating);
      if (n >= 1 && n <= 5) input.minRating = n as 1 | 2 | 3 | 4 | 5;
    }
    if (cursor) input.cursor = cursor;
    return input;
  }, [filters, cursor]);

  const categoriesQuery = useQuery(
    trpc.category.list.queryOptions({ activeOnly: true }),
  );
  const tagsQuery = useQuery(trpc.tag.list.queryOptions({ activeOnly: true }));

  const recipesQuery = useQuery({
    ...trpc.recipe.list.queryOptions(listInput),
    enabled: tab === "recipes",
  });

  // Interleave ChefIdeas when search is non-empty (Â§9.2).
  const ideasQuery = useQuery({
    ...trpc.chefIdea.list.queryOptions({
      q: filters.q.trim() || undefined,
      categoryIds: filters.categoryIds.length
        ? filters.categoryIds
        : undefined,
      tagIds: filters.tagIds.length ? filters.tagIds : undefined,
      limit: 10,
    }),
    enabled: tab === "recipes" && filters.q.trim().length > 0,
  });

  const combosQuery = useQuery({
    ...trpc.recipeCombination.list.queryOptions({ limit: 20 }),
    enabled: tab === "meals",
  });

  // Accumulate pages when cursor advances
  const currentPage = recipesQuery.data;
  const allRecipes = useMemo(() => {
    if (!currentPage) return pages.flatMap((p) => p.items);
    if (!cursor) return currentPage.items;
    const prior = pages.flatMap((p) => p.items);
    // avoid dup if same page
    const ids = new Set(prior.map((r) => r.id as string));
    const merged = [
      ...prior,
      ...currentPage.items.filter((r) => !ids.has(r.id as string)),
    ];
    return merged;
  }, [currentPage, pages, cursor]);

  function onFilterChange(next: ContentFilterState) {
    setFilters(next);
    setCursor(undefined);
    setPages([]);
  }

  function loadMore() {
    if (!currentPage?.nextCursor) return;
    setPages((prev) => [
      ...prev,
      {
        items: currentPage.items as Array<Record<string, unknown>>,
        nextCursor: currentPage.nextCursor,
      },
    ]);
    setCursor(currentPage.nextCursor);
  }

  const catTree = categoriesQuery.data?.tree ?? [];
  const tags = Array.isArray(tagsQuery.data) ? tagsQuery.data : [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div
          role="tablist"
          aria-label="Recipes or meals"
          className="inline-flex rounded-lg border border-zinc-200 bg-zinc-50 p-0.5"
        >
          <button
            type="button"
            role="tab"
            aria-selected={tab === "recipes"}
            className={[
              "rounded-md px-3 py-1.5 text-sm font-medium",
              tab === "recipes"
                ? "bg-white text-zinc-900 shadow-sm"
                : "text-zinc-600",
            ].join(" ")}
            onClick={() => setTab("recipes")}
          >
            Recipes
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "meals"}
            className={[
              "rounded-md px-3 py-1.5 text-sm font-medium",
              tab === "meals"
                ? "bg-white text-zinc-900 shadow-sm"
                : "text-zinc-600",
            ].join(" ")}
            onClick={() => setTab("meals")}
          >
            Meals
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          {tab === "recipes" ? (
            <>
              <Link
                href="/recipes/ingredients"
                data-testid="link-ingredients"
                className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-800 hover:bg-zinc-50"
              >
                Ingredients
              </Link>
              <Link
                href="/recipes/new"
                data-testid="link-new-recipe"
                className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700"
              >
                New recipe
              </Link>
            </>
          ) : (
            <Link
              href="/recipes/combinations/new"
              className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700"
            >
              New combination
            </Link>
          )}
        </div>
      </div>

      {tab === "recipes" ? (
        <>
          <ContentFilters
            value={filters}
            onChange={onFilterChange}
            categories={catTree}
            tags={tags}
            searchPlaceholder="Search recipes (and ideas)â€¦"
          />

          {recipesQuery.isLoading ? (
            <p className="text-sm text-zinc-500">Loading recipesâ€¦</p>
          ) : null}
          {recipesQuery.isError ? (
            <p className="text-sm text-red-600" role="alert">
              Could not load recipes.
            </p>
          ) : null}

          {!recipesQuery.isLoading &&
          allRecipes.length === 0 &&
          !(ideasQuery.data?.items.length) ? (
            <EmptyState
              title="No recipes yet"
              description="Add a family recipe or convert a ChefIdea when you're ready."
            />
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {(ideasQuery.data?.items ?? []).map((idea) => (
                <ChefIdeaSearchCard
                  key={`idea-${idea.id}`}
                  id={idea.id}
                  title={idea.title}
                  notes={idea.notes}
                  status={idea.status}
                />
              ))}
              {allRecipes.map((r) => (
                <RecipeCard
                  key={r.id as string}
                  id={r.id as string}
                  title={r.title as string}
                  description={(r.description as string | null) ?? null}
                  totalTimeMinutes={
                    (r.totalTimeMinutes as number | null) ?? null
                  }
                  makeAgainRating={
                    (r.makeAgainRating as number | null) ?? null
                  }
                  isDeleted={Boolean(r.isDeleted)}
                />
              ))}
            </div>
          )}

          {currentPage?.nextCursor ? (
            <div className="flex justify-center pt-2">
              <button
                type="button"
                data-testid="recipes-load-more"
                className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50"
                onClick={loadMore}
                disabled={recipesQuery.isFetching}
              >
                {recipesQuery.isFetching ? "Loadingâ€¦" : "Load more"}
              </button>
            </div>
          ) : null}
        </>
      ) : (
        <>
          {combosQuery.isLoading ? (
            <p className="text-sm text-zinc-500">Loading mealsâ€¦</p>
          ) : null}
          {!combosQuery.isLoading &&
          (combosQuery.data?.items.length ?? 0) === 0 ? (
            <EmptyState
              title="No meal combinations yet"
              description="Group recipes into a complete meal with roles and order."
              action={
                <Link
                  href="/recipes/combinations/new"
                  className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white"
                >
                  Create combination
                </Link>
              }
            />
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {(combosQuery.data?.items ?? []).map((c) => (
                <CombinationCard
                  key={c.id}
                  id={c.id}
                  name={c.name}
                  notes={c.notes}
                  makeAgainRating={c.makeAgainRating}
                  isTemplate={c.isTemplate}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
```

### FILE: apps/web/src/app/(app)/recipes/new/page.tsx

```tsx
import { RecipeEditor } from "@/components/recipes/RecipeEditor";

export default function NewRecipePage() {
  return <RecipeEditor />;
}
```

### FILE: apps/web/src/app/(app)/recipes/[id]/page.tsx

```tsx
import { RecipeDetail } from "@/components/recipes/RecipeDetail";

type Params = Promise<{ id: string }>;

export default async function RecipeDetailPage({
  params,
}: {
  params: Params;
}) {
  const { id } = await params;
  return (
    <div className="space-y-4">
      <RecipeDetail recipeId={id} />
    </div>
  );
}
```

### FILE: apps/web/src/app/(app)/recipes/[id]/edit/page.tsx

```tsx
import { RecipeEditor } from "@/components/recipes/RecipeEditor";

type Params = Promise<{ id: string }>;

export default async function EditRecipePage({
  params,
}: {
  params: Params;
}) {
  const { id } = await params;
  return <RecipeEditor recipeId={id} />;
}
```

### FILE: apps/web/src/app/(app)/recipes/ingredients/page.tsx

```tsx
import { IngredientManager } from "@/components/recipes/IngredientManager";

export default function IngredientsPage() {
  return <IngredientManager />;
}
```

### FILE: apps/web/src/components/recipes/InstructionStepsEditor.test.tsx

```tsx
/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as React from "react";

import {
  InstructionStepsEditor,
  reorderSteps,
} from "./InstructionStepsEditor";
import type { InstructionStep } from "@menu-boss/schemas";

function Controlled({
  initial,
}: {
  initial: InstructionStep[];
}) {
  const [value, setValue] = React.useState(initial);
  return (
    <div>
      <InstructionStepsEditor value={value} onChange={setValue} />
      <ol data-testid="order-mirror">
        {value.map((s, i) => (
          <li key={i} data-testid={`mirror-${i}`}>
            {s.text}
          </li>
        ))}
      </ol>
    </div>
  );
}

describe("reorderSteps", () => {
  it("swaps neighbors and no-ops at edges", () => {
    const steps = [
      { text: "A" },
      { text: "B" },
      { text: "C" },
    ];
    expect(reorderSteps(steps, 0, -1)).toEqual(steps);
    expect(reorderSteps(steps, 2, 1)).toEqual(steps);
    expect(reorderSteps(steps, 1, -1).map((s) => s.text)).toEqual([
      "B",
      "A",
      "C",
    ]);
  });
});

describe("InstructionStepsEditor", () => {
  it("reorders steps with Up/Down controls", async () => {
    const user = userEvent.setup();
    render(
      <Controlled
        initial={[
          { text: "Sear pork" },
          { text: "Braise low" },
          { text: "Rest and slice" },
        ]}
      />,
    );

    expect(screen.getByTestId("mirror-0")).toHaveTextContent("Sear pork");
    expect(screen.getByTestId("mirror-1")).toHaveTextContent("Braise low");

    await user.click(screen.getByTestId("instruction-down-0"));

    expect(screen.getByTestId("mirror-0")).toHaveTextContent("Braise low");
    expect(screen.getByTestId("mirror-1")).toHaveTextContent("Sear pork");
    expect(screen.getByTestId("mirror-2")).toHaveTextContent("Rest and slice");

    await user.click(screen.getByTestId("instruction-up-2"));

    expect(screen.getByTestId("mirror-1")).toHaveTextContent("Rest and slice");
    expect(screen.getByTestId("mirror-2")).toHaveTextContent("Sear pork");
  });

  it("adds and removes steps", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <InstructionStepsEditor
        value={[{ text: "Only step" }]}
        onChange={onChange}
      />,
    );

    await user.click(screen.getByTestId("instruction-add"));
    expect(onChange).toHaveBeenCalledWith([
      { text: "Only step" },
      { text: "" },
    ]);

    await user.click(screen.getByTestId("instruction-remove-0"));
    expect(onChange).toHaveBeenCalledWith([]);
  });
});
```

### FILE: apps/web/src/components/recipes/IngredientLinesEditor.test.tsx

```tsx
/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as React from "react";

import { SEED_UNITS, DEFAULT_UNIT_ID } from "@/lib/units";

import {
  IngredientLinesEditor,
  emptyIngredientLine,
  validateIngredientLine,
  type IngredientLineDraft,
  type CreateIngredientResult,
} from "./IngredientLinesEditor";

function ControlledEditor({
  initial = [] as IngredientLineDraft[],
  onCreate,
  searchResults = [],
}: {
  initial?: IngredientLineDraft[];
  onCreate?: (input: {
    name: string;
    defaultUnitId: string;
  }) => Promise<CreateIngredientResult>;
  searchResults?: Array<{ id: string; name: string }>;
}) {
  const [value, setValue] = React.useState(initial);
  const [searchQuery, setSearchQuery] = React.useState("");
  const [showValidation, setShowValidation] = React.useState(false);

  return (
    <div>
      <IngredientLinesEditor
        value={value}
        onChange={setValue}
        units={SEED_UNITS}
        searchQuery={searchQuery}
        onSearchQueryChange={setSearchQuery}
        searchResults={
          searchQuery.trim()
            ? searchResults.filter((r) =>
                r.name.toLowerCase().includes(searchQuery.toLowerCase()),
              )
            : []
        }
        onCreateIngredient={
          onCreate ??
          (async () => ({
            ok: true as const,
            id: "new-id",
            name: "Created",
            defaultUnitId: DEFAULT_UNIT_ID,
          }))
        }
        showValidation={showValidation}
      />
      <button
        type="button"
        data-testid="force-validate"
        onClick={() => setShowValidation(true)}
      >
        Validate
      </button>
    </div>
  );
}

describe("validateIngredientLine", () => {
  it("rejects quantity 0", () => {
    const line = emptyIngredientLine({
      ingredientId: "00000000-0000-4000-8000-000000000001",
      ingredientName: "Salt",
      quantity: 0,
      unitId: DEFAULT_UNIT_ID,
    });
    const result = validateIngredientLine(line);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message.toLowerCase()).toMatch(/quantity|0|>/);
    }
  });

  it("accepts positive quantity", () => {
    const line = emptyIngredientLine({
      ingredientId: "00000000-0000-4000-8000-000000000001",
      ingredientName: "Salt",
      quantity: 1.5,
      unitId: DEFAULT_UNIT_ID,
    });
    expect(validateIngredientLine(line)).toEqual({ ok: true });
  });
});

describe("IngredientLinesEditor", () => {
  it("surfaces quantity 0 validation error", async () => {
    const user = userEvent.setup();
    const line = emptyIngredientLine({
      ingredientId: "00000000-0000-4000-8000-000000000001",
      ingredientName: "Olive oil",
      quantity: 0,
      unitId: DEFAULT_UNIT_ID,
    });

    render(<ControlledEditor initial={[line]} />);

    expect(screen.queryByTestId("ingredient-line-error-0")).toBeNull();

    await user.click(screen.getByTestId("force-validate"));

    expect(screen.getByTestId("ingredient-line-error-0")).toBeInTheDocument();
    expect(screen.getByTestId("ingredient-line-error-0").textContent).toMatch(
      /quantity/i,
    );
  });

  it("shows merge suggestion on duplicate-name CONFLICT and accepts it", async () => {
    const user = userEvent.setup();
    const existingId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const onCreate = vi.fn().mockResolvedValue({
      ok: false,
      conflict: true,
      existingId,
      existingName: "olive oil",
      message: 'Ingredient name already exists: "Olive Oil"',
    } satisfies CreateIngredientResult);

    render(
      <ControlledEditor
        onCreate={onCreate}
        searchResults={[]}
      />,
    );

    await user.type(screen.getByTestId("ingredient-search"), "Olive Oil");

    // no search hits â†’ create inline
    expect(screen.getByTestId("ingredient-create-inline")).toBeInTheDocument();
    await user.click(screen.getByTestId("ingredient-create-submit"));

    await waitFor(() => {
      expect(screen.getByTestId("ingredient-merge-suggestion")).toBeInTheDocument();
    });
    expect(screen.getByTestId("ingredient-merge-suggestion")).toHaveTextContent(
      /already exists/i,
    );

    await user.click(screen.getByTestId("ingredient-merge-accept"));

    await waitFor(() => {
      expect(screen.getByTestId("ingredient-line-edit-0")).toHaveTextContent(
        "olive oil",
      );
    });
    expect(screen.queryByTestId("ingredient-merge-suggestion")).toBeNull();
  });
});
```

### FILE: apps/web/src/components/recipes/FoodSafetyProfileEditor.test.tsx

```tsx
/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { FoodSafetyProfileEditor } from "./FoodSafetyProfileEditor";

describe("FoodSafetyProfileEditor admin gate", () => {
  it("hides safety editor form for non-admin (read-only only)", () => {
    render(
      <FoodSafetyProfileEditor
        isAdmin={false}
        value={{
          mercury: {
            fda_category: "Best Choices",
            recommended_frequency: "2â€“3 / week",
          },
        }}
        onChange={vi.fn()}
      />,
    );

    expect(screen.queryByTestId("safety-editor")).toBeNull();
    expect(screen.getByTestId("safety-admin-only-badge")).toBeInTheDocument();
    expect(screen.getByTestId("safety-readonly")).toBeInTheDocument();
    expect(screen.getByTestId("safety-note-callout")).toBeInTheDocument();
  });

  it("shows structured mercury + contaminant editor for admin", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(
      <FoodSafetyProfileEditor
        isAdmin
        value={{ mercury: { fda_category: "Good Choices" } }}
        onChange={onChange}
      />,
    );

    expect(screen.getByTestId("safety-editor")).toBeInTheDocument();
    expect(screen.queryByTestId("safety-admin-only-badge")).toBeNull();

    await user.selectOptions(
      screen.getByTestId("safety-mercury-fda"),
      "Best Choices",
    );
    expect(onChange).toHaveBeenCalled();
    const last = onChange.mock.calls.at(-1)?.[0] as {
      mercury?: { fda_category?: string };
    };
    expect(last.mercury?.fda_category).toBe("Best Choices");

    await user.type(screen.getByTestId("safety-add-contaminant-key"), "lead");
    await user.click(screen.getByTestId("safety-add-contaminant"));
    const added = onChange.mock.calls.at(-1)?.[0] as Record<string, unknown>;
    expect(added).toHaveProperty("lead");
  });
});
```

