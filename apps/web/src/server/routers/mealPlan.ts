/**
 * mealPlan router — household-visibility domain (D6 / D8).
 * Writes go through meal_plan_create_or_update RPC (atomic multi-table).
 * Auth: JWT supabase client; RLS owns authorization. No service role.
 */
import { calculateEffectiveProteinOz } from "@menu-boss/portion-calc";
import {
  mealPlanByIdInputSchema,
  mealPlanListRangeInputSchema,
  mealPlanShareInputSchema,
  mealPlanSoftDeleteInputSchema,
  mealPlanUnshareInputSchema,
  mealPlanUpsertInputSchema,
  proteinRollupQuerySchema,
  shoppingListQuerySchema,
} from "@menu-boss/schemas";
import { assertFound, throwFromPostgrest } from "../dbErrors";
import {
  authedProcedure,
  createTRPCRouter,
  type AppSupabaseClient,
} from "../trpc";
import {
  buildShoppingListDto,
  mapAssignmentRow,
  mapMealPlanRow,
  mapPortionRequirementRow,
  type MealPlanAssignmentRow,
  type MealPlanDetailDto,
  type MealPlanPortionRequirementRow,
  type MealPlanRow,
  type UnitRow,
} from "./mealPlanMapper";

type PortionCategoryRow = {
  id: string;
  slug: string;
  base_protein_oz: number;
  is_active: boolean;
};

async function loadFamilySettings(
  supabase: AppSupabaseClient,
): Promise<{ athleteMultiplier: number }> {
  const { data, error } = await supabase
    .from("family_settings")
    .select("athlete_multiplier")
    .order("id", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throwFromPostgrest(error);
  return {
    athleteMultiplier: Number(data?.athlete_multiplier ?? 1.5),
  };
}

async function loadPortionCategories(
  supabase: AppSupabaseClient,
  ids: string[],
): Promise<PortionCategoryRow[]> {
  if (ids.length === 0) return [];
  const { data, error } = await supabase
    .from("portion_category")
    .select("id, slug, base_protein_oz, is_active")
    .in("id", ids);
  if (error) throwFromPostgrest(error);
  return (data ?? []) as PortionCategoryRow[];
}

function computeEffectiveProteinOz(
  requirements: MealPlanPortionRequirementRow[],
  categories: PortionCategoryRow[],
  athleteMultiplier: number,
): number {
  if (requirements.length === 0) return 0;
  return calculateEffectiveProteinOz(
    requirements.map((r) => ({
      portionCategoryId: r.portion_category_id,
      count: Number(r.count),
      athleteCount: Number(r.athlete_count),
    })),
    categories.map((c) => ({
      id: c.id,
      slug: c.slug,
      baseProteinOz: Number(c.base_protein_oz),
      isActive: c.is_active,
    })),
    { athleteMultiplier },
  );
}

async function loadPlanDetail(
  supabase: AppSupabaseClient,
  planId: string,
): Promise<MealPlanDetailDto> {
  const { data: plan, error } = await supabase
    .from("meal_plan")
    .select("*")
    .eq("id", planId)
    .maybeSingle();
  if (error) throwFromPostgrest(error);
  assertFound(plan, "Meal plan not found");

  const { data: households, error: hhErr } = await supabase
    .from("meal_plan_household")
    .select("household_id")
    .eq("meal_plan_id", planId);
  if (hhErr) throwFromPostgrest(hhErr);

  const { data: portions, error: prErr } = await supabase
    .from("meal_plan_portion_requirement")
    .select("*")
    .eq("meal_plan_id", planId);
  if (prErr) throwFromPostgrest(prErr);

  const { data: assignments, error: asErr } = await supabase
    .from("meal_plan_assignment")
    .select("*")
    .eq("meal_plan_id", planId)
    .order("assignment_date", { ascending: true });
  if (asErr) throwFromPostgrest(asErr);

  const portionRows = (portions ?? []) as MealPlanPortionRequirementRow[];
  const categoryIds = portionRows.map((p) => p.portion_category_id);
  const [categories, settings] = await Promise.all([
    loadPortionCategories(supabase, categoryIds),
    loadFamilySettings(supabase),
  ]);

  const householdIds = (households ?? []).map(
    (h) => h.household_id as string,
  );

  return {
    ...mapMealPlanRow(plan as MealPlanRow),
    householdIds,
    isShared: householdIds.length > 1,
    portionRequirements: portionRows.map(mapPortionRequirementRow),
    assignments: ((assignments ?? []) as MealPlanAssignmentRow[]).map(
      mapAssignmentRow,
    ),
    effectiveProteinOz: computeEffectiveProteinOz(
      portionRows,
      categories,
      settings.athleteMultiplier,
    ),
  };
}

export const mealPlanRouter = createTRPCRouter({
  /**
   * Atomic create/update via meal_plan_create_or_update RPC.
   * Maps SQLSTATE 42501 → FORBIDDEN, 23514 → BAD_REQUEST.
   */
  upsert: authedProcedure
    .input(mealPlanUpsertInputSchema)
    .mutation(async ({ ctx, input }) => {
      const payload = {
        ...(input.id ? { id: input.id } : {}),
        title: input.title,
        description: input.description ?? null,
        startDate: input.startDate.slice(0, 10),
        endDate: input.endDate.slice(0, 10),
        householdIds: input.householdIds,
        portionRequirements: input.portionRequirements.map((r) => ({
          portionCategoryId: r.portionCategoryId,
          count: r.count,
          athleteCount: r.athleteCount,
        })),
        assignments: input.assignments.map((a) => ({
          ...(a.id ? { id: a.id } : {}),
          recipeId: a.recipeId,
          assignmentDate: a.assignmentDate.slice(0, 10),
          mealSlot: a.mealSlot,
          servings: a.servings,
          notes: a.notes ?? null,
        })),
      };

      const { data: planId, error } = await ctx.supabase.rpc(
        "meal_plan_create_or_update",
        { p_payload: payload },
      );
      if (error) throwFromPostgrest(error);
      assertFound(planId, "Meal plan upsert returned no id");

      return loadPlanDetail(ctx.supabase, planId as string);
    }),

  byId: authedProcedure
    .input(mealPlanByIdInputSchema)
    .query(async ({ ctx, input }) => {
      return loadPlanDetail(ctx.supabase, input.id);
    }),

  /**
   * Plans overlapping [start, end] with deleted_at IS NULL.
   * isShared derived from membership count > 1; effectiveProteinOz via portion-calc.
   */
  listRange: authedProcedure
    .input(mealPlanListRangeInputSchema)
    .query(async ({ ctx, input }) => {
      const start = input.start.slice(0, 10);
      const end = input.end.slice(0, 10);

      const { data, error } = await ctx.supabase
        .from("meal_plan")
        .select("*")
        .is("deleted_at", null)
        .lte("start_date", end)
        .gte("end_date", start)
        .order("start_date", { ascending: true });
      if (error) throwFromPostgrest(error);

      const plans = (data ?? []) as MealPlanRow[];
      if (plans.length === 0) return [];

      const planIds = plans.map((p) => p.id);

      const { data: memberships, error: mErr } = await ctx.supabase
        .from("meal_plan_household")
        .select("meal_plan_id, household_id")
        .in("meal_plan_id", planIds);
      if (mErr) throwFromPostgrest(mErr);

      const { data: portions, error: pErr } = await ctx.supabase
        .from("meal_plan_portion_requirement")
        .select("*")
        .in("meal_plan_id", planIds);
      if (pErr) throwFromPostgrest(pErr);

      // Calendar needs assignment slots inside plan day cells (Task 11).
      const { data: assignmentRows, error: aErr } = await ctx.supabase
        .from("meal_plan_assignment")
        .select("*")
        .in("meal_plan_id", planIds)
        .order("assignment_date", { ascending: true });
      if (aErr) throwFromPostgrest(aErr);

      const assignments =
        (assignmentRows ?? []) as MealPlanAssignmentRow[];
      const recipeIds = [
        ...new Set(assignments.map((a) => a.recipe_id)),
      ];
      const recipeTitleById = new Map<string, string>();
      if (recipeIds.length > 0) {
        const { data: recipes, error: rErr } = await ctx.supabase
          .from("recipe")
          .select("id, title")
          .in("id", recipeIds);
        if (rErr) throwFromPostgrest(rErr);
        for (const r of recipes ?? []) {
          recipeTitleById.set(r.id as string, r.title as string);
        }
      }

      const portionRows = (portions ?? []) as MealPlanPortionRequirementRow[];
      const categoryIds = [
        ...new Set(portionRows.map((p) => p.portion_category_id)),
      ];
      const [categories, settings] = await Promise.all([
        loadPortionCategories(ctx.supabase, categoryIds),
        loadFamilySettings(ctx.supabase),
      ]);

      const hhByPlan = new Map<string, string[]>();
      for (const m of memberships ?? []) {
        const pid = m.meal_plan_id as string;
        const list = hhByPlan.get(pid) ?? [];
        list.push(m.household_id as string);
        hhByPlan.set(pid, list);
      }

      const portionsByPlan = new Map<string, MealPlanPortionRequirementRow[]>();
      for (const pr of portionRows) {
        const list = portionsByPlan.get(pr.meal_plan_id) ?? [];
        list.push(pr);
        portionsByPlan.set(pr.meal_plan_id, list);
      }

      const assignmentsByPlan = new Map<string, MealPlanAssignmentRow[]>();
      for (const a of assignments) {
        const list = assignmentsByPlan.get(a.meal_plan_id) ?? [];
        list.push(a);
        assignmentsByPlan.set(a.meal_plan_id, list);
      }

      const mealSlotOrder = (slot: string) => {
        const order: Record<string, number> = {
          breakfast: 0,
          lunch: 1,
          dinner: 2,
          snack: 3,
        };
        return order[slot.toLowerCase()] ?? 50;
      };

      return plans.map((plan) => {
        const householdIds = hhByPlan.get(plan.id) ?? [];
        const prs = portionsByPlan.get(plan.id) ?? [];
        const planAssignments = (assignmentsByPlan.get(plan.id) ?? [])
          .slice()
          .sort((a, b) => {
            const byDate = a.assignment_date.localeCompare(b.assignment_date);
            if (byDate !== 0) return byDate;
            return mealSlotOrder(a.meal_slot) - mealSlotOrder(b.meal_slot);
          })
          .map((a) => ({
            ...mapAssignmentRow(a),
            recipeTitle: recipeTitleById.get(a.recipe_id) ?? "Recipe",
          }));
        return {
          ...mapMealPlanRow(plan),
          householdIds,
          isShared: householdIds.length > 1,
          portionRequirements: prs.map(mapPortionRequirementRow),
          assignments: planAssignments,
          effectiveProteinOz: computeEffectiveProteinOz(
            prs,
            categories,
            settings.athleteMultiplier,
          ),
        };
      });
    }),

  /**
   * Wrapper over generate_shopping_list + display-unit formatting.
   * Largest unit ≥ 1 in dimension; cross-dimension under one ingredient heading;
   * Optional group separated.
   */
  generateShoppingList: authedProcedure
    .input(shoppingListQuerySchema)
    .query(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase.rpc("generate_shopping_list", {
        p_meal_plan_ids: input.mealPlanIds,
      });
      if (error) throwFromPostgrest(error);

      const { data: units, error: uErr } = await ctx.supabase
        .from("unit")
        .select("id, name, abbreviation, dimension, factor_to_base, is_active, sort_order")
        .eq("is_active", true);
      if (uErr) throwFromPostgrest(uErr);

      return buildShoppingListDto(
        (data ?? []) as Array<{
          ingredient_id: string;
          ingredient_name: string;
          dimension: string;
          total_quantity_base: number | null;
          is_optional: boolean;
          category_name: string | null;
          source_recipe_ids: string[] | null;
          includes_deleted_recipe: boolean;
        }>,
        (units ?? []) as UnitRow[],
      );
    }),

  proteinRollup: authedProcedure
    .input(proteinRollupQuerySchema)
    .query(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase.rpc("weekly_protein_rollup", {
        p_start: input.start.slice(0, 10),
        p_end: input.end.slice(0, 10),
      });
      if (error) throwFromPostgrest(error);

      return ((data ?? []) as Array<{
        meal_plan_id: string;
        title: string;
        start_date: string;
        end_date: string;
        effective_protein_oz: number;
      }>).map((r) => ({
        mealPlanId: r.meal_plan_id,
        title: r.title,
        startDate: r.start_date,
        endDate: r.end_date,
        effectiveProteinOz: Number(r.effective_protein_oz),
      }));
    }),

  softDelete: authedProcedure
    .input(mealPlanSoftDeleteInputSchema)
    .mutation(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from("meal_plan")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", input.id)
        .is("deleted_at", null)
        .select("*")
        .maybeSingle();
      if (error) throwFromPostgrest(error);
      assertFound(data, "Meal plan not found or already deleted");
      return mapMealPlanRow(data as MealPlanRow);
    }),

  /** Single-row share — insert meal_plan_household (no RPC needed). */
  share: authedProcedure
    .input(mealPlanShareInputSchema)
    .mutation(async ({ ctx, input }) => {
      const { error } = await ctx.supabase.from("meal_plan_household").insert({
        meal_plan_id: input.mealPlanId,
        household_id: input.householdId,
        added_by_user_id: ctx.userId,
      });
      if (error) throwFromPostgrest(error);
      return loadPlanDetail(ctx.supabase, input.mealPlanId);
    }),

  /** Single-row unshare — delete meal_plan_household (creator row blocked by RLS). */
  unshare: authedProcedure
    .input(mealPlanUnshareInputSchema)
    .mutation(async ({ ctx, input }) => {
      const { error, count } = await ctx.supabase
        .from("meal_plan_household")
        .delete({ count: "exact" })
        .eq("meal_plan_id", input.mealPlanId)
        .eq("household_id", input.householdId);
      if (error) throwFromPostgrest(error);
      if (count === 0) {
        // Could be creator-row protection or missing membership — fail closed.
        assertFound(null, "Membership not found or cannot be removed");
      }
      return loadPlanDetail(ctx.supabase, input.mealPlanId);
    }),
});
