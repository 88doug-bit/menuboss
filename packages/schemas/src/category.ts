import { z } from "zod";
import { idInputSchema, nonEmptyTrimmed, uuidSchema } from "./common";

export const categoryCreateInputSchema = z.object({
  name: nonEmptyTrimmed,
  slug: nonEmptyTrimmed
    .regex(
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
      "slug must be lowercase kebab-case",
    ),
  parentId: uuidSchema.nullable().optional(),
  categoryType: nonEmptyTrimmed.default("nutrition"),
  sortOrder: z.number().int().default(0),
  description: z.string().trim().optional(),
  isActive: z.boolean().default(true),
});

export const categoryUpdateInputSchema = categoryCreateInputSchema
  .partial()
  .extend({
    id: uuidSchema,
  });

export const categoryListInputSchema = z.object({
  /** When true (default), only is_active rows. */
  activeOnly: z.boolean().default(true),
  categoryType: z.string().trim().min(1).optional(),
});

export const categoryDeactivateInputSchema = idInputSchema;

export const categoryReorderInputSchema = z.object({
  /** Ordered list of category ids; position in array becomes sort_order. */
  orderedIds: z.array(uuidSchema).min(1),
});

export type CategoryCreateInput = z.infer<typeof categoryCreateInputSchema>;
export type CategoryUpdateInput = z.infer<typeof categoryUpdateInputSchema>;
export type CategoryListInput = z.infer<typeof categoryListInputSchema>;
export type CategoryReorderInput = z.infer<typeof categoryReorderInputSchema>;
