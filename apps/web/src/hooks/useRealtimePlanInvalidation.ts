"use client";

/**
 * Notify-then-refetch realtime wiring for meal plans (DB PRD v0.4 §7).
 *
 * Clients subscribe to postgres_changes on meal_plan* tables but treat
 * events ONLY as invalidation signals. On any event: debounce 250ms, then
 * invalidate TanStack Query caches for the visible range and refetch via
 * normal RLS-filtered tRPC queries.
 *
 * NEVER render payload data from the realtime event itself.
 */
import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { useTRPC } from "@/trpc/client";

export type DateRange = {
  start: string;
  end: string;
};

const MEAL_PLAN_TABLES = [
  "meal_plan",
  "meal_plan_assignment",
  "meal_plan_household",
  "meal_plan_portion_requirement",
] as const;

const DEBOUNCE_MS = 250;

/**
 * Subscribe to meal_plan* changes and invalidate listRange + proteinRollup
 * for the given visible range (and any byId caches).
 */
export function useRealtimePlanInvalidation(range: DateRange | null) {
  const queryClient = useQueryClient();
  const trpc = useTRPC();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rangeRef = useRef(range);
  rangeRef.current = range;

  useEffect(() => {
    if (!range) return;

    const supabase = createClient();

    const invalidate = () => {
      const r = rangeRef.current;
      if (!r) return;

      // Invalidate only through query keys — never touch event payloads.
      void queryClient.invalidateQueries({
        queryKey: trpc.mealPlan.listRange.queryKey({
          start: r.start,
          end: r.end,
        }),
      });
      void queryClient.invalidateQueries({
        queryKey: trpc.mealPlan.proteinRollup.queryKey({
          start: r.start,
          end: r.end,
        }),
      });
      // Broad byId / list invalidation so open editors refresh safely.
      void queryClient.invalidateQueries({
        predicate: (q) => {
          const key = q.queryKey;
          if (!Array.isArray(key)) return false;
          // tRPC v11 keys typically nest path segments; match mealPlan loosely.
          return JSON.stringify(key).includes("mealPlan");
        },
      });
    };

    const schedule = () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        invalidate();
      }, DEBOUNCE_MS);
    };

    const channel = supabase.channel(`meal-plan-invalidate-${range.start}-${range.end}`);

    for (const table of MEAL_PLAN_TABLES) {
      channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table },
        // Intentionally ignore payload — notify-then-refetch only.
        () => {
          schedule();
        },
      );
    }

    channel.subscribe();

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      void supabase.removeChannel(channel);
    };
  }, [range?.start, range?.end, queryClient, trpc]);
}

/** Test seam: pure debounce scheduler used by unit tests. */
export function createDebouncedInvalidator(
  invalidate: () => void,
  debounceMs = DEBOUNCE_MS,
) {
  let timer: ReturnType<typeof setTimeout> | null = null;

  return {
    notify() {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        invalidate();
      }, debounceMs);
    },
    dispose() {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    },
  };
}
