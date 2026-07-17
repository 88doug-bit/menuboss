import { notFound } from "next/navigation";
import { isValid, parse } from "date-fns";
import { DayPlanner } from "@/components/day-planner/DayPlanner";

type Params = Promise<{ date: string }>;

export default async function DayPlannerPage({ params }: { params: Params }) {
  const { date } = await params;
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    !isValid(parse(date, "yyyy-MM-dd", new Date()))
  ) {
    notFound();
  }
  return <DayPlanner dayIso={date} />;
}
