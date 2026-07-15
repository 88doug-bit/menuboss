import { z } from "zod";
import {
  idInputSchema,
  nonEmptyTrimmed,
  paginationSchema,
  uuidSchema,
} from "./common";

export const chefIdeaStatusSchema = z.enum([
  "idea",
  "researching",
  "tested",
  "adopted",
  "abandoned",
]);

export const chefIdeaCreateInputSchema = z.object({
  title: nonEmptyTrimmed,
  notes: z.string().trim().optional(),
  source: z.string().trim().optional(),
  status: chefIdeaStatusSchema.default("idea"),
  /** Priority 1 (highest) – 3 (lowest). */
  priority: z.number().int().min(1).max(3).optional(),
  categoryIds: z.array(uuidSchema).default([]),
  tagIds: z.array(uuidSchema).default([]),
  /** API name; maps to DB column `linked_recipe_id`. */
  convertedRecipeId: uuidSchema.optional(),
});

export const chefIdeaUpdateInputSchema = chefIdeaCreateInputSchema
  .partial()
  .extend({
    id: uuidSchema,
  });

export const chefIdeaListInputSchema = paginationSchema.extend({
  q: z.string().trim().min(1).optional(),
  status: chefIdeaStatusSchema.optional(),
  priority: z.number().int().min(1).max(3).optional(),
  categoryIds: z.array(uuidSchema).optional(),
  tagIds: z.array(uuidSchema).optional(),
});

export const chefIdeaSetStatusInputSchema = z.object({
  id: uuidSchema,
  status: chefIdeaStatusSchema,
});

/**
 * convertToRecipe: create a recipe from the idea, preserving notes/tags/
 * categories, and link convertedRecipeId (DB: linked_recipe_id).
 * Optional overrides let the cook flesh out the recipe at conversion time.
 */
export const chefIdeaConvertToRecipeInputSchema = z.object({
  id: uuidSchema,
  title: nonEmptyTrimmed.optional(),
  description: z.string().trim().optional(),
  yieldServings: z.number().positive().optional(),
});

export const chefIdeaByIdInputSchema = idInputSchema;

export type ChefIdeaStatus = z.infer<typeof chefIdeaStatusSchema>;
export type ChefIdeaCreateInput = z.infer<typeof chefIdeaCreateInputSchema>;
export type ChefIdeaUpdateInput = z.infer<typeof chefIdeaUpdateInputSchema>;
export type ChefIdeaListInput = z.infer<typeof chefIdeaListInputSchema>;
export type ChefIdeaSetStatusInput = z.infer<typeof chefIdeaSetStatusInputSchema>;
export type ChefIdeaConvertToRecipeInput = z.infer<
  typeof chefIdeaConvertToRecipeInputSchema
>;
