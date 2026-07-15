/**
 * chefIdea router — family-global content (D7).
 * convertToRecipe creates a recipe preserving notes/tags/categories and
 * links convertedRecipeId (DB: linked_recipe_id).
 */
import {
  chefIdeaConvertToRecipeInputSchema,
  chefIdeaCreateInputSchema,
  chefIdeaListInputSchema,
  chefIdeaSetStatusInputSchema,
  chefIdeaUpdateInputSchema,
} from "@menu-boss/schemas";
import { assertFound, throwFromPostgrest } from "../dbErrors";
import { authedProcedure, createTRPCRouter } from "../trpc";
import {
  chefIdeaWriteFields,
  mapChefIdeaRow,
  type ChefIdeaRow,
} from "./chefIdeaMapper";
import { mapRecipeRow, type RecipeRow } from "./recipeMapper";

async function replaceChefIdeaJunction(
  supabase: import("../trpc").AppSupabaseClient,
  table: "chef_idea_category" | "chef_idea_tag",
  fkCol: "category_id" | "tag_id",
  chefIdeaId: string,
  ids: string[],
) {
  const { error: delErr } = await supabase
    .from(table)
    .delete()
    .eq("chef_idea_id", chefIdeaId);
  if (delErr) throwFromPostgrest(delErr);
  if (ids.length === 0) return;
  const rows = ids.map((id) => ({
    chef_idea_id: chefIdeaId,
    [fkCol]: id,
  }));
  const { error: insErr } = await supabase.from(table).insert(rows);
  if (insErr) throwFromPostgrest(insErr);
}

export const chefIdeaRouter = createTRPCRouter({
  list: authedProcedure
    .input(chefIdeaListInputSchema)
    .query(async ({ ctx, input }) => {
      const limit = input.limit;
      let query = ctx.supabase
        .from("chef_idea")
        .select("*")
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(limit + 1);

      if (input.status) {
        query = query.eq("status", input.status);
      }
      if (input.priority !== undefined) {
        query = query.eq("priority", input.priority);
      }
      if (input.q) {
        query = query.or(
          `title.ilike.%${input.q}%,notes.ilike.%${input.q}%`,
        );
      }
      if (input.cursor) {
        query = query.lt("created_at", input.cursor);
      }

      const { data, error } = await query;
      if (error) throwFromPostgrest(error);

      let rows = (data ?? []) as ChefIdeaRow[];

      if (input.categoryIds?.length) {
        const { data: jc, error: jcErr } = await ctx.supabase
          .from("chef_idea_category")
          .select("chef_idea_id")
          .in("category_id", input.categoryIds);
        if (jcErr) throwFromPostgrest(jcErr);
        const allowed = new Set(
          (jc ?? []).map((r) => r.chef_idea_id as string),
        );
        rows = rows.filter((r) => allowed.has(r.id));
      }
      if (input.tagIds?.length) {
        const { data: jt, error: jtErr } = await ctx.supabase
          .from("chef_idea_tag")
          .select("chef_idea_id")
          .in("tag_id", input.tagIds);
        if (jtErr) throwFromPostgrest(jtErr);
        const allowed = new Set(
          (jt ?? []).map((r) => r.chef_idea_id as string),
        );
        rows = rows.filter((r) => allowed.has(r.id));
      }

      const hasMore = rows.length > limit;
      const page = hasMore ? rows.slice(0, limit) : rows;
      const nextCursor =
        hasMore && page.length > 0
          ? page[page.length - 1]!.created_at
          : null;

      return {
        items: page.map(mapChefIdeaRow),
        nextCursor,
      };
    }),

  create: authedProcedure
    .input(chefIdeaCreateInputSchema)
    .mutation(async ({ ctx, input }) => {
      const fields = chefIdeaWriteFields({
        title: input.title,
        notes: input.notes,
        source: input.source,
        status: input.status,
        priority: input.priority,
        convertedRecipeId: input.convertedRecipeId,
      });

      const { data, error } = await ctx.supabase
        .from("chef_idea")
        .insert({
          ...fields,
          created_by_user_id: ctx.userId,
        })
        .select("*")
        .single();
      if (error) throwFromPostgrest(error);

      const row = data as ChefIdeaRow;
      await replaceChefIdeaJunction(
        ctx.supabase,
        "chef_idea_category",
        "category_id",
        row.id,
        input.categoryIds,
      );
      await replaceChefIdeaJunction(
        ctx.supabase,
        "chef_idea_tag",
        "tag_id",
        row.id,
        input.tagIds,
      );

      return mapChefIdeaRow(row);
    }),

  update: authedProcedure
    .input(chefIdeaUpdateInputSchema)
    .mutation(async ({ ctx, input }) => {
      const { id, categoryIds, tagIds, ...rest } = input;
      const fields = chefIdeaWriteFields(rest);

      if (Object.keys(fields).length > 0) {
        const { error } = await ctx.supabase
          .from("chef_idea")
          .update(fields)
          .eq("id", id)
          .is("deleted_at", null);
        if (error) throwFromPostgrest(error);
      }

      if (categoryIds !== undefined) {
        await replaceChefIdeaJunction(
          ctx.supabase,
          "chef_idea_category",
          "category_id",
          id,
          categoryIds,
        );
      }
      if (tagIds !== undefined) {
        await replaceChefIdeaJunction(
          ctx.supabase,
          "chef_idea_tag",
          "tag_id",
          id,
          tagIds,
        );
      }

      const { data, error } = await ctx.supabase
        .from("chef_idea")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (error) throwFromPostgrest(error);
      assertFound(data, "ChefIdea not found");
      return mapChefIdeaRow(data as ChefIdeaRow);
    }),

  setStatus: authedProcedure
    .input(chefIdeaSetStatusInputSchema)
    .mutation(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from("chef_idea")
        .update({ status: input.status })
        .eq("id", input.id)
        .is("deleted_at", null)
        .select("*")
        .maybeSingle();
      if (error) throwFromPostgrest(error);
      assertFound(data, "ChefIdea not found");
      return mapChefIdeaRow(data as ChefIdeaRow);
    }),

  /**
   * Create a recipe from the idea (notes → description), copy category/tag
   * junctions, set idea status=adopted and linked_recipe_id.
   * Sequential inserts under caller JWT; surface first error.
   * (A single RPC may replace this later for true atomicity.)
   */
  convertToRecipe: authedProcedure
    .input(chefIdeaConvertToRecipeInputSchema)
    .mutation(async ({ ctx, input }) => {
      const { data: idea, error: ideaErr } = await ctx.supabase
        .from("chef_idea")
        .select("*")
        .eq("id", input.id)
        .is("deleted_at", null)
        .maybeSingle();
      if (ideaErr) throwFromPostgrest(ideaErr);
      assertFound(idea, "ChefIdea not found");
      const ideaRow = idea as ChefIdeaRow;

      if (ideaRow.linked_recipe_id) {
        const { data: existingRecipe, error: erErr } = await ctx.supabase
          .from("recipe")
          .select("*")
          .eq("id", ideaRow.linked_recipe_id)
          .maybeSingle();
        if (erErr) throwFromPostgrest(erErr);
        assertFound(existingRecipe, "Linked recipe not found");
        return {
          idea: mapChefIdeaRow(ideaRow),
          recipe: mapRecipeRow(existingRecipe as RecipeRow),
          alreadyConverted: true as const,
        };
      }

      const { data: cats } = await ctx.supabase
        .from("chef_idea_category")
        .select("category_id")
        .eq("chef_idea_id", input.id);
      const { data: tags } = await ctx.supabase
        .from("chef_idea_tag")
        .select("tag_id")
        .eq("chef_idea_id", input.id);

      const categoryIds = (cats ?? []).map((c) => c.category_id as string);
      const tagIds = (tags ?? []).map((t) => t.tag_id as string);

      const { data: recipe, error: recipeErr } = await ctx.supabase
        .from("recipe")
        .insert({
          title: input.title ?? ideaRow.title,
          description: input.description ?? ideaRow.notes,
          yield_servings: input.yieldServings ?? 1,
          instructions: [],
          leftover_decay_path: [],
          created_by_user_id: ctx.userId,
        })
        .select("*")
        .single();
      if (recipeErr) throwFromPostgrest(recipeErr);
      const recipeRow = recipe as RecipeRow;

      if (categoryIds.length) {
        const { error } = await ctx.supabase.from("recipe_category").insert(
          categoryIds.map((category_id) => ({
            recipe_id: recipeRow.id,
            category_id,
          })),
        );
        if (error) throwFromPostgrest(error);
      }
      if (tagIds.length) {
        const { error } = await ctx.supabase.from("recipe_tag").insert(
          tagIds.map((tag_id) => ({
            recipe_id: recipeRow.id,
            tag_id,
          })),
        );
        if (error) throwFromPostgrest(error);
      }

      const { data: updatedIdea, error: updErr } = await ctx.supabase
        .from("chef_idea")
        .update({
          linked_recipe_id: recipeRow.id,
          status: "adopted",
        })
        .eq("id", input.id)
        .select("*")
        .single();
      if (updErr) throwFromPostgrest(updErr);

      return {
        idea: mapChefIdeaRow(updatedIdea as ChefIdeaRow),
        recipe: mapRecipeRow(recipeRow),
        alreadyConverted: false as const,
      };
    }),
});
