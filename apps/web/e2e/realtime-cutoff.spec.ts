/**
 * Scenario 11 — Realtime parity / unshare cutoff
 * ============================================================================
 * SECURITY CRITICAL — pgTAP cannot exercise the Realtime path
 * (see supabase/tests/rls/README.md). This suite is the product gate.
 * ============================================================================
 * Assertions:
 * 1. Positive parity: member_b subscribed to meal_plan (+ children) for a plan
 *    shared A→B receives an event when member_a edits.
 * 2. Unshare cutoff: after B is unshared, member_b receives NO further events
 *    for subsequent edits (collector polled over a 5 s window).
 * 3. Belt-and-braces: member_b refetch of the plan returns zero rows (notify-
 *    then-refetch fallback is safe even if an event leaked).
 * 4. member_c control: subscribed from the start, receives NO INSERT/UPDATE
 *    events at any point (those are WALRUS/RLS-filtered per subscriber).
 *    Platform caveat: Supabase Realtime CANNOT RLS-filter DELETE events (the
 *    row is gone before policies can run), so DELETEs broadcast to every
 *    table subscriber carrying ONLY replica-identity (PK) columns. member_c
 *    therefore MAY observe the unshare's meal_plan_household DELETE as
 *    id-metadata; the assertion pins that to identifier-only payloads —
 *    any content field, or any other table's DELETE, still fails as a leak.
 *
 * ⚠ If assertion 2 fails on the real stack:
 *    - Treat it as a SECURITY finding, not a flake.
 *    - App notify-then-refetch design (Task 11) remains the guaranteed safety
 *      net: clients must NEVER render event payloads — only invalidate + refetch
 *      through RLS-filtered queries.
 * ============================================================================
 * Pure @supabase/supabase-js integration (no browser). Kept in Playwright for
 * env reuse (E2E_SUPABASE_URL, global-setup auth users). No service role.
 * No page.waitForTimeout — expect.poll only.
 */
import { expect, test } from "@playwright/test";
import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import { PERSONAS } from "./personas";
import { e2eDescribe } from "./helpers/describe";
import { signInAs } from "./helpers/supabase";

type ChangeEvent = {
  table: string;
  eventType: string;
  at: number;
  /** Raw payload rows so leak assertions can inspect exactly what arrived. */
  newRow?: Record<string, unknown>;
  oldRow?: Record<string, unknown>;
};

async function subscribePlanTables(
  client: SupabaseClient,
  channelName: string,
  collector: ChangeEvent[],
  planIdFilter?: string,
): Promise<RealtimeChannel> {
  // Filter is best-effort; RLS still governs delivery. We also post-filter
  // by plan id in the collector when payload includes it.
  let channel = client.channel(channelName);

  const tables = [
    "meal_plan",
    "meal_plan_household",
    "meal_plan_portion_requirement",
    "meal_plan_assignment",
  ] as const;

  for (const table of tables) {
    channel = channel.on(
      "postgres_changes",
      { event: "*", schema: "public", table },
      (payload) => {
        const row = (payload.new ?? payload.old) as
          | Record<string, unknown>
          | undefined;
        const rowPlanId =
          (row?.id as string | undefined) ??
          (row?.meal_plan_id as string | undefined);
        if (planIdFilter && rowPlanId && rowPlanId !== planIdFilter) {
          return;
        }
        // meal_plan row uses id; if filter set and we cannot resolve, still record
        // for meal_plan updates where id matches filter via payload
        if (
          planIdFilter &&
          table === "meal_plan" &&
          row?.id &&
          row.id !== planIdFilter
        ) {
          return;
        }
        collector.push({
          table,
          eventType: payload.eventType,
          at: Date.now(),
          newRow: payload.new as Record<string, unknown> | undefined,
          oldRow: payload.old as Record<string, unknown> | undefined,
        });
      },
    );
  }

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error(`channel ${channelName} subscribe timeout`)),
      15_000,
    );
    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        clearTimeout(timeout);
        resolve();
      }
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        clearTimeout(timeout);
        reject(new Error(`channel ${channelName} status=${status}`));
      }
    });
  });

  return channel;
}

async function createSharedPlan(memberA: SupabaseClient): Promise<string> {
  const title = `E2E Realtime Cutoff ${Date.now()}`;
  const start = "2099-03-01";
  const end = "2099-03-07";

  const { data, error } = await memberA.rpc("meal_plan_create_or_update", {
    p_payload: {
      title,
      startDate: start,
      endDate: end,
      householdIds: [
        PERSONAS.member_a.householdId,
        PERSONAS.member_b.householdId,
      ],
      portionRequirements: [],
      assignments: [],
    },
  });
  if (error) throw new Error(`createSharedPlan: ${error.message}`);
  return data as string;
}

e2eDescribe("Scenario 11 realtime unshare cutoff", () => {
  test("parity → unshare cutoff → refetch zero → member_c silent", async () => {
    const memberA = await signInAs("member_a");
    const memberB = await signInAs("member_b");
    const memberC = await signInAs("member_c");

    const planId = await createSharedPlan(memberA);

    const eventsB: ChangeEvent[] = [];
    const eventsC: ChangeEvent[] = [];

    const channelB = await subscribePlanTables(
      memberB,
      `e2e-b-${planId}`,
      eventsB,
      planId,
    );
    const channelC = await subscribePlanTables(
      memberC,
      `e2e-c-${planId}`,
      eventsC,
      planId,
    );

    try {
      // ---- 1. Positive parity: member_a edit → member_b receives event ----
      // SUBSCRIBED acks the channel join, but the postgres_changes
      // subscription registers in the database a beat later — a single
      // immediate edit can slip past the WAL poller and never be delivered.
      // Retry-edit until the first event proves the subscription is live;
      // any received edit event satisfies the parity assertion.
      const beforeParity = eventsB.length;
      let parityDelivered = false;
      for (let attempt = 1; attempt <= 5 && !parityDelivered; attempt++) {
        const { error: editErr } = await memberA
          .from("meal_plan")
          .update({ title: `E2E Parity Edit ${attempt} ${Date.now()}` })
          .eq("id", planId);
        if (editErr) throw new Error(`parity edit ${attempt}: ${editErr.message}`);

        try {
          await expect
            .poll(() => eventsB.length, {
              timeout: 2_000,
              intervals: [100, 200, 400],
            })
            .toBeGreaterThan(beforeParity);
          parityDelivered = true;
        } catch {
          // subscription not live yet — edit again
        }
      }
      expect(
        parityDelivered,
        "Scenario 11 assertion 1: member_b must receive realtime event on shared-plan edit (5 attempts)",
      ).toBe(true);

      // member_c must still be silent for RLS-filterable event types
      expect(
        eventsC.filter((e) => e.eventType !== "DELETE"),
        "Scenario 11 assertion 4 (during parity): member_c must receive no INSERT/UPDATE events",
      ).toHaveLength(0);

      // ---- 2. Unshare B, then edit again; B must receive no further events ----
      const { error: unshareErr, count: unshareCount } = await memberA
        .from("meal_plan_household")
        .delete({ count: "exact" })
        .eq("meal_plan_id", planId)
        .eq("household_id", PERSONAS.member_b.householdId);
      if (unshareErr) throw new Error(`unshare: ${unshareErr.message}`);
      if (unshareCount === 0) {
        throw new Error("unshare deleted 0 rows — membership missing?");
      }

      // Drain unshare-related events (membership DELETE may still fire once).
      // Snapshot baseline after collector stabilizes (no new events for 400ms).
      let stableAt = Date.now();
      let lastLen = eventsB.length;
      await expect
        .poll(
          () => {
            if (eventsB.length !== lastLen) {
              lastLen = eventsB.length;
              stableAt = Date.now();
            }
            return Date.now() - stableAt >= 400 ? "stable" : "draining";
          },
          { timeout: 3000, intervals: [100, 150] },
        )
        .toBe("stable");
      const afterUnshareBaseline = eventsB.length;

      const { error: postUnshareEditErr } = await memberA
        .from("meal_plan")
        .update({ title: `E2E Post-Unshare Edit ${Date.now()}` })
        .eq("id", planId);
      if (postUnshareEditErr) {
        throw new Error(`post-unshare edit: ${postUnshareEditErr.message}`);
      }

      // Poll collector over a 5 s window — length must stay flat.
      // SECURITY: if this fails, file as SECURITY finding, not flake.
      const windowStart = Date.now();
      await expect
        .poll(
          () => {
            const elapsed = Date.now() - windowStart;
            const leaked = eventsB.length - afterUnshareBaseline;
            if (leaked > 0) {
              return `LEAK:${leaked}`;
            }
            return elapsed >= 5000 ? "CLEAN" : "WAITING";
          },
          {
            timeout: 6000,
            intervals: [200, 400, 500],
            message:
              "SECURITY (Scenario 11 assertion 2): member_b received realtime events after unshare — notify-then-refetch is the app safety net, but this is a security finding",
          },
        )
        .toBe("CLEAN");

      expect(
        eventsB.length,
        "SECURITY: no further member_b events after unshare + edit (5s window)",
      ).toBe(afterUnshareBaseline);

      // ---- 3. Belt-and-braces refetch: zero rows for member_b ----
      const { data: bRows, error: bSelectErr } = await memberB
        .from("meal_plan")
        .select("id")
        .eq("id", planId);
      if (bSelectErr) throw new Error(`member_b refetch: ${bSelectErr.message}`);
      expect(
        bRows ?? [],
        "Scenario 11 assertion 3: member_b refetch must return zero rows after unshare",
      ).toHaveLength(0);

      // ---- 4. member_c: no RLS-filterable events; DELETEs id-metadata only ----
      const cNonDelete = eventsC.filter((e) => e.eventType !== "DELETE");
      expect(
        cNonDelete,
        `Scenario 11 assertion 4: member_c control must receive no INSERT/UPDATE events (got ${JSON.stringify(cNonDelete)})`,
      ).toHaveLength(0);

      // DELETE broadcasts are unavoidable (not RLS-filtered — see header).
      // They must be the unshare's membership row only, and must carry ONLY
      // replica-identity columns — any content field is a real leak.
      const IDENTIFIER_COLS = new Set(["id", "meal_plan_id", "household_id"]);
      for (const e of eventsC.filter((ev) => ev.eventType === "DELETE")) {
        expect(
          e.table,
          `SECURITY: member_c saw a DELETE on ${e.table} — only meal_plan_household unshare DELETEs are expected`,
        ).toBe("meal_plan_household");
        expect(
          Object.keys(e.newRow ?? {}),
          "SECURITY: DELETE payload must carry no new-row data",
        ).toHaveLength(0);
        const contentCols = Object.keys(e.oldRow ?? {}).filter(
          (k) => !IDENTIFIER_COLS.has(k),
        );
        expect(
          contentCols,
          `SECURITY: member_c DELETE payload leaked content columns: ${contentCols.join(", ")}`,
        ).toHaveLength(0);
      }
    } finally {
      await memberB.removeChannel(channelB);
      await memberC.removeChannel(channelC);
      // Best-effort cleanup (soft-delete) as member_a
      await memberA
        .from("meal_plan")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", planId);
    }
  });
});
