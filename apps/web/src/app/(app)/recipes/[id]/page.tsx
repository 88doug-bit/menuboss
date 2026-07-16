import { RecipeDetail } from "@/components/recipes/RecipeDetail";

type Params = Promise<{ id: string }>;

export default async function RecipeDetailPage({ params }: { params: Params }) {
  const { id } = await params;
  return <RecipeDetail recipeId={id} />;
}
