"use client";

/**
 * Plan → calendar-event mapping, extracted from CalendarDashboard so the
 * dashboard, band week view, and day planner share one event shape.
 */
import { useMemo } from "react";
import { parse } from "date-fns";

/** Structural subset of mealPlan.listRange items the calendar consumes. */
export type CalendarPlanLite = {
  id: string;
  title: string;
  isShared: boolean;
  startDate: string;
  endDate: string;
  assignments?:
    | {
        id: string;
        assignmentDate: string;
        mealSlot: string;
        recipeTitle?: string | null;
      }[]
    | null;
};

export type CalendarAssignmentEvent = {
  id: string;
  title: string;
  start: Date;
  end: Date;
  allDay: boolean;
  resource: {
    planId: string;
    planTitle: string;
    isShared: boolean;
    mealSlot: string;
    recipeTitle: string;
    assignmentId: string;
  };
};

export function plansToEvents(
  plans: CalendarPlanLite[],
): CalendarAssignmentEvent[] {
  const out: CalendarAssignmentEvent[] = [];
  for (const plan of plans) {
    const assignments = plan.assignments ?? [];
    for (const a of assignments) {
      const day = parse(a.assignmentDate.slice(0, 10), "yyyy-MM-dd", new Date());
      out.push({
        id: a.id,
        title: `${a.mealSlot}: ${a.recipeTitle ?? "Recipe"}`,
        start: day,
        end: day,
        allDay: true,
        resource: {
          planId: plan.id,
          planTitle: plan.title,
          isShared: plan.isShared,
          mealSlot: a.mealSlot,
          recipeTitle: a.recipeTitle ?? "Recipe",
          assignmentId: a.id,
        },
      });
    }
    // Plans with no assignments still appear as a span marker on start day.
    if (assignments.length === 0) {
      const day = parse(plan.startDate.slice(0, 10), "yyyy-MM-dd", new Date());
      out.push({
        id: `plan-${plan.id}`,
        title: plan.title,
        start: day,
        end: day,
        allDay: true,
        resource: {
          planId: plan.id,
          planTitle: plan.title,
          isShared: plan.isShared,
          mealSlot: "",
          recipeTitle: plan.title,
          assignmentId: "",
        },
      });
    }
  }
  return out;
}

export function useCalendarEvents(
  plans: CalendarPlanLite[] | undefined,
): CalendarAssignmentEvent[] {
  return useMemo(() => plansToEvents(plans ?? []), [plans]);
}
