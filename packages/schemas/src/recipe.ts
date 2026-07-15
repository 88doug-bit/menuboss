import { z } from "zod";
import {
  idInputSchema,
  nonEmptyTrimmed,
  paginationSchema,
  ratingSchema,
  uuidSchema,
} from "./common";

/** One structured instruction step (stored in recipe.instructions JSONB). */
export const instructionStepSchema = z.object({
  text: nonEmptyTrimmed,
  timerMinutes: z.number().int().min(0).optional(),
  temperature: z.string().trim().min(1).optional(),
});

/**
 * Recipe ingredient line for create/update payloads.
 * Maps to recipe_ingredient rows (not the ingredient master).
 */
export const recipeIngredientInputSchema = z.object({
  ingredientId: uuidSchema,
  quantity: z.number().positive("quantity must be > 0"),
  unitId: uuidSchema,
  preparationNote: z.string().trim().optional(),
  sequenceOrder: z.number().int().min(0),
  isOptional: z.boolean().default(false),
});

/**
 * One leftover decay-path entry (recipe.leftover_decay_path JSONB).
 * `use` is required; notes and linked recipe ids are optional.
 */
export const leftoverDecayPathEntrySchema = z.object({
  use: nonEmptyTrimmed,
  notes: z.string().trim().optional(),
  linkedRecipeIds: z.array(uuidSchema).optional(),
});

export const leftoverDecayPathSchema = z.array(leftoverDecayPathEntrySchema);

const sourceFields = {
  sourceUrl: z.string().url().optional().or(z.literal("")),
  sourceBook: z.string().trim().optional(),
};

export const recipeCreateInputSchema = z.object({
  title: nonEmptyTrimmed,
  description: z.string().trim().optional(),
  instructions: z.array(instructionStepSchema).default([]),
  prepTimeMinutes: z.number().int().min(0).optional(),
  cookTimeMinutes: z.number().int().min(0).optional(),
  totalTimeMinutes: z.number().int().min(0).optional(),
  yieldServings: z.number().positive("yieldServings must be > 0").default(1),
  sourceUrl: sourceFields.sourceUrl,
  sourceBook: sourceFields.sourceBook,
  isTemplate: z.boolean().default(false),
  makeAgainRating: ratingSchema.optional(),
  leftoverDecayPath: leftoverDecayPathSchema.default([]),
  ingredients: z.array(recipeIngredientInputSchema).default([]),
  categoryIds: z.array(uuidSchema).default([]),
  tagIds: z.array(uuidSchema).default([]),
});

export const recipeUpdateInputSchema = recipeCreateInputSchema
  .partial()
  .extend({
    id: uuidSchema,
  });

export const recipeListInputSchema = paginationSchema.extend({
  /** Full-text search query (tsvector on title + description). */
  q: z.string().trim().min(1).optional(),
  categoryIds: z.array(uuidSchema).optional(),
  tagIds: z.array(uuidSchema).optional(),
  maxTotalMinutes: z.number().int().min(0).optional(),
  minRating: ratingSchema.optional(),
});

export const recipeRateInputSchema = z.object({
  id: uuidSchema,
  makeAgainRating: ratingSchema,
});

export const recipeSetLeftoverDecayPathInputSchema = z.object({
  id: uuidSchema,
  leftoverDecayPath: leftoverDecayPathSchema,
});

export const recipeByIdInputSchema = idInputSchema;
export const recipeSoftDeleteInputSchema = idInputSchema;
export const recipeRestoreInputSchema = idInputSchema;

export type InstructionStep = z.infer<typeof instructionStepSchema>;
export type RecipeIngredientInput = z.infer<typeof recipeIngredientInputSchema>;
export type LeftoverDecayPathEntry = z.infer<typeof leftoverDecayPathEntrySchema>;
export type RecipeCreateInput = z.infer<typeof recipeCreateInputSchema>;
export type RecipeUpdateInput = z.infer<typeof recipeUpdateInputSchema>;
export type RecipeListInput = z.infer<typeof recipeListInputSchema>;
export type RecipeRateInput = z.infer<typeof recipeRateInputSchema>;
export type RecipeSetLeftoverDecayPathInput = z.infer<
  typeof recipeSetLeftoverDecayPathInputSchema
>;
