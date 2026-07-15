/**
 * Shopping list screen — plan ids via ?planIds=id1,id2 (calendar handoff).
 */
"use client";

import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";

import { ShoppingListView } from "@/components/shopping/ShoppingListView";
import { EmptyState } from "@/components/shell/EmptyState";
import { useTRPC } from "@/lib/trpc/client";

function ShoppingPageInner() {
  const trpc = useTRPC();
  const searchParams = useSearchParams();
  const fromQuery = searchParams.get("planIds") ?? searchParams.get("plans") ?? "";
  const [manualIds, setManualIds] = useState("");

  const planIds = useMemo(() => {
    const raw = (fromQuery || manualIds)
      .split(/[,\s]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    return [...new Set(raw)];
  }, [fromQuery, manualIds]);

  const listQuery = useQuery({
    ...trpc.mealPlan.generateShoppingList.queryOptions({
      mealPlanIds: planIds,
    }),
    enabled: planIds.length > 0,
  });

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-zinc-900">Shopping</h1>

      {!fromQuery ? (
        <label className="block text-sm text-zinc-700">
          Meal plan ids (comma-separated)
          {/* <!-- TODO(coordinator): Task 11 calendar multi-select handoff --> */}
          <input
            data-testid="shopping-plan-ids"
            value={manualIds}
            onChange={(e) => setManualIds(e.target.value)}
            placeholder="uuid, uuid, …"
            className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
          />
        </label>
      ) : (
        <p className="text-sm text-zinc-600">
          Plans: {planIds.join(", ")}
        </p>
      )}

      {planIds.length === 0 ? (
        <EmptyState
          title="Select plans to generate a list"
          description="Open Shopping from the calendar with selected plan ids, or paste ids above. An empty list after generation is not an error."
        />
      ) : listQuery.isLoading ? (
        <p className="text-sm text-zinc-500">Generating shopping list…</p>
      ) : listQuery.isError ? (
        <p className="text-sm text-red-600" role="alert">
          Could not generate shopping list.
        </p>
      ) : listQuery.data ? (
        <ShoppingListView list={listQuery.data} planIds={planIds} />
      ) : null}
    </div>
  );
}

export default function ShoppingPage() {
  return (
    <Suspense fallback={<p className="text-sm text-zinc-500">Loading…</p>}>
      <ShoppingPageInner />
    </Suspense>
  );
}
