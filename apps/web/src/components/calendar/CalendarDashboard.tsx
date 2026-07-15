"use client";

/**
 * Calendar / Meal Planning Dashboard (§9.2).
 * react-big-calendar week (default) + month; mobile day list under sm.
 * Shared vs private styling, protein rollup strip, quick actions.
 */
import { useCallback, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Calendar,
  dateFnsLocalizer,
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
  isSameDay,
} from "date-fns";
import { enUS } from "date-fns/locale";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTRPC } from "@/trpc/client";
import { useRealtimePlanInvalidation } from "@/hooks/useRealtimePlanInvalidation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ProteinRollupStrip } from "@/components/calendar/ProteinRollupStrip";
import { MobileDayList } from "@/components/calendar/MobileDayList";
import { DayDetailPanel } from "@/components/calendar/DayDetailPanel";
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
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);

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

  const events: CalendarAssignmentEvent[] = useMemo(() => {
    const plans = plansQuery.data ?? [];
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
  }, [plansQuery.data]);

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
        >
          {shared && (
            <span aria-hidden className="inline-block" title="Shared plan">
              👪
            </span>
          )}
          <span className="truncate">{event.title}</span>
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
      ? `/shopping?plans=${selectedPlanIds.join(",")}`
      : "/shopping";

  return (
    <div className="flex flex-col gap-4 p-3 sm:p-6">
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

      {/* Desktop / tablet calendar */}
      <div className="hidden sm:block">
        <div className="mb-2 flex flex-wrap gap-2">
          <Button
            size="sm"
            variant={view === "week" ? "default" : "outline"}
            onClick={() => setView("week")}
          >
            Week
          </Button>
          <Button
            size="sm"
            variant={view === "month" ? "default" : "outline"}
            onClick={() => setView("month")}
          >
            Month
          </Button>
        </div>
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
            views={["week", "month"]}
            popup
            selectable
            onSelectSlot={(slot) => {
              setSelectedDay(slot.start);
            }}
            onSelectEvent={(ev) => {
              setSelectedDay(ev.start);
            }}
            onDrillDown={(d) => setSelectedDay(d)}
            components={{ event: EventComponent }}
            eventPropGetter={eventPropGetter}
            style={{ height: "100%" }}
            messages={{
              showMore: (n) => `+${n} more`,
            }}
          />
        </div>
      </div>

      {/* Mobile vertical day list */}
      <div className="sm:hidden" data-testid="calendar-mobile">
        <MobileDayList
          anchor={date}
          events={events}
          plans={plansQuery.data ?? []}
          onSelectDay={setSelectedDay}
          onShiftWeek={(delta) => setDate((d) => addDays(d, delta * 7))}
        />
      </div>

      {plansQuery.isLoading && (
        <p className="text-sm text-zinc-500">Loading plans…</p>
      )}
      {plansQuery.isError && (
        <p className="text-sm text-red-600" role="alert">
          Could not load plans for this range.
        </p>
      )}

      {selectedDay && (
        <DayDetailPanel
          day={selectedDay}
          plans={(plansQuery.data ?? []).filter((p) => {
            const start = p.startDate.slice(0, 10);
            const end = p.endDate.slice(0, 10);
            const iso = toIsoDate(selectedDay);
            return iso >= start && iso <= end;
          })}
          events={events.filter((e) => isSameDay(e.start, selectedDay))}
          onClose={() => setSelectedDay(null)}
          onAddToPlan={() => {
            const iso = toIsoDate(selectedDay);
            router.push(`/plans/new?start=${iso}&end=${iso}`);
          }}
        />
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
