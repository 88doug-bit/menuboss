"use client";

/**
 * Calendar / Meal Planning Dashboard (§9.2, UI Increment 1).
 * Custom band week view (Morning / Mid-day / Evening) + rbc month view;
 * mobile day list under sm. Day clicks route to the /day/[date] planner.
 * Shared vs private styling, protein rollup strip, quick actions.
 */
import { cloneElement, useCallback, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Calendar,
  dateFnsLocalizer,
  type DateCellWrapperProps,
  type EventProps,
  type View,
} from "react-big-calendar";
import {
  format,
  parse,
  startOfWeek,
  getDay,
  startOfMonth,
  endOfMonth,
  endOfWeek,
  addDays,
} from "date-fns";
import { enUS } from "date-fns/locale";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTRPC } from "@/trpc/client";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { useRealtimePlanInvalidation } from "@/hooks/useRealtimePlanInvalidation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ProteinRollupStrip } from "@/components/calendar/ProteinRollupStrip";
import { MobileDayList } from "@/components/calendar/MobileDayList";
import { BandWeekView } from "@/components/calendar/BandWeekView";
import {
  useCalendarEvents,
  type CalendarAssignmentEvent,
} from "@/components/calendar/useCalendarEvents";
import { cn, toIsoDate } from "@/lib/utils";
import "react-big-calendar/lib/css/react-big-calendar.css";

const locales = { "en-US": enUS };
const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek: (d: Date) => startOfWeek(d, { weekStartsOn: 0 }),
  getDay,
  locales,
});

export type { CalendarAssignmentEvent };

/**
 * E2E testid contract (§9.3): tag each month background day cell as
 * `calendar-day-cell` by cloning react-big-calendar's own cell element —
 * no extra wrapper markup, layout, or behavior change.
 */
function DateCellWrapper({ children }: DateCellWrapperProps) {
  return cloneElement(children, {
    "data-testid": "calendar-day-cell",
  } as Record<string, unknown>);
}

function rangeForView(date: Date, view: View): { start: string; end: string } {
  if (view === "month") {
    const monthStart = startOfMonth(date);
    const monthEnd = endOfMonth(date);
    return {
      start: toIsoDate(startOfWeek(monthStart, { weekStartsOn: 0 })),
      end: toIsoDate(endOfWeek(monthEnd, { weekStartsOn: 0 })),
    };
  }
  // week (default) and day
  const weekStart = startOfWeek(date, { weekStartsOn: 0 });
  const weekEnd = endOfWeek(date, { weekStartsOn: 0 });
  return { start: toIsoDate(weekStart), end: toIsoDate(weekEnd) };
}

export function CalendarDashboard() {
  const trpc = useTRPC();
  const router = useRouter();
  const [date, setDate] = useState(() => new Date());
  const [view, setView] = useState<View>("week");
  // Mount exactly one variant (E2E strict-mode + hidden-click contract).
  const isDesktop = useMediaQuery("(min-width: 640px)");

  const range = useMemo(() => rangeForView(date, view), [date, view]);

  useRealtimePlanInvalidation(range);

  const plansQuery = useQuery(
    trpc.mealPlan.listRange.queryOptions({
      start: range.start,
      end: range.end,
    }),
  );
  const rollupQuery = useQuery(
    trpc.mealPlan.proteinRollup.queryOptions({
      start: range.start,
      end: range.end,
    }),
  );

  const events = useCalendarEvents(plansQuery.data);

  const goToDay = useCallback(
    (d: Date) => router.push(`/day/${toIsoDate(d)}`),
    [router],
  );

  const EventComponent = useCallback(
    ({ event }: EventProps<CalendarAssignmentEvent>) => {
      const shared = event.resource.isShared;
      return (
        <span
          className={cn(
            "flex items-center gap-1 truncate text-[11px] leading-tight",
            shared ? "font-semibold" : "font-normal opacity-90",
          )}
          title={`${event.resource.planTitle} — ${event.title}`}
          data-testid="calendar-plan-event"
        >
          {shared && (
            <span aria-hidden className="inline-block" title="Shared plan">
              👪
            </span>
          )}
          <span className="truncate">{event.title}</span>
          {/* E2E contract: chip text must include the plan title (visually
              unchanged — already conveyed via the title tooltip above). */}
          <span className="sr-only">{event.resource.planTitle}</span>
        </span>
      );
    },
    [],
  );

  const eventPropGetter = useCallback((event: CalendarAssignmentEvent) => {
    if (event.resource.isShared) {
      return {
        className: "mb-rbc-shared",
        style: {
          backgroundColor: "#047857",
          borderColor: "#065f46",
          color: "#fff",
        },
      };
    }
    return {
      className: "mb-rbc-private",
      style: {
        backgroundColor: "#a1a1aa",
        borderColor: "#71717a",
        color: "#fff",
      },
    };
  }, []);

  const selectedPlanIds = useMemo(
    () => (plansQuery.data ?? []).map((p) => p.id),
    [plansQuery.data],
  );

  const shoppingHref =
    selectedPlanIds.length > 0
      ? `/shopping?mealPlanIds=${selectedPlanIds.join(",")}`
      : "/shopping";

  return (
    <div
      className="flex flex-col gap-4 p-3 sm:p-6"
      data-testid="calendar-week-grid"
    >
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-zinc-900">
            Meal calendar
          </h1>
          <SharedPrivateLegend />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => router.push("/plans/new")}>New plan</Button>
          <Link
            href={shoppingHref}
            className="inline-flex h-10 items-center justify-center rounded-md border border-zinc-300 bg-white px-4 text-sm font-medium text-zinc-900 hover:bg-zinc-50"
          >
            Shopping list
          </Link>
        </div>
      </header>

      <ProteinRollupStrip
        rows={rollupQuery.data ?? []}
        loading={rollupQuery.isLoading}
      />

      {/* Desktop / tablet calendar — mounted only at ≥sm (see useMediaQuery).
          Week/Month toggle lives solely in rbc's toolbar (right side). */}
      {isDesktop === true ? (
        <div
          className="h-[min(70vh,40rem)] rounded-xl border border-zinc-200 bg-white p-2"
          data-testid="calendar-desktop"
        >
          <Calendar
            localizer={localizer}
            events={events}
            date={date}
            view={view}
            onNavigate={setDate}
            onView={setView}
            views={{ week: BandWeekView, month: true }}
            popup
            selectable
            onSelectSlot={(slot) => goToDay(slot.start)}
            onSelectEvent={(ev) => goToDay(ev.start)}
            onDrillDown={(d) => goToDay(d)}
            components={{
              event: EventComponent,
              dateCellWrapper: DateCellWrapper,
            }}
            eventPropGetter={eventPropGetter}
            style={{ height: "100%" }}
            messages={{
              showMore: (n) => `+${n} more`,
            }}
          />
        </div>
      ) : null}

      {/* Mobile vertical day list — mounted only below sm */}
      {isDesktop === false ? (
      <div data-testid="calendar-mobile">
        <MobileDayList
          anchor={date}
          events={events}
          plans={plansQuery.data ?? []}
          onSelectDay={goToDay}
          onShiftWeek={(delta) => setDate((d) => addDays(d, delta * 7))}
        />
      </div>
      ) : null}

      {plansQuery.isLoading && (
        <p className="text-sm text-zinc-500">Loading plans…</p>
      )}
      {plansQuery.isError && (
        <p className="text-sm text-red-600" role="alert">
          Could not load plans for this range.
        </p>
      )}
    </div>
  );
}

function SharedPrivateLegend() {
  return (
    <div
      className="mt-1 flex flex-wrap items-center gap-3 text-xs text-zinc-600"
      aria-label="Plan visibility legend"
    >
      <span className="inline-flex items-center gap-1.5">
        <span
          className="inline-block h-2.5 w-2.5 rounded-sm bg-emerald-700"
          aria-hidden
        />
        <span>👪 Shared family plan</span>
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span
          className="inline-block h-2.5 w-2.5 rounded-sm bg-zinc-400"
          aria-hidden
        />
        <span>Private household plan</span>
      </span>
      <Badge className="bg-transparent text-zinc-400">§9.5 visual language</Badge>
    </div>
  );
}
