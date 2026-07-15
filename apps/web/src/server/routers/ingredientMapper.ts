/**
 * Explicit snake_case ↔ camelCase mapping for ingredient domain.
 */

export type IngredientRow = {
  id: string;
  name: string;
  description: string | null;
  default_unit_id: string | null;
  nutrition_data: unknown;
  food_safety_profile: unknown;
  is_user_added: boolean;
  created_by_user_id: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type IngredientDto = {
  id: string;
  name: string;
  description: string | null;
  defaultUnitId: string | null;
  nutritionData: unknown;
  foodSafetyProfile: unknown;
  isUserAdded: boolean;
  createdByUserId: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  isDeleted: boolean;
};

export function mapIngredientRow(row: IngredientRow): IngredientDto {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    defaultUnitId: row.default_unit_id,
    nutritionData: row.nutrition_data,
    foodSafetyProfile: row.food_safety_profile,
    isUserAdded: row.is_user_added,
    createdByUserId: row.created_by_user_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
    isDeleted: row.deleted_at != null,
  };
}

export function ingredientWriteFields(input: {
  name?: string;
  description?: string;
  defaultUnitId?: string | null;
  foodSafetyProfile?: unknown;
  isUserAdded?: boolean;
}): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (input.name !== undefined) out.name = input.name;
  if (input.description !== undefined) out.description = input.description;
  if (input.defaultUnitId !== undefined)
    out.default_unit_id = input.defaultUnitId;
  if (input.foodSafetyProfile !== undefined)
    out.food_safety_profile = input.foodSafetyProfile;
  if (input.isUserAdded !== undefined) out.is_user_added = input.isUserAdded;
  return out;
}
