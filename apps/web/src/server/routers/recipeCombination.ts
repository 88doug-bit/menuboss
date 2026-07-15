/**
 * recipeCombination router — family-global content (D7).
 * create/update manage combination + junction rows.
 */
import {
  recipeCombinationByIdInputSchema,
  recipeCombinationCreateInputSchema,
  recipeCombinationListInputSchema,
  recipeCombinationRateInputSchema,
  recipeCombinationSoftDeleteInputSchema,
  recipeCombinationUpdateInputSchema,
} from "@menu-boss/schemas";
import { assertFound, throwFromPostgrest } from "../dbErrors";
import { authedProcedure, createTRPCRouter } from "../trpc";
import {
  mapRecipeCombinationRecipeRow,
  mapRecipeCombinationRow,
  recipeCombinationWriteFields,
  type RecipeCombinationRecipeRow,
  type RecipeCombinationRow,
} from "./recipeCombinationMapper";

async function replaceCombinationRecipes(
  supabase: import("../trpc").AppSupabaseClient,
  combinationId: string,
  recipes: Array<{
    recipeId: string;
    roleInMeal: string;
    sequenceOrder: number;
    notes?: string;
  }>,
) {
  const { error: delErr } = await supabase
    .from("recipe_combination_recipe")
    .delete()
    .eq("recipe_combination_id", combinationId);
  if (delErr) throwFromPostgrest(delErr);

  if (recipes.length === 0) return;

  const rows = recipes.map((r) => ({
    recipe_combination_id: combinationId,
    recipe_id: r.recipeId,
    role_in_meal: r.roleInMeal,
    sequence_order: r.sequenceOrder,
    notes: r.notes ?? null,
  }));
  const { error: insErr } = await supabase
    .from("recipe_combination_recipe")
    .insert(rows);
  if (insErr) throwFromPostgrest(insErr);
}

export const recipeCombinationRouter = createTRPCRouter({
  list: authedProcedure
    .input(recipeCombinationListInputSchema)
    .query(async ({ ctx, input }) => {
      const limit = input.limit;
      let query = ctx.supabase
        .from("recipe_combination")
        .select("*")
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(limit + 1);

      if (input.q) {
        query = query.or(
          `name.ilike.%${input.q}%,notes.ilike.%${input.q}%`,
        );
      }
      if (input.isTemplate !== undefined) {
        query = query.eq("is_template", input.isTemplate);
      }
      if (input.minRating !== undefined) {
        query = query.gte("make_again_rating", input.minRating);
      }
      if (input.cursor) {
        query = query.lt("created_at", input.cursor);
      }

      const { data, error } = await query;
      if (error) throwFromPostgrest(error);

      const rows = (data ?? []) as RecipeCombinationRow[];
      const hasMore = rows.length > limit;
      const page = hasMore ? rows.slice(0, limit) : rows;
      const nextCursor =
        hasMore && page.length > 0
          ? page[page.length - 1]!.created_at
          : null;

      return {
        items: page.map(mapRecipeCombinationRow),
        nextCursor,
      };
    }),

  /** Detail by id — does NOT filter deleted_at. */
  byId: authedProcedure
    .input(recipeCombinationByIdInputSchema)
    .query(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from("recipe_combination")
        .select("*")
        .eq("id", input.id)
        .maybeSingle();
      if (error) throwFromPostgrest(error);
      assertFound(data, "RecipeCombination not found");

      const { data: links, error: linkErr } = await ctx.supabase
        .from("recipe_combination_recipe")
        .select("*")
        .eq("recipe_combination_id", input.id)
        .order("sequence_order", { ascending: true });
      if (linkErr) throwFromPostgrest(linkErr);

      return {
        ...mapRecipeCombinationRow(data as RecipeCombinationRow),
        recipes: ((links ?? []) as RecipeCombinationRecipeRow[]).map(
          mapRecipeCombinationRecipeRow,
        ),
      };
    }),

  create: authedProcedure
    .input(recipeCombinationCreateInputSchema)
    .mutation(async ({ ctx, input }) => {
      const fields = recipeCombinationWriteFields({
        name: input.name,
        notes: input.notes,
        makeAgainRating: input.makeAgainRating,
        isTemplate: input.isTemplate,
      });

      const { data, error } = await ctx.supabase
        .from("recipe_combination")
        .insert({
          ...fields,
          created_by_user_id: ctx.userId,
        })
        .select("*")
        .single();
      if (error) throwFromPostgrest(error);

      const row = data as RecipeCombinationRow;
      await replaceCombinationRecipes(ctx.supabase, row.id, input.recipes);

      const { data: links } = await ctx.supabase
        .from("recipe_combination_recipe")
        .select("*")
        .eq("recipe_combination_id", row.id)
        .order("sequence_order", { ascending: true });

      return {
        ...mapRecipeCombinationRow(row),
        recipes: ((links ?? []) as RecipeCombinationRecipeRow[]).map(
          mapRecipeCombinationRecipeRow,
        ),
      };
    }),

  update: authedProcedure
    .input(recipeCombinationUpdateInputSchema)
    .mutation(async ({ ctx, input }) => {
      const { id, recipes, ...rest } = input;
      const fields = recipeCombinationWriteFields(rest);

      if (Object.keys(fields).length > 0) {
        const { error } = await ctx.supabase
          .from("recipe_combination")
          .update(fields)
          .eq("id", id)
          .is("deleted_at", null);
        if (error) throwFromPostgrest(error);
      }

      if (recipes !== undefined) {
        await replaceCombinationRecipes(ctx.supabase, id, recipes);
      }

      const { data, error } = await ctx.supabase
        .from("recipe_combination")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (error) throwFromPostgrest(error);
      assertFound(data, "RecipeCombination not found");

      const { data: links } = await ctx.supabase
        .from("recipe_combination_recipe")
        .select("*")
        .eq("recipe_combination_id", id)
        .order("sequence_order", { ascending: true });

      return {
        ...mapRecipeCombinationRow(data as RecipeCombinationRow),
        recipes: ((links ?? []) as RecipeCombinationRecipeRow[]).map(
          mapRecipeCombinationRecipeRow,
        ),
      };
    }),

  rate: authedProcedure
    .input(recipeCombinationRateInputSchema)
    .mutation(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from("recipe_combination")
        .update({ make_again_rating: input.makeAgainRating })
        .eq("id", input.id)
        .is("deleted_at", null)
        .select("*")
        .maybeSingle();
      if (error) throwFromPostgrest(error);
      assertFound(data, "RecipeCombination not found");
      return mapRecipeCombinationRow(data as RecipeCombinationRow);
    }),

  softDelete: authedProcedure
    .input(recipeCombinationSoftDeleteInputSchema)
    .mutation(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from("recipe_combination")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", input.id)
        .is("deleted_at", null)
        .select("*")
        .maybeSingle();
      if (error) throwFromPostgrest(error);
      assertFound(data, "RecipeCombination not found or already deleted");
      return mapRecipeCombinationRow(data as RecipeCombinationRow);
    }),
});
