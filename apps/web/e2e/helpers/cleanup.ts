/**
 * E2E meal-plan cleanup (persona JWT only — no service role).
 *
 * Specs create real plans in the current week (plan-shared-meal via the UI,
 * shopping-list / perf-budgets / realtime-cutoff via RPC). Without cleanup
 * they accumulate and flood the dev calendar with "E2E …" chips. All of them
 * are created by member_a with an "E2E " title prefix, so member_a can
 * soft-delete them (household-A RLS), matching the app's delete semantics.
 *
 * Called from global-setup (pre-clean: residue from crashed runs) and
 * global-teardown (post-clean: leave the shared dev DB calendar clean).
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export async function cleanupE2EPlans(
  memberA: SupabaseClient,
  label: string,
): Promise<void> {
  const { data, error } = await memberA
    .from("meal_plan")
    .update({ deleted_at: new Date().toISOString() })
    .like("title", "E2E %")
    .is("deleted_at", null)
    .select("id");
  if (error) {
    // Cleanup must never fail the suite — report and continue.
    console.warn(`[e2e ${label}] plan cleanup failed: ${error.message}`);
    return;
  }
  console.log(`[e2e ${label}] soft-deleted ${data?.length ?? 0} E2E plan(s)`);
}
