/**
 * Root app router — Wave 1 content domain only.
 * mealPlan / shoppingList are Wave 2 — intentionally omitted.
 */
import { createTRPCRouter } from "../trpc";
import { categoryRouter } from "./category";
import { chefIdeaRouter } from "./chefIdea";
import { healthRouter } from "./health";
import { ingredientRouter } from "./ingredient";
import { recipeRouter } from "./recipe";
import { recipeCombinationRouter } from "./recipeCombination";
import { tagRouter } from "./tag";

export const appRouter = createTRPCRouter({
  health: healthRouter,
  recipe: recipeRouter,
  ingredient: ingredientRouter,
  category: categoryRouter,
  tag: tagRouter,
  chefIdea: chefIdeaRouter,
  recipeCombination: recipeCombinationRouter,
});

export type AppRouter = typeof appRouter;
