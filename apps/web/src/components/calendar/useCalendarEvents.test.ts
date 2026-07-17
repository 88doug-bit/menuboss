import { describe, it, expect } from "vitest";
import { plansToEvents, type CalendarPlanLite } from "./useCalendarEvents";

const basePlan: CalendarPlanLite = {
  id: "plan-1",
  title: "Week plan",
  isShared: true,
  startDate: "2026-07-13T00:00:00Z",
  endDate: "2026-07-19T00:00:00Z",
  assignments: [
    {
      id: "asg-1",
      assignmentDate: "2026-07-16T00:00:00Z",
      mealSlot: "dinner",
      recipeTitle: "Salmon Bowl",
    },
  ],
};

describe("plansToEvents", () => {
  it("maps assignments to all-day events with plan resource", () => {
    const events = plansToEvents([basePlan]);
    expect(events).toHaveLength(1);
    const e = events[0];
    expect(e.id).toBe("asg-1");
    expect(e.title).toBe("dinner: Salmon Bowl");
    expect(e.allDay).toBe(true);
    expect(e.start.getFullYear()).toBe(2026);
    expect(e.start.getMonth()).toBe(6);
    expect(e.start.getDate()).toBe(16);
    expect(e.resource).toEqual({
      planId: "plan-1",
      planTitle: "Week plan",
      isShared: true,
      mealSlot: "dinner",
      recipeTitle: "Salmon Bowl",
      assignmentId: "asg-1",
    });
  });

  it("falls back to 'Recipe' when recipeTitle is missing", () => {
    const events = plansToEvents([
      {
        ...basePlan,
        assignments: [
          { id: "asg-1", assignmentDate: "2026-07-16", mealSlot: "lunch" },
        ],
      },
    ]);
    expect(events[0].title).toBe("lunch: Recipe");
  });

  it("emits a start-day marker for plans with no assignments", () => {
    const events = plansToEvents([{ ...basePlan, assignments: [] }]);
    expect(events).toHaveLength(1);
    expect(events[0].id).toBe("plan-plan-1");
    expect(events[0].title).toBe("Week plan");
    expect(events[0].resource.assignmentId).toBe("");
    expect(events[0].start.getDate()).toBe(13);
  });

  it("handles null assignments and empty input", () => {
    expect(plansToEvents([])).toEqual([]);
    const events = plansToEvents([{ ...basePlan, assignments: null }]);
    expect(events).toHaveLength(1);
    expect(events[0].id).toBe("plan-plan-1");
  });
});
