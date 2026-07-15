import { z } from "zod";
import {
  idInputSchema,
  nonEmptyTrimmed,
  paginationSchema,
  ratingSchema,
  uuidSchema,
} from "./common";

export const roleInMealSchema = z.enum([
  "main",
  "side",
  "dessert",
  "appetizer",
  "other",
]);

export const combinationRecipeInputSchema = z.object({
  recipeId: uuidSchema,
  roleInMeal: roleInMealSchema,
  sequenceOrder: z.number().int().min(0),
  notes: z.string().trim().optional(),
});

export const recipeCombinationCreateInputSchema = z.object({
  name: nonEmptyTrimmed,
  notes: z.string().trim().optional(),
  makeAgainRating: ratingSchema.optional(),
  isTemplate: z.boolean().default(false),
  /** At least one recipe required. */
  recipes: z
    .array(combinationRecipeInputSchema)
    .min(1, "combination must include at least one recipe"),
});

export const recipeCombinationUpdateInputSchema = z.object({
  id: uuidSchema,
  name: nonEmptyTrimmed.optional(),
  notes: z.string().trim().optional(),
  makeAgainRating: ratingSchema.nullable().optional(),
  isTemplate: z.boolean().optional(),
  /** When provided, replaces the full junction set. */
  recipes: z
    .array(combinationRecipeInputSchema)
    .min(1, "combination must include at least one recipe")
    .optional(),
});

export const recipeCombinationListInputSchema = paginationSchema.extend({
  q: z.string().trim().min(1).optional(),
  isTemplate: z.boolean().optional(),
  minRating: ratingSchema.optional(),
});

export const recipeCombinationRateInputSchema = z.object({
  id: uuidSchema,
  makeAgainRating: ratingSchema,
});

export const recipeCombinationByIdInputSchema = idInputSchema;
export const recipeCombinationSoftDeleteInputSchema = idInputSchema;

export type RoleInMeal = z.infer<typeof roleInMealSchema>;
export type CombinationRecipeInput = z.infer<typeof combinationRecipeInputSchema>;
export type RecipeCombinationCreateInput = z.infer<
  typeof recipeCombinationCreateInputSchema
>;
export type RecipeCombinationUpdateInput = z.infer<
  typeof recipeCombinationUpdateInputSchema
>;
export type RecipeCombinationListInput = z.infer<
  typeof recipeCombinationListInputSchema
>;
export type RecipeCombinationRateInput = z.infer<
  typeof recipeCombinationRateInputSchema
>;
