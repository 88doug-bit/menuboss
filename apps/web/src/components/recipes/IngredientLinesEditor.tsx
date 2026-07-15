/**
 * Recipe ingredient lines: search picker, quantity/unit/prep/optional,
 * sequence reorder, inline create + CONFLICT merge suggestion (§8.1 AC).
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
  /** Create ingredient (name + default unit). Parent maps CONFLICT → merge. */
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
          No ingredient lines yet — search or create an ingredient below.
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
            placeholder="Type to search or create…"
            className="mt-1 w-full rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm"
          />
        </label>

        {searchLoading ? (
          <p className="text-xs text-zinc-500">Searching…</p>
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
              No match for &ldquo;{searchQuery.trim()}&rdquo; — create it?
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
                ? "Creating…"
                : `Create “${searchQuery.trim()}”`}
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
