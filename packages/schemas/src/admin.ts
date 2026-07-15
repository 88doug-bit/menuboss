/**
 * Admin-domain Zod schemas (Task 15).
 * Invites, households, portion categories, units, family settings, audit.
 */
import { z } from "zod";
import { idInputSchema, nonEmptyTrimmed, paginationSchema, uuidSchema } from "./common";

/** Family role on invite / profile. */
export const familyRoleSchema = z.enum(["admin", "member"]);

/**
 * Invite email: trim → lowercase → RFC-ish email check.
 * Client should also trim before submit; server re-validates.
 */
export const inviteEmailSchema = z
  .string()
  .transform((s) => s.trim().toLowerCase())
  .pipe(z.string().email("Invalid email").min(1));

export const inviteCreateInputSchema = z.object({
  email: inviteEmailSchema,
  householdId: uuidSchema,
  role: familyRoleSchema.default("member"),
});

export const inviteListInputSchema = z.object({
  /** pending | accepted | all */
  status: z.enum(["pending", "accepted", "all"]).default("all"),
});

export const inviteRevokeInputSchema = idInputSchema;

export const householdCreateInputSchema = z.object({
  name: nonEmptyTrimmed,
  familyId: nonEmptyTrimmed.optional(),
  isActive: z.boolean().default(true),
});

export const householdRenameInputSchema = z.object({
  id: uuidSchema,
  name: nonEmptyTrimmed,
});

export const householdSetActiveInputSchema = z.object({
  id: uuidSchema,
  isActive: z.boolean(),
});

export const householdListInputSchema = z.object({
  /** When true (default), only is_active rows. When false, include inactive. */
  activeOnly: z.boolean().default(false),
});

/** Positive finite number (base oz, factors, multipliers). */
export const positiveFiniteSchema = z
  .number()
  .finite("must be finite")
  .positive("must be > 0");

export const portionCategoryCreateInputSchema = z.object({
  name: nonEmptyTrimmed,
  slug: nonEmptyTrimmed.regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    "slug must be lowercase kebab-case",
  ),
  baseProteinOz: positiveFiniteSchema,
  description: z.string().trim().optional(),
  sortOrder: z.number().int().default(0),
  isActive: z.boolean().default(true),
});

export const portionCategoryUpdateInputSchema = portionCategoryCreateInputSchema
  .partial()
  .extend({
    id: uuidSchema,
  });

export const portionCategorySetActiveInputSchema = z.object({
  id: uuidSchema,
  isActive: z.boolean(),
});

export const portionCategoryReorderInputSchema = z.object({
  orderedIds: z.array(uuidSchema).min(1),
});

export const unitDimensionSchema = z.enum(["mass", "volume", "count"]);

export const unitCreateInputSchema = z.object({
  name: nonEmptyTrimmed,
  abbreviation: nonEmptyTrimmed,
  dimension: unitDimensionSchema,
  factorToBase: positiveFiniteSchema,
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().default(true),
});

export const unitUpdateInputSchema = unitCreateInputSchema.partial().extend({
  id: uuidSchema,
});

export const unitSetActiveInputSchema = z.object({
  id: uuidSchema,
  isActive: z.boolean(),
});

export const unitListInputSchema = z.object({
  activeOnly: z.boolean().default(false),
  dimension: unitDimensionSchema.optional(),
});

export const familySettingsUpdateInputSchema = z.object({
  id: uuidSchema,
  athleteMultiplier: positiveFiniteSchema,
});

export const auditListInputSchema = paginationSchema.extend({
  tableName: z.string().trim().min(1).optional(),
  recordId: uuidSchema.optional(),
});

export const membersListInputSchema = z.object({
  householdId: uuidSchema.optional(),
});

export type FamilyRole = z.infer<typeof familyRoleSchema>;
export type InviteCreateInput = z.infer<typeof inviteCreateInputSchema>;
export type InviteListInput = z.infer<typeof inviteListInputSchema>;
export type HouseholdCreateInput = z.infer<typeof householdCreateInputSchema>;
export type HouseholdRenameInput = z.infer<typeof householdRenameInputSchema>;
export type PortionCategoryCreateInput = z.infer<
  typeof portionCategoryCreateInputSchema
>;
export type PortionCategoryUpdateInput = z.infer<
  typeof portionCategoryUpdateInputSchema
>;
export type UnitCreateInput = z.infer<typeof unitCreateInputSchema>;
export type UnitUpdateInput = z.infer<typeof unitUpdateInputSchema>;
export type UnitDimension = z.infer<typeof unitDimensionSchema>;
export type FamilySettingsUpdateInput = z.infer<
  typeof familySettingsUpdateInputSchema
>;
export type AuditListInput = z.infer<typeof auditListInputSchema>;
export type MembersListInput = z.infer<typeof membersListInputSchema>;
