import { z } from "zod";
import { idInputSchema, nonEmptyTrimmed, uuidSchema } from "./common";

/** ISO date string (YYYY-MM-DD) or full ISO datetime — Postgres `::date` accepts both. */
const isoDateSchema = z
  .string()
  .min(1, "date is required")
  .refine((s) => !Number.isNaN(Date.parse(s)), {
    message: "must be a valid ISO date string",
  });

export const mealPlanPortionRequirementInputSchema = z
  .object({
    portionCategoryId: uuidSchema,
    count: z.number().int().min(0, "count must be ≥ 0"),
    athleteCount: z.number().int().min(0, "athleteCount must be ≥ 0").default(0),
  })
  .refine((r) => r.athleteCount <= r.count, {
    message: "athleteCount must be ≤ count",
    path: ["athleteCount"],
  });

export const mealPlanAssignmentInputSchema = z.object({
  id: uuidSchema.optional(),
  recipeId: uuidSchema,
  assignmentDate: isoDateSchema,
  mealSlot: nonEmptyTrimmed,
  servings: z.number().positive("servings must be > 0").default(1),
  notes: z.string().optional(),
});

/**
 * Payload for meal_plan_create_or_update RPC / mealPlan.upsert.
 * DB triggers remain the authority for assignment-in-range and athlete≤count;
 * Zod provides friendly client errors.
 */
export const mealPlanUpsertInputSchema = z
  .object({
    id: uuidSchema.optional(),
    title: nonEmptyTrimmed,
    description: z.string().optional(),
    startDate: isoDateSchema,
    endDate: isoDateSchema,
    householdIds: z.array(uuidSchema).default([]),
    portionRequirements: z
      .array(mealPlanPortionRequirementInputSchema)
      .default([]),
    assignments: z.array(mealPlanAssignmentInputSchema).default([]),
  })
  .refine(
    (p) => {
      const start = Date.parse(p.startDate);
      const end = Date.parse(p.endDate);
      return end >= start;
    },
    { message: "endDate must be ≥ startDate", path: ["endDate"] },
  )
  .refine(
    (p) => {
      const start = Date.parse(p.startDate);
      const end = Date.parse(p.endDate);
      return p.assignments.every((a) => {
        const d = Date.parse(a.assignmentDate);
        return d >= start && d <= end;
      });
    },
    {
      message: "each assignmentDate must fall within [startDate, endDate]",
      path: ["assignments"],
    },
  );

export const shoppingListQuerySchema = z.object({
  mealPlanIds: z.array(uuidSchema).default([]),
});

export const proteinRollupQuerySchema = z.object({
  start: isoDateSchema,
  end: isoDateSchema,
});

export const mealPlanListRangeInputSchema = z
  .object({
    start: isoDateSchema,
    end: isoDateSchema,
  })
  .refine((p) => Date.parse(p.end) >= Date.parse(p.start), {
    message: "end must be ≥ start",
    path: ["end"],
  });

export const mealPlanShareInputSchema = z.object({
  mealPlanId: uuidSchema,
  householdId: uuidSchema,
});

export const mealPlanUnshareInputSchema = mealPlanShareInputSchema;

export const mealPlanByIdInputSchema = idInputSchema;
export const mealPlanSoftDeleteInputSchema = idInputSchema;

export type MealPlanPortionRequirementInput = z.infer<
  typeof mealPlanPortionRequirementInputSchema
>;
export type MealPlanAssignmentInput = z.infer<
  typeof mealPlanAssignmentInputSchema
>;
export type MealPlanUpsertInput = z.infer<typeof mealPlanUpsertInputSchema>;
export type ShoppingListQuery = z.infer<typeof shoppingListQuerySchema>;
export type ProteinRollupQuery = z.infer<typeof proteinRollupQuerySchema>;
export type MealPlanListRangeInput = z.infer<typeof mealPlanListRangeInputSchema>;
export type MealPlanShareInput = z.infer<typeof mealPlanShareInputSchema>;
