/**
 * category router — admin vocabulary (Shape C).
 * list returns a tree assembled from flat parent_id rows.
 * create/update/deactivate/reorder are adminProcedure.
 */
import {
  categoryCreateInputSchema,
  categoryDeactivateInputSchema,
  categoryListInputSchema,
  categoryReorderInputSchema,
  categoryUpdateInputSchema,
} from "@menu-boss/schemas";
import { assertFound, throwFromPostgrest } from "../dbErrors";
import { adminProcedure, authedProcedure, createTRPCRouter } from "../trpc";
import {
  buildCategoryTree,
  categoryWriteFields,
  mapCategoryRow,
  type CategoryRow,
} from "./categoryMapper";

export const categoryRouter = createTRPCRouter({
  /** Flat rows → tree (children nested). Authed read for all family members. */
  list: authedProcedure
    .input(categoryListInputSchema)
    .query(async ({ ctx, input }) => {
      let query = ctx.supabase
        .from("category")
        .select("*")
        .order("sort_order", { ascending: true });

      if (input.activeOnly) {
        query = query.eq("is_active", true);
      }
      if (input.categoryType) {
        query = query.eq("category_type", input.categoryType);
      }

      const { data, error } = await query;
      if (error) throwFromPostgrest(error);

      const rows = (data ?? []) as CategoryRow[];
      return {
        tree: buildCategoryTree(rows),
        flat: rows.map(mapCategoryRow),
      };
    }),

  create: adminProcedure
    .input(categoryCreateInputSchema)
    .mutation(async ({ ctx, input }) => {
      const fields = categoryWriteFields(input);
      const { data, error } = await ctx.supabase
        .from("category")
        .insert(fields)
        .select("*")
        .single();
      if (error) throwFromPostgrest(error);
      return mapCategoryRow(data as CategoryRow);
    }),

  update: adminProcedure
    .input(categoryUpdateInputSchema)
    .mutation(async ({ ctx, input }) => {
      const { id, ...rest } = input;
      const fields = categoryWriteFields(rest);
      const { data, error } = await ctx.supabase
        .from("category")
        .update(fields)
        .eq("id", id)
        .select("*")
        .maybeSingle();
      if (error) throwFromPostgrest(error);
      assertFound(data, "Category not found");
      return mapCategoryRow(data as CategoryRow);
    }),

  /** Soft-deactivate (is_active = false); no hard delete. */
  deactivate: adminProcedure
    .input(categoryDeactivateInputSchema)
    .mutation(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from("category")
        .update({ is_active: false })
        .eq("id", input.id)
        .select("*")
        .maybeSingle();
      if (error) throwFromPostgrest(error);
      assertFound(data, "Category not found");
      return mapCategoryRow(data as CategoryRow);
    }),

  reorder: adminProcedure
    .input(categoryReorderInputSchema)
    .mutation(async ({ ctx, input }) => {
      // Sequential updates; coordinator may later provide a bulk RPC.
      const results: CategoryRow[] = [];
      for (let i = 0; i < input.orderedIds.length; i++) {
        const id = input.orderedIds[i]!;
        const { data, error } = await ctx.supabase
          .from("category")
          .update({ sort_order: i })
          .eq("id", id)
          .select("*")
          .maybeSingle();
        if (error) throwFromPostgrest(error);
        if (data) results.push(data as CategoryRow);
      }
      return results.map(mapCategoryRow);
    }),
});
