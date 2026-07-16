import { RecipeEditor } from "@/components/recipes/RecipeEditor";

type Params = Promise<{ id: string }>;

export default async function EditRecipePage({ params }: { params: Params }) {
  const { id } = await params;
  return <RecipeEditor recipeId={id} />;
}
