import { z } from "zod";
import {
  idInputSchema,
  nonEmptyTrimmed,
  paginationSchema,
  uuidSchema,
} from "./common";

/**
 * Shape for a known contaminant block (e.g. mercury) and any novel
 * contaminant key accepted via catchall.
 */
export const contaminantProfileSchema = z.object({
  fda_category: z.string().optional(),
  risk_level: z.string().optional(),
  recommended_frequency: z.string().optional(),
  notes: z.string().optional(),
  source: z.string().optional(),
  last_reviewed: z.string().optional(),
});

/**
 * General food-safety guidance block (cooking temp, storage, etc.).
 * Loose object — not forced into the contaminant field set.
 */
export const generalSafetySchema = z
  .object({
    cooking_temperature: z.string().optional(),
    storage_notes: z.string().optional(),
  })
  .passthrough();

/**
 * food_safety_profile JSONB on Ingredient.
 * Known keys (`mercury`, `general`) typed; additional contaminant keys
 * allowed via catchall of the contaminant shape (lead, PFAS, …).
 */
export const foodSafetyProfileSchema = z
  .object({
    mercury: contaminantProfileSchema.optional(),
    general: generalSafetySchema.optional(),
  })
  .catchall(contaminantProfileSchema);

export const ingredientNameSchema = nonEmptyTrimmed.pipe(
  z.string().min(1).max(120, "Ingredient name must be ≤ 120 characters"),
);

export const ingredientCreateInputSchema = z.object({
  name: ingredientNameSchema,
  description: z.string().trim().optional(),
  defaultUnitId: uuidSchema.optional(),
  foodSafetyProfile: foodSafetyProfileSchema.optional(),
  categoryIds: z.array(uuidSchema).default([]),
  tagIds: z.array(uuidSchema).default([]),
  isUserAdded: z.boolean().default(true),
});

export const ingredientUpdateInputSchema = z.object({
  id: uuidSchema,
  name: ingredientNameSchema.optional(),
  description: z.string().trim().optional(),
  defaultUnitId: uuidSchema.nullable().optional(),
  categoryIds: z.array(uuidSchema).optional(),
  tagIds: z.array(uuidSchema).optional(),
});

export const ingredientListInputSchema = paginationSchema.extend({
  q: z.string().trim().min(1).optional(),
  categoryIds: z.array(uuidSchema).optional(),
  /** When true, only ingredients with a non-empty food_safety_profile. */
  hasSafetyProfile: z.boolean().optional(),
});

export const ingredientSetFoodSafetyProfileInputSchema = z.object({
  id: uuidSchema,
  foodSafetyProfile: foodSafetyProfileSchema,
});

export const ingredientByIdInputSchema = idInputSchema;
export const ingredientSoftDeleteInputSchema = idInputSchema;

export type ContaminantProfile = z.infer<typeof contaminantProfileSchema>;
export type FoodSafetyProfile = z.infer<typeof foodSafetyProfileSchema>;
export type IngredientCreateInput = z.infer<typeof ingredientCreateInputSchema>;
export type IngredientUpdateInput = z.infer<typeof ingredientUpdateInputSchema>;
export type IngredientListInput = z.infer<typeof ingredientListInputSchema>;
export type IngredientSetFoodSafetyProfileInput = z.infer<
  typeof ingredientSetFoodSafetyProfileInputSchema
>;
