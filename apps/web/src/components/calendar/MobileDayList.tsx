"use client";

import { addDays, format, isSameDay, startOfWeek } from "date-fns";
import { Button } from "@/components/ui/button";
import { cn, weekDays } from "@/lib/utils";
import type {
  CalendarAssignmentEvent,
  CalendarPlanLite,
} from "@/components/calendar/useCalendarEvents";
import { MealChip } from "@/components/calendar/MealChip";

export function MobileDayList({
  anchor,
  events,
  plans,
  onSelectDay,
  onShiftWeek,
}: {
  anchor: Date;
  events: CalendarAssignmentEvent[];
  plans: CalendarPlanLite[];
  onSelectDay: (d: Date) => void;
  onShiftWeek: (delta: number) => void;
}) {
  const weekStart = startOfWeek(anchor, { weekStartsOn: 0 });
  const days = weekDays(anchor);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <Button
          size="sm"
          variant="outline"
          onClick={() => onShiftWeek(-1)}
          aria-label="Previous week"
        >
          ← Prev
        </Button>
        <p className="text-sm font-medium text-zinc-700">
          {format(weekStart, "MMM d")} –{" "}
          {format(addDays(weekStart, 6), "MMM d, yyyy")}
        </p>
        <Button
          size="sm"
          variant="outline"
          onClick={() => onShiftWeek(1)}
          aria-label="Next week"
        >
          Next →
        </Button>
      </div>

      <ul className="flex flex-col gap-2" role="list">
        {days.map((day) => {
          const dayEvents = events.filter((e) => isSameDay(e.start, day));
          const iso = format(day, "yyyy-MM-dd");
          const covering = plans.filter(
            (p) =>
              iso >= p.startDate.slice(0, 10) && iso <= p.endDate.slice(0, 10),
          );
          return (
            <li key={iso}>
              <button
                type="button"
                className={cn(
                  "w-full rounded-xl border border-zinc-200 bg-white p-3 text-left",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600",
                  "hover:border-emerald-300",
                )}
                data-testid="calendar-day-cell"
                onClick={() => onSelectDay(day)}
                aria-label={`${format(day, "EEEE, MMM d")}: ${dayEvents.length} items`}
              >
                <div className="mb-1 flex items-baseline justify-between gap-2">
                  <span className="font-semibold text-zinc-900">
                    {format(day, "EEE MMM d")}
                  </span>
                  {covering.some((p) => p.isShared) && (
                    <span className="text-xs text-emerald-700">👪 shared</span>
                  )}
                </div>
                {dayEvents.length === 0 ? (
                  <p className="text-xs text-zinc-400">No meals planned</p>
                ) : (
                  <ul className="space-y-1">
                    {dayEvents.map((ev) => (
                      <li key={ev.id}>
                        <MealChip
                          title={ev.title}
                          planTitle={ev.resource.planTitle}
                          isShared={ev.resource.isShared}
                        />
                      </li>
                    ))}
                  </ul>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
