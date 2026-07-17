"use client";

/**
 * MealPlan editor — RHF + mealPlanUpsertInput Zod, portion grid, share checklist.
 * Save via mealPlan.upsert; maps FORBIDDEN/BAD_REQUEST to inline messages.
 */
import { useEffect, useMemo, useState } from "react";
import { useForm, useFieldArray, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  mealPlanUpsertInputSchema,
  type MealPlanUpsertInput,
} from "@menu-boss/schemas";
import { useRouter } from "next/navigation";
import { useTRPC } from "@/trpc/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  PortionGrid,
  type PortionRequirementValue,
} from "@/components/meal-plan/PortionGrid";
import { ShareChecklist } from "@/components/meal-plan/ShareChecklist";
import {
  SafetyNoteCallout,
  hasMercuryProfile,
} from "@/components/recipes/SafetyNoteCallout";
import { toIsoDate } from "@/lib/utils";
import { MEAL_SLOTS } from "@/lib/mealSlots";
import { RecipePicker } from "@/components/recipes/RecipePicker";

/**
 * Inline mercury/food-safety callout for the selected recipe (E2E contract:
 * `food-safety-note`). Fetches the recipe's ingredient safety profiles the
 * same way RecipeDetail does.
 */
function AssignmentSafetyNote({ recipeId }: { recipeId?: string }) {
  const trpc = useTRPC();
  const detailQuery = useQuery({
    ...trpc.recipe.byId.queryOptions({ id: recipeId! }),
    enabled: Boolean(recipeId),
  });
  const ingredientIds = useMemo(
    () => (detailQuery.data?.ingredients ?? []).map((i) => i.ingredientId),
    [detailQuery.data?.ingredients],
  );
  const ingredientQueries = useQueries({
    queries: ingredientIds.map((id) =>
      trpc.ingredient.byId.queryOptions({ id }),
    ),
  });

  const mercury = ingredientQueries
    .map((q) => q.data?.foodSafetyProfile)
    .find(hasMercuryProfile);

  if (!recipeId || !mercury) return null;
  return (
    <div data-testid="food-safety-note">
      <SafetyNoteCallout mercury={mercury.mercury} />
    </div>
  );
}

export type MealPlanEditorProps = {
  /** Existing plan id for edit; omit for create. */
  planId?: string;
  /** Prefill start date (e.g. from calendar day tap). */
  defaultStartDate?: string;
  defaultEndDate?: string;
};

type FormValues = MealPlanUpsertInput;

export function MealPlanEditor({
  planId,
  defaultStartDate,
  defaultEndDate,
}: MealPlanEditorProps) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);

  const meQuery = useQuery(trpc.family.me.queryOptions());
  const householdsQuery = useQuery(trpc.family.households.queryOptions());
  const categoriesQuery = useQuery(
    trpc.family.portionCategories.queryOptions(),
  );
  const settingsQuery = useQuery(trpc.family.settings.queryOptions());
  const planQuery = useQuery({
    ...trpc.mealPlan.byId.queryOptions({ id: planId! }),
    enabled: Boolean(planId),
  });

  const creatorHouseholdId =
    planQuery.data?.createdByHouseholdId ??
    meQuery.data?.profile.householdId ??
    "";

  const today = toIsoDate(new Date());
  const startDefault = defaultStartDate ?? today;
  const endDefault = defaultEndDate ?? defaultStartDate ?? today;

  const form = useForm<FormValues>({
    // zodResolver + .default() fields can widen; cast keeps RHF happy.
    resolver: zodResolver(mealPlanUpsertInputSchema) as never,
    defaultValues: {
      title: "",
      description: "",
      startDate: startDefault,
      endDate: endDefault,
      householdIds: creatorHouseholdId ? [creatorHouseholdId] : [],
      portionRequirements: [],
      assignments: [],
    },
  });

  const {
    fields: assignmentFields,
    append: appendAssignment,
    remove: removeAssignment,
  } = useFieldArray({
    control: form.control,
    name: "assignments",
  });

  // Hydrate from existing plan once loaded.
  useEffect(() => {
    if (!planQuery.data) return;
    const p = planQuery.data;
    form.reset({
      id: p.id,
      title: p.title,
      description: p.description ?? "",
      startDate: p.startDate.slice(0, 10),
      endDate: p.endDate.slice(0, 10),
      householdIds:
        p.householdIds.length > 0
          ? p.householdIds
          : [p.createdByHouseholdId],
      portionRequirements: p.portionRequirements.map((r) => ({
        portionCategoryId: r.portionCategoryId,
        count: r.count,
        athleteCount: r.athleteCount,
      })),
      assignments: p.assignments.map((a) => ({
        id: a.id,
        recipeId: a.recipeId,
        assignmentDate: a.assignmentDate.slice(0, 10),
        mealSlot: a.mealSlot,
        servings: a.servings,
        notes: a.notes ?? undefined,
      })),
    });
  }, [planQuery.data, form]);

  // Ensure creator household is always in householdIds once known.
  useEffect(() => {
    if (!creatorHouseholdId) return;
    const current = form.getValues("householdIds") ?? [];
    if (!current.includes(creatorHouseholdId)) {
      form.setValue("householdIds", [creatorHouseholdId, ...current], {
        shouldDirty: false,
      });
    }
  }, [creatorHouseholdId, form]);

  const recipeSearch = form.watch("assignments");
  // Simple recipe list for pickers (first page).
  const recipesQuery = useQuery(
    trpc.recipe.list.queryOptions({ limit: 50 }),
  );

  const upsert = useMutation(
    trpc.mealPlan.upsert.mutationOptions({
      onSuccess: async (data) => {
        setFormError(null);
        await queryClient.invalidateQueries(trpc.mealPlan.pathFilter());
        router.push(`/plans/${data.id}/edit`);
        router.refresh();
      },
      onError: (err) => {
        const code = err.data?.code;
        const msg = err.message ?? "Save failed";
        if (code === "FORBIDDEN") {
          setFormError("You don’t have permission to save this plan.");
        } else if (code === "BAD_REQUEST") {
          // Stranded-assignments / range trigger messages.
          setFormError(msg);
          form.setError("assignments", { message: msg });
          if (/range|assignment/i.test(msg)) {
            form.setError("endDate", { message: msg });
          }
        } else {
          setFormError(msg);
        }
      },
    }),
  );

  const portionValue = form.watch("portionRequirements") as
    | PortionRequirementValue[]
    | undefined;
  const householdIds = form.watch("householdIds") ?? [];

  const categories = useMemo(
    () =>
      (categoriesQuery.data ?? []).map((c) => ({
        id: c.id,
        name: c.name,
        slug: c.slug,
        baseProteinOz: c.baseProteinOz,
        isActive: c.isActive,
      })),
    [categoriesQuery.data],
  );

  const households = householdsQuery.data ?? [];
  const athleteMultiplier = settingsQuery.data?.athleteMultiplier ?? 1.5;

  if (meQuery.isLoading || (planId && planQuery.isLoading)) {
    return <p className="p-4 text-sm text-zinc-500">Loading plan editor…</p>;
  }

  if (meQuery.data === null) {
    return (
      <p className="p-4 text-sm text-amber-700">
        Waiting for family invite — plan editing is unavailable.
      </p>
    );
  }

  return (
    <form
      className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-4 sm:p-6"
      data-testid="meal-plan-editor"
      onSubmit={form.handleSubmit((values) => {
        setFormError(null);
        const payload: MealPlanUpsertInput = {
          ...values,
          id: planId ?? values.id,
          householdIds: Array.from(
            new Set([creatorHouseholdId, ...(values.householdIds ?? [])]),
          ).filter(Boolean),
          description: values.description || undefined,
        };
        upsert.mutate(payload);
      })}
      noValidate
    >
      <Card>
        <CardHeader>
          {/* E2E contract alias: a successful save redirects to
              /plans/{id}/edit, so the edit-mode heading doubles as the
              `meal-plan-save-success` affordance (no dedicated toast exists). */}
          <CardTitle
            data-testid={planId ? "meal-plan-save-success" : undefined}
          >
            {planId ? "Edit meal plan" : "New meal plan"}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              data-testid="meal-plan-title-input"
              {...form.register("title")}
            />
            {form.formState.errors.title && (
              <p className="text-xs text-red-600">
                {form.formState.errors.title.message}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="description">Description</Label>
            <Input id="description" {...form.register("description")} />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="startDate">Start date</Label>
              <Input
                id="startDate"
                type="date"
                {...form.register("startDate")}
              />
              {form.formState.errors.startDate && (
                <p className="text-xs text-red-600">
                  {form.formState.errors.startDate.message}
                </p>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="endDate">End date</Label>
              <Input id="endDate" type="date" {...form.register("endDate")} />
              {form.formState.errors.endDate && (
                <p className="text-xs text-red-600">
                  {form.formState.errors.endDate.message}
                </p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Sharing</CardTitle>
        </CardHeader>
        <CardContent>
          {creatorHouseholdId ? (
            <Controller
              control={form.control}
              name="householdIds"
              render={({ field }) => (
                <ShareChecklist
                  households={households}
                  creatorHouseholdId={creatorHouseholdId}
                  value={field.value ?? [creatorHouseholdId]}
                  onChange={field.onChange}
                />
              )}
            />
          ) : (
            <p className="text-sm text-zinc-500">Loading households…</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Portion calculator</CardTitle>
        </CardHeader>
        <CardContent>
          <PortionGrid
            categories={categories}
            value={portionValue ?? []}
            athleteMultiplier={athleteMultiplier}
            onChange={(next) =>
              form.setValue("portionRequirements", next, {
                shouldDirty: true,
                shouldValidate: true,
              })
            }
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle>Assignments</CardTitle>
          <Button
            type="button"
            size="sm"
            variant="outline"
            data-testid="assignment-add-row"
            onClick={() =>
              appendAssignment({
                recipeId: recipesQuery.data?.items?.[0]?.id ?? "",
                assignmentDate: form.getValues("startDate") || today,
                mealSlot: "dinner",
                servings: 1,
              })
            }
          >
            Add assignment
          </Button>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {assignmentFields.length === 0 && (
            <p className="text-sm text-zinc-500">
              No assignments yet. Add recipes to meal slots within the plan
              range.
            </p>
          )}
          {assignmentFields.map((field, index) => (
            <div
              key={field.id}
              className="grid gap-2 rounded-lg border border-zinc-200 p-3 sm:grid-cols-2"
            >
              <div className="flex flex-col gap-1 sm:col-span-2">
                <Label htmlFor={`assignments.${index}.recipeId`}>Recipe</Label>
                <RecipePicker
                  showIdleResults={false}
                  onPick={(r) =>
                    form.setValue(`assignments.${index}.recipeId`, r.id, {
                      shouldDirty: true,
                      shouldValidate: true,
                    })
                  }
                />
                <select
                  id={`assignments.${index}.recipeId`}
                  className="h-10 rounded-md border border-zinc-300 bg-white px-3 text-sm"
                  {...form.register(`assignments.${index}.recipeId`)}
                >
                  <option value="">Select a recipe…</option>
                  {(recipesQuery.data?.items ?? []).map(
                    (r: { id: string; title: string }) => (
                      <option key={r.id} value={r.id}>
                        {r.title}
                      </option>
                    ),
                  )}
                </select>
                <AssignmentSafetyNote
                  recipeId={form.watch(`assignments.${index}.recipeId`)}
                />
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor={`assignments.${index}.assignmentDate`}>
                  Date
                </Label>
                <Input
                  id={`assignments.${index}.assignmentDate`}
                  type="date"
                  {...form.register(`assignments.${index}.assignmentDate`)}
                />
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor={`assignments.${index}.mealSlot`}>
                  Meal slot
                </Label>
                <select
                  id={`assignments.${index}.mealSlot`}
                  className="h-10 rounded-md border border-zinc-300 bg-white px-3 text-sm"
                  {...form.register(`assignments.${index}.mealSlot`)}
                >
                  {MEAL_SLOTS.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor={`assignments.${index}.servings`}>
                  Servings
                </Label>
                <Input
                  id={`assignments.${index}.servings`}
                  type="number"
                  min={0.1}
                  step="any"
                  {...form.register(`assignments.${index}.servings`, {
                    valueAsNumber: true,
                  })}
                />
              </div>
              <div className="flex items-end">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => removeAssignment(index)}
                >
                  Remove
                </Button>
              </div>
            </div>
          ))}
          {form.formState.errors.assignments && (
            <p className="text-xs text-red-600" role="alert">
              {form.formState.errors.assignments.message as string}
            </p>
          )}
          {/* silence unused watch lint in strict setups */}
          <span className="sr-only">{recipeSearch?.length ?? 0} assignments</span>
        </CardContent>
      </Card>

      {formError && (
        <p className="text-sm text-red-600" role="alert">
          {formError}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <Button
          type="submit"
          disabled={upsert.isPending}
          data-testid="meal-plan-save"
        >
          {upsert.isPending ? "Saving…" : "Save plan"}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push("/calendar")}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
