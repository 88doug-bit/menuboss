/**
 * Pure payload builders for creating/updating a meal from the day planner.
 * Kept free of React/tRPC so the plan-attachment rule is unit-testable:
 * an existing covering plan gets the assignment appended (or updated);
 * with no covering plan, a single-day private plan is created.
 */
import { parse, format } from "date-fns";
import type { MealPlanUpsertInput } from "@menu-boss/schemas";
import { normalizeMealSlot } from "@/lib/mealSlots";

/** Structural subset of mealPlan.byId the payload builder needs. */
export type PlanDetailForPayload = {
  id: string;
  title: string;
  description: string | null;
  startDate: string;
  endDate: string;
  createdByHouseholdId: string;
  householdIds: string[];
  portionRequirements: {
    portionCategoryId: string;
    count: number;
    athleteCount: number;
  }[];
  assignments: {
    id: string;
    recipeId: string;
    assignmentDate: string;
    mealSlot: string;
    servings: number;
    notes: string | null;
  }[];
};

/** Title for an auto-created single-day plan, e.g. "Thu Jul 16, 2026". */
export function autoPlanTitle(dayIso: string): string {
  return format(parse(dayIso, "yyyy-MM-dd", new Date()), "EEE MMM d, yyyy");
}

export function buildDayMealPayload(opts: {
  /** Existing covering plan detail, or null to auto-create a single-day plan. */
  detail: PlanDetailForPayload | null;
  dayIso: string;
  mealSlot: string;
  recipeId: string;
  /** Creator household — required when auto-creating (detail null). */
  householdId: string;
  /** When set, update this assignment's recipe/slot instead of appending. */
  assignmentId?: string;
}): MealPlanUpsertInput {
  const { detail, dayIso, recipeId, householdId, assignmentId } = opts;
  const mealSlot = normalizeMealSlot(opts.mealSlot);

  if (!detail) {
    return {
      title: autoPlanTitle(dayIso),
      startDate: dayIso,
      endDate: dayIso,
      householdIds: [householdId],
      portionRequirements: [],
      assignments: [
        { recipeId, assignmentDate: dayIso, mealSlot, servings: 1 },
      ],
    };
  }

  const assignments: MealPlanUpsertInput["assignments"] =
    detail.assignments.map((a) => ({
      id: a.id,
      recipeId: a.id === assignmentId ? recipeId : a.recipeId,
      assignmentDate: a.assignmentDate.slice(0, 10),
      mealSlot: a.id === assignmentId ? mealSlot : a.mealSlot,
      servings: a.servings,
      notes: a.notes ?? undefined,
    }));
  if (!assignmentId) {
    assignments.push({
      recipeId,
      assignmentDate: dayIso,
      mealSlot,
      servings: 1,
    });
  }

  return {
    id: detail.id,
    title: detail.title,
    description: detail.description ?? undefined,
    startDate: detail.startDate.slice(0, 10),
    endDate: detail.endDate.slice(0, 10),
    householdIds:
      detail.householdIds.length > 0
        ? detail.householdIds
        : [detail.createdByHouseholdId],
    portionRequirements: detail.portionRequirements.map((r) => ({
      portionCategoryId: r.portionCategoryId,
      count: r.count,
      athleteCount: r.athleteCount,
    })),
    assignments,
  };
}
