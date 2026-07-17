import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BandWeekView, groupEventsByDayAndBand } from "./BandWeekView";
import type { CalendarAssignmentEvent } from "./useCalendarEvents";

function event(
  id: string,
  iso: string,
  mealSlot: string,
  overrides: Partial<CalendarAssignmentEvent["resource"]> = {},
): CalendarAssignmentEvent {
  const [y, m, d] = iso.split("-").map(Number);
  const day = new Date(y, m - 1, d);
  return {
    id,
    title: `${mealSlot}: Recipe ${id}`,
    start: day,
    end: day,
    allDay: true,
    resource: {
      planId: "plan-1",
      planTitle: "Week plan",
      isShared: false,
      mealSlot,
      recipeTitle: `Recipe ${id}`,
      assignmentId: id,
      ...overrides,
    },
  };
}

// Week of Sun 2026-07-12 .. Sat 2026-07-18.
const anchor = new Date(2026, 6, 16);

describe("groupEventsByDayAndBand", () => {
  const days = BandWeekView.range(anchor);

  it("groups a single pass into day × band buckets", () => {
    const groups = groupEventsByDayAndBand(
      [
        event("a", "2026-07-16", "breakfast"),
        event("b", "2026-07-16", "dinner"),
        event("c", "2026-07-14", "lunch"),
      ],
      days,
    );
    expect(groups.get("2026-07-16")?.morning.map((e) => e.id)).toEqual(["a"]);
    expect(groups.get("2026-07-16")?.evening.map((e) => e.id)).toEqual(["b"]);
    expect(groups.get("2026-07-14")?.midday.map((e) => e.id)).toEqual(["c"]);
  });

  it("ignores events outside the week", () => {
    const groups = groupEventsByDayAndBand(
      [event("x", "2026-07-25", "dinner")],
      days,
    );
    for (const [, bands] of groups) {
      expect(bands.morning).toEqual([]);
      expect(bands.midday).toEqual([]);
      expect(bands.evening).toEqual([]);
    }
  });

  it("routes unknown slots to the midday fallback (never dropped)", () => {
    const groups = groupEventsByDayAndBand(
      [event("weird", "2026-07-16", "midnight feast"), event("blank", "2026-07-16", "")],
      days,
    );
    expect(groups.get("2026-07-16")?.midday.map((e) => e.id)).toEqual([
      "weird",
      "blank",
    ]);
  });
});

describe("BandWeekView statics (rbc custom-view contract)", () => {
  it("range returns Sun..Sat of the anchor week", () => {
    const days = BandWeekView.range(anchor);
    expect(days).toHaveLength(7);
    expect(days[0].getDay()).toBe(0);
    expect(days[0].getDate()).toBe(12);
    expect(days[6].getDate()).toBe(18);
  });

  it("navigate steps a week and holds otherwise", () => {
    expect(BandWeekView.navigate(anchor, "PREV").getDate()).toBe(9);
    expect(BandWeekView.navigate(anchor, "NEXT").getDate()).toBe(23);
    expect(BandWeekView.navigate(anchor, "TODAY").getDate()).toBe(16);
  });

  it("title spans the week", () => {
    expect(BandWeekView.title(anchor)).toBe("Jul 12 – Jul 18, 2026");
  });
});

describe("BandWeekView rendering", () => {
  it("renders chips in the matching band row and day header clicks drill down", async () => {
    const onDrillDown = vi.fn();
    const onSelectEvent = vi.fn();
    const events = [
      event("a", "2026-07-16", "breakfast"),
      event("b", "2026-07-16", "dinner", { isShared: true }),
    ];
    render(
      <BandWeekView
        date={anchor}
        events={events}
        onDrillDown={onDrillDown}
        onSelectEvent={onSelectEvent}
      />,
    );

    const morningCells = screen.getAllByTestId("band-cell-morning");
    const eveningCells = screen.getAllByTestId("band-cell-evening");
    expect(morningCells).toHaveLength(7);
    // Thursday is column index 4 (Sun-start week).
    expect(
      within(morningCells[4]).getByText(/breakfast: Recipe a/),
    ).toBeInTheDocument();
    expect(
      within(eveningCells[4]).getByText(/dinner: Recipe b/),
    ).toBeInTheDocument();

    const headers = screen.getAllByTestId("calendar-day-cell");
    expect(headers).toHaveLength(7);
    await userEvent.click(headers[4]);
    expect(onDrillDown).toHaveBeenCalledTimes(1);
    expect(onDrillDown.mock.calls[0][0].getDate()).toBe(16);

    // Chip click selects the event without also drilling down via the cell.
    await userEvent.click(
      within(eveningCells[4]).getByTestId("calendar-plan-event"),
    );
    expect(onSelectEvent).toHaveBeenCalledTimes(1);
    expect(onSelectEvent.mock.calls[0][0].id).toBe("b");
    expect(onDrillDown).toHaveBeenCalledTimes(1);
  });

  it("clicking an empty band cell drills down to that day", async () => {
    const onDrillDown = vi.fn();
    render(<BandWeekView date={anchor} events={[]} onDrillDown={onDrillDown} />);
    await userEvent.click(screen.getAllByTestId("band-cell-midday")[2]);
    expect(onDrillDown).toHaveBeenCalledTimes(1);
    expect(onDrillDown.mock.calls[0][0].getDate()).toBe(14);
  });
});
