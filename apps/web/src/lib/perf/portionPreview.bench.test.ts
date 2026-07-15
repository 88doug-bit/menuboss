/**
 * §12 P3 — Portion live-preview recompute micro-benchmark.
 * Asserts calculateEffectiveProteinOz × 50 < 100 ms (loose gate for CI variance).
 */
import { describe, expect, it } from "vitest";
import {
  calculateEffectiveProteinOz,
  type PortionCategoryRef,
  type PortionRequirement,
} from "@menu-boss/portion-calc";

import { PERF_BUDGETS } from "../../../e2e/budgets";

const categories: PortionCategoryRef[] = [
  {
    id: "00000000-0000-4000-8000-000000000207",
    slug: "adult-male",
    baseProteinOz: 6,
    isActive: true,
  },
  {
    id: "00000000-0000-4000-8000-000000000206",
    slug: "adult-female",
    baseProteinOz: 5,
    isActive: true,
  },
  {
    id: "00000000-0000-4000-8000-000000000208",
    slug: "child",
    baseProteinOz: 3,
    isActive: true,
  },
];

function requirementsFor(i: number): PortionRequirement[] {
  return [
    {
      portionCategoryId: categories[0]!.id,
      count: 2 + (i % 3),
      athleteCount: i % 2,
    },
    {
      portionCategoryId: categories[1]!.id,
      count: 1 + (i % 2),
      athleteCount: 0,
    },
    {
      portionCategoryId: categories[2]!.id,
      count: i % 4,
      athleteCount: 0,
    },
  ];
}

describe("§12 P3 portion preview micro-benchmark", () => {
  it("50 calculateEffectiveProteinOz recomputes under 100ms", () => {
    const settings = { athleteMultiplier: 1.5 };
    // Warm JIT once
    calculateEffectiveProteinOz(requirementsFor(0), categories, settings);

    const t0 = performance.now();
    let last = 0;
    for (let i = 0; i < 50; i++) {
      last = calculateEffectiveProteinOz(
        requirementsFor(i),
        categories,
        settings,
      );
    }
    const ms = performance.now() - t0;

    // eslint-disable-next-line no-console
    console.log(
      `[perf] §12 P3_PORTION_PREVIEW: ${ms.toFixed(2)}ms for 50 recomputes (budget ${PERF_BUDGETS.P3_PORTION_PREVIEW_MS}ms)`,
    );

    expect(last).toBeGreaterThan(0);
    // Hard gate at 2× for pathological CI; primary budget is 100ms.
    expect(ms).toBeLessThan(PERF_BUDGETS.P3_PORTION_PREVIEW_MS * 2);
    // Soft primary budget — still assert < 100ms as product target.
    expect(
      ms,
      `§12 P3: ${ms.toFixed(2)}ms exceeds ${PERF_BUDGETS.P3_PORTION_PREVIEW_MS}ms budget for 50 recomputes`,
    ).toBeLessThan(PERF_BUDGETS.P3_PORTION_PREVIEW_MS);
  });
});
