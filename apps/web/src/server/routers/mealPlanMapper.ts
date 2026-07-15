/**
 * Explicit snake_case (DB) ↔ camelCase (TS) mapping for meal-plan domain.
 * Display-unit selection for shopping list (largest unit with qty ≥ 1).
 * No ORM. Dumb field renames + pure formatting only.
 */

export type MealPlanRow = {
  id: string;
  title: string;
  description: string | null;
  start_date: string;
  end_date: string;
  created_by_household_id: string;
  created_by_user_id: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type MealPlanAssignmentRow = {
  id: string;
  meal_plan_id: string;
  recipe_id: string;
  assignment_date: string;
  meal_slot: string;
  servings: number;
  notes: string | null;
  created_at: string;
};

export type MealPlanHouseholdRow = {
  meal_plan_id: string;
  household_id: string;
  added_by_user_id: string | null;
  created_at: string;
};

export type MealPlanPortionRequirementRow = {
  meal_plan_id: string;
  portion_category_id: string;
  count: number;
  athlete_count: number;
  updated_at: string;
};

export type UnitRow = {
  id: string;
  name: string;
  abbreviation: string;
  dimension: string;
  factor_to_base: number;
  is_active: boolean;
  sort_order: number | null;
};

export type MealPlanDto = {
  id: string;
  title: string;
  description: string | null;
  startDate: string;
  endDate: string;
  createdByHouseholdId: string;
  createdByUserId: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  isDeleted: boolean;
};

export type MealPlanAssignmentDto = {
  id: string;
  mealPlanId: string;
  recipeId: string;
  assignmentDate: string;
  mealSlot: string;
  servings: number;
  notes: string | null;
  createdAt: string;
};

export type MealPlanPortionRequirementDto = {
  mealPlanId: string;
  portionCategoryId: string;
  count: number;
  athleteCount: number;
  updatedAt: string;
};

export type MealPlanDetailDto = MealPlanDto & {
  householdIds: string[];
  isShared: boolean;
  portionRequirements: MealPlanPortionRequirementDto[];
  assignments: MealPlanAssignmentDto[];
  /** Full-precision effective oz from @menu-boss/portion-calc (not SQL). */
  effectiveProteinOz: number;
};

export type ShoppingListLineDto = {
  ingredientId: string;
  ingredientName: string;
  dimension: string;
  totalQuantityBase: number | null;
  displayQuantity: number | null;
  displayUnitAbbreviation: string | null;
  displayUnitName: string | null;
  isOptional: boolean;
  categoryName: string | null;
  sourceRecipeIds: string[];
  includesDeletedRecipe: boolean;
};

export type ShoppingListIngredientGroupDto = {
  ingredientId: string;
  ingredientName: string;
  categoryName: string | null;
  isOptional: boolean;
  lines: ShoppingListLineDto[];
};

export type ShoppingListDto = {
  required: ShoppingListIngredientGroupDto[];
  optional: ShoppingListIngredientGroupDto[];
};

export function mapMealPlanRow(row: MealPlanRow): MealPlanDto {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    startDate: row.start_date,
    endDate: row.end_date,
    createdByHouseholdId: row.created_by_household_id,
    createdByUserId: row.created_by_user_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
    isDeleted: row.deleted_at != null,
  };
}

export function mapAssignmentRow(
  row: MealPlanAssignmentRow,
): MealPlanAssignmentDto {
  return {
    id: row.id,
    mealPlanId: row.meal_plan_id,
    recipeId: row.recipe_id,
    assignmentDate: row.assignment_date,
    mealSlot: row.meal_slot,
    servings: Number(row.servings),
    notes: row.notes,
    createdAt: row.created_at,
  };
}

export function mapPortionRequirementRow(
  row: MealPlanPortionRequirementRow,
): MealPlanPortionRequirementDto {
  return {
    mealPlanId: row.meal_plan_id,
    portionCategoryId: row.portion_category_id,
    count: Number(row.count),
    athleteCount: Number(row.athlete_count),
    updatedAt: row.updated_at,
  };
}

/**
 * Display unit: among active units of the same dimension, pick the **largest**
 * unit (max factor_to_base) such that quantity_base / factor ≥ 1.
 * If none qualify, fall back to the base unit (smallest factor_to_base).
 *
 * Example: 680 g → 680/453.592 ≈ 1.5 lb.
 */
export function formatDisplayQuantity(
  totalQuantityBase: number | null,
  dimension: string,
  units: readonly UnitRow[],
): {
  displayQuantity: number | null;
  displayUnitAbbreviation: string | null;
  displayUnitName: string | null;
} {
  if (totalQuantityBase == null || !Number.isFinite(totalQuantityBase)) {
    return {
      displayQuantity: null,
      displayUnitAbbreviation: null,
      displayUnitName: null,
    };
  }

  const dimUnits = units.filter(
    (u) => u.dimension === dimension && u.is_active !== false,
  );
  if (dimUnits.length === 0) {
    return {
      displayQuantity: totalQuantityBase,
      displayUnitAbbreviation: null,
      displayUnitName: null,
    };
  }

  let best: UnitRow | null = null;
  for (const u of dimUnits) {
    const factor = Number(u.factor_to_base);
    if (!(factor > 0)) continue;
    const qty = totalQuantityBase / factor;
    if (qty >= 1) {
      if (!best || factor > Number(best.factor_to_base)) {
        best = u;
      }
    }
  }

  if (!best) {
    best = dimUnits.reduce((a, b) =>
      Number(a.factor_to_base) <= Number(b.factor_to_base) ? a : b,
    );
  }

  const raw = totalQuantityBase / Number(best.factor_to_base);
  // Two-decimal display round (680 g → 1.5 lb).
  const displayQuantity = Math.round(raw * 100) / 100;

  return {
    displayQuantity,
    displayUnitAbbreviation: best.abbreviation,
    displayUnitName: best.name,
  };
}

type RawShoppingRow = {
  ingredient_id: string;
  ingredient_name: string;
  dimension: string;
  total_quantity_base: number | null;
  is_optional: boolean;
  category_name: string | null;
  source_recipe_ids: string[] | null;
  includes_deleted_recipe: boolean;
};

/**
 * Group RPC rows: cross-dimension lines under one ingredient heading;
 * Optional group separated from required.
 */
export function buildShoppingListDto(
  rows: RawShoppingRow[],
  units: readonly UnitRow[],
): ShoppingListDto {
  type AccKey = string;
  const groupMap = new Map<
    AccKey,
    ShoppingListIngredientGroupDto
  >();

  for (const row of rows) {
    const key = `${row.ingredient_id}::${row.is_optional ? "opt" : "req"}`;
    const display = formatDisplayQuantity(
      row.total_quantity_base == null
        ? null
        : Number(row.total_quantity_base),
      row.dimension,
      units,
    );
    const line: ShoppingListLineDto = {
      ingredientId: row.ingredient_id,
      ingredientName: row.ingredient_name,
      dimension: row.dimension,
      totalQuantityBase:
        row.total_quantity_base == null
          ? null
          : Number(row.total_quantity_base),
      displayQuantity: display.displayQuantity,
      displayUnitAbbreviation: display.displayUnitAbbreviation,
      displayUnitName: display.displayUnitName,
      isOptional: row.is_optional,
      categoryName: row.category_name,
      sourceRecipeIds: row.source_recipe_ids ?? [],
      includesDeletedRecipe: row.includes_deleted_recipe,
    };

    let group = groupMap.get(key);
    if (!group) {
      group = {
        ingredientId: row.ingredient_id,
        ingredientName: row.ingredient_name,
        categoryName: row.category_name,
        isOptional: row.is_optional,
        lines: [],
      };
      groupMap.set(key, group);
    }
    group.lines.push(line);
  }

  const required: ShoppingListIngredientGroupDto[] = [];
  const optional: ShoppingListIngredientGroupDto[] = [];
  for (const g of groupMap.values()) {
    if (g.isOptional) optional.push(g);
    else required.push(g);
  }

  // Stable order: category, ingredient name
  const sortGroups = (a: ShoppingListIngredientGroupDto, b: ShoppingListIngredientGroupDto) => {
    const ca = a.categoryName ?? "";
    const cb = b.categoryName ?? "";
    if (ca !== cb) return ca.localeCompare(cb);
    return a.ingredientName.localeCompare(b.ingredientName);
  };
  required.sort(sortGroups);
  optional.sort(sortGroups);

  return { required, optional };
}
