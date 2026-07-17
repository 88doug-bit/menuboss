"use client";

/**
 * Menu Planner dialog (UI Increment 1 spec lines 8–16).
 *
 * Create mode: pick a meal slot (pre-selected from the band zone clicked),
 * see/choose which plan the meal attaches to (hybrid rule: one covering
 * plan → used silently, several → picker, none → auto-created single-day
 * plan, always stated visibly), pick a recipe, save.
 *
 * Change mode (clicking an existing meal): recipe picker only — updates
 * that assignment's recipe and slot.
 */
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  RecipePicker,
  type RecipePickerRecipe,
} from "@/components/recipes/RecipePicker";
import { MEAL_SLOTS } from "@/lib/mealSlots";
import {
  autoPlanTitle,
  buildDayMealPayload,
} from "@/components/day-planner/dayPlanPayload";

export type CoveringPlanLite = { id: string; title: string; isShared: boolean };

export type MealDialogProps = {
  dayIso: string;
  coveringPlans: CoveringPlanLite[];
  /** Slot pre-selected from the band zone that opened the dialog. */
  defaultSlot: string;
  /** Set to update an existing meal's recipe instead of creating one. */
  existing?: { planId: string; assignmentId: string; mealSlot: string };
  onClose: () => void;
};

const NEW_PLAN = "__new__";

export function MealDialog({
  dayIso,
  coveringPlans,
  defaultSlot,
  existing,
  onClose,
}: MealDialogProps) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [slot, setSlot] = useState(existing?.mealSlot ?? defaultSlot);
  const [planId, setPlanId] = useState<string>(() => {
    if (existing) return existing.planId;
    if (coveringPlans.length === 1) return coveringPlans[0].id;
    if (coveringPlans.length === 0) return NEW_PLAN;
    return ""; // several plans — user must choose
  });
  const [recipe, setRecipe] = useState<RecipePickerRecipe | null>(null);
  const [error, setError] = useState<string | null>(null);

  const meQuery = useQuery(trpc.family.me.queryOptions());
  const householdId = meQuery.data?.profile.householdId ?? "";

  // mealSlot is free-form in the schema — keep a non-canonical current
  // value selectable instead of showing a blank select.
  const slotOptions: string[] = MEAL_SLOTS.includes(
    slot as (typeof MEAL_SLOTS)[number],
  )
    ? [...MEAL_SLOTS]
    : [slot, ...MEAL_SLOTS];

  const needsDetail = planId !== "" && planId !== NEW_PLAN;
  const detailQuery = useQuery({
    ...trpc.mealPlan.byId.queryOptions({ id: planId }),
    enabled: needsDetail,
  });

  const upsert = useMutation(
    trpc.mealPlan.upsert.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries({
          predicate: (q) => JSON.stringify(q.queryKey).includes("mealPlan"),
        });
        onClose(); // focus returns to the day planner (spec line 9)
      },
      onError: (err) => {
        setError(
          err.data?.code === "FORBIDDEN"
            ? "You don’t have permission to change this plan."
            : (err.message ?? "Save failed."),
        );
      },
    }),
  );

  // Saving without a recipe is allowed only when it creates a new plan —
  // an "empty plan for later editing". Appending nothing to an existing
  // plan (or clearing a meal's recipe) would be a silent no-op.
  const savesEmptyPlan = !existing && !recipe && planId === NEW_PLAN;

  const canSave = useMemo(() => {
    if (upsert.isPending) return false;
    if (savesEmptyPlan) return Boolean(householdId);
    if (!recipe) return false;
    if (planId === "") return false;
    if (planId === NEW_PLAN) return Boolean(householdId);
    return Boolean(detailQuery.data);
  }, [
    upsert.isPending,
    savesEmptyPlan,
    recipe,
    planId,
    householdId,
    detailQuery.data,
  ]);

  // A silently dimmed save button is a dead end — always say why.
  const saveHint = useMemo(() => {
    if (canSave || upsert.isPending) return null;
    if ((planId === NEW_PLAN || savesEmptyPlan) && !householdId) {
      return meQuery.isLoading
        ? "Loading your household…"
        : "Waiting for family invite — saving is unavailable.";
    }
    if (!recipe) return "Pick a recipe to save.";
    if (planId === "") return "Choose a plan first.";
    if (detailQuery.isError) return "Could not load the plan — try again.";
    if (detailQuery.isLoading) return "Loading plan…";
    return null;
  }, [
    canSave,
    upsert.isPending,
    savesEmptyPlan,
    recipe,
    planId,
    householdId,
    meQuery.isLoading,
    detailQuery.isError,
    detailQuery.isLoading,
  ]);

  function save() {
    if (!recipe && !savesEmptyPlan) return;
    setError(null);
    upsert.mutate(
      buildDayMealPayload({
        detail: planId === NEW_PLAN ? null : (detailQuery.data ?? null),
        dayIso,
        mealSlot: slot,
        recipeId: recipe?.id ?? null,
        householdId,
        assignmentId: existing?.assignmentId,
      }),
    );
  }

  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="meal-dialog-title"
    >
      <Card
        className="max-h-[85vh] w-full max-w-lg overflow-auto rounded-b-none sm:rounded-xl"
        data-testid="meal-dialog"
      >
        <CardHeader className="flex flex-row items-start justify-between gap-2">
          <CardTitle id="meal-dialog-title">
            {existing ? "Menu planner — change recipe" : "Menu planner — new meal"}
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close">
            Close
          </Button>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="meal-slot">Meal</Label>
            <select
              id="meal-slot"
              data-testid="meal-dialog-slot"
              className="h-10 rounded-md border border-zinc-300 bg-white px-3 text-sm"
              value={slot}
              onChange={(e) => setSlot(e.target.value)}
            >
              {slotOptions.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          {!existing &&
            (coveringPlans.length === 0 ? (
              <p
                className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900"
                data-testid="meal-dialog-autocreate-note"
              >
                No plan covers this day — a new single-day plan “
                {autoPlanTitle(dayIso)}” will be created.
              </p>
            ) : coveringPlans.length === 1 ? (
              <p
                className="text-sm text-zinc-600"
                data-testid="meal-dialog-plan-target"
              >
                Adding to plan{" "}
                <span className="font-medium">{coveringPlans[0].title}</span>
              </p>
            ) : (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="meal-plan">Plan</Label>
                <select
                  id="meal-plan"
                  data-testid="meal-dialog-plan-select"
                  className="h-10 rounded-md border border-zinc-300 bg-white px-3 text-sm"
                  value={planId}
                  onChange={(e) => setPlanId(e.target.value)}
                >
                  <option value="">Choose a plan…</option>
                  {coveringPlans.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.isShared ? "👪 " : ""}
                      {p.title}
                    </option>
                  ))}
                  <option value={NEW_PLAN}>
                    New single-day plan “{autoPlanTitle(dayIso)}”
                  </option>
                </select>
              </div>
            ))}

          <div className="flex flex-col gap-1.5">
            <Label>Recipe</Label>
            <RecipePicker onPick={setRecipe} />
            {recipe ? (
              <p
                className="text-sm text-zinc-700"
                data-testid="meal-dialog-recipe-selected"
              >
                Selected: <span className="font-medium">{recipe.title}</span>
              </p>
            ) : null}
          </div>

          {error ? (
            <p className="text-sm text-red-600" role="alert">
              {error}
            </p>
          ) : null}

          <div className="flex flex-wrap items-center gap-2">
            <Button
              onClick={save}
              disabled={!canSave}
              data-testid="meal-dialog-save"
            >
              {upsert.isPending
                ? "Saving…"
                : savesEmptyPlan
                  ? "Save empty plan"
                  : "Save to menu plan"}
            </Button>
            <Button variant="outline" onClick={onClose}>
              Return to day planner
            </Button>
            {saveHint ? (
              <p
                className="text-xs text-zinc-500"
                data-testid="meal-dialog-save-hint"
              >
                {saveHint}
              </p>
            ) : null}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
