import { MealPlanEditor } from "@/components/meal-plan/MealPlanEditor";

type SearchParams = Promise<{ start?: string; end?: string }>;

export default async function NewPlanPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sp = await searchParams;
  return (
    <MealPlanEditor
      defaultStartDate={sp.start}
      defaultEndDate={sp.end}
    />
  );
}
