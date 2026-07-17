import { describe, it, expect } from "vitest";
import {
  autoPlanTitle,
  buildDayMealPayload,
  type PlanDetailForPayload,
} from "./dayPlanPayload";

const detail: PlanDetailForPayload = {
  id: "plan-1",
  title: "Week of Jul 13",
  description: null,
  startDate: "2026-07-13T00:00:00Z",
  endDate: "2026-07-19T00:00:00Z",
  createdByHouseholdId: "hh-a",
  householdIds: ["hh-a", "hh-b"],
  portionRequirements: [
    { portionCategoryId: "cat-1", count: 2, athleteCount: 1 },
  ],
  assignments: [
    {
      id: "asg-1",
      recipeId: "rec-old",
      assignmentDate: "2026-07-14T00:00:00Z",
      mealSlot: "dinner",
      servings: 2,
      notes: "double batch",
    },
  ],
};

describe("autoPlanTitle", () => {
  it("formats the day", () => {
    expect(autoPlanTitle("2026-07-16")).toBe("Thu Jul 16, 2026");
  });
});

describe("buildDayMealPayload — no covering plan (auto-create branch)", () => {
  it("creates a single-day private plan with the one assignment", () => {
    const payload = buildDayMealPayload({
      detail: null,
      dayIso: "2026-07-16",
      mealSlot: "Breakfast",
      recipeId: "rec-1",
      householdId: "hh-a",
    });
    expect(payload).toEqual({
      title: "Thu Jul 16, 2026",
      startDate: "2026-07-16",
      endDate: "2026-07-16",
      householdIds: ["hh-a"],
      portionRequirements: [],
      assignments: [
        {
          recipeId: "rec-1",
          assignmentDate: "2026-07-16",
          mealSlot: "breakfast", // normalized on write
          servings: 1,
        },
      ],
    });
    expect(payload.id).toBeUndefined();
  });

  it("creates an empty plan (no assignments) when recipeId is null", () => {
    const payload = buildDayMealPayload({
      detail: null,
      dayIso: "2026-07-16",
      mealSlot: "dinner",
      recipeId: null,
      householdId: "hh-a",
    });
    expect(payload.assignments).toEqual([]);
    expect(payload.title).toBe("Thu Jul 16, 2026");
    expect(payload.startDate).toBe("2026-07-16");
    expect(payload.endDate).toBe("2026-07-16");
  });
});

describe("buildDayMealPayload — existing plan (append branch)", () => {
  it("preserves the plan and appends a normalized assignment", () => {
    const payload = buildDayMealPayload({
      detail,
      dayIso: "2026-07-16",
      mealSlot: " LUNCH ",
      recipeId: "rec-2",
      householdId: "hh-a",
    });
    expect(payload.id).toBe("plan-1");
    expect(payload.title).toBe("Week of Jul 13");
    expect(payload.startDate).toBe("2026-07-13");
    expect(payload.endDate).toBe("2026-07-19");
    expect(payload.householdIds).toEqual(["hh-a", "hh-b"]);
    expect(payload.portionRequirements).toEqual(detail.portionRequirements);
    expect(payload.assignments).toHaveLength(2);
    // Existing assignment untouched (dates trimmed to ISO day).
    expect(payload.assignments[0]).toEqual({
      id: "asg-1",
      recipeId: "rec-old",
      assignmentDate: "2026-07-14",
      mealSlot: "dinner",
      servings: 2,
      notes: "double batch",
    });
    expect(payload.assignments[1]).toEqual({
      recipeId: "rec-2",
      assignmentDate: "2026-07-16",
      mealSlot: "lunch",
      servings: 1,
    });
  });

  it("changes nothing on an existing plan when recipeId is null (no phantom append)", () => {
    const payload = buildDayMealPayload({
      detail,
      dayIso: "2026-07-16",
      mealSlot: "lunch",
      recipeId: null,
      householdId: "hh-a",
    });
    expect(payload.assignments).toHaveLength(1);
    expect(payload.assignments[0].id).toBe("asg-1");
  });

  it("falls back to the creator household when householdIds is empty", () => {
    const payload = buildDayMealPayload({
      detail: { ...detail, householdIds: [] },
      dayIso: "2026-07-16",
      mealSlot: "dinner",
      recipeId: "rec-2",
      householdId: "hh-x",
    });
    expect(payload.householdIds).toEqual(["hh-a"]);
  });
});

describe("buildDayMealPayload — change-recipe branch", () => {
  it("updates the target assignment's recipe and slot, keeps servings", () => {
    const payload = buildDayMealPayload({
      detail,
      dayIso: "2026-07-14",
      mealSlot: "Supper",
      recipeId: "rec-new",
      householdId: "hh-a",
      assignmentId: "asg-1",
    });
    expect(payload.assignments).toHaveLength(1);
    expect(payload.assignments[0]).toEqual({
      id: "asg-1",
      recipeId: "rec-new",
      assignmentDate: "2026-07-14",
      mealSlot: "supper",
      servings: 2,
      notes: "double batch",
    });
  });

  it("leaves other assignments alone when updating one of several", () => {
    const two: PlanDetailForPayload = {
      ...detail,
      assignments: [
        ...detail.assignments,
        {
          id: "asg-2",
          recipeId: "rec-b",
          assignmentDate: "2026-07-15T00:00:00Z",
          mealSlot: "lunch",
          servings: 1,
          notes: null,
        },
      ],
    };
    const payload = buildDayMealPayload({
      detail: two,
      dayIso: "2026-07-15",
      mealSlot: "lunch",
      recipeId: "rec-new",
      householdId: "hh-a",
      assignmentId: "asg-2",
    });
    expect(payload.assignments).toHaveLength(2);
    expect(payload.assignments[0].recipeId).toBe("rec-old");
    expect(payload.assignments[1].recipeId).toBe("rec-new");
  });
});
