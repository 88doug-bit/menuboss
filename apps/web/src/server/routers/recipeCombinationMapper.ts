/**
 * Explicit snake_case ↔ camelCase mapping for recipe_combination domain.
 */

export type RecipeCombinationRow = {
  id: string;
  name: string;
  notes: string | null;
  make_again_rating: number | null;
  served_date: string | null;
  meal_plan_id: string | null;
  is_template: boolean;
  created_by_user_id: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type RecipeCombinationRecipeRow = {
  recipe_combination_id: string;
  recipe_id: string;
  role_in_meal: string | null;
  sequence_order: number;
  notes: string | null;
  created_at: string;
};

export type RecipeCombinationDto = {
  id: string;
  name: string;
  notes: string | null;
  makeAgainRating: number | null;
  servedDate: string | null;
  mealPlanId: string | null;
  isTemplate: boolean;
  createdByUserId: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  isDeleted: boolean;
  recipes?: RecipeCombinationRecipeDto[];
};

export type RecipeCombinationRecipeDto = {
  recipeCombinationId: string;
  recipeId: string;
  roleInMeal: string | null;
  sequenceOrder: number;
  notes: string | null;
  createdAt: string;
};

export function mapRecipeCombinationRow(
  row: RecipeCombinationRow,
): RecipeCombinationDto {
  return {
    id: row.id,
    name: row.name,
    notes: row.notes,
    makeAgainRating: row.make_again_rating,
    servedDate: row.served_date,
    mealPlanId: row.meal_plan_id,
    isTemplate: row.is_template,
    createdByUserId: row.created_by_user_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
    isDeleted: row.deleted_at != null,
  };
}

export function mapRecipeCombinationRecipeRow(
  row: RecipeCombinationRecipeRow,
): RecipeCombinationRecipeDto {
  return {
    recipeCombinationId: row.recipe_combination_id,
    recipeId: row.recipe_id,
    roleInMeal: row.role_in_meal,
    sequenceOrder: row.sequence_order,
    notes: row.notes,
    createdAt: row.created_at,
  };
}

export function recipeCombinationWriteFields(input: {
  name?: string;
  notes?: string;
  makeAgainRating?: number | null;
  isTemplate?: boolean;
}): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (input.name !== undefined) out.name = input.name;
  if (input.notes !== undefined) out.notes = input.notes;
  if (input.makeAgainRating !== undefined)
    out.make_again_rating = input.makeAgainRating;
  if (input.isTemplate !== undefined) out.is_template = input.isTemplate;
  return out;
}
