"use client";

/**
 * Day Planner page (/day/[date], UI Increment 1 spec lines 6–11).
 * Morning / Mid-day / Evening zones for one day (same band language as the
 * calendar week view — decision 1C: no 24-hour clock). Each zone lists the
 * day's meals; "Add meal" opens the Menu Planner dialog pre-set to that
 * band's default slot; clicking a meal opens it in change-recipe mode.
 */
import { useMemo, useState } from "react";
import { addDays, format, isSameDay, parse } from "date-fns";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useTRPC } from "@/lib/trpc/client";
import { useRealtimePlanInvalidation } from "@/hooks/useRealtimePlanInvalidation";
import { Button } from "@/components/ui/button";
import { MealChip } from "@/components/calendar/MealChip";
import { useCalendarEvents } from "@/components/calendar/useCalendarEvents";
import {
  MealDialog,
  type CoveringPlanLite,
} from "@/components/day-planner/MealDialog";
import {
  BANDS,
  BAND_DEFAULT_SLOT,
  BAND_LABELS,
  slotToBand,
  type Band,
} from "@/lib/mealSlots";
import { toIsoDate } from "@/lib/utils";

type DialogState =
  | { mode: "create"; defaultSlot: string }
  | {
      mode: "change";
      planId: string;
      assignmentId: string;
      mealSlot: string;
    }
  | null;

export function DayPlanner({ dayIso }: { dayIso: string }) {
  const trpc = useTRPC();
  const router = useRouter();
  const day = useMemo(
    () => parse(dayIso, "yyyy-MM-dd", new Date()),
    [dayIso],
  );
  const [dialog, setDialog] = useState<DialogState>(null);

  const range = { start: dayIso, end: dayIso };
  useRealtimePlanInvalidation(range);
  const queryClient = useQueryClient();
  const plansQuery = useQuery(trpc.mealPlan.listRange.queryOptions(range));
  const plans = plansQuery.data ?? [];

  const softDelete = useMutation(
    trpc.mealPlan.softDelete.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries({
          predicate: (q) => JSON.stringify(q.queryKey).includes("mealPlan"),
        });
      },
    }),
  );

  // Covering plans span the day; their assignments may span other days.
  const events = useCalendarEvents(plansQuery.data).filter((e) =>
    isSameDay(e.start, day),
  );

  const byBand = useMemo(() => {
    const groups: Record<Band, typeof events> = {
      morning: [],
      midday: [],
      evening: [],
    };
    for (const event of events) {
      groups[slotToBand(event.resource.mealSlot)].push(event);
    }
    return groups;
  }, [events]);

  const coveringPlans: CoveringPlanLite[] = plans.map((p) => ({
    id: p.id,
    title: p.title,
    isShared: p.isShared,
  }));

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-3 sm:p-6" data-testid="day-planner">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-zinc-900">
            {format(day, "EEEE, MMM d, yyyy")}
          </h1>
          <p className="text-xs text-zinc-500">Day planner</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => router.push(`/day/${toIsoDate(addDays(day, -1))}`)}
            aria-label="Previous day"
          >
            ← Prev
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => router.push(`/day/${toIsoDate(addDays(day, 1))}`)}
            aria-label="Next day"
          >
            Next →
          </Button>
          <Link
            href="/calendar"
            className="inline-flex h-9 items-center rounded-md border border-zinc-300 bg-white px-3 text-sm font-medium text-zinc-900 hover:bg-zinc-50"
          >
            Calendar
          </Link>
          <Button
            size="sm"
            data-testid="calendar-add-to-plan"
            onClick={() =>
              router.push(`/plans/new?start=${dayIso}&end=${dayIso}`)
            }
          >
            New plan for this day
          </Button>
        </div>
      </header>

      {plansQuery.isLoading && (
        <p className="text-sm text-zinc-500">Loading meals…</p>
      )}
      {plansQuery.isError && (
        <p className="text-sm text-red-600" role="alert">
          Could not load this day.
        </p>
      )}

      {BANDS.map((band) => (
        <section
          key={band}
          className="rounded-xl border border-zinc-200 bg-white p-3"
          data-testid={`day-band-${band}`}
        >
          <div className="mb-2 flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-zinc-800">
              {BAND_LABELS[band]}
            </h2>
            <Button
              size="sm"
              variant="outline"
              data-testid={`day-band-add-${band}`}
              // Wait for covering plans — the dialog's plan-attachment
              // branch is chosen when it opens.
              disabled={plansQuery.isLoading}
              onClick={() =>
                setDialog({
                  mode: "create",
                  defaultSlot: BAND_DEFAULT_SLOT[band],
                })
              }
            >
              Add meal
            </Button>
          </div>
          {byBand[band].length === 0 ? (
            <p className="text-xs text-zinc-400">No meals planned</p>
          ) : (
            <ul className="space-y-1.5">
              {byBand[band].map((event) => (
                <li key={event.id} data-testid="day-meal-item">
                  <MealChip
                    title={event.title}
                    planTitle={event.resource.planTitle}
                    isShared={event.resource.isShared}
                    onClick={() => {
                      // Plan-marker events (no assignment) open the plan editor.
                      if (!event.resource.assignmentId) {
                        router.push(`/plans/${event.resource.planId}/edit`);
                        return;
                      }
                      setDialog({
                        mode: "change",
                        planId: event.resource.planId,
                        assignmentId: event.resource.assignmentId,
                        mealSlot: event.resource.mealSlot,
                      });
                    }}
                  />
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}

      {plans.length > 0 && (
        <section className="rounded-xl border border-zinc-200 bg-white p-3">
          <h2 className="mb-2 text-sm font-semibold text-zinc-800">
            Covering plans
          </h2>
          <ul className="space-y-1">
            {plans.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-2">
                <Link
                  href={`/plans/${p.id}/edit`}
                  className="text-sm text-emerald-800 underline"
                >
                  {p.isShared ? "👪 " : ""}
                  {p.title}
                </Link>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-red-700 hover:bg-red-50"
                  data-testid={`plan-delete-${p.id}`}
                  disabled={softDelete.isPending}
                  onClick={() => {
                    if (
                      window.confirm(
                        `Delete plan “${p.title}” and all its meals? This removes it from everyone's calendar.`,
                      )
                    ) {
                      softDelete.mutate({ id: p.id });
                    }
                  }}
                >
                  Delete
                </Button>
              </li>
            ))}
          </ul>
          {softDelete.isError ? (
            <p className="mt-2 text-sm text-red-600" role="alert">
              Could not delete the plan
              {softDelete.error?.message ? ` — ${softDelete.error.message}` : "."}
            </p>
          ) : null}
        </section>
      )}

      {dialog && (
        <MealDialog
          dayIso={dayIso}
          coveringPlans={coveringPlans}
          defaultSlot={dialog.mode === "create" ? dialog.defaultSlot : ""}
          existing={
            dialog.mode === "change"
              ? {
                  planId: dialog.planId,
                  assignmentId: dialog.assignmentId,
                  mealSlot: dialog.mealSlot,
                }
              : undefined
          }
          onClose={() => setDialog(null)}
        />
      )}
    </div>
  );
}
