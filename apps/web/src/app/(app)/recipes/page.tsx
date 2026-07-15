import { RecipeBrowser } from "@/components/recipes/RecipeBrowser";

export default function RecipesPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-zinc-900">Recipes</h1>
      <RecipeBrowser />
    </div>
  );
}
