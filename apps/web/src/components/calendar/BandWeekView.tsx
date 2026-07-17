"use client";

/**
 * Custom react-big-calendar week view: 7 day columns × 3 day-part bands
 * (Morning / Mid-day / Evening) instead of the 24-hour time gutter — all
 * meal events are all-day, so an hour grid is dead space. Registered via
 * `views={{ week: BandWeekView, month: true }}`, which keeps rbc's own
 * toolbar (right-side Week/Month toggle, navigation) untouched.
 */
import { addDays, format, isSameDay, startOfWeek } from "date-fns";
import type { NavigateAction } from "react-big-calendar";
import {
  BANDS,
  BAND_DEFAULT_SLOT,
  BAND_LABELS,
  slotToBand,
  type Band,
} from "@/lib/mealSlots";
import type { CalendarAssignmentEvent } from "@/components/calendar/useCalendarEvents";
import { MealChip } from "@/components/calendar/MealChip";
import { cn, toIsoDate } from "@/lib/utils";

function weekDays(date: Date): Date[] {
  const start = startOfWeek(date, { weekStartsOn: 0 });
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

export type BandGroups = Map<string, Record<Band, CalendarAssignmentEvent[]>>;

/** Single pass over events; cells then do O(1) lookups. */
export function groupEventsByDayAndBand(
  events: CalendarAssignmentEvent[],
  days: Date[],
): BandGroups {
  const groups: BandGroups = new Map(
    days.map((d) => [
      toIsoDate(d),
      { morning: [], midday: [], evening: [] } as Record<
        Band,
        CalendarAssignmentEvent[]
      >,
    ]),
  );
  for (const event of events) {
    const cell = groups.get(toIsoDate(event.start));
    if (!cell) continue; // outside this week
    cell[slotToBand(event.resource.mealSlot)].push(event);
  }
  return groups;
}

type BandWeekViewProps = {
  date: Date;
  events?: CalendarAssignmentEvent[];
  onDrillDown?: (date: Date) => void;
  onSelectEvent?: (event: CalendarAssignmentEvent) => void;
};

export function BandWeekView({
  date,
  events = [],
  onDrillDown,
  onSelectEvent,
}: BandWeekViewProps) {
  const days = weekDays(date);
  const groups = groupEventsByDayAndBand(events, days);
  const today = new Date();

  return (
    <div
      className="grid h-full grid-cols-[5rem_repeat(7,minmax(0,1fr))] grid-rows-[auto_repeat(3,minmax(0,1fr))] overflow-auto"
      data-testid="calendar-band-week"
    >
      {/* Header row */}
      <div aria-hidden className="border-b border-zinc-200" />
      {days.map((day) => (
        <button
          key={toIsoDate(day)}
          type="button"
          data-testid="calendar-day-cell"
          className={cn(
            "truncate border-b border-l border-zinc-200 px-1 py-1.5 text-center text-sm hover:bg-emerald-50",
            isSameDay(day, today)
              ? "font-semibold text-emerald-800"
              : "text-zinc-700",
          )}
          onClick={() => onDrillDown?.(day)}
          aria-label={`Open day planner for ${format(day, "EEEE, MMM d")}`}
        >
          {format(day, "dd EEE")}
        </button>
      ))}

      {/* Band rows */}
      {BANDS.map((band) => (
        <div key={band} className="contents">
          <div className="border-b border-zinc-100 px-2 py-1.5 text-xs font-medium text-zinc-500">
            {BAND_LABELS[band]}
          </div>
          {days.map((day) => {
            const cellEvents = groups.get(toIsoDate(day))?.[band] ?? [];
            return (
              <div
                key={`${band}-${toIsoDate(day)}`}
                className="flex min-h-14 cursor-pointer flex-col gap-1 border-b border-l border-zinc-100 p-1 hover:bg-emerald-50/50"
                data-testid={`band-cell-${band}`}
                onClick={() => onDrillDown?.(day)}
              >
                {cellEvents.length === 0 ? (
                  // Pre-populated default slot placeholder (Breakfast /
                  // Lunch / Dinner); the cell click opens the day planner.
                  <span
                    aria-hidden
                    className="truncate px-0.5 text-[11px] capitalize text-zinc-300"
                  >
                    {BAND_DEFAULT_SLOT[band]}
                  </span>
                ) : (
                  cellEvents.map((event) => (
                    <MealChip
                      key={event.id}
                      title={event.title}
                      planTitle={event.resource.planTitle}
                      isShared={event.resource.isShared}
                      onClick={() => onSelectEvent?.(event)}
                    />
                  ))
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

// react-big-calendar custom-view contract (statics).
BandWeekView.range = (date: Date) => weekDays(date);
BandWeekView.navigate = (date: Date, action: NavigateAction) => {
  switch (action) {
    case "PREV":
      return addDays(date, -7);
    case "NEXT":
      return addDays(date, 7);
    default:
      return date;
  }
};
BandWeekView.title = (date: Date) => {
  const days = weekDays(date);
  return `${format(days[0], "MMM dd")} – ${format(days[6], "MMM dd, yyyy")}`;
};
