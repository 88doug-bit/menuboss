/**
 * ingredient router — family-global content (D7).
 * create surfaces uq_ingredient_name unique-violation as CONFLICT with
 * existing ingredient id (merge-suggestion AC).
 * setFoodSafetyProfile is adminProcedure (display gate; RLS still enforces).
 */
import {
  ingredientByIdInputSchema,
  ingredientCreateInputSchema,
  ingredientListInputSchema,
  ingredientSetFoodSafetyProfileInputSchema,
  ingredientSoftDeleteInputSchema,
  ingredientUpdateInputSchema,
} from "@menu-boss/schemas";
import { assertFound, conflictWithExisting, throwFromPostgrest } from "../dbErrors";
import { adminProcedure, authedProcedure, createTRPCRouter } from "../trpc";
import {
  ingredientWriteFields,
  mapIngredientRow,
  type IngredientRow,
} from "./ingredientMapper";

async function replaceIngredientJunction(
  supabase: import("../trpc").AppSupabaseClient,
  table: "ingredient_category" | "ingredient_tag",
  fkCol: "category_id" | "tag_id",
  ingredientId: string,
  ids: string[],
) {
  const { error: delErr } = await supabase
    .from(table)
    .delete()
    .eq("ingredient_id", ingredientId);
  if (delErr) throwFromPostgrest(delErr);
  if (ids.length === 0) return;
  const rows = ids.map((id) => ({
    ingredient_id: ingredientId,
    [fkCol]: id,
  }));
  const { error: insErr } = await supabase.from(table).insert(rows);
  if (insErr) throwFromPostgrest(insErr);
}

export const ingredientRouter = createTRPCRouter({
  list: authedProcedure
    .input(ingredientListInputSchema)
    .query(async ({ ctx, input }) => {
      const limit = input.limit;
      let query = ctx.supabase
        .from("ingredient")
        .select("*")
        .is("deleted_at", null)
        .order("name", { ascending: true })
        .limit(limit + 1);

      if (input.q) {
        query = query.textSearch("search_vector", input.q, {
          type: "websearch",
          config: "english",
        });
      }
      if (input.hasSafetyProfile === true) {
        // non-empty JSON object
        query = query.neq("food_safety_profile", "{}");
      }
      if (input.cursor) {
        query = query.gt("name", input.cursor);
      }

      const { data, error } = await query;
      if (error) throwFromPostgrest(error);

      let rows = (data ?? []) as IngredientRow[];

      if (input.categoryIds?.length) {
        const { data: ic, error: icErr } = await ctx.supabase
          .from("ingredient_category")
          .select("ingredient_id")
          .in("category_id", input.categoryIds);
        if (icErr) throwFromPostgrest(icErr);
        const allowed = new Set(
          (ic ?? []).map((r) => r.ingredient_id as string),
        );
        rows = rows.filter((r) => allowed.has(r.id));
      }

      const hasMore = rows.length > limit;
      const page = hasMore ? rows.slice(0, limit) : rows;
      const nextCursor =
        hasMore && page.length > 0 ? page[page.length - 1]!.name : null;

      return {
        items: page.map(mapIngredientRow),
        nextCursor,
      };
    }),

  /** Detail by id — does NOT filter deleted_at (badge soft-deleted refs). */
  byId: authedProcedure
    .input(ingredientByIdInputSchema)
    .query(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from("ingredient")
        .select("*")
        .eq("id", input.id)
        .maybeSingle();
      if (error) throwFromPostgrest(error);
      assertFound(data, "Ingredient not found");

      const { data: cats, error: catErr } = await ctx.supabase
        .from("ingredient_category")
        .select("category_id")
        .eq("ingredient_id", input.id);
      if (catErr) throwFromPostgrest(catErr);

      const { data: tags, error: tagErr } = await ctx.supabase
        .from("ingredient_tag")
        .select("tag_id")
        .eq("ingredient_id", input.id);
      if (tagErr) throwFromPostgrest(tagErr);

      return {
        ...mapIngredientRow(data as IngredientRow),
        categoryIds: (cats ?? []).map((c) => c.category_id as string),
        tagIds: (tags ?? []).map((t) => t.tag_id as string),
      };
    }),

  create: authedProcedure
    .input(ingredientCreateInputSchema)
    .mutation(async ({ ctx, input }) => {
      const fields = ingredientWriteFields({
        name: input.name,
        description: input.description,
        defaultUnitId: input.defaultUnitId,
        foodSafetyProfile: input.foodSafetyProfile,
        isUserAdded: input.isUserAdded,
      });

      const { data, error } = await ctx.supabase
        .from("ingredient")
        .insert({
          ...fields,
          created_by_user_id: ctx.userId,
        })
        .select("*")
        .single();

      if (error) {
        if (error.code === "23505") {
          // Look up existing live ingredient by case-insensitive name for merge UX
          const { data: existing } = await ctx.supabase
            .from("ingredient")
            .select("id, name")
            .is("deleted_at", null)
            .ilike("name", input.name)
            .maybeSingle();
          throw conflictWithExisting(
            `Ingredient name already exists: "${input.name}"`,
            (existing?.id as string) ?? "",
            { existingName: existing?.name ?? input.name },
          );
        }
        throwFromPostgrest(error);
      }

      const row = data as IngredientRow;
      await replaceIngredientJunction(
        ctx.supabase,
        "ingredient_category",
        "category_id",
        row.id,
        input.categoryIds,
      );
      await replaceIngredientJunction(
        ctx.supabase,
        "ingredient_tag",
        "tag_id",
        row.id,
        input.tagIds,
      );

      return mapIngredientRow(row);
    }),

  update: authedProcedure
    .input(ingredientUpdateInputSchema)
    .mutation(async ({ ctx, input }) => {
      const { id, categoryIds, tagIds, ...rest } = input;
      const fields = ingredientWriteFields(rest);

      if (Object.keys(fields).length > 0) {
        const { error } = await ctx.supabase
          .from("ingredient")
          .update(fields)
          .eq("id", id)
          .is("deleted_at", null);
        if (error) {
          if (error.code === "23505" && rest.name) {
            const { data: existing } = await ctx.supabase
              .from("ingredient")
              .select("id, name")
              .is("deleted_at", null)
              .ilike("name", rest.name)
              .maybeSingle();
            throw conflictWithExisting(
              `Ingredient name already exists: "${rest.name}"`,
              (existing?.id as string) ?? "",
              { existingName: existing?.name ?? rest.name },
            );
          }
          throwFromPostgrest(error);
        }
      }

      if (categoryIds !== undefined) {
        await replaceIngredientJunction(
          ctx.supabase,
          "ingredient_category",
          "category_id",
          id,
          categoryIds,
        );
      }
      if (tagIds !== undefined) {
        await replaceIngredientJunction(
          ctx.supabase,
          "ingredient_tag",
          "tag_id",
          id,
          tagIds,
        );
      }

      const { data, error } = await ctx.supabase
        .from("ingredient")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (error) throwFromPostgrest(error);
      assertFound(data, "Ingredient not found");
      return mapIngredientRow(data as IngredientRow);
    }),

  softDelete: authedProcedure
    .input(ingredientSoftDeleteInputSchema)
    .mutation(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from("ingredient")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", input.id)
        .is("deleted_at", null)
        .select("*")
        .maybeSingle();
      if (error) throwFromPostgrest(error);
      assertFound(data, "Ingredient not found or already deleted");
      return mapIngredientRow(data as IngredientRow);
    }),

  /** Admin-gated food-safety profile write (Product PRD §10.3; brief name). */
  setFoodSafetyProfile: adminProcedure
    .input(ingredientSetFoodSafetyProfileInputSchema)
    .mutation(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from("ingredient")
        .update({ food_safety_profile: input.foodSafetyProfile })
        .eq("id", input.id)
        .is("deleted_at", null)
        .select("*")
        .maybeSingle();
      if (error) throwFromPostgrest(error);
      assertFound(data, "Ingredient not found");
      return mapIngredientRow(data as IngredientRow);
    }),
});
