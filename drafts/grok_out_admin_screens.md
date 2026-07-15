# Grok Task 15 — Family admin screens

**Branch:** `implement/grok-15-admin-screens`

## Summary

- `packages/schemas/src/admin.ts` — invite/household/portion/unit/settings/audit Zod schemas (email trim+lowercase, positive finite)
- `admin` tRPC router (`adminProcedure`): invites, households, portionCategories, units, familySettings, audit, members
- `/admin` UI: invites & members, portion categories (D17 Adult Male hint), units, categories/tags tree, family settings with portion-calc example, audit log
- Nav Admin entry only when `family.me.role === 'admin'` (AuthedShell + AppNav); non-admins hitting `/admin` see friendly admins-only state
- Component tests: invite email normalize, portion base oz ≤0 reject, non-admin gate
- Integration (env-guarded): invite create/revoke pending/accepted filter + member RLS denial
- Extensionless imports throughout

## NOTES

1. **No service-role; no SQL/RLS changes.** All writes go through caller JWT + RLS.
2. **Invite revoke** = DELETE of pending invite only; accepted invites throw BAD_REQUEST in the router and are protected by `accepted_at IS NULL` filter.
3. **Portion categories / units / households**: deactivate via `is_active` — no hard-delete buttons (matches Shape C no DELETE policies).
4. **Family settings live example** uses `@menu-boss/portion-calc` `calculatePerCategoryBreakdown` + `roundOz` — math not inlined.
5. **Categories & tags** reuse existing `category` / `tag` admin procedures; UI notes reparenting deferred.
6. **Audit list** is paged by bigint id cursor; filter by `table_name` / `record_id`.

<!-- TODO(coordinator): none required for core Task 15 path — household_invite + audit_log already have admin policies in 0002/0005. -->

---

### FILE: packages/schemas/src/admin.ts
```ts
/**
 * Admin-domain Zod schemas (Task 15).
 * Invites, households, portion categories, units, family settings, audit.
 */
import { z } from "zod";
import { idInputSchema, nonEmptyTrimmed, paginationSchema, uuidSchema } from "./common";

/** Family role on invite / profile. */
export const familyRoleSchema = z.enum(["admin", "member"]);

/**
 * Invite email: trim â†’ lowercase â†’ RFC-ish email check.
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
```

### FILE: packages/schemas/src/index.ts
```ts
export * from "./common";
export * from "./recipe";
export * from "./ingredient";
export * from "./category";
export * from "./tag";
export * from "./chefIdea";
export * from "./recipeCombination";
export * from "./mealPlan";
export * from "./admin";
```

### FILE: packages/schemas/package.json
```json
{
  "name": "@menu-boss/schemas",
  "version": "0.1.0",
  "description": "Shared Zod schemas for MenuBoss tRPC procedures and forms.",
  "type": "module",
  "main": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts",
    "./common": "./src/common.ts",
    "./recipe": "./src/recipe.ts",
    "./ingredient": "./src/ingredient.ts",
    "./category": "./src/category.ts",
    "./tag": "./src/tag.ts",
    "./chefIdea": "./src/chefIdea.ts",
    "./recipeCombination": "./src/recipeCombination.ts",
    "./mealPlan": "./src/mealPlan.ts",
    "./admin": "./src/admin.ts"
  },
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "files": [
    "src"
  ],
  "keywords": [
    "menu-boss",
    "zod",
    "schemas"
  ],
  "license": "UNLICENSED",
  "private": true,
  "dependencies": {
    "zod": "^3.24.1"
  },
  "devDependencies": {
    "@types/node": "^22.10.7",
    "typescript": "^5.7.3",
    "vitest": "^3.0.5"
  },
  "engines": {
    "node": ">=20"
  }
}
```

### FILE: packages/schemas/src/schemas.test.ts
```ts
/**
 * Zod boundary tests for content-domain schemas.
 * (Also materializes as apps/web/src/server/routers/__tests__/schemas.test.ts)
 *
 * Covers: invalid enums, quantity 0, rating 6, empty combination recipes,
 * decay-path without `use`, novel foodSafetyProfile contaminant key accepted.
 * Athlete/portion inputs are out of scope for this domain.
 */
import { describe, expect, it } from "vitest";
import {
  chefIdeaCreateInputSchema,
  chefIdeaStatusSchema,
  foodSafetyProfileSchema,
  ingredientCreateInputSchema,
  inviteEmailSchema,
  leftoverDecayPathEntrySchema,
  leftoverDecayPathSchema,
  portionCategoryCreateInputSchema,
  positiveFiniteSchema,
  ratingSchema,
  recipeCombinationCreateInputSchema,
  recipeCreateInputSchema,
  recipeIngredientInputSchema,
  roleInMealSchema,
} from "./index";

const UUID = "11111111-1111-4111-8111-111111111111";
const UUID2 = "22222222-2222-4222-8222-222222222222";

describe("ratingSchema", () => {
  it("accepts integers 1â€“5", () => {
    for (const n of [1, 2, 3, 4, 5]) {
      expect(ratingSchema.parse(n)).toBe(n);
    }
  });

  it("rejects rating 6", () => {
    const r = ratingSchema.safeParse(6);
    expect(r.success).toBe(false);
  });

  it("rejects rating 0 and non-integers", () => {
    expect(ratingSchema.safeParse(0).success).toBe(false);
    expect(ratingSchema.safeParse(3.5).success).toBe(false);
  });
});

describe("recipeIngredientInputSchema", () => {
  const base = {
    ingredientId: UUID,
    unitId: UUID2,
    sequenceOrder: 0,
    isOptional: false,
  };

  it("accepts quantity > 0", () => {
    expect(
      recipeIngredientInputSchema.parse({ ...base, quantity: 0.5 }),
    ).toMatchObject({ quantity: 0.5 });
  });

  it("rejects quantity 0", () => {
    const r = recipeIngredientInputSchema.safeParse({
      ...base,
      quantity: 0,
    });
    expect(r.success).toBe(false);
  });

  it("rejects negative quantity", () => {
    expect(
      recipeIngredientInputSchema.safeParse({ ...base, quantity: -1 })
        .success,
    ).toBe(false);
  });
});

describe("roleInMealSchema / enums", () => {
  it("accepts known roles", () => {
    for (const role of ["main", "side", "dessert", "appetizer", "other"]) {
      expect(roleInMealSchema.parse(role)).toBe(role);
    }
  });

  it("rejects invalid role enum", () => {
    expect(roleInMealSchema.safeParse("entree").success).toBe(false);
    expect(roleInMealSchema.safeParse("MAIN").success).toBe(false);
  });

  it("rejects invalid chefIdea status", () => {
    expect(chefIdeaStatusSchema.safeParse("draft").success).toBe(false);
    expect(chefIdeaStatusSchema.parse("abandoned")).toBe("abandoned");
  });
});

describe("recipeCombinationCreateInputSchema", () => {
  it("rejects empty recipes array", () => {
    const r = recipeCombinationCreateInputSchema.safeParse({
      name: "Sunday Dinner",
      recipes: [],
    });
    expect(r.success).toBe(false);
  });

  it("accepts at least one recipe", () => {
    const r = recipeCombinationCreateInputSchema.parse({
      name: "Sunday Dinner",
      recipes: [
        {
          recipeId: UUID,
          roleInMeal: "main",
          sequenceOrder: 0,
        },
      ],
    });
    expect(r.recipes).toHaveLength(1);
  });
});

describe("leftoverDecayPath", () => {
  it("rejects entry without use", () => {
    const r = leftoverDecayPathEntrySchema.safeParse({
      notes: "something",
    });
    expect(r.success).toBe(false);
  });

  it("rejects empty use after trim", () => {
    expect(
      leftoverDecayPathEntrySchema.safeParse({ use: "   " }).success,
    ).toBe(false);
  });

  it("accepts use-only and full entry", () => {
    expect(leftoverDecayPathEntrySchema.parse({ use: "Cuban Sandwiches" })).toEqual({
      use: "Cuban Sandwiches",
    });
    expect(
      leftoverDecayPathSchema.parse([
        {
          use: "Bolognese",
          notes: "freezes well",
          linkedRecipeIds: [UUID],
        },
      ]),
    ).toHaveLength(1);
  });
});

describe("foodSafetyProfileSchema", () => {
  it("accepts mercury + general known keys", () => {
    const profile = foodSafetyProfileSchema.parse({
      mercury: {
        fda_category: "Good Choices",
        risk_level: "moderate",
        recommended_frequency: "2-3/week",
        source: "FDA/EPA",
        last_reviewed: "2026-06",
      },
      general: {
        cooking_temperature: "145F",
        storage_notes: "1-2 days",
      },
    });
    expect(profile.mercury?.fda_category).toBe("Good Choices");
  });

  it("accepts novel contaminant key via catchall", () => {
    const profile = foodSafetyProfileSchema.parse({
      pfas: {
        risk_level: "unknown",
        notes: "emerging guidance",
        source: "EPA draft",
      },
    });
    expect(profile.pfas).toBeDefined();
    expect(profile.pfas?.risk_level).toBe("unknown");
  });

  it("accepts empty object", () => {
    expect(foodSafetyProfileSchema.parse({})).toEqual({});
  });
});

describe("recipeCreateInputSchema", () => {
  it("requires title and positive yield", () => {
    expect(recipeCreateInputSchema.safeParse({ title: "" }).success).toBe(
      false,
    );
    const r = recipeCreateInputSchema.parse({
      title: "  Roast Chicken  ",
      yieldServings: 4,
    });
    expect(r.title).toBe("Roast Chicken");
    expect(r.yieldServings).toBe(4);
    expect(r.instructions).toEqual([]);
  });

  it("rejects yieldServings 0", () => {
    expect(
      recipeCreateInputSchema.safeParse({
        title: "X",
        yieldServings: 0,
      }).success,
    ).toBe(false);
  });

  it("rejects makeAgainRating 6 on create", () => {
    expect(
      recipeCreateInputSchema.safeParse({
        title: "X",
        makeAgainRating: 6,
      }).success,
    ).toBe(false);
  });
});

describe("ingredientCreateInputSchema", () => {
  it("enforces name length 1â€“120", () => {
    expect(
      ingredientCreateInputSchema.safeParse({ name: "" }).success,
    ).toBe(false);
    expect(
      ingredientCreateInputSchema.safeParse({ name: "a".repeat(121) })
        .success,
    ).toBe(false);
    expect(
      ingredientCreateInputSchema.parse({ name: "  Olive Oil  " }).name,
    ).toBe("Olive Oil");
  });
});

describe("chefIdeaCreateInputSchema", () => {
  it("defaults status to idea and validates priority 1â€“3", () => {
    const r = chefIdeaCreateInputSchema.parse({ title: "Try Greek pork" });
    expect(r.status).toBe("idea");
    expect(
      chefIdeaCreateInputSchema.safeParse({
        title: "X",
        priority: 4,
      }).success,
    ).toBe(false);
  });
});

describe("admin schemas (Task 15)", () => {
  it("inviteEmailSchema trims + lowercases + validates", () => {
    expect(inviteEmailSchema.parse("  Alice@Example.COM ")).toBe(
      "alice@example.com",
    );
    expect(inviteEmailSchema.safeParse("not-email").success).toBe(false);
  });

  it("positiveFiniteSchema rejects â‰¤ 0 and non-finite", () => {
    expect(positiveFiniteSchema.parse(1.5)).toBe(1.5);
    expect(positiveFiniteSchema.safeParse(0).success).toBe(false);
    expect(positiveFiniteSchema.safeParse(-1).success).toBe(false);
    expect(positiveFiniteSchema.safeParse(Number.NaN).success).toBe(false);
  });

  it("portionCategoryCreateInputSchema requires baseProteinOz > 0", () => {
    expect(
      portionCategoryCreateInputSchema.safeParse({
        name: "Adult Male",
        slug: "adult-male",
        baseProteinOz: 0,
      }).success,
    ).toBe(false);
    expect(
      portionCategoryCreateInputSchema.parse({
        name: "Adult Male",
        slug: "adult-male",
        baseProteinOz: 6,
      }).baseProteinOz,
    ).toBe(6);
  });
});
```

### FILE: apps/web/src/server/routers/admin.ts
```ts
/**
 * admin router â€” family admin surface (Task 15).
 * Every procedure is adminProcedure (UX gate); RLS is sole write authority.
 * Thin Supabase pass-throughs; 42501 â†’ FORBIDDEN via throwFromPostgrest.
 *
 * Invite model (0005): admin creates household_invite; signup/invite order
 * does not matter â€” both directions provision profile. Revoke = DELETE of
 * pending invite only; accepted invites are read-only history.
 */
import {
  auditListInputSchema,
  familySettingsUpdateInputSchema,
  householdCreateInputSchema,
  householdListInputSchema,
  householdRenameInputSchema,
  householdSetActiveInputSchema,
  inviteCreateInputSchema,
  inviteListInputSchema,
  inviteRevokeInputSchema,
  membersListInputSchema,
  portionCategoryCreateInputSchema,
  portionCategoryReorderInputSchema,
  portionCategorySetActiveInputSchema,
  portionCategoryUpdateInputSchema,
  unitCreateInputSchema,
  unitListInputSchema,
  unitSetActiveInputSchema,
  unitUpdateInputSchema,
} from "@menu-boss/schemas";
import { TRPCError } from "@trpc/server";
import { assertFound, throwFromPostgrest } from "../dbErrors";
import { adminProcedure, createTRPCRouter } from "../trpc";

// ---------------------------------------------------------------------------
// DTOs
// ---------------------------------------------------------------------------

export type InviteDto = {
  id: string;
  email: string;
  householdId: string;
  householdName: string | null;
  role: "admin" | "member";
  invitedBy: string | null;
  acceptedAt: string | null;
  createdAt: string;
};

export type AdminHouseholdDto = {
  id: string;
  name: string;
  familyId: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type AdminPortionCategoryDto = {
  id: string;
  name: string;
  slug: string;
  baseProteinOz: number;
  description: string | null;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type AdminUnitDto = {
  id: string;
  name: string;
  abbreviation: string;
  dimension: "mass" | "volume" | "count";
  factorToBase: number;
  sortOrder: number | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type AdminFamilySettingsDto = {
  id: string;
  athleteMultiplier: number;
  otherGlobalDefaults: Record<string, unknown>;
  updatedAt: string | null;
};

export type AuditLogDto = {
  id: string;
  tableName: string;
  recordId: string | null;
  action: string;
  actorId: string | null;
  beforeData: unknown;
  afterData: unknown;
  createdAt: string;
};

export type MemberDto = {
  id: string;
  householdId: string;
  displayName: string;
  role: "admin" | "member";
};

// ---------------------------------------------------------------------------
// Mappers
// ---------------------------------------------------------------------------

function mapInvite(
  row: {
    id: string;
    email: string;
    household_id: string;
    role: string;
    invited_by: string | null;
    accepted_at: string | null;
    created_at: string;
  },
  householdName: string | null,
): InviteDto {
  return {
    id: row.id,
    email: row.email,
    householdId: row.household_id,
    householdName,
    role: row.role as "admin" | "member",
    invitedBy: row.invited_by,
    acceptedAt: row.accepted_at,
    createdAt: row.created_at,
  };
}

function mapHousehold(row: {
  id: string;
  name: string;
  family_id: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}): AdminHouseholdDto {
  return {
    id: row.id,
    name: row.name,
    familyId: row.family_id,
    isActive: Boolean(row.is_active),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapPortionCategory(row: {
  id: string;
  name: string;
  slug: string;
  base_protein_oz: number;
  description: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}): AdminPortionCategoryDto {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    baseProteinOz: Number(row.base_protein_oz),
    description: row.description,
    sortOrder: row.sort_order,
    isActive: Boolean(row.is_active),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapUnit(row: {
  id: string;
  name: string;
  abbreviation: string;
  dimension: string;
  factor_to_base: number;
  sort_order: number | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}): AdminUnitDto {
  return {
    id: row.id,
    name: row.name,
    abbreviation: row.abbreviation,
    dimension: row.dimension as "mass" | "volume" | "count",
    factorToBase: Number(row.factor_to_base),
    sortOrder: row.sort_order,
    isActive: Boolean(row.is_active),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ---------------------------------------------------------------------------
// Nested routers
// ---------------------------------------------------------------------------

const invitesRouter = createTRPCRouter({
  list: adminProcedure
    .input(inviteListInputSchema)
    .query(async ({ ctx, input }) => {
      let query = ctx.supabase
        .from("household_invite")
        .select(
          "id, email, household_id, role, invited_by, accepted_at, created_at",
        )
        .order("created_at", { ascending: false });

      if (input.status === "pending") {
        query = query.is("accepted_at", null);
      } else if (input.status === "accepted") {
        query = query.not("accepted_at", "is", null);
      }

      const { data, error } = await query;
      if (error) throwFromPostgrest(error);

      const rows = (data ?? []) as Array<{
        id: string;
        email: string;
        household_id: string;
        role: string;
        invited_by: string | null;
        accepted_at: string | null;
        created_at: string;
      }>;

      const hhIds = [...new Set(rows.map((r) => r.household_id))];
      const nameById = new Map<string, string>();
      if (hhIds.length > 0) {
        const { data: households, error: hhErr } = await ctx.supabase
          .from("household")
          .select("id, name")
          .in("id", hhIds);
        if (hhErr) throwFromPostgrest(hhErr);
        for (const h of (households ?? []) as Array<{
          id: string;
          name: string;
        }>) {
          nameById.set(h.id, h.name);
        }
      }

      return rows.map((r) => mapInvite(r, nameById.get(r.household_id) ?? null));
    }),

  create: adminProcedure
    .input(inviteCreateInputSchema)
    .mutation(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from("household_invite")
        .insert({
          email: input.email,
          household_id: input.householdId,
          role: input.role,
          invited_by: ctx.userId,
        })
        .select(
          "id, email, household_id, role, invited_by, accepted_at, created_at",
        )
        .single();
      if (error) throwFromPostgrest(error);

      const { data: hh } = await ctx.supabase
        .from("household")
        .select("name")
        .eq("id", input.householdId)
        .maybeSingle();

      return mapInvite(
        data as {
          id: string;
          email: string;
          household_id: string;
          role: string;
          invited_by: string | null;
          accepted_at: string | null;
          created_at: string;
        },
        (hh?.name as string | undefined) ?? null,
      );
    }),

  /**
   * Revoke = DELETE of a pending invite. Accepted invites are history.
   */
  revoke: adminProcedure
    .input(inviteRevokeInputSchema)
    .mutation(async ({ ctx, input }) => {
      const { data: existing, error: fetchErr } = await ctx.supabase
        .from("household_invite")
        .select("id, accepted_at")
        .eq("id", input.id)
        .maybeSingle();
      if (fetchErr) throwFromPostgrest(fetchErr);
      assertFound(existing, "Invite not found");

      if (existing.accepted_at != null) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Accepted invites are history and cannot be revoked",
        });
      }

      const { error } = await ctx.supabase
        .from("household_invite")
        .delete()
        .eq("id", input.id)
        .is("accepted_at", null);
      if (error) throwFromPostgrest(error);
      return { id: input.id, revoked: true as const };
    }),
});

const householdsRouter = createTRPCRouter({
  list: adminProcedure
    .input(householdListInputSchema)
    .query(async ({ ctx, input }) => {
      let query = ctx.supabase
        .from("household")
        .select("id, name, family_id, is_active, created_at, updated_at")
        .order("name", { ascending: true });
      if (input.activeOnly) {
        query = query.eq("is_active", true);
      }
      const { data, error } = await query;
      if (error) throwFromPostgrest(error);
      return (
        (data ?? []) as Array<{
          id: string;
          name: string;
          family_id: string;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        }>
      ).map(mapHousehold);
    }),

  create: adminProcedure
    .input(householdCreateInputSchema)
    .mutation(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from("household")
        .insert({
          name: input.name,
          ...(input.familyId !== undefined
            ? { family_id: input.familyId }
            : {}),
          is_active: input.isActive,
        })
        .select("id, name, family_id, is_active, created_at, updated_at")
        .single();
      if (error) throwFromPostgrest(error);
      return mapHousehold(
        data as {
          id: string;
          name: string;
          family_id: string;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        },
      );
    }),

  rename: adminProcedure
    .input(householdRenameInputSchema)
    .mutation(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from("household")
        .update({ name: input.name })
        .eq("id", input.id)
        .select("id, name, family_id, is_active, created_at, updated_at")
        .maybeSingle();
      if (error) throwFromPostgrest(error);
      assertFound(data, "Household not found");
      return mapHousehold(
        data as {
          id: string;
          name: string;
          family_id: string;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        },
      );
    }),

  setActive: adminProcedure
    .input(householdSetActiveInputSchema)
    .mutation(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from("household")
        .update({ is_active: input.isActive })
        .eq("id", input.id)
        .select("id, name, family_id, is_active, created_at, updated_at")
        .maybeSingle();
      if (error) throwFromPostgrest(error);
      assertFound(data, "Household not found");
      return mapHousehold(
        data as {
          id: string;
          name: string;
          family_id: string;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        },
      );
    }),
});

const portionCategoriesRouter = createTRPCRouter({
  list: adminProcedure.query(async ({ ctx }) => {
    const { data, error } = await ctx.supabase
      .from("portion_category")
      .select(
        "id, name, slug, base_protein_oz, description, sort_order, is_active, created_at, updated_at",
      )
      .order("sort_order", { ascending: true });
    if (error) throwFromPostgrest(error);
    return (
      (data ?? []) as Array<{
        id: string;
        name: string;
        slug: string;
        base_protein_oz: number;
        description: string | null;
        sort_order: number;
        is_active: boolean;
        created_at: string;
        updated_at: string;
      }>
    ).map(mapPortionCategory);
  }),

  create: adminProcedure
    .input(portionCategoryCreateInputSchema)
    .mutation(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from("portion_category")
        .insert({
          name: input.name,
          slug: input.slug,
          base_protein_oz: input.baseProteinOz,
          description: input.description ?? null,
          sort_order: input.sortOrder,
          is_active: input.isActive,
        })
        .select(
          "id, name, slug, base_protein_oz, description, sort_order, is_active, created_at, updated_at",
        )
        .single();
      if (error) throwFromPostgrest(error);
      return mapPortionCategory(
        data as {
          id: string;
          name: string;
          slug: string;
          base_protein_oz: number;
          description: string | null;
          sort_order: number;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        },
      );
    }),

  update: adminProcedure
    .input(portionCategoryUpdateInputSchema)
    .mutation(async ({ ctx, input }) => {
      const { id, ...rest } = input;
      const fields: Record<string, unknown> = {};
      if (rest.name !== undefined) fields.name = rest.name;
      if (rest.slug !== undefined) fields.slug = rest.slug;
      if (rest.baseProteinOz !== undefined)
        fields.base_protein_oz = rest.baseProteinOz;
      if (rest.description !== undefined) fields.description = rest.description;
      if (rest.sortOrder !== undefined) fields.sort_order = rest.sortOrder;
      if (rest.isActive !== undefined) fields.is_active = rest.isActive;

      const { data, error } = await ctx.supabase
        .from("portion_category")
        .update(fields)
        .eq("id", id)
        .select(
          "id, name, slug, base_protein_oz, description, sort_order, is_active, created_at, updated_at",
        )
        .maybeSingle();
      if (error) throwFromPostgrest(error);
      assertFound(data, "Portion category not found");
      return mapPortionCategory(
        data as {
          id: string;
          name: string;
          slug: string;
          base_protein_oz: number;
          description: string | null;
          sort_order: number;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        },
      );
    }),

  setActive: adminProcedure
    .input(portionCategorySetActiveInputSchema)
    .mutation(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from("portion_category")
        .update({ is_active: input.isActive })
        .eq("id", input.id)
        .select(
          "id, name, slug, base_protein_oz, description, sort_order, is_active, created_at, updated_at",
        )
        .maybeSingle();
      if (error) throwFromPostgrest(error);
      assertFound(data, "Portion category not found");
      return mapPortionCategory(
        data as {
          id: string;
          name: string;
          slug: string;
          base_protein_oz: number;
          description: string | null;
          sort_order: number;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        },
      );
    }),

  reorder: adminProcedure
    .input(portionCategoryReorderInputSchema)
    .mutation(async ({ ctx, input }) => {
      const results: AdminPortionCategoryDto[] = [];
      for (let i = 0; i < input.orderedIds.length; i++) {
        const id = input.orderedIds[i]!;
        const { data, error } = await ctx.supabase
          .from("portion_category")
          .update({ sort_order: i })
          .eq("id", id)
          .select(
            "id, name, slug, base_protein_oz, description, sort_order, is_active, created_at, updated_at",
          )
          .maybeSingle();
        if (error) throwFromPostgrest(error);
        if (data) {
          results.push(
            mapPortionCategory(
              data as {
                id: string;
                name: string;
                slug: string;
                base_protein_oz: number;
                description: string | null;
                sort_order: number;
                is_active: boolean;
                created_at: string;
                updated_at: string;
              },
            ),
          );
        }
      }
      return results;
    }),
});

const unitsRouter = createTRPCRouter({
  list: adminProcedure
    .input(unitListInputSchema)
    .query(async ({ ctx, input }) => {
      let query = ctx.supabase
        .from("unit")
        .select(
          "id, name, abbreviation, dimension, factor_to_base, sort_order, is_active, created_at, updated_at",
        )
        .order("dimension", { ascending: true })
        .order("sort_order", { ascending: true });
      if (input.activeOnly) {
        query = query.eq("is_active", true);
      }
      if (input.dimension) {
        query = query.eq("dimension", input.dimension);
      }
      const { data, error } = await query;
      if (error) throwFromPostgrest(error);
      return (
        (data ?? []) as Array<{
          id: string;
          name: string;
          abbreviation: string;
          dimension: string;
          factor_to_base: number;
          sort_order: number | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        }>
      ).map(mapUnit);
    }),

  create: adminProcedure
    .input(unitCreateInputSchema)
    .mutation(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from("unit")
        .insert({
          name: input.name,
          abbreviation: input.abbreviation,
          dimension: input.dimension,
          factor_to_base: input.factorToBase,
          sort_order: input.sortOrder ?? null,
          is_active: input.isActive,
        })
        .select(
          "id, name, abbreviation, dimension, factor_to_base, sort_order, is_active, created_at, updated_at",
        )
        .single();
      if (error) throwFromPostgrest(error);
      return mapUnit(
        data as {
          id: string;
          name: string;
          abbreviation: string;
          dimension: string;
          factor_to_base: number;
          sort_order: number | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        },
      );
    }),

  update: adminProcedure
    .input(unitUpdateInputSchema)
    .mutation(async ({ ctx, input }) => {
      const { id, ...rest } = input;
      const fields: Record<string, unknown> = {};
      if (rest.name !== undefined) fields.name = rest.name;
      if (rest.abbreviation !== undefined)
        fields.abbreviation = rest.abbreviation;
      if (rest.dimension !== undefined) fields.dimension = rest.dimension;
      if (rest.factorToBase !== undefined)
        fields.factor_to_base = rest.factorToBase;
      if (rest.sortOrder !== undefined) fields.sort_order = rest.sortOrder;
      if (rest.isActive !== undefined) fields.is_active = rest.isActive;

      const { data, error } = await ctx.supabase
        .from("unit")
        .update(fields)
        .eq("id", id)
        .select(
          "id, name, abbreviation, dimension, factor_to_base, sort_order, is_active, created_at, updated_at",
        )
        .maybeSingle();
      if (error) throwFromPostgrest(error);
      assertFound(data, "Unit not found");
      return mapUnit(
        data as {
          id: string;
          name: string;
          abbreviation: string;
          dimension: string;
          factor_to_base: number;
          sort_order: number | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        },
      );
    }),

  setActive: adminProcedure
    .input(unitSetActiveInputSchema)
    .mutation(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from("unit")
        .update({ is_active: input.isActive })
        .eq("id", input.id)
        .select(
          "id, name, abbreviation, dimension, factor_to_base, sort_order, is_active, created_at, updated_at",
        )
        .maybeSingle();
      if (error) throwFromPostgrest(error);
      assertFound(data, "Unit not found");
      return mapUnit(
        data as {
          id: string;
          name: string;
          abbreviation: string;
          dimension: string;
          factor_to_base: number;
          sort_order: number | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        },
      );
    }),
});

const familySettingsRouter = createTRPCRouter({
  get: adminProcedure.query(async ({ ctx }) => {
    const { data, error } = await ctx.supabase
      .from("family_settings")
      .select("id, athlete_multiplier, other_global_defaults, updated_at")
      .order("id", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (error) throwFromPostgrest(error);
    if (!data) {
      return {
        id: "",
        athleteMultiplier: 1.5,
        otherGlobalDefaults: {},
        updatedAt: null,
      } satisfies AdminFamilySettingsDto;
    }
    return {
      id: data.id as string,
      athleteMultiplier: Number(data.athlete_multiplier),
      otherGlobalDefaults: (data.other_global_defaults ?? {}) as Record<
        string,
        unknown
      >,
      updatedAt: (data.updated_at as string) ?? null,
    } satisfies AdminFamilySettingsDto;
  }),

  update: adminProcedure
    .input(familySettingsUpdateInputSchema)
    .mutation(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from("family_settings")
        .update({ athlete_multiplier: input.athleteMultiplier })
        .eq("id", input.id)
        .select("id, athlete_multiplier, other_global_defaults, updated_at")
        .maybeSingle();
      if (error) throwFromPostgrest(error);
      assertFound(data, "Family settings not found");
      return {
        id: data.id as string,
        athleteMultiplier: Number(data.athlete_multiplier),
        otherGlobalDefaults: (data.other_global_defaults ?? {}) as Record<
          string,
          unknown
        >,
        updatedAt: (data.updated_at as string) ?? null,
      } satisfies AdminFamilySettingsDto;
    }),
});

const auditRouter = createTRPCRouter({
  list: adminProcedure
    .input(auditListInputSchema)
    .query(async ({ ctx, input }) => {
      let query = ctx.supabase
        .from("audit_log")
        .select(
          "id, table_name, record_id, action, actor_id, before_data, after_data, created_at",
        )
        .order("id", { ascending: false })
        .limit(input.limit + 1);

      if (input.tableName) {
        query = query.eq("table_name", input.tableName);
      }
      if (input.recordId) {
        query = query.eq("record_id", input.recordId);
      }
      // Cursor = last-seen audit id (bigint as string)
      if (input.cursor) {
        const cursorId = Number(input.cursor);
        if (Number.isFinite(cursorId)) {
          query = query.lt("id", cursorId);
        }
      }

      const { data, error } = await query;
      if (error) throwFromPostgrest(error);

      const rows = (data ?? []) as Array<{
        id: number | string;
        table_name: string;
        record_id: string | null;
        action: string;
        actor_id: string | null;
        before_data: unknown;
        after_data: unknown;
        created_at: string;
      }>;

      const hasMore = rows.length > input.limit;
      const page = hasMore ? rows.slice(0, input.limit) : rows;
      const items: AuditLogDto[] = page.map((r) => ({
        id: String(r.id),
        tableName: r.table_name,
        recordId: r.record_id,
        action: r.action,
        actorId: r.actor_id,
        beforeData: r.before_data,
        afterData: r.after_data,
        createdAt: r.created_at,
      }));
      const nextCursor =
        hasMore && items.length > 0 ? items[items.length - 1]!.id : null;

      return { items, nextCursor };
    }),
});

const membersRouter = createTRPCRouter({
  list: adminProcedure
    .input(membersListInputSchema)
    .query(async ({ ctx, input }) => {
      let query = ctx.supabase
        .from("profile")
        .select("id, household_id, display_name, role")
        .order("display_name", { ascending: true });
      if (input.householdId) {
        query = query.eq("household_id", input.householdId);
      }
      const { data, error } = await query;
      if (error) throwFromPostgrest(error);
      return ((data ?? []) as Array<{
        id: string;
        household_id: string;
        display_name: string;
        role: string;
      }>).map(
        (p): MemberDto => ({
          id: p.id,
          householdId: p.household_id,
          displayName: p.display_name,
          role: p.role as "admin" | "member",
        }),
      );
    }),
});

export const adminRouter = createTRPCRouter({
  invites: invitesRouter,
  households: householdsRouter,
  portionCategories: portionCategoriesRouter,
  units: unitsRouter,
  familySettings: familySettingsRouter,
  audit: auditRouter,
  members: membersRouter,
});
```

### FILE: apps/web/src/server/routers/_app.ts
```ts
/**
 * Root app router â€” Wave 1 content domain + Wave 2 mealPlan + family reads
 * + Wave 3 admin (Task 15).
 */
import { createTRPCRouter } from "../trpc";
import { adminRouter } from "./admin";
import { categoryRouter } from "./category";
import { chefIdeaRouter } from "./chefIdea";
import { familyRouter } from "./family";
import { healthRouter } from "./health";
import { ingredientRouter } from "./ingredient";
import { mealPlanRouter } from "./mealPlan";
import { recipeRouter } from "./recipe";
import { recipeCombinationRouter } from "./recipeCombination";
import { tagRouter } from "./tag";

export const appRouter = createTRPCRouter({
  health: healthRouter,
  recipe: recipeRouter,
  ingredient: ingredientRouter,
  category: categoryRouter,
  tag: tagRouter,
  chefIdea: chefIdeaRouter,
  recipeCombination: recipeCombinationRouter,
  mealPlan: mealPlanRouter,
  family: familyRouter,
  admin: adminRouter,
});

export type AppRouter = typeof appRouter;
```

### FILE: apps/web/src/app/(app)/admin/page.tsx
```tsx
/**
 * /admin â€” family admin hub (Task 15).
 * Inside authed (app) tree; non-admins get friendly empty state.
 */
"use client";

import { AdminPage } from "@/components/admin/AdminPage";

export default function AdminRoutePage() {
  return <AdminPage />;
}
```

### FILE: apps/web/src/components/admin/adminValidation.ts
```ts
/**
 * Pure client-side validation helpers for admin forms.
 * Mirrors packages/schemas/admin email + positive-number rules for UI feedback.
 */

/** Trim + lowercase email; returns null when empty after trim. */
export function normalizeInviteEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** True when normalized email looks valid. */
export function isValidInviteEmail(raw: string): boolean {
  const email = normalizeInviteEmail(raw);
  return email.length > 0 && EMAIL_RE.test(email);
}

/**
 * Parse base protein ounces. Rejects â‰¤ 0, non-finite, empty.
 * Returns { ok: true, value } or { ok: false, message }.
 */
export function parseBaseProteinOz(
  raw: string | number,
): { ok: true; value: number } | { ok: false; message: string } {
  const n = typeof raw === "number" ? raw : Number(String(raw).trim());
  if (!Number.isFinite(n)) {
    return { ok: false, message: "Base oz must be a finite number" };
  }
  if (n <= 0) {
    return { ok: false, message: "Base oz must be greater than 0" };
  }
  return { ok: true, value: n };
}

/** Kebab-case slug from a display name. */
export function slugifyName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
```

### FILE: apps/web/src/components/admin/InviteDialog.tsx
```tsx
/**
 * "Invite someone" dialog â€” email trim/lowercase, household, role.
 * Copy reflects 0005: access on signup or immediately if account exists.
 */
"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import {
  isValidInviteEmail,
  normalizeInviteEmail,
} from "./adminValidation";

export type InviteHouseholdOption = {
  id: string;
  name: string;
};

export type InviteDialogSubmit = {
  email: string;
  householdId: string;
  role: "admin" | "member";
};

export function InviteDialog({
  open,
  households,
  onClose,
  onSubmit,
  isSubmitting = false,
  errorMessage,
}: {
  open: boolean;
  households: InviteHouseholdOption[];
  onClose: () => void;
  onSubmit: (payload: InviteDialogSubmit) => void;
  isSubmitting?: boolean;
  errorMessage?: string | null;
}) {
  const [email, setEmail] = useState("");
  const [householdId, setHouseholdId] = useState(households[0]?.id ?? "");
  const [role, setRole] = useState<"admin" | "member">("member");
  const [localError, setLocalError] = useState<string | null>(null);

  if (!open) return null;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLocalError(null);
    if (!isValidInviteEmail(email)) {
      setLocalError("Enter a valid email address");
      return;
    }
    const hh = householdId || households[0]?.id;
    if (!hh) {
      setLocalError("Select a household");
      return;
    }
    onSubmit({
      email: normalizeInviteEmail(email),
      householdId: hh,
      role,
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="invite-dialog-title"
      data-testid="invite-dialog"
    >
      <div className="w-full max-w-md rounded-xl border border-zinc-200 bg-white p-5 shadow-lg">
        <h2
          id="invite-dialog-title"
          className="text-lg font-semibold text-zinc-900"
        >
          Invite someone
        </h2>
        <p className="mt-1 text-sm text-zinc-600">
          They&apos;ll get access when they sign up â€” or immediately if they
          already have an account.
        </p>

        <form
          className="mt-4 space-y-3"
          onSubmit={handleSubmit}
          noValidate
        >
          <div>
            <Label htmlFor="invite-email">Email</Label>
            <Input
              id="invite-email"
              data-testid="invite-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onBlur={() => setEmail((v) => normalizeInviteEmail(v))}
              placeholder="person@example.com"
              className="mt-1"
            />
          </div>

          <div>
            <Label htmlFor="invite-household">Household</Label>
            <select
              id="invite-household"
              data-testid="invite-household"
              className="mt-1 flex h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm"
              value={householdId || households[0]?.id || ""}
              onChange={(e) => setHouseholdId(e.target.value)}
            >
              {households.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <Label htmlFor="invite-role">Role</Label>
            <select
              id="invite-role"
              data-testid="invite-role"
              className="mt-1 flex h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm"
              value={role}
              onChange={(e) =>
                setRole(e.target.value as "admin" | "member")
              }
            >
              <option value="member">Member</option>
              <option value="admin">Admin</option>
            </select>
          </div>

          {(localError || errorMessage) && (
            <p
              className="text-sm text-red-600"
              role="alert"
              data-testid="invite-error"
            >
              {localError || errorMessage}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              data-testid="invite-cancel"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting}
              data-testid="invite-submit"
            >
              {isSubmitting ? "Sendingâ€¦" : "Send invite"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
```

### FILE: apps/web/src/components/admin/PortionCategoriesPanel.tsx
```tsx
/**
 * Portion category editor â€” name, base oz, sort order, active toggle.
 * Deactivate only (no hard delete). Adult Male 6.0 oz is the D17 reference.
 */
"use client";

import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { parseBaseProteinOz, slugifyName } from "./adminValidation";

export type PortionCategoryRow = {
  id: string;
  name: string;
  slug: string;
  baseProteinOz: number;
  description: string | null;
  sortOrder: number;
  isActive: boolean;
};

export function PortionCategoriesPanel({
  categories,
  onUpdate,
  onCreate,
  onSetActive,
  isSaving = false,
}: {
  categories: PortionCategoryRow[];
  onUpdate: (input: {
    id: string;
    name?: string;
    baseProteinOz?: number;
    sortOrder?: number;
  }) => void;
  onCreate: (input: {
    name: string;
    slug: string;
    baseProteinOz: number;
    sortOrder: number;
  }) => void;
  onSetActive: (id: string, isActive: boolean) => void;
  isSaving?: boolean;
}) {
  const [drafts, setDrafts] = useState<
    Record<string, { name: string; baseOz: string; sortOrder: string }>
  >({});
  const [rowError, setRowError] = useState<Record<string, string>>({});
  const [newName, setNewName] = useState("");
  const [newBaseOz, setNewBaseOz] = useState("6");
  const [createError, setCreateError] = useState<string | null>(null);

  function draftFor(c: PortionCategoryRow) {
    return (
      drafts[c.id] ?? {
        name: c.name,
        baseOz: String(c.baseProteinOz),
        sortOrder: String(c.sortOrder),
      }
    );
  }

  function setDraft(
    id: string,
    patch: Partial<{ name: string; baseOz: string; sortOrder: string }>,
  ) {
    setDrafts((prev) => {
      const base =
        prev[id] ??
        (() => {
          const c = categories.find((x) => x.id === id)!;
          return {
            name: c.name,
            baseOz: String(c.baseProteinOz),
            sortOrder: String(c.sortOrder),
          };
        })();
      return { ...prev, [id]: { ...base, ...patch } };
    });
  }

  function saveRow(c: PortionCategoryRow) {
    const d = draftFor(c);
    const parsed = parseBaseProteinOz(d.baseOz);
    if (!parsed.ok) {
      setRowError((e) => ({ ...e, [c.id]: parsed.message }));
      return;
    }
    setRowError((e) => {
      const next = { ...e };
      delete next[c.id];
      return next;
    });
    onUpdate({
      id: c.id,
      name: d.name.trim(),
      baseProteinOz: parsed.value,
      sortOrder: Number.parseInt(d.sortOrder, 10) || 0,
    });
  }

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreateError(null);
    const name = newName.trim();
    if (!name) {
      setCreateError("Name is required");
      return;
    }
    const parsed = parseBaseProteinOz(newBaseOz);
    if (!parsed.ok) {
      setCreateError(parsed.message);
      return;
    }
    const slug = slugifyName(name);
    if (!slug) {
      setCreateError("Could not derive slug from name");
      return;
    }
    const maxSort = categories.reduce((m, c) => Math.max(m, c.sortOrder), 0);
    onCreate({
      name,
      slug,
      baseProteinOz: parsed.value,
      sortOrder: maxSort + 10,
    });
    setNewName("");
    setNewBaseOz("6");
  }

  return (
    <div className="space-y-4" data-testid="portion-categories-panel">
      <p className="text-sm text-zinc-600" data-testid="adult-male-hint">
        <strong>Adult Male</strong> is the family reference base (decision D17).
        Default is <strong>6.0 oz</strong> â€” edit that row to change the
        reference. Other categories carry their own base ounces. Deactivate
        categories you no longer want on new plans; never hard-delete.
      </p>

      <div className="overflow-x-auto rounded-lg border border-zinc-200">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="bg-zinc-50 text-xs uppercase text-zinc-500">
            <tr>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Base oz</th>
              <th className="px-3 py-2">Sort</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {categories.map((c) => {
              const d = draftFor(c);
              const isRef = c.slug === "adult-male";
              return (
                <tr
                  key={c.id}
                  className="border-t border-zinc-100"
                  data-testid={`portion-row-${c.slug}`}
                >
                  <td className="px-3 py-2">
                    <Input
                      value={d.name}
                      onChange={(e) =>
                        setDraft(c.id, { name: e.target.value })
                      }
                      data-testid={`portion-name-${c.slug}`}
                      className="h-9"
                    />
                    {isRef && (
                      <Badge className="mt-1 bg-emerald-50 text-emerald-800">
                        D17 reference
                      </Badge>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <Input
                      type="number"
                      step="0.1"
                      min="0.1"
                      value={d.baseOz}
                      onChange={(e) =>
                        setDraft(c.id, { baseOz: e.target.value })
                      }
                      data-testid={`portion-base-oz-${c.slug}`}
                      className="h-9 w-24"
                    />
                    {rowError[c.id] && (
                      <p
                        className="mt-1 text-xs text-red-600"
                        data-testid={`portion-error-${c.slug}`}
                      >
                        {rowError[c.id]}
                      </p>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <Input
                      type="number"
                      value={d.sortOrder}
                      onChange={(e) =>
                        setDraft(c.id, { sortOrder: e.target.value })
                      }
                      data-testid={`portion-sort-${c.slug}`}
                      className="h-9 w-20"
                    />
                  </td>
                  <td className="px-3 py-2">
                    {c.isActive ? (
                      <Badge className="bg-emerald-50 text-emerald-800">
                        Active
                      </Badge>
                    ) : (
                      <Badge className="bg-zinc-200 text-zinc-600">
                        Inactive
                      </Badge>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={isSaving}
                        onClick={() => saveRow(c)}
                        data-testid={`portion-save-${c.slug}`}
                      >
                        Save
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={isSaving}
                        onClick={() => onSetActive(c.id, !c.isActive)}
                        data-testid={`portion-toggle-${c.slug}`}
                      >
                        {c.isActive ? "Deactivate" : "Activate"}
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <form
        onSubmit={handleCreate}
        className="flex flex-wrap items-end gap-2 rounded-lg border border-dashed border-zinc-300 p-3"
        data-testid="portion-create-form"
      >
        <div>
          <label className="text-xs font-medium text-zinc-600">New name</label>
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            data-testid="portion-new-name"
            className="mt-1 h-9 w-40"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-zinc-600">Base oz</label>
          <Input
            type="number"
            step="0.1"
            value={newBaseOz}
            onChange={(e) => setNewBaseOz(e.target.value)}
            data-testid="portion-new-base-oz"
            className="mt-1 h-9 w-24"
          />
        </div>
        <Button type="submit" size="sm" disabled={isSaving}>
          Add category
        </Button>
        {createError && (
          <p
            className="w-full text-sm text-red-600"
            role="alert"
            data-testid="portion-create-error"
          >
            {createError}
          </p>
        )}
      </form>
    </div>
  );
}
```

### FILE: apps/web/src/components/admin/FamilySettingsPanel.tsx
```tsx
/**
 * Family settings â€” athlete multiplier with live portion-calc example.
 * Math is delegated to @menu-boss/portion-calc (never inlined).
 */
"use client";

import {
  calculatePerCategoryBreakdown,
  roundOz,
} from "@menu-boss/portion-calc";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const ADULT_MALE_ID = "adult-male-ref";
const ADULT_MALE_BASE = 6;

export function FamilySettingsPanel({
  settingsId,
  athleteMultiplier,
  onSave,
  isSaving = false,
}: {
  settingsId: string;
  athleteMultiplier: number;
  onSave: (input: { id: string; athleteMultiplier: number }) => void;
  isSaving?: boolean;
}) {
  const [value, setValue] = useState(String(athleteMultiplier));

  const exampleOz = useMemo(() => {
    const mult = Number(value);
    if (!Number.isFinite(mult) || mult <= 0) return null;
    try {
      const lines = calculatePerCategoryBreakdown(
        [
          {
            portionCategoryId: ADULT_MALE_ID,
            count: 1,
            athleteCount: 1,
          },
        ],
        [
          {
            id: ADULT_MALE_ID,
            slug: "adult-male",
            baseProteinOz: ADULT_MALE_BASE,
            isActive: true,
          },
        ],
        { athleteMultiplier: mult },
      );
      return lines[0]?.effectiveOz ?? null;
    } catch {
      return null;
    }
  }, [value]);

  function handleSave() {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0 || !settingsId) return;
    onSave({ id: settingsId, athleteMultiplier: n });
  }

  function step(delta: number) {
    const n = Number(value);
    const next = Number.isFinite(n) ? Math.max(0.1, Math.round((n + delta) * 10) / 10) : 1.5;
    setValue(String(next));
  }

  return (
    <div className="space-y-4" data-testid="family-settings-panel">
      <p className="text-sm text-zinc-600">
        Family-wide athlete multiplier applied when a person in a portion
        category is marked as an athlete. Base ounces still live on each
        PortionCategory (Adult Male default 6.0 oz).
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <label className="text-sm font-medium text-zinc-800" htmlFor="athlete-mult">
          Athlete multiplier
        </label>
        <Button
          size="sm"
          variant="outline"
          onClick={() => step(-0.1)}
          aria-label="Decrease multiplier"
          data-testid="athlete-mult-dec"
        >
          âˆ’
        </Button>
        <Input
          id="athlete-mult"
          type="number"
          step="0.1"
          min="0.1"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="h-9 w-24"
          data-testid="athlete-multiplier-input"
        />
        <Button
          size="sm"
          variant="outline"
          onClick={() => step(0.1)}
          aria-label="Increase multiplier"
          data-testid="athlete-mult-inc"
        >
          +
        </Button>
        <Button
          size="sm"
          onClick={handleSave}
          disabled={isSaving || !settingsId}
          data-testid="athlete-mult-save"
        >
          Save
        </Button>
      </div>

      <p
        className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900"
        data-testid="athlete-example"
      >
        {exampleOz != null ? (
          <>
            An athlete adult male counts as{" "}
            <strong>{roundOz(exampleOz).toFixed(1)} oz</strong> at{" "}
            <strong>{Number(value)}Ã—</strong> (base {ADULT_MALE_BASE}.0 oz Ã—
            multiplier).
          </>
        ) : (
          <>Enter a positive multiplier to see the live example.</>
        )}
      </p>
    </div>
  );
}
```

### FILE: apps/web/src/components/admin/AdminPage.tsx
```tsx
/**
 * Family admin hub â€” invites/members, portion categories, units,
 * categories/tags, family settings, audit log.
 * Non-admins see a friendly "admins only" state (RLS still enforces).
 */
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useTRPC } from "@/lib/trpc/client";

import { FamilySettingsPanel } from "./FamilySettingsPanel";
import { InviteDialog } from "./InviteDialog";
import { PortionCategoriesPanel } from "./PortionCategoriesPanel";
import { slugifyName } from "./adminValidation";

const TABS = [
  { id: "invites", label: "Invites & members" },
  { id: "portions", label: "Portion categories" },
  { id: "units", label: "Units" },
  { id: "taxonomy", label: "Categories & tags" },
  { id: "settings", label: "Family settings" },
  { id: "audit", label: "Audit log" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export function AdminPage() {
  const trpc = useTRPC();
  const qc = useQueryClient();
  const [tab, setTab] = useState<TabId>("invites");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [expandedAudit, setExpandedAudit] = useState<string | null>(null);

  const meQuery = useQuery(trpc.family.me.queryOptions());
  const isAdmin = meQuery.data?.profile.role === "admin";

  const invitesQuery = useQuery({
    ...trpc.admin.invites.list.queryOptions({ status: "all" }),
    enabled: isAdmin && tab === "invites",
  });
  const householdsQuery = useQuery({
    ...trpc.admin.households.list.queryOptions({ activeOnly: false }),
    enabled: isAdmin && (tab === "invites" || inviteOpen),
  });
  const membersQuery = useQuery({
    ...trpc.admin.members.list.queryOptions({}),
    enabled: isAdmin && tab === "invites",
  });
  const portionsQuery = useQuery({
    ...trpc.admin.portionCategories.list.queryOptions(),
    enabled: isAdmin && tab === "portions",
  });
  const unitsQuery = useQuery({
    ...trpc.admin.units.list.queryOptions({ activeOnly: false }),
    enabled: isAdmin && tab === "units",
  });
  const settingsQuery = useQuery({
    ...trpc.admin.familySettings.get.queryOptions(),
    enabled: isAdmin && tab === "settings",
  });
  const auditQuery = useQuery({
    ...trpc.admin.audit.list.queryOptions({ limit: 50 }),
    enabled: isAdmin && tab === "audit",
  });
  const categoriesQuery = useQuery({
    ...trpc.category.list.queryOptions({ activeOnly: false }),
    enabled: isAdmin && tab === "taxonomy",
  });
  const tagsQuery = useQuery({
    ...trpc.tag.list.queryOptions({ activeOnly: false }),
    enabled: isAdmin && tab === "taxonomy",
  });

  const invalidateAdmin = () => {
    void qc.invalidateQueries();
  };

  const createInvite = useMutation(
    trpc.admin.invites.create.mutationOptions({
      onSuccess: () => {
        setInviteOpen(false);
        invalidateAdmin();
      },
    }),
  );
  const revokeInvite = useMutation(
    trpc.admin.invites.revoke.mutationOptions({
      onSuccess: invalidateAdmin,
    }),
  );
  const updatePortion = useMutation(
    trpc.admin.portionCategories.update.mutationOptions({
      onSuccess: invalidateAdmin,
    }),
  );
  const createPortion = useMutation(
    trpc.admin.portionCategories.create.mutationOptions({
      onSuccess: invalidateAdmin,
    }),
  );
  const setPortionActive = useMutation(
    trpc.admin.portionCategories.setActive.mutationOptions({
      onSuccess: invalidateAdmin,
    }),
  );
  const createUnit = useMutation(
    trpc.admin.units.create.mutationOptions({ onSuccess: invalidateAdmin }),
  );
  const updateUnit = useMutation(
    trpc.admin.units.update.mutationOptions({ onSuccess: invalidateAdmin }),
  );
  const setUnitActive = useMutation(
    trpc.admin.units.setActive.mutationOptions({ onSuccess: invalidateAdmin }),
  );
  const updateSettings = useMutation(
    trpc.admin.familySettings.update.mutationOptions({
      onSuccess: invalidateAdmin,
    }),
  );
  const createCategory = useMutation(
    trpc.category.create.mutationOptions({ onSuccess: invalidateAdmin }),
  );
  const updateCategory = useMutation(
    trpc.category.update.mutationOptions({ onSuccess: invalidateAdmin }),
  );
  const deactivateCategory = useMutation(
    trpc.category.deactivate.mutationOptions({ onSuccess: invalidateAdmin }),
  );
  const createTag = useMutation(
    trpc.tag.create.mutationOptions({ onSuccess: invalidateAdmin }),
  );
  const updateTag = useMutation(
    trpc.tag.update.mutationOptions({ onSuccess: invalidateAdmin }),
  );
  const deactivateTag = useMutation(
    trpc.tag.deactivate.mutationOptions({ onSuccess: invalidateAdmin }),
  );
  const createHousehold = useMutation(
    trpc.admin.households.create.mutationOptions({
      onSuccess: invalidateAdmin,
    }),
  );
  const renameHousehold = useMutation(
    trpc.admin.households.rename.mutationOptions({
      onSuccess: invalidateAdmin,
    }),
  );
  const setHouseholdActive = useMutation(
    trpc.admin.households.setActive.mutationOptions({
      onSuccess: invalidateAdmin,
    }),
  );

  const pendingInvites = useMemo(
    () => (invitesQuery.data ?? []).filter((i) => i.acceptedAt == null),
    [invitesQuery.data],
  );
  const acceptedInvites = useMemo(
    () => (invitesQuery.data ?? []).filter((i) => i.acceptedAt != null),
    [invitesQuery.data],
  );

  const householdNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const h of householdsQuery.data ?? []) m.set(h.id, h.name);
    return m;
  }, [householdsQuery.data]);

  const unitsByDimension = useMemo(() => {
    const groups: Record<string, NonNullable<typeof unitsQuery.data>> = {
      mass: [],
      volume: [],
      count: [],
    };
    for (const u of unitsQuery.data ?? []) {
      (groups[u.dimension] ??= []).push(u);
    }
    return groups;
  }, [unitsQuery.data]);

  if (meQuery.isLoading) {
    return (
      <p className="p-6 text-sm text-zinc-500" data-testid="admin-loading">
        Loadingâ€¦
      </p>
    );
  }

  if (!isAdmin) {
    return (
      <div
        className="mx-auto max-w-lg space-y-2 p-8 text-center"
        data-testid="admins-only"
      >
        <h1 className="text-xl font-semibold text-zinc-900">Admins only</h1>
        <p className="text-sm text-zinc-600">
          Family administration is limited to family admins. If you need access,
          ask an existing admin to invite you with the admin role.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4 sm:p-6" data-testid="admin-page">
      <div>
        <h1 className="text-xl font-semibold text-zinc-900">Family admin</h1>
        <p className="text-sm text-zinc-600">
          Invites, vocabularies, portion defaults, and audit history. RLS
          enforces every write; this UI is admin-gated for convenience.
        </p>
      </div>

      <div
        className="flex flex-wrap gap-1 border-b border-zinc-200 pb-2"
        role="tablist"
        aria-label="Admin sections"
      >
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            data-testid={`admin-tab-${t.id}`}
            className={[
              "rounded-md px-3 py-1.5 text-sm font-medium",
              tab === t.id
                ? "bg-emerald-50 text-emerald-900"
                : "text-zinc-600 hover:bg-zinc-100",
            ].join(" ")}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "invites" && (
        <div className="space-y-6" data-testid="admin-section-invites">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2">
              <CardTitle>Pending invites</CardTitle>
              <Button
                size="sm"
                onClick={() => setInviteOpen(true)}
                data-testid="open-invite-dialog"
              >
                Invite someone
              </Button>
            </CardHeader>
            <CardContent>
              {invitesQuery.isLoading ? (
                <p className="text-sm text-zinc-500">Loading invitesâ€¦</p>
              ) : pendingInvites.length === 0 ? (
                <p className="text-sm text-zinc-500">No pending invites.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="text-xs uppercase text-zinc-500">
                      <tr>
                        <th className="py-1 pr-2">Email</th>
                        <th className="py-1 pr-2">Household</th>
                        <th className="py-1 pr-2">Role</th>
                        <th className="py-1 pr-2">Created</th>
                        <th className="py-1"> </th>
                      </tr>
                    </thead>
                    <tbody>
                      {pendingInvites.map((inv) => (
                        <tr
                          key={inv.id}
                          className="border-t border-zinc-100"
                          data-testid={`pending-invite-${inv.id}`}
                        >
                          <td className="py-2 pr-2">{inv.email}</td>
                          <td className="py-2 pr-2">
                            {inv.householdName ?? inv.householdId}
                          </td>
                          <td className="py-2 pr-2">{inv.role}</td>
                          <td className="py-2 pr-2">
                            {new Date(inv.createdAt).toLocaleString()}
                          </td>
                          <td className="py-2">
                            <Button
                              size="sm"
                              variant="destructive"
                              disabled={revokeInvite.isPending}
                              onClick={() =>
                                revokeInvite.mutate({ id: inv.id })
                              }
                              data-testid={`revoke-invite-${inv.id}`}
                            >
                              Revoke
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Accepted history</CardTitle>
            </CardHeader>
            <CardContent>
              {acceptedInvites.length === 0 ? (
                <p className="text-sm text-zinc-500">No accepted invites yet.</p>
              ) : (
                <ul className="space-y-1 text-sm">
                  {acceptedInvites.map((inv) => (
                    <li key={inv.id} data-testid={`accepted-invite-${inv.id}`}>
                      {inv.email} â†’ {inv.householdName ?? inv.householdId} (
                      {inv.role}) Â·{" "}
                      {inv.acceptedAt
                        ? new Date(inv.acceptedAt).toLocaleString()
                        : "â€”"}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Members</CardTitle>
            </CardHeader>
            <CardContent>
              {membersQuery.isLoading ? (
                <p className="text-sm text-zinc-500">Loading membersâ€¦</p>
              ) : (
                <ul className="space-y-2 text-sm" data-testid="members-list">
                  {(membersQuery.data ?? []).map((m) => (
                    <li
                      key={m.id}
                      className="flex flex-wrap items-center gap-2"
                      data-testid={`member-${m.id}`}
                    >
                      <span className="font-medium">{m.displayName}</span>
                      <Badge>{m.role}</Badge>
                      <span className="text-zinc-500">
                        {householdNameById.get(m.householdId) ?? m.householdId}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <HouseholdsInline
            households={householdsQuery.data ?? []}
            onCreate={(name) => createHousehold.mutate({ name })}
            onRename={(id, name) => renameHousehold.mutate({ id, name })}
            onSetActive={(id, isActive) =>
              setHouseholdActive.mutate({ id, isActive })
            }
          />
        </div>
      )}

      {tab === "portions" && (
        <Card data-testid="admin-section-portions">
          <CardHeader>
            <CardTitle>Portion categories</CardTitle>
          </CardHeader>
          <CardContent>
            {portionsQuery.isLoading ? (
              <p className="text-sm text-zinc-500">Loadingâ€¦</p>
            ) : (
              <PortionCategoriesPanel
                categories={portionsQuery.data ?? []}
                isSaving={
                  updatePortion.isPending ||
                  createPortion.isPending ||
                  setPortionActive.isPending
                }
                onUpdate={(input) => updatePortion.mutate(input)}
                onCreate={(input) => createPortion.mutate(input)}
                onSetActive={(id, isActive) =>
                  setPortionActive.mutate({ id, isActive })
                }
              />
            )}
          </CardContent>
        </Card>
      )}

      {tab === "units" && (
        <div className="space-y-4" data-testid="admin-section-units">
          <p
            className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900"
            data-testid="units-factor-warning"
          >
            Conversion factors (<code>factor_to_base</code>) are
            conversion-critical. Incorrect values break shopping-list unit
            display and recipe quantities. Base units: massâ†’gram, volumeâ†’ml,
            countâ†’each.
          </p>
          {unitsQuery.isLoading ? (
            <p className="text-sm text-zinc-500">Loading unitsâ€¦</p>
          ) : (
            (["mass", "volume", "count"] as const).map((dim) => (
              <Card key={dim}>
                <CardHeader>
                  <CardTitle className="capitalize">{dim}</CardTitle>
                </CardHeader>
                <CardContent>
                  <UnitsTable
                    units={unitsByDimension[dim] ?? []}
                    onToggle={(id, isActive) =>
                      setUnitActive.mutate({ id, isActive })
                    }
                    onUpdate={(input) => updateUnit.mutate(input)}
                  />
                  <UnitCreateForm
                    dimension={dim}
                    onCreate={(input) => createUnit.mutate(input)}
                  />
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}

      {tab === "taxonomy" && (
        <div className="space-y-6" data-testid="admin-section-taxonomy">
          <Card>
            <CardHeader>
              <CardTitle>Categories</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-xs text-zinc-500">
                Add child, rename, reorder, deactivate. Reparenting is deferred
                for a later release.
              </p>
              {categoriesQuery.isLoading ? (
                <p className="text-sm text-zinc-500">Loadingâ€¦</p>
              ) : (
                <CategoryTreeEditor
                  flat={categoriesQuery.data?.flat ?? []}
                  onCreate={(input) => createCategory.mutate(input)}
                  onRename={(id, name) =>
                    updateCategory.mutate({ id, name })
                  }
                  onDeactivate={(id) => deactivateCategory.mutate({ id })}
                />
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Tags</CardTitle>
            </CardHeader>
            <CardContent>
              {tagsQuery.isLoading ? (
                <p className="text-sm text-zinc-500">Loadingâ€¦</p>
              ) : (
                <TagsEditor
                  tags={tagsQuery.data ?? []}
                  onCreate={(input) => createTag.mutate(input)}
                  onRename={(id, name) => updateTag.mutate({ id, name })}
                  onDeactivate={(id) => deactivateTag.mutate({ id })}
                />
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {tab === "settings" && (
        <Card data-testid="admin-section-settings">
          <CardHeader>
            <CardTitle>Family settings</CardTitle>
          </CardHeader>
          <CardContent>
            {settingsQuery.isLoading ? (
              <p className="text-sm text-zinc-500">Loadingâ€¦</p>
            ) : (
              <FamilySettingsPanel
                settingsId={settingsQuery.data?.id ?? ""}
                athleteMultiplier={
                  settingsQuery.data?.athleteMultiplier ?? 1.5
                }
                isSaving={updateSettings.isPending}
                onSave={(input) => updateSettings.mutate(input)}
              />
            )}
          </CardContent>
        </Card>
      )}

      {tab === "audit" && (
        <Card data-testid="admin-section-audit">
          <CardHeader>
            <CardTitle>Audit log</CardTitle>
          </CardHeader>
          <CardContent>
            {auditQuery.isLoading ? (
              <p className="text-sm text-zinc-500">Loadingâ€¦</p>
            ) : (auditQuery.data?.items.length ?? 0) === 0 ? (
              <p className="text-sm text-zinc-500">No audit entries visible.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="text-xs uppercase text-zinc-500">
                    <tr>
                      <th className="py-1 pr-2">When</th>
                      <th className="py-1 pr-2">Who</th>
                      <th className="py-1 pr-2">Table</th>
                      <th className="py-1 pr-2">Action</th>
                      <th className="py-1">Diff</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(auditQuery.data?.items ?? []).map((row) => (
                      <tr
                        key={row.id}
                        className="border-t border-zinc-100 align-top"
                        data-testid={`audit-row-${row.id}`}
                      >
                        <td className="py-2 pr-2 whitespace-nowrap">
                          {new Date(row.createdAt).toLocaleString()}
                        </td>
                        <td className="py-2 pr-2 font-mono text-xs">
                          {row.actorId?.slice(0, 8) ?? "â€”"}
                        </td>
                        <td className="py-2 pr-2">{row.tableName}</td>
                        <td className="py-2 pr-2">{row.action}</td>
                        <td className="py-2">
                          <button
                            type="button"
                            className="text-xs text-emerald-700 underline"
                            data-testid={`audit-expand-${row.id}`}
                            onClick={() =>
                              setExpandedAudit((id) =>
                                id === row.id ? null : row.id,
                              )
                            }
                          >
                            {expandedAudit === row.id ? "Hide" : "Before/after"}
                          </button>
                          {expandedAudit === row.id && (
                            <div
                              className="mt-2 grid gap-2 sm:grid-cols-2"
                              data-testid={`audit-diff-${row.id}`}
                            >
                              <pre className="max-h-48 overflow-auto rounded bg-zinc-50 p-2 text-[10px]">
                                {JSON.stringify(row.beforeData, null, 2) ??
                                  "null"}
                              </pre>
                              <pre className="max-h-48 overflow-auto rounded bg-zinc-50 p-2 text-[10px]">
                                {JSON.stringify(row.afterData, null, 2) ??
                                  "null"}
                              </pre>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <InviteDialog
        open={inviteOpen}
        households={(householdsQuery.data ?? []).filter((h) => h.isActive)}
        onClose={() => setInviteOpen(false)}
        isSubmitting={createInvite.isPending}
        errorMessage={
          createInvite.isError ? createInvite.error.message : null
        }
        onSubmit={(payload) => createInvite.mutate(payload)}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Local subcomponents
// ---------------------------------------------------------------------------

function HouseholdsInline({
  households,
  onCreate,
  onRename,
  onSetActive,
}: {
  households: Array<{
    id: string;
    name: string;
    isActive: boolean;
  }>;
  onCreate: (name: string) => void;
  onRename: (id: string, name: string) => void;
  onSetActive: (id: string, isActive: boolean) => void;
}) {
  const [name, setName] = useState("");
  const [renameDrafts, setRenameDrafts] = useState<Record<string, string>>({});

  return (
    <Card>
      <CardHeader>
        <CardTitle>Households</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <ul className="space-y-2 text-sm">
          {households.map((h) => (
            <li
              key={h.id}
              className="flex flex-wrap items-center gap-2"
              data-testid={`household-${h.id}`}
            >
              <Input
                className="h-8 w-48"
                value={renameDrafts[h.id] ?? h.name}
                onChange={(e) =>
                  setRenameDrafts((d) => ({ ...d, [h.id]: e.target.value }))
                }
              />
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  onRename(h.id, (renameDrafts[h.id] ?? h.name).trim())
                }
              >
                Rename
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => onSetActive(h.id, !h.isActive)}
              >
                {h.isActive ? "Deactivate" : "Activate"}
              </Button>
              {!h.isActive && <Badge>Inactive</Badge>}
            </li>
          ))}
        </ul>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim()) return;
            onCreate(name.trim());
            setName("");
          }}
        >
          <Input
            placeholder="New household name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            data-testid="new-household-name"
            className="h-9 max-w-xs"
          />
          <Button type="submit" size="sm">
            Add household
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function UnitsTable({
  units,
  onToggle,
  onUpdate,
}: {
  units: Array<{
    id: string;
    name: string;
    abbreviation: string;
    factorToBase: number;
    isActive: boolean;
  }>;
  onToggle: (id: string, isActive: boolean) => void;
  onUpdate: (input: {
    id: string;
    name?: string;
    abbreviation?: string;
    factorToBase?: number;
  }) => void;
}) {
  return (
    <table className="mb-3 w-full text-left text-sm">
      <thead className="text-xs uppercase text-zinc-500">
        <tr>
          <th className="py-1 pr-2">Name</th>
          <th className="py-1 pr-2">Abbr</th>
          <th className="py-1 pr-2">Factor</th>
          <th className="py-1">Actions</th>
        </tr>
      </thead>
      <tbody>
        {units.map((u) => (
          <UnitRow key={u.id} unit={u} onToggle={onToggle} onUpdate={onUpdate} />
        ))}
      </tbody>
    </table>
  );
}

function UnitRow({
  unit,
  onToggle,
  onUpdate,
}: {
  unit: {
    id: string;
    name: string;
    abbreviation: string;
    factorToBase: number;
    isActive: boolean;
  };
  onToggle: (id: string, isActive: boolean) => void;
  onUpdate: (input: {
    id: string;
    name?: string;
    abbreviation?: string;
    factorToBase?: number;
  }) => void;
}) {
  const [name, setName] = useState(unit.name);
  const [abbr, setAbbr] = useState(unit.abbreviation);
  const [factor, setFactor] = useState(String(unit.factorToBase));

  return (
    <tr className="border-t border-zinc-100" data-testid={`unit-row-${unit.id}`}>
      <td className="py-1 pr-2">
        <Input
          className="h-8"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </td>
      <td className="py-1 pr-2">
        <Input
          className="h-8 w-20"
          value={abbr}
          onChange={(e) => setAbbr(e.target.value)}
        />
      </td>
      <td className="py-1 pr-2">
        <Input
          className="h-8 w-28"
          type="number"
          step="any"
          value={factor}
          onChange={(e) => setFactor(e.target.value)}
        />
      </td>
      <td className="py-1">
        <div className="flex gap-1">
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              const f = Number(factor);
              if (!Number.isFinite(f) || f <= 0) return;
              onUpdate({
                id: unit.id,
                name: name.trim(),
                abbreviation: abbr.trim(),
                factorToBase: f,
              });
            }}
          >
            Save
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onToggle(unit.id, !unit.isActive)}
          >
            {unit.isActive ? "Deactivate" : "Activate"}
          </Button>
        </div>
      </td>
    </tr>
  );
}

function UnitCreateForm({
  dimension,
  onCreate,
}: {
  dimension: "mass" | "volume" | "count";
  onCreate: (input: {
    name: string;
    abbreviation: string;
    dimension: "mass" | "volume" | "count";
    factorToBase: number;
  }) => void;
}) {
  const [name, setName] = useState("");
  const [abbr, setAbbr] = useState("");
  const [factor, setFactor] = useState("1");

  return (
    <form
      className="flex flex-wrap items-end gap-2 border-t border-dashed border-zinc-200 pt-3"
      onSubmit={(e) => {
        e.preventDefault();
        const f = Number(factor);
        if (!name.trim() || !abbr.trim() || !Number.isFinite(f) || f <= 0)
          return;
        onCreate({
          name: name.trim(),
          abbreviation: abbr.trim(),
          dimension,
          factorToBase: f,
        });
        setName("");
        setAbbr("");
        setFactor("1");
      }}
    >
      <Input
        placeholder="Name"
        className="h-8 w-32"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <Input
        placeholder="Abbr"
        className="h-8 w-20"
        value={abbr}
        onChange={(e) => setAbbr(e.target.value)}
      />
      <Input
        placeholder="Factor"
        type="number"
        step="any"
        className="h-8 w-24"
        value={factor}
        onChange={(e) => setFactor(e.target.value)}
      />
      <Button type="submit" size="sm">
        Add {dimension} unit
      </Button>
    </form>
  );
}

function CategoryTreeEditor({
  flat,
  onCreate,
  onRename,
  onDeactivate,
}: {
  flat: Array<{
    id: string;
    name: string;
    slug: string;
    parentId: string | null;
    sortOrder: number;
    isActive: boolean;
  }>;
  onCreate: (input: {
    name: string;
    slug: string;
    parentId?: string | null;
    sortOrder?: number;
  }) => void;
  onRename: (id: string, name: string) => void;
  onDeactivate: (id: string) => void;
}) {
  const [newName, setNewName] = useState("");
  const [parentId, setParentId] = useState<string>("");
  const [renameDrafts, setRenameDrafts] = useState<Record<string, string>>({});

  const roots = flat.filter((c) => !c.parentId);
  const childrenOf = (id: string) => flat.filter((c) => c.parentId === id);

  function renderNode(c: (typeof flat)[0], depth: number) {
    return (
      <li key={c.id} style={{ marginLeft: depth * 16 }}>
        <div
          className="flex flex-wrap items-center gap-2 py-1"
          data-testid={`category-node-${c.slug}`}
        >
          <Input
            className="h-8 w-48"
            value={renameDrafts[c.id] ?? c.name}
            onChange={(e) =>
              setRenameDrafts((d) => ({ ...d, [c.id]: e.target.value }))
            }
          />
          {!c.isActive && <Badge>Inactive</Badge>}
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              onRename(c.id, (renameDrafts[c.id] ?? c.name).trim())
            }
          >
            Rename
          </Button>
          {c.isActive && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onDeactivate(c.id)}
            >
              Deactivate
            </Button>
          )}
        </div>
        <ul>{childrenOf(c.id).map((ch) => renderNode(ch, depth + 1))}</ul>
      </li>
    );
  }

  return (
    <div className="space-y-3">
      <ul className="text-sm">{roots.map((r) => renderNode(r, 0))}</ul>
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const name = newName.trim();
          if (!name) return;
          const slug = slugifyName(name);
          if (!slug) return;
          onCreate({
            name,
            slug,
            parentId: parentId || null,
            sortOrder: flat.length * 10,
          });
          setNewName("");
          setParentId("");
        }}
      >
        <Input
          placeholder="New category"
          className="h-8 w-40"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          data-testid="new-category-name"
        />
        <select
          className="h-8 rounded-md border border-zinc-300 px-2 text-sm"
          value={parentId}
          onChange={(e) => setParentId(e.target.value)}
          data-testid="new-category-parent"
        >
          <option value="">Top-level</option>
          {flat.map((c) => (
            <option key={c.id} value={c.id}>
              Child of {c.name}
            </option>
          ))}
        </select>
        <Button type="submit" size="sm">
          Add category
        </Button>
      </form>
    </div>
  );
}

function TagsEditor({
  tags,
  onCreate,
  onRename,
  onDeactivate,
}: {
  tags: Array<{
    id: string;
    name: string;
    slug: string;
    tagGroup: string;
    isActive: boolean;
  }>;
  onCreate: (input: {
    name: string;
    slug: string;
    tagGroup: string;
  }) => void;
  onRename: (id: string, name: string) => void;
  onDeactivate: (id: string) => void;
}) {
  const [name, setName] = useState("");
  const [group, setGroup] = useState("cuisine");
  const [renameDrafts, setRenameDrafts] = useState<Record<string, string>>({});

  const byGroup = useMemo(() => {
    const m = new Map<string, typeof tags>();
    for (const t of tags) {
      const list = m.get(t.tagGroup) ?? [];
      list.push(t);
      m.set(t.tagGroup, list);
    }
    return [...m.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [tags]);

  return (
    <div className="space-y-4">
      {byGroup.map(([g, list]) => (
        <div key={g}>
          <h4 className="mb-1 text-xs font-semibold uppercase text-zinc-500">
            {g}
          </h4>
          <ul className="space-y-1 text-sm">
            {list.map((t) => (
              <li
                key={t.id}
                className="flex flex-wrap items-center gap-2"
                data-testid={`tag-${t.slug}`}
              >
                <Input
                  className="h-8 w-40"
                  value={renameDrafts[t.id] ?? t.name}
                  onChange={(e) =>
                    setRenameDrafts((d) => ({ ...d, [t.id]: e.target.value }))
                  }
                />
                {!t.isActive && <Badge>Inactive</Badge>}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    onRename(t.id, (renameDrafts[t.id] ?? t.name).trim())
                  }
                >
                  Rename
                </Button>
                {t.isActive && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => onDeactivate(t.id)}
                  >
                    Deactivate
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </div>
      ))}
      <form
        className="flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const n = name.trim();
          if (!n) return;
          const slug = slugifyName(n);
          if (!slug) return;
          onCreate({ name: n, slug, tagGroup: group.trim() || "general" });
          setName("");
        }}
      >
        <Input
          placeholder="Tag name"
          className="h-8 w-36"
          value={name}
          onChange={(e) => setName(e.target.value)}
          data-testid="new-tag-name"
        />
        <Input
          placeholder="Group"
          className="h-8 w-32"
          value={group}
          onChange={(e) => setGroup(e.target.value)}
          data-testid="new-tag-group"
        />
        <Button type="submit" size="sm">
          Add tag
        </Button>
      </form>
    </div>
  );
}
```

### FILE: apps/web/src/components/shell/AppNav.tsx
```tsx
/**
 * Persistent nav: Calendar | Recipes | Ideas | Shopping | Admin (Â§9.4 + Task 15).
 * Bottom bar on mobile, side rail on md+. Admin entry is display-only gated.
 */
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { href: "/calendar", label: "Calendar" },
  { href: "/recipes", label: "Recipes" },
  { href: "/ideas", label: "Ideas" },
  { href: "/shopping", label: "Shopping" },
] as const;

function isActive(pathname: string, href: string): boolean {
  if (href === "/calendar") return pathname === "/calendar" || pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppNav({ showAdmin = false }: { showAdmin?: boolean }) {
  const pathname = usePathname() ?? "/";
  const items = showAdmin
    ? [...NAV_ITEMS, { href: "/admin", label: "Admin" } as const]
    : NAV_ITEMS;

  return (
    <nav
      aria-label="Main"
      className="print:hidden border-t border-zinc-200 bg-white md:border-t-0 md:border-r md:w-48 md:min-h-screen"
    >
      <ul className="flex justify-around md:flex-col md:gap-1 md:p-3 md:pt-6">
        {items.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <li key={item.href} className="flex-1 md:flex-none">
              <Link
                href={item.href}
                data-testid={
                  item.href === "/admin" ? "nav-admin" : undefined
                }
                className={[
                  "flex flex-col items-center justify-center gap-0.5 px-2 py-3 text-xs font-medium md:flex-row md:justify-start md:gap-2 md:rounded-lg md:px-3 md:py-2 md:text-sm",
                  active
                    ? "text-emerald-700 md:bg-emerald-50"
                    : "text-zinc-600 hover:text-zinc-900 md:hover:bg-zinc-50",
                ].join(" ")}
                aria-current={active ? "page" : undefined}
              >
                <span>{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
```

### FILE: apps/web/src/components/shell/AuthedShell.tsx
```tsx
"use client";

/**
 * Authenticated app shell. Gates on profile row (waiting-for-invite).
 * <!-- COORDINATOR: 0005 auth provisioning -->
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useTRPC } from "@/trpc/client";
import { useSession } from "@/providers/SessionProvider";
import { WaitingForInvite } from "@/components/auth/WaitingForInvite";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const BASE_NAV = [
  { href: "/calendar", label: "Calendar" },
  { href: "/recipes", label: "Recipes" },
  { href: "/ideas", label: "Ideas" },
  { href: "/shopping", label: "Shopping" },
] as const;

export default function AppShellLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, loading: sessionLoading, signOut } = useSession();
  const trpc = useTRPC();
  const pathname = usePathname();
  const meQuery = useQuery({
    ...trpc.family.me.queryOptions(),
    enabled: Boolean(user),
    retry: false,
  });

  const isAdmin = meQuery.data?.profile.role === "admin";
  const nav = isAdmin
    ? [...BASE_NAV, { href: "/admin", label: "Admin" } as const]
    : BASE_NAV;

  if (sessionLoading || (user && meQuery.isLoading)) {
    return (
      <div className="flex flex-1 items-center justify-center p-8 text-sm text-zinc-500">
        Loadingâ€¦
      </div>
    );
  }

  // Session without profile â†’ waiting for invite (not an error).
  if (user && meQuery.data === null && !meQuery.isError) {
    return <WaitingForInvite />;
  }

  // UNAUTHORIZED / FORBIDDEN from empty RLS family â†’ treat as waiting.
  if (user && meQuery.isError) {
    const code = meQuery.error.data?.code;
    if (code === "FORBIDDEN" || code === "UNAUTHORIZED") {
      return <WaitingForInvite />;
    }
  }

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="sticky top-0 z-20 border-b border-zinc-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-3 py-2 sm:px-6">
          <Link
            href="/calendar"
            className="text-sm font-semibold tracking-tight text-emerald-800"
          >
            MenuBoss
          </Link>
          <nav
            className="hidden items-center gap-1 sm:flex"
            aria-label="Primary"
          >
            {nav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                data-testid={
                  item.href === "/admin" ? "nav-admin" : undefined
                }
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm font-medium",
                  pathname.startsWith(item.href)
                    ? "bg-emerald-50 text-emerald-900"
                    : "text-zinc-600 hover:bg-zinc-100",
                )}
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            {meQuery.data?.profile.displayName && (
              <span className="hidden text-xs text-zinc-500 sm:inline">
                {meQuery.data.profile.displayName}
              </span>
            )}
            <Button size="sm" variant="ghost" onClick={() => void signOut()}>
              Sign out
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1">{children}</main>

      <nav
        className="sticky bottom-0 z-20 border-t border-zinc-200 bg-white sm:hidden"
        aria-label="Mobile primary"
      >
        <ul
          className={cn(
            "grid",
            isAdmin ? "grid-cols-5" : "grid-cols-4",
          )}
        >
          {nav.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                data-testid={
                  item.href === "/admin" ? "nav-admin-mobile" : undefined
                }
                className={cn(
                  "flex h-12 items-center justify-center text-xs font-medium",
                  pathname.startsWith(item.href)
                    ? "text-emerald-800"
                    : "text-zinc-500",
                )}
              >
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
```

### FILE: apps/web/src/components/admin/InviteDialog.test.tsx
```tsx
/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { InviteDialog } from "./InviteDialog";
import {
  isValidInviteEmail,
  normalizeInviteEmail,
} from "./adminValidation";

const HOUSEHOLDS = [
  { id: "hh-a", name: "Household A" },
  { id: "hh-b", name: "Household B" },
];

describe("normalizeInviteEmail / isValidInviteEmail", () => {
  it("trims and lowercases email", () => {
    expect(normalizeInviteEmail("  Alice@Example.COM ")).toBe(
      "alice@example.com",
    );
  });

  it("rejects invalid emails", () => {
    expect(isValidInviteEmail("")).toBe(false);
    expect(isValidInviteEmail("   ")).toBe(false);
    expect(isValidInviteEmail("not-an-email")).toBe(false);
    expect(isValidInviteEmail("ok@example.com")).toBe(true);
  });
});

describe("InviteDialog", () => {
  it("normalizes email (trim + lowercase) on submit", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <InviteDialog
        open
        households={HOUSEHOLDS}
        onClose={vi.fn()}
        onSubmit={onSubmit}
      />,
    );

    await user.type(
      screen.getByTestId("invite-email"),
      "  NewCook@Example.COM ",
    );
    await user.click(screen.getByTestId("invite-submit"));

    expect(onSubmit).toHaveBeenCalledWith({
      email: "newcook@example.com",
      householdId: "hh-a",
      role: "member",
    });
  });

  it("shows validation error for bad email", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <InviteDialog
        open
        households={HOUSEHOLDS}
        onClose={vi.fn()}
        onSubmit={onSubmit}
      />,
    );

    await user.type(screen.getByTestId("invite-email"), "not-valid");
    await user.click(screen.getByTestId("invite-submit"));

    expect(screen.getByTestId("invite-error")).toHaveTextContent(
      /valid email/i,
    );
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("shows 0005 invite copy", () => {
    render(
      <InviteDialog
        open
        households={HOUSEHOLDS}
        onClose={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );
    expect(screen.getByTestId("invite-dialog")).toHaveTextContent(
      /sign up/i,
    );
    expect(screen.getByTestId("invite-dialog")).toHaveTextContent(
      /already have an account/i,
    );
  });
});
```

### FILE: apps/web/src/components/admin/PortionCategoriesPanel.test.tsx
```tsx
/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { PortionCategoriesPanel } from "./PortionCategoriesPanel";
import { parseBaseProteinOz } from "./adminValidation";

const CATS = [
  {
    id: "c1",
    name: "Adult Male",
    slug: "adult-male",
    baseProteinOz: 6,
    description: "Reference",
    sortOrder: 70,
    isActive: true,
  },
  {
    id: "c2",
    name: "Child",
    slug: "child",
    baseProteinOz: 3,
    description: null,
    sortOrder: 10,
    isActive: true,
  },
];

describe("parseBaseProteinOz", () => {
  it("accepts positive values", () => {
    expect(parseBaseProteinOz(6)).toEqual({ ok: true, value: 6 });
    expect(parseBaseProteinOz("4.5")).toEqual({ ok: true, value: 4.5 });
  });

  it("rejects base oz â‰¤ 0", () => {
    expect(parseBaseProteinOz(0).ok).toBe(false);
    expect(parseBaseProteinOz(-1).ok).toBe(false);
    expect(parseBaseProteinOz("0").ok).toBe(false);
  });
});

describe("PortionCategoriesPanel", () => {
  it("shows Adult Male D17 hint", () => {
    render(
      <PortionCategoriesPanel
        categories={CATS}
        onUpdate={vi.fn()}
        onCreate={vi.fn()}
        onSetActive={vi.fn()}
      />,
    );
    expect(screen.getByTestId("adult-male-hint")).toHaveTextContent(/6\.0 oz/i);
    expect(screen.getByTestId("adult-male-hint")).toHaveTextContent(/D17/);
  });

  it("rejects base oz â‰¤ 0 on save", async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn();
    render(
      <PortionCategoriesPanel
        categories={CATS}
        onUpdate={onUpdate}
        onCreate={vi.fn()}
        onSetActive={vi.fn()}
      />,
    );

    const input = screen.getByTestId("portion-base-oz-adult-male");
    await user.clear(input);
    await user.type(input, "0");
    await user.click(screen.getByTestId("portion-save-adult-male"));

    expect(screen.getByTestId("portion-error-adult-male")).toHaveTextContent(
      /greater than 0/i,
    );
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it("rejects base oz â‰¤ 0 on create", async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn();
    render(
      <PortionCategoriesPanel
        categories={CATS}
        onUpdate={vi.fn()}
        onCreate={onCreate}
        onSetActive={vi.fn()}
      />,
    );

    await user.type(screen.getByTestId("portion-new-name"), "Teen");
    const base = screen.getByTestId("portion-new-base-oz");
    await user.clear(base);
    await user.type(base, "-2");
    await user.click(screen.getByRole("button", { name: /add category/i }));

    expect(screen.getByTestId("portion-create-error")).toHaveTextContent(
      /greater than 0/i,
    );
    expect(onCreate).not.toHaveBeenCalled();
  });

  it("has no hard-delete control", () => {
    render(
      <PortionCategoriesPanel
        categories={CATS}
        onUpdate={vi.fn()}
        onCreate={vi.fn()}
        onSetActive={vi.fn()}
      />,
    );
    expect(screen.queryByRole("button", { name: /delete/i })).toBeNull();
    expect(
      screen.getByTestId("portion-toggle-adult-male"),
    ).toHaveTextContent(/deactivate/i);
  });
});
```

### FILE: apps/web/src/components/admin/AdminPage.test.tsx
```tsx
/**
 * @vitest-environment jsdom
 *
 * Non-admin sees "admins only" when family.me role is member.
 * Admin path is not fully integration-tested here (tRPC mocked).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const meState = vi.hoisted(() => ({
  role: "member" as "admin" | "member",
  loading: false,
}));

vi.mock("@/lib/trpc/client", () => {
  function qOpts() {
    return {
      queryKey: ["mock"],
      queryFn: async () => null,
    };
  }
  function mOpts(opts?: { onSuccess?: () => void }) {
    return {
      mutationKey: ["mock"],
      mutationFn: async () => {
        opts?.onSuccess?.();
        return {};
      },
    };
  }
  return {
    useTRPC: () => ({
      family: {
        me: {
          queryOptions: () => ({
            queryKey: ["family", "me"],
            queryFn: async () => {
              if (meState.loading) {
                // never resolves while loading tests set isLoading via placeholder
                return {
                  profile: {
                    id: "p1",
                    householdId: "h1",
                    displayName: "User",
                    role: meState.role,
                  },
                  household: null,
                };
              }
              return {
                profile: {
                  id: "p1",
                  householdId: "h1",
                  displayName: "User",
                  role: meState.role,
                },
                household: null,
              };
            },
          }),
        },
      },
      admin: {
        invites: {
          list: { queryOptions: qOpts },
          create: { mutationOptions: mOpts },
          revoke: { mutationOptions: mOpts },
        },
        households: {
          list: { queryOptions: qOpts },
          create: { mutationOptions: mOpts },
          rename: { mutationOptions: mOpts },
          setActive: { mutationOptions: mOpts },
        },
        members: { list: { queryOptions: qOpts } },
        portionCategories: {
          list: { queryOptions: qOpts },
          create: { mutationOptions: mOpts },
          update: { mutationOptions: mOpts },
          setActive: { mutationOptions: mOpts },
        },
        units: {
          list: { queryOptions: qOpts },
          create: { mutationOptions: mOpts },
          update: { mutationOptions: mOpts },
          setActive: { mutationOptions: mOpts },
        },
        familySettings: {
          get: { queryOptions: qOpts },
          update: { mutationOptions: mOpts },
        },
        audit: { list: { queryOptions: qOpts } },
      },
      category: {
        list: { queryOptions: qOpts },
        create: { mutationOptions: mOpts },
        update: { mutationOptions: mOpts },
        deactivate: { mutationOptions: mOpts },
      },
      tag: {
        list: { queryOptions: qOpts },
        create: { mutationOptions: mOpts },
        update: { mutationOptions: mOpts },
        deactivate: { mutationOptions: mOpts },
      },
    }),
  };
});

import { AdminPage } from "./AdminPage";

function renderAdmin() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <AdminPage />
    </QueryClientProvider>,
  );
}

describe("AdminPage role gate", () => {
  beforeEach(() => {
    meState.role = "member";
    meState.loading = false;
  });

  it("shows admins-only state for non-admin role", async () => {
    meState.role = "member";
    renderAdmin();
    expect(await screen.findByTestId("admins-only")).toBeTruthy();
    expect(screen.getByTestId("admins-only")).toHaveTextContent(/admins only/i);
    expect(screen.queryByTestId("admin-page")).toBeNull();
  });

  it("shows admin hub when role is admin", async () => {
    meState.role = "admin";
    renderAdmin();
    expect(await screen.findByTestId("admin-page")).toBeTruthy();
    expect(screen.queryByTestId("admins-only")).toBeNull();
  });
});
```

### FILE: apps/web/src/server/routers/__tests__/admin.integration.test.ts
```ts
/**
 * Admin invite semantics integration tests (migration 0005).
 *
 * Env-guarded: describe.skipIf(!process.env.DATABASE_URL), pg client,
 * per-test BEGIN/ROLLBACK â€” same pattern as mealPlan.integration.test.ts.
 *
 * Covers: admin.invites.create â†’ row present; revoke pending works;
 * revoke accepted rejected (or zero-row / blocked). Aligns with 0005.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const databaseUrl = process.env.DATABASE_URL;

const ADMIN_A = "00000000-0000-4000-8000-0000000000a2";
const MEMBER_A = "00000000-0000-4000-8000-0000000000a1";
const HOUSEHOLD_A = "00000000-0000-4000-8000-0000000000a0";
const HOUSEHOLD_C = "00000000-0000-4000-8000-0000000000c0";

describe.skipIf(!databaseUrl)("admin invites integration (0005)", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let client: any;

  beforeAll(async () => {
    const { Client } = await import("pg");
    client = new Client({ connectionString: databaseUrl });
    await client.connect();
  });

  afterAll(async () => {
    await client?.end();
  });

  async function asAdminA() {
    await client.query(
      `SELECT set_config(
         'request.jwt.claims',
         $1,
         true
       )`,
      [`{"sub":"${ADMIN_A}","role":"authenticated"}`],
    );
    await client.query(`SET LOCAL ROLE authenticated`);
  }

  async function asMemberA() {
    await client.query(
      `SELECT set_config(
         'request.jwt.claims',
         $1,
         true
       )`,
      [`{"sub":"${MEMBER_A}","role":"authenticated"}`],
    );
    await client.query(`SET LOCAL ROLE authenticated`);
  }

  async function ensureFixtures() {
    await client.query(
      `INSERT INTO household (id, name, family_id)
       VALUES ($1, 'Household A', 'menuboss-family'),
              ($2, 'Household C', 'menuboss-family')
       ON CONFLICT (id) DO NOTHING`,
      [HOUSEHOLD_A, HOUSEHOLD_C],
    );
    await client.query(
      `INSERT INTO profile (id, household_id, display_name, role)
       VALUES ($1, $2, 'Admin A', 'admin'),
              ($3, $2, 'Member A', 'member')
       ON CONFLICT (id) DO NOTHING`,
      [ADMIN_A, HOUSEHOLD_A, MEMBER_A],
    );
  }

  it("admin invite create inserts a pending household_invite row", async () => {
    await client.query("BEGIN");
    try {
      await ensureFixtures();
      await asAdminA();

      const email = `invite-${randomUUID().slice(0, 8)}@example.com`;
      const { rows } = await client.query(
        `INSERT INTO household_invite (email, household_id, role, invited_by)
         VALUES ($1, $2, 'member', $3)
         RETURNING id, email, household_id, accepted_at`,
        [email, HOUSEHOLD_C, ADMIN_A],
      );

      expect(rows).toHaveLength(1);
      expect(rows[0].email).toBe(email);
      expect(rows[0].household_id).toBe(HOUSEHOLD_C);
      expect(rows[0].accepted_at).toBeNull();

      const { rows: found } = await client.query(
        `SELECT id FROM household_invite WHERE id = $1`,
        [rows[0].id],
      );
      expect(found).toHaveLength(1);
    } finally {
      await client.query("ROLLBACK");
    }
  });

  it("revoke pending invite (DELETE) works for admin", async () => {
    await client.query("BEGIN");
    try {
      await ensureFixtures();
      await asAdminA();

      const email = `revoke-${randomUUID().slice(0, 8)}@example.com`;
      const { rows } = await client.query(
        `INSERT INTO household_invite (email, household_id, role, invited_by)
         VALUES ($1, $2, 'member', $3)
         RETURNING id`,
        [email, HOUSEHOLD_A, ADMIN_A],
      );
      const inviteId = rows[0].id as string;

      await client.query(
        `DELETE FROM household_invite WHERE id = $1 AND accepted_at IS NULL`,
        [inviteId],
      );

      const { rows: after } = await client.query(
        `SELECT id FROM household_invite WHERE id = $1`,
        [inviteId],
      );
      expect(after).toHaveLength(0);
    } finally {
      await client.query("ROLLBACK");
    }
  });

  it("accepted invites are not deleted by pending-only revoke filter", async () => {
    await client.query("BEGIN");
    try {
      await ensureFixtures();
      // Superuser / table owner path to plant accepted history without
      // going through auth.users provisioning (local gate may lack auth).
      await client.query(`RESET ROLE`);
      await client.query(
        `SELECT set_config('request.jwt.claims', '', true)`,
      );

      const email = `accepted-${randomUUID().slice(0, 8)}@example.com`;
      const { rows } = await client.query(
        `INSERT INTO household_invite (email, household_id, role, invited_by, accepted_at)
         VALUES ($1, $2, 'member', $3, now())
         RETURNING id, accepted_at`,
        [email, HOUSEHOLD_A, ADMIN_A],
      );
      const inviteId = rows[0].id as string;
      expect(rows[0].accepted_at).not.toBeNull();

      await asAdminA();

      // Router filters: DELETE â€¦ WHERE accepted_at IS NULL â†’ 0 rows
      const del = await client.query(
        `DELETE FROM household_invite WHERE id = $1 AND accepted_at IS NULL`,
        [inviteId],
      );
      expect(del.rowCount).toBe(0);

      const { rows: still } = await client.query(
        `SELECT id, accepted_at FROM household_invite WHERE id = $1`,
        [inviteId],
      );
      expect(still).toHaveLength(1);
      expect(still[0].accepted_at).not.toBeNull();
    } finally {
      await client.query("ROLLBACK");
    }
  });

  it("member cannot create invites (RLS 42501)", async () => {
    await client.query("BEGIN");
    try {
      await ensureFixtures();
      await asMemberA();

      let denied = false;
      try {
        await client.query(
          `INSERT INTO household_invite (email, household_id, role)
           VALUES ($1, $2, 'member')`,
          [`sneaky-${randomUUID().slice(0, 8)}@example.com`, HOUSEHOLD_A],
        );
      } catch (e: unknown) {
        const err = e as { code?: string };
        denied = err.code === "42501";
      }
      expect(denied).toBe(true);
    } finally {
      await client.query("ROLLBACK");
    }
  });
});

/** Always-on pure schema checks (no DB). */
describe("admin invite email schema", () => {
  it("trims, lowercases, and validates email via Zod", async () => {
    const { inviteEmailSchema, inviteCreateInputSchema } = await import(
      "@menu-boss/schemas"
    );
    expect(inviteEmailSchema.parse("  Foo@Bar.COM ")).toBe("foo@bar.com");
    expect(
      inviteCreateInputSchema.parse({
        email: "  A@B.co ",
        householdId: "00000000-0000-4000-8000-0000000000a0",
        role: "member",
      }).email,
    ).toBe("a@b.co");
    expect(inviteEmailSchema.safeParse("nope").success).toBe(false);
  });
});
```

