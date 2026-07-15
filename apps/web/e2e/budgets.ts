/**
 * Product PRD §12 performance budgets (P1–P5) — single source of truth for E2E.
 * Specs import these numbers so budgets are never hard-coded in assertions twice.
 */

export const PERF_BUDGETS = {
  /** P1 — Calendar week view interactive (warm run) */
  P1_CALENDAR_INTERACTIVE_MS: 1_500,
  /** P2 — Shopping-list generation ready for render */
  P2_SHOPPING_LIST_MS: 2_000,
  /** P3 — Portion live-preview recompute (Vitest micro-benchmark) */
  P3_PORTION_PREVIEW_MS: 100,
  /** P4 — Search results first page after settled keystrokes */
  P4_SEARCH_RESULTS_MS: 500,
  /** P5 — Realtime shared-plan propagation end-to-end */
  P5_REALTIME_PROPAGATION_MS: 2_000,
} as const;

export type BudgetId = keyof typeof PERF_BUDGETS;

/** Hard-fail threshold: 2× budget (soft warning is logged at 1×). */
export function hardFailMs(budgetMs: number): number {
  return budgetMs * 2;
}

/**
 * Log raw timing always; soft-warn at budget; hard-fail (throw) at 2×.
 * Use inside Playwright `expect` wrappers or plain throws.
 */
export function assertPerfBudget(
  budgetId: string,
  actualMs: number,
  budgetMs: number,
): void {
  const hard = hardFailMs(budgetMs);
  // Always log raw timing for CI flakiness forensics.
  // eslint-disable-next-line no-console
  console.log(
    `[perf] §12 ${budgetId}: ${actualMs.toFixed(1)}ms (budget ${budgetMs}ms, hard ${hard}ms)`,
  );

  if (actualMs > hard) {
    throw new Error(
      `§12 ${budgetId} HARD FAIL: ${actualMs.toFixed(1)}ms exceeds 2× budget (${hard}ms; budget ${budgetMs}ms)`,
    );
  }

  if (actualMs > budgetMs) {
    // Soft-fail: warning only — does not fail the suite.
    // eslint-disable-next-line no-console
    console.warn(
      `§12 ${budgetId} SOFT WARNING: ${actualMs.toFixed(1)}ms exceeds budget ${budgetMs}ms (hard fail at ${hard}ms)`,
    );
  }
}
