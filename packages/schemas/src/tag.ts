import { z } from "zod";
import { idInputSchema, nonEmptyTrimmed, uuidSchema } from "./common";

export const tagCreateInputSchema = z.object({
  name: nonEmptyTrimmed,
  slug: nonEmptyTrimmed.regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    "slug must be lowercase kebab-case",
  ),
  tagGroup: nonEmptyTrimmed,
  description: z.string().trim().optional(),
  isActive: z.boolean().default(true),
});

export const tagUpdateInputSchema = tagCreateInputSchema.partial().extend({
  id: uuidSchema,
});

export const tagListInputSchema = z.object({
  activeOnly: z.boolean().default(true),
  tagGroup: z.string().trim().min(1).optional(),
});

export const tagDeactivateInputSchema = idInputSchema;

export const tagReorderInputSchema = z.object({
  /** Tag has no sort_order in schema v0.4 — reorder is a no-op placeholder
   * reserved if a future column is added. Accepts ordered ids for API symmetry
   * with category.reorder; currently returns tags in requested order only. */
  orderedIds: z.array(uuidSchema).min(1),
});

export type TagCreateInput = z.infer<typeof tagCreateInputSchema>;
export type TagUpdateInput = z.infer<typeof tagUpdateInputSchema>;
export type TagListInput = z.infer<typeof tagListInputSchema>;
export type TagReorderInput = z.infer<typeof tagReorderInputSchema>;
