/**
 * Explicit snake_case (DB) ↔ camelCase (TS) mapping for recipe domain.
 * No ORM. Dumb field renames only.
 */

export type RecipeRow = {
  id: string;
  title: string;
  description: string | null;
  instructions: unknown;
  prep_time_minutes: number | null;
  cook_time_minutes: number | null;
  total_time_minutes: number | null;
  yield_servings: number;
  source_url: string | null;
  source_book: string | null;
  created_by_user_id: string | null;
  is_template: boolean;
  make_again_rating: number | null;
  leftover_decay_path: unknown;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type RecipeIngredientRow = {
  id: string;
  recipe_id: string;
  ingredient_id: string;
  quantity: number;
  unit_id: string;
  preparation_note: string | null;
  sequence_order: number;
  is_optional: boolean;
  created_at: string;
};

export type RecipeDto = {
  id: string;
  title: string;
  description: string | null;
  instructions: unknown;
  prepTimeMinutes: number | null;
  cookTimeMinutes: number | null;
  totalTimeMinutes: number | null;
  yieldServings: number;
  sourceUrl: string | null;
  sourceBook: string | null;
  createdByUserId: string | null;
  isTemplate: boolean;
  makeAgainRating: number | null;
  leftoverDecayPath: unknown;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  isDeleted: boolean;
};

export type RecipeIngredientDto = {
  id: string;
  recipeId: string;
  ingredientId: string;
  quantity: number;
  unitId: string;
  preparationNote: string | null;
  sequenceOrder: number;
  isOptional: boolean;
  createdAt: string;
};

export function mapRecipeRow(row: RecipeRow): RecipeDto {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    instructions: row.instructions,
    prepTimeMinutes: row.prep_time_minutes,
    cookTimeMinutes: row.cook_time_minutes,
    totalTimeMinutes: row.total_time_minutes,
    yieldServings: Number(row.yield_servings),
    sourceUrl: row.source_url,
    sourceBook: row.source_book,
    createdByUserId: row.created_by_user_id,
    isTemplate: row.is_template,
    makeAgainRating: row.make_again_rating,
    leftoverDecayPath: row.leftover_decay_path,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
    isDeleted: row.deleted_at != null,
  };
}

export function mapRecipeIngredientRow(
  row: RecipeIngredientRow,
): RecipeIngredientDto {
  return {
    id: row.id,
    recipeId: row.recipe_id,
    ingredientId: row.ingredient_id,
    quantity: Number(row.quantity),
    unitId: row.unit_id,
    preparationNote: row.preparation_note,
    sequenceOrder: row.sequence_order,
    isOptional: row.is_optional,
    createdAt: row.created_at,
  };
}

/** Partial insert/update payload for recipe table from camelCase input. */
export function recipeWriteFields(input: {
  title?: string;
  description?: string;
  instructions?: unknown;
  prepTimeMinutes?: number;
  cookTimeMinutes?: number;
  totalTimeMinutes?: number;
  yieldServings?: number;
  sourceUrl?: string;
  sourceBook?: string;
  isTemplate?: boolean;
  makeAgainRating?: number;
  leftoverDecayPath?: unknown;
}): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (input.title !== undefined) out.title = input.title;
  if (input.description !== undefined) out.description = input.description;
  if (input.instructions !== undefined) out.instructions = input.instructions;
  if (input.prepTimeMinutes !== undefined)
    out.prep_time_minutes = input.prepTimeMinutes;
  if (input.cookTimeMinutes !== undefined)
    out.cook_time_minutes = input.cookTimeMinutes;
  if (input.totalTimeMinutes !== undefined)
    out.total_time_minutes = input.totalTimeMinutes;
  if (input.yieldServings !== undefined)
    out.yield_servings = input.yieldServings;
  if (input.sourceUrl !== undefined)
    out.source_url = input.sourceUrl === "" ? null : input.sourceUrl;
  if (input.sourceBook !== undefined) out.source_book = input.sourceBook;
  if (input.isTemplate !== undefined) out.is_template = input.isTemplate;
  if (input.makeAgainRating !== undefined)
    out.make_again_rating = input.makeAgainRating;
  if (input.leftoverDecayPath !== undefined)
    out.leftover_decay_path = input.leftoverDecayPath;
  return out;
}
