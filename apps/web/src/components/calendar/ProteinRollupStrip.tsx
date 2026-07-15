"use client";

import { roundOz } from "@menu-boss/portion-calc";
import { cn } from "@/lib/utils";

export type ProteinRollupRow = {
  mealPlanId: string;
  title: string;
  startDate: string;
  endDate: string;
  effectiveProteinOz: number;
};

export function ProteinRollupStrip({
  rows,
  loading,
  className,
}: {
  rows: ProteinRollupRow[];
  loading?: boolean;
  className?: string;
}) {
  const total = rows.reduce((s, r) => s + r.effectiveProteinOz, 0);

  return (
    <div
      className={cn(
        "rounded-xl border border-emerald-100 bg-emerald-50/80 px-3 py-2 sm:px-4",
        className,
      )}
      data-testid="protein-rollup-strip"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-emerald-800/80">
            Weekly protein total
          </p>
          <p
            className="text-xl font-semibold tabular-nums text-emerald-900"
            data-testid="protein-rollup-total"
          >
            {loading ? "…" : `${roundOz(total)} oz`}
          </p>
        </div>
        {rows.length > 0 && (
          <details className="text-sm text-emerald-900">
            <summary className="cursor-pointer select-none font-medium">
              Breakdown by plan
            </summary>
            <ul className="mt-2 max-h-40 space-y-1 overflow-auto pr-1">
              {rows.map((r) => (
                <li
                  key={r.mealPlanId}
                  className="flex justify-between gap-4 border-t border-emerald-100/80 py-1 text-xs"
                >
                  <span className="truncate">{r.title}</span>
                  <span className="tabular-nums">
                    {roundOz(r.effectiveProteinOz)} oz
                  </span>
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </div>
  );
}
