/**
 * admin router — family admin surface (Task 15).
 * Every procedure is adminProcedure (UX gate); RLS is sole write authority.
 * Thin Supabase pass-throughs; 42501 → FORBIDDEN via throwFromPostgrest.
 *
 * Invite model (0005): admin creates household_invite; signup/invite order
 * does not matter — both directions provision profile. Revoke = DELETE of
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
