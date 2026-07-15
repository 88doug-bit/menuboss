"use client";

import { format } from "date-fns";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { CalendarAssignmentEvent } from "@/components/calendar/CalendarDashboard";
import { cn } from "@/lib/utils";

type PlanLite = {
  id: string;
  title: string;
  isShared: boolean;
  startDate: string;
  endDate: string;
};

export function DayDetailPanel({
  day,
  plans,
  events,
  onClose,
  onAddToPlan,
}: {
  day: Date;
  plans: PlanLite[];
  events: CalendarAssignmentEvent[];
  onClose: () => void;
  onAddToPlan: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="day-detail-title"
    >
      <Card className="max-h-[85vh] w-full max-w-lg overflow-auto rounded-b-none sm:rounded-xl">
        <CardHeader className="flex flex-row items-start justify-between gap-2">
          <div>
            <CardTitle id="day-detail-title">
              {format(day, "EEEE, MMM d")}
            </CardTitle>
            <p className="text-xs text-zinc-500">Meal slots & plans</p>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close">
            Close
          </Button>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={onAddToPlan}>
              Add to plan
            </Button>
          </div>

          {events.length === 0 && plans.length === 0 && (
            <p className="text-sm text-zinc-500">
              Nothing scheduled. Create a plan to get started.
            </p>
          )}

          {events.length > 0 && (
            <section>
              <h3 className="mb-2 text-sm font-medium text-zinc-800">
                Assignments
              </h3>
              <ul className="space-y-2">
                {events.map((ev) => (
                  <li
                    key={ev.id}
                    className={cn(
                      "rounded-lg border px-3 py-2 text-sm",
                      ev.resource.isShared
                        ? "border-emerald-200 bg-emerald-50"
                        : "border-zinc-200 bg-zinc-50",
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">
                        {ev.resource.mealSlot
                          ? `${ev.resource.mealSlot}: `
                          : ""}
                        {ev.resource.recipeTitle}
                      </span>
                      {ev.resource.isShared && (
                        <span className="text-xs" title="Shared">
                          👪
                        </span>
                      )}
                    </div>
                    <Link
                      href={`/plans/${ev.resource.planId}/edit`}
                      className="text-xs text-emerald-800 underline"
                    >
                      {ev.resource.planTitle}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {plans.length > 0 && (
            <section>
              <h3 className="mb-2 text-sm font-medium text-zinc-800">
                Covering plans
              </h3>
              <ul className="space-y-1">
                {plans.map((p) => (
                  <li key={p.id}>
                    <Link
                      href={`/plans/${p.id}/edit`}
                      className="text-sm text-emerald-800 underline"
                    >
                      {p.isShared ? "👪 " : ""}
                      {p.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
