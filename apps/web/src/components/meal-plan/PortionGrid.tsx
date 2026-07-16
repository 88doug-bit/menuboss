"use client";

/**
 * Portion grid: one row per PortionCategory with count / athleteCount steppers.
 * Live protein preview via @menu-boss/portion-calc (no server round-trip).
 * Deactivated categories with existing rows render read-only (D11).
 */
import { useMemo } from "react";
import {
  calculateEffectiveProteinOz,
  calculatePerCategoryBreakdown,
  roundOz,
  type PortionCategoryRef,
} from "@menu-boss/portion-calc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type PortionRequirementValue = {
  portionCategoryId: string;
  count: number;
  athleteCount: number;
};

export type PortionCategoryOption = {
  id: string;
  name: string;
  slug: string;
  baseProteinOz: number;
  isActive: boolean;
};

export type PortionGridProps = {
  categories: PortionCategoryOption[];
  value: PortionRequirementValue[];
  onChange: (next: PortionRequirementValue[]) => void;
  athleteMultiplier?: number;
  /** When true, all steppers disabled (e.g. read-only shared plan). */
  readOnly?: boolean;
  className?: string;
};

function clampAthlete(count: number, athleteCount: number): number {
  return Math.max(0, Math.min(athleteCount, count));
}

function upsertRequirement(
  rows: PortionRequirementValue[],
  portionCategoryId: string,
  patch: Partial<Pick<PortionRequirementValue, "count" | "athleteCount">>,
): PortionRequirementValue[] {
  const idx = rows.findIndex((r) => r.portionCategoryId === portionCategoryId);
  if (idx < 0) {
    const count = patch.count ?? 0;
    const athleteCount = clampAthlete(count, patch.athleteCount ?? 0);
    if (count === 0 && athleteCount === 0) return rows;
    return [...rows, { portionCategoryId, count, athleteCount }];
  }
  const current = rows[idx]!;
  const count = patch.count ?? current.count;
  const athleteCount = clampAthlete(
    count,
    patch.athleteCount ?? current.athleteCount,
  );
  if (count === 0 && athleteCount === 0) {
    return rows.filter((_, i) => i !== idx);
  }
  const next = rows.slice();
  next[idx] = { portionCategoryId, count, athleteCount };
  return next;
}

export function PortionGrid({
  categories,
  value,
  onChange,
  athleteMultiplier = 1.5,
  readOnly = false,
  className,
}: PortionGridProps) {
  const byId = useMemo(() => {
    const m = new Map(value.map((r) => [r.portionCategoryId, r]));
    return m;
  }, [value]);

  // Active categories always shown; inactive only if they have a requirement row.
  const rows = useMemo(() => {
    const active = categories.filter((c) => c.isActive);
    const inactiveWithData = categories.filter(
      (c) => !c.isActive && byId.has(c.id),
    );
    return [...active, ...inactiveWithData];
  }, [categories, byId]);

  const categoryRefs: PortionCategoryRef[] = useMemo(
    () =>
      categories.map((c) => ({
        id: c.id,
        slug: c.slug,
        baseProteinOz: c.baseProteinOz,
        isActive: c.isActive,
      })),
    [categories],
  );

  const requirements = useMemo(
    () =>
      value.map((r) => ({
        portionCategoryId: r.portionCategoryId,
        count: r.count,
        athleteCount: r.athleteCount,
      })),
    [value],
  );

  const preview = useMemo(() => {
    try {
      const settings = { athleteMultiplier };
      const total = calculateEffectiveProteinOz(
        requirements,
        categoryRefs,
        settings,
      );
      const breakdown = calculatePerCategoryBreakdown(
        requirements,
        categoryRefs,
        settings,
      );
      return { total, breakdown, error: null as string | null };
    } catch (err) {
      return {
        total: 0,
        breakdown: [],
        error: err instanceof Error ? err.message : "Preview unavailable",
      };
    }
  }, [requirements, categoryRefs, athleteMultiplier]);

  function setCount(categoryId: string, count: number) {
    if (readOnly) return;
    const nextCount = Math.max(0, count);
    onChange(
      upsertRequirement(value, categoryId, {
        count: nextCount,
      }),
    );
  }

  function setAthleteCount(categoryId: string, athleteCount: number) {
    if (readOnly) return;
    const current = byId.get(categoryId);
    const count = current?.count ?? 0;
    onChange(
      upsertRequirement(value, categoryId, {
        count,
        athleteCount: clampAthlete(count, Math.max(0, athleteCount)),
      }),
    );
  }

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div className="overflow-x-auto rounded-lg border border-zinc-200">
        <table className="w-full min-w-[28rem] text-left text-sm">
          <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
            <tr>
              <th scope="col" className="px-3 py-2 font-medium">
                Category
              </th>
              <th scope="col" className="px-3 py-2 font-medium">
                Count
              </th>
              <th scope="col" className="px-3 py-2 font-medium">
                Athletes
              </th>
              <th scope="col" className="px-3 py-2 font-medium">
                Oz
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((cat) => {
              const req = byId.get(cat.id);
              const count = req?.count ?? 0;
              const athleteCount = req?.athleteCount ?? 0;
              const deactivated = !cat.isActive;
              const rowReadOnly = readOnly || deactivated;
              const line = preview.breakdown.find(
                (b) => b.portionCategoryId === cat.id,
              );

              return (
                <tr
                  key={cat.id}
                  className={cn(
                    "border-t border-zinc-100",
                    deactivated && "bg-zinc-50/80",
                  )}
                  // E2E contract (§9.3): rows are keyed by portion CATEGORY ID
                  // (seed UUID), not slug. Slug-keyed rows remain only in the
                  // admin PortionCategoriesPanel.
                  data-testid={`portion-row-${cat.id}`}
                >
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-zinc-900">
                        {cat.name}
                      </span>
                      <span className="text-xs text-zinc-400">
                        {cat.baseProteinOz} oz
                      </span>
                      {deactivated && (
                        <Badge
                          className="border-amber-200 bg-amber-50 text-amber-800"
                          data-testid="deactivated-badge"
                        >
                          deactivated
                        </Badge>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <Stepper
                      ariaLabel={`${cat.name} count`}
                      value={count}
                      disabled={rowReadOnly}
                      onChange={(n) => setCount(cat.id, n)}
                      testId={`count-stepper-${cat.slug}`}
                      inputTestId="portion-count-input"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <Stepper
                      ariaLabel={`${cat.name} athlete count`}
                      value={athleteCount}
                      max={count}
                      disabled={rowReadOnly}
                      onChange={(n) => setAthleteCount(cat.id, n)}
                      testId={`athlete-stepper-${cat.slug}`}
                      inputTestId="portion-athlete-input"
                    />
                  </td>
                  <td className="px-3 py-2 tabular-nums text-zinc-700">
                    {line ? roundOz(line.effectiveOz) : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div
        className="flex flex-wrap items-baseline justify-between gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm"
        data-testid="portion-preview"
        aria-live="polite"
      >
        <span className="font-medium text-emerald-900">Live protein total</span>
        <span
          className="text-lg font-semibold tabular-nums text-emerald-800"
          data-testid="portion-total"
        >
          {/* E2E contract alias: `portion-live-total` is the same value as
              `portion-total` (kept — referenced by unit tests). */}
          <span data-testid="portion-live-total">
            {preview.error ? "—" : `${roundOz(preview.total)} oz`}
          </span>
        </span>
      </div>
      {preview.error && (
        <p className="text-xs text-red-600" role="alert">
          {preview.error}
        </p>
      )}
    </div>
  );
}

function Stepper({
  value,
  onChange,
  disabled,
  max,
  ariaLabel,
  testId,
  inputTestId,
}: {
  value: number;
  onChange: (n: number) => void;
  disabled?: boolean;
  max?: number;
  ariaLabel: string;
  testId?: string;
  /** data-testid for the editable value input (E2E contract). */
  inputTestId?: string;
}) {
  const atMax = max !== undefined && value >= max;

  function commitInput(raw: string) {
    const n = Number.parseInt(raw, 10);
    if (Number.isNaN(n)) {
      onChange(0);
      return;
    }
    const clamped = Math.max(0, max !== undefined ? Math.min(n, max) : n);
    onChange(clamped);
  }

  return (
    <div
      className="inline-flex items-center gap-1"
      data-testid={testId}
      role="group"
      aria-label={ariaLabel}
    >
      <Button
        type="button"
        size="icon"
        variant="outline"
        className="h-8 w-8"
        disabled={disabled || value <= 0}
        aria-label={`Decrease ${ariaLabel}`}
        onClick={() => onChange(value - 1)}
      >
        −
      </Button>
      <span
        className="min-w-8 text-center tabular-nums"
        aria-live="polite"
        data-testid={testId ? `${testId}-value` : undefined}
      >
        <input
          type="number"
          inputMode="numeric"
          min={0}
          max={max}
          aria-label={ariaLabel}
          data-testid={inputTestId}
          disabled={disabled}
          className="w-12 rounded border border-transparent bg-transparent text-center tabular-nums hover:border-zinc-200 focus:border-zinc-300 focus:outline-none disabled:opacity-50"
          value={value}
          onChange={(e) => commitInput(e.target.value)}
        />
      </span>
      <Button
        type="button"
        size="icon"
        variant="outline"
        className="h-8 w-8"
        disabled={disabled || atMax}
        aria-label={`Increase ${ariaLabel}`}
        onClick={() => onChange(value + 1)}
      >
        +
      </Button>
    </div>
  );
}

/** Pure clamp helper exported for unit tests. */
export function clampAthleteCount(count: number, athleteCount: number): number {
  return clampAthlete(count, athleteCount);
}
