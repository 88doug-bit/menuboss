/**
 * Root app router — Wave 1 content domain + Wave 2 mealPlan + family reads.
 */
import { createTRPCRouter } from "../trpc";
import { categoryRouter } from "./category";
import { chefIdeaRouter } from "./chefIdea";
import { familyRouter } from "./family";
import { healthRouter } from "./health";
import { ingredientRouter } from "./ingredient";
import { mealPlanRouter } from "./mealPlan";
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
  mealPlan: mealPlanRouter,
  family: familyRouter,
});

export type AppRouter = typeof appRouter;
