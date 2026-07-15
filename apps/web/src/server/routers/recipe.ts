/**
 * recipe router — family-global content (D7).
 * Soft-delete only. Browse filters deleted_at IS NULL; byId does not.
 * Auth: JWT supabase client; RLS owns authorization.
 */
import {
  recipeByIdInputSchema,
  recipeCreateInputSchema,
  recipeListInputSchema,
  recipeRateInputSchema,
  recipeRestoreInputSchema,
  recipeSetLeftoverDecayPathInputSchema,
  recipeSoftDeleteInputSchema,
  recipeUpdateInputSchema,
} from "@menu-boss/schemas";
import { assertFound, throwFromPostgrest } from "../dbErrors";
import {
  authedProcedure,
  createTRPCRouter,
  type AppSupabaseClient,
} from "../trpc";
import {
  mapRecipeIngredientRow,
  mapRecipeRow,
  recipeWriteFields,
  type RecipeIngredientRow,
  type RecipeRow,
} from "./recipeMapper";

async function replaceRecipeIngredients(
  supabase: AppSupabaseClient,
  recipeId: string,
  ingredients: Array<{
    ingredientId: string;
    quantity: number;
    unitId: string;
    preparationNote?: string;
    sequenceOrder: number;
    isOptional: boolean;
  }>,
) {
  const { error: delErr } = await supabase
    .from("recipe_ingredient")
    .delete()
    .eq("recipe_id", recipeId);
  if (delErr) throwFromPostgrest(delErr);

  if (ingredients.length === 0) return;

  const rows = ingredients.map((ing) => ({
    recipe_id: recipeId,
    ingredient_id: ing.ingredientId,
    quantity: ing.quantity,
    unit_id: ing.unitId,
    preparation_note: ing.preparationNote ?? null,
    sequence_order: ing.sequenceOrder,
    is_optional: ing.isOptional,
  }));
  const { error: insErr } = await supabase
    .from("recipe_ingredient")
    .insert(rows);
  if (insErr) throwFromPostgrest(insErr);
}

async function replaceJunction(
  supabase: AppSupabaseClient,
  table: "recipe_category" | "recipe_tag",
  fkCol: "category_id" | "tag_id",
  recipeId: string,
  ids: string[],
) {
  const { error: delErr } = await supabase
    .from(table)
    .delete()
    .eq("recipe_id", recipeId);
  if (delErr) throwFromPostgrest(delErr);
  if (ids.length === 0) return;
  const rows = ids.map((id) => ({
    recipe_id: recipeId,
    [fkCol]: id,
  }));
  const { error: insErr } = await supabase.from(table).insert(rows);
  if (insErr) throwFromPostgrest(insErr);
}

export const recipeRouter = createTRPCRouter({
  /**
   * Browse/search live recipes (deleted_at IS NULL).
   * Filters: q (tsvector), categoryIds, tagIds, maxTotalMinutes, minRating.
   */
  list: authedProcedure
    .input(recipeListInputSchema)
    .query(async ({ ctx, input }) => {
      const limit = input.limit;
      let query = ctx.supabase
        .from("recipe")
        .select("*")
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(limit + 1);

      if (input.q) {
        // plainto_tsquery-style via textSearch helper
        query = query.textSearch("search_vector", input.q, {
          type: "websearch",
          config: "english",
        });
      }
      if (input.maxTotalMinutes !== undefined) {
        query = query.lte("total_time_minutes", input.maxTotalMinutes);
      }
      if (input.minRating !== undefined) {
        query = query.gte("make_again_rating", input.minRating);
      }
      if (input.cursor) {
        query = query.lt("created_at", input.cursor);
      }

      const { data, error } = await query;
      if (error) throwFromPostgrest(error);

      let rows = (data ?? []) as RecipeRow[];

      // Post-filter by category/tag junctions when requested (family-global, small sets).
      if (input.categoryIds?.length) {
        const { data: rc, error: rcErr } = await ctx.supabase
          .from("recipe_category")
          .select("recipe_id")
          .in("category_id", input.categoryIds);
        if (rcErr) throwFromPostgrest(rcErr);
        const allowed = new Set((rc ?? []).map((r) => r.recipe_id as string));
        rows = rows.filter((r) => allowed.has(r.id));
      }
      if (input.tagIds?.length) {
        const { data: rt, error: rtErr } = await ctx.supabase
          .from("recipe_tag")
          .select("recipe_id")
          .in("tag_id", input.tagIds);
        if (rtErr) throwFromPostgrest(rtErr);
        const allowed = new Set((rt ?? []).map((r) => r.recipe_id as string));
        rows = rows.filter((r) => allowed.has(r.id));
      }

      const hasMore = rows.length > limit;
      const page = hasMore ? rows.slice(0, limit) : rows;
      const nextCursor =
        hasMore && page.length > 0
          ? page[page.length - 1]!.created_at
          : null;

      return {
        items: page.map(mapRecipeRow),
        nextCursor,
      };
    }),

  /**
   * Detail by id — does NOT filter deleted_at (historical plan views need deleted rows, badged).
   */
  byId: authedProcedure
    .input(recipeByIdInputSchema)
    .query(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from("recipe")
        .select("*")
        .eq("id", input.id)
        .maybeSingle();
      if (error) throwFromPostgrest(error);
      assertFound(data, "Recipe not found");

      const { data: ings, error: ingErr } = await ctx.supabase
        .from("recipe_ingredient")
        .select("*")
        .eq("recipe_id", input.id)
        .order("sequence_order", { ascending: true });
      if (ingErr) throwFromPostgrest(ingErr);

      const { data: cats, error: catErr } = await ctx.supabase
        .from("recipe_category")
        .select("category_id")
        .eq("recipe_id", input.id);
      if (catErr) throwFromPostgrest(catErr);

      const { data: tags, error: tagErr } = await ctx.supabase
        .from("recipe_tag")
        .select("tag_id")
        .eq("recipe_id", input.id);
      if (tagErr) throwFromPostgrest(tagErr);

      return {
        ...mapRecipeRow(data as RecipeRow),
        ingredients: ((ings ?? []) as RecipeIngredientRow[]).map(
          mapRecipeIngredientRow,
        ),
        categoryIds: (cats ?? []).map((c) => c.category_id as string),
        tagIds: (tags ?? []).map((t) => t.tag_id as string),
      };
    }),

  create: authedProcedure
    .input(recipeCreateInputSchema)
    .mutation(async ({ ctx, input }) => {
      const fields = recipeWriteFields(input);
      const { data, error } = await ctx.supabase
        .from("recipe")
        .insert({
          ...fields,
          created_by_user_id: ctx.userId,
        })
        .select("*")
        .single();
      if (error) throwFromPostgrest(error);

      const recipe = data as RecipeRow;
      await replaceRecipeIngredients(ctx.supabase, recipe.id, input.ingredients);
      await replaceJunction(
        ctx.supabase,
        "recipe_category",
        "category_id",
        recipe.id,
        input.categoryIds,
      );
      await replaceJunction(
        ctx.supabase,
        "recipe_tag",
        "tag_id",
        recipe.id,
        input.tagIds,
      );

      return mapRecipeRow(recipe);
    }),

  update: authedProcedure
    .input(recipeUpdateInputSchema)
    .mutation(async ({ ctx, input }) => {
      const { id, ingredients, categoryIds, tagIds, ...rest } = input;
      const fields = recipeWriteFields(rest);

      if (Object.keys(fields).length > 0) {
        const { error } = await ctx.supabase
          .from("recipe")
          .update(fields)
          .eq("id", id)
          .is("deleted_at", null);
        if (error) throwFromPostgrest(error);
      }

      if (ingredients !== undefined) {
        await replaceRecipeIngredients(ctx.supabase, id, ingredients);
      }
      if (categoryIds !== undefined) {
        await replaceJunction(
          ctx.supabase,
          "recipe_category",
          "category_id",
          id,
          categoryIds,
        );
      }
      if (tagIds !== undefined) {
        await replaceJunction(ctx.supabase, "recipe_tag", "tag_id", id, tagIds);
      }

      const { data, error } = await ctx.supabase
        .from("recipe")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (error) throwFromPostgrest(error);
      assertFound(data, "Recipe not found");
      return mapRecipeRow(data as RecipeRow);
    }),

  softDelete: authedProcedure
    .input(recipeSoftDeleteInputSchema)
    .mutation(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from("recipe")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", input.id)
        .is("deleted_at", null)
        .select("*")
        .maybeSingle();
      if (error) throwFromPostgrest(error);
      assertFound(data, "Recipe not found or already deleted");
      return mapRecipeRow(data as RecipeRow);
    }),

  restore: authedProcedure
    .input(recipeRestoreInputSchema)
    .mutation(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from("recipe")
        .update({ deleted_at: null })
        .eq("id", input.id)
        .not("deleted_at", "is", null)
        .select("*")
        .maybeSingle();
      if (error) throwFromPostgrest(error);
      assertFound(data, "Recipe not found or not deleted");
      return mapRecipeRow(data as RecipeRow);
    }),

  rate: authedProcedure
    .input(recipeRateInputSchema)
    .mutation(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from("recipe")
        .update({ make_again_rating: input.makeAgainRating })
        .eq("id", input.id)
        .is("deleted_at", null)
        .select("*")
        .maybeSingle();
      if (error) throwFromPostgrest(error);
      assertFound(data, "Recipe not found");
      return mapRecipeRow(data as RecipeRow);
    }),

  setLeftoverDecayPath: authedProcedure
    .input(recipeSetLeftoverDecayPathInputSchema)
    .mutation(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from("recipe")
        .update({ leftover_decay_path: input.leftoverDecayPath })
        .eq("id", input.id)
        .is("deleted_at", null)
        .select("*")
        .maybeSingle();
      if (error) throwFromPostgrest(error);
      assertFound(data, "Recipe not found");
      return mapRecipeRow(data as RecipeRow);
    }),
});
