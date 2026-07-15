import { MealPlanEditor } from "@/components/meal-plan/MealPlanEditor";

type Params = Promise<{ id: string }>;

export default async function EditPlanPage({ params }: { params: Params }) {
  const { id } = await params;
  return <MealPlanEditor planId={id} />;
}
