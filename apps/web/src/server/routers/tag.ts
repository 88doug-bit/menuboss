/**
 * tag router — admin vocabulary (Shape C).
 * create/update/deactivate/reorder are adminProcedure.
 * Note: tag table has no sort_order in 0001 schema; reorder returns tags
 * in requested order without persisting positions (see NOTES).
 */
import {
  tagCreateInputSchema,
  tagDeactivateInputSchema,
  tagListInputSchema,
  tagReorderInputSchema,
  tagUpdateInputSchema,
} from "@menu-boss/schemas";
import { assertFound, throwFromPostgrest } from "../dbErrors";
import { adminProcedure, authedProcedure, createTRPCRouter } from "../trpc";
import { mapTagRow, tagWriteFields, type TagRow } from "./tagMapper";

export const tagRouter = createTRPCRouter({
  list: authedProcedure
    .input(tagListInputSchema)
    .query(async ({ ctx, input }) => {
      let query = ctx.supabase
        .from("tag")
        .select("*")
        .order("tag_group", { ascending: true })
        .order("name", { ascending: true });

      if (input.activeOnly) {
        query = query.eq("is_active", true);
      }
      if (input.tagGroup) {
        query = query.eq("tag_group", input.tagGroup);
      }

      const { data, error } = await query;
      if (error) throwFromPostgrest(error);
      return ((data ?? []) as TagRow[]).map(mapTagRow);
    }),

  create: adminProcedure
    .input(tagCreateInputSchema)
    .mutation(async ({ ctx, input }) => {
      const fields = tagWriteFields(input);
      const { data, error } = await ctx.supabase
        .from("tag")
        .insert(fields)
        .select("*")
        .single();
      if (error) throwFromPostgrest(error);
      return mapTagRow(data as TagRow);
    }),

  update: adminProcedure
    .input(tagUpdateInputSchema)
    .mutation(async ({ ctx, input }) => {
      const { id, ...rest } = input;
      const fields = tagWriteFields(rest);
      const { data, error } = await ctx.supabase
        .from("tag")
        .update(fields)
        .eq("id", id)
        .select("*")
        .maybeSingle();
      if (error) throwFromPostgrest(error);
      assertFound(data, "Tag not found");
      return mapTagRow(data as TagRow);
    }),

  deactivate: adminProcedure
    .input(tagDeactivateInputSchema)
    .mutation(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from("tag")
        .update({ is_active: false })
        .eq("id", input.id)
        .select("*")
        .maybeSingle();
      if (error) throwFromPostgrest(error);
      assertFound(data, "Tag not found");
      return mapTagRow(data as TagRow);
    }),

  /**
   * API symmetry with category.reorder. Tag has no sort_order column in
   * 0001 schema — returns tags ordered as requested without DB writes.
   */
  reorder: adminProcedure
    .input(tagReorderInputSchema)
    .mutation(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from("tag")
        .select("*")
        .in("id", input.orderedIds);
      if (error) throwFromPostgrest(error);
      const byId = new Map(
        ((data ?? []) as TagRow[]).map((t) => [t.id, t] as const),
      );
      return input.orderedIds
        .map((id) => byId.get(id))
        .filter((t): t is TagRow => t != null)
        .map(mapTagRow);
    }),
});
