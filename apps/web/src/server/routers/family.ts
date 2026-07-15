/**
 * family router — profile/me, households, portion categories, family settings.
 * Read-only surface for auth gate + MealPlan editor (Task 11).
 * Auth: JWT supabase client; RLS owns authorization.
 *
 * <!-- COORDINATOR: 0005 auth provisioning -->
 * Profile rows are provisioned by the admin invite flow + SECURITY DEFINER
 * auth hook (migration 0005). Callers without a profile row see empty me /
 * waiting-for-invite — not an error.
 */
import { assertFound, throwFromPostgrest } from "../dbErrors";
import { authedProcedure, createTRPCRouter } from "../trpc";

export type ProfileDto = {
  id: string;
  householdId: string;
  displayName: string;
  role: "admin" | "member";
};

export type HouseholdDto = {
  id: string;
  name: string;
  familyId: string;
  isActive: boolean;
};

export type PortionCategoryDto = {
  id: string;
  name: string;
  slug: string;
  baseProteinOz: number;
  description: string | null;
  sortOrder: number;
  isActive: boolean;
};

export type FamilySettingsDto = {
  id: string;
  athleteMultiplier: number;
};

export const familyRouter = createTRPCRouter({
  /**
   * Current user's profile + household.
   * Returns null when session is valid but no profile row exists
   * (waiting for family invite — RLS empty / is_family_member false).
   */
  me: authedProcedure.query(async ({ ctx }) => {
    const { data, error } = await ctx.supabase
      .from("profile")
      .select("id, household_id, display_name, role")
      .eq("id", ctx.userId)
      .maybeSingle();
    if (error) throwFromPostgrest(error);
    if (!data) return null;

    const { data: household, error: hhErr } = await ctx.supabase
      .from("household")
      .select("id, name, family_id, is_active")
      .eq("id", data.household_id as string)
      .maybeSingle();
    if (hhErr) throwFromPostgrest(hhErr);

    const profile: ProfileDto = {
      id: data.id as string,
      householdId: data.household_id as string,
      displayName: data.display_name as string,
      role: data.role as "admin" | "member",
    };

    const householdDto: HouseholdDto | null = household
      ? {
          id: household.id as string,
          name: household.name as string,
          familyId: household.family_id as string,
          isActive: Boolean(household.is_active),
        }
      : null;

    return { profile, household: householdDto };
  }),

  /** Active households in the family (share checklist). */
  households: authedProcedure.query(async ({ ctx }) => {
    const { data, error } = await ctx.supabase
      .from("household")
      .select("id, name, family_id, is_active")
      .eq("is_active", true)
      .order("name", { ascending: true });
    if (error) throwFromPostgrest(error);
    return ((data ?? []) as Array<{
      id: string;
      name: string;
      family_id: string;
      is_active: boolean;
    }>).map(
      (h): HouseholdDto => ({
        id: h.id,
        name: h.name,
        familyId: h.family_id,
        isActive: h.is_active,
      }),
    );
  }),

  /**
   * Portion categories for the editor grid.
   * Includes inactive so historical plan rows can render read-only (D11).
   */
  portionCategories: authedProcedure.query(async ({ ctx }) => {
    const { data, error } = await ctx.supabase
      .from("portion_category")
      .select(
        "id, name, slug, base_protein_oz, description, sort_order, is_active",
      )
      .order("sort_order", { ascending: true });
    if (error) throwFromPostgrest(error);
    return ((data ?? []) as Array<{
      id: string;
      name: string;
      slug: string;
      base_protein_oz: number;
      description: string | null;
      sort_order: number;
      is_active: boolean;
    }>).map(
      (c): PortionCategoryDto => ({
        id: c.id,
        name: c.name,
        slug: c.slug,
        baseProteinOz: Number(c.base_protein_oz),
        description: c.description,
        sortOrder: c.sort_order,
        isActive: c.is_active,
      }),
    );
  }),

  settings: authedProcedure.query(async ({ ctx }) => {
    const { data, error } = await ctx.supabase
      .from("family_settings")
      .select("id, athlete_multiplier")
      .order("id", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (error) throwFromPostgrest(error);
    if (!data) {
      return { id: "", athleteMultiplier: 1.5 } satisfies FamilySettingsDto;
    }
    return {
      id: data.id as string,
      athleteMultiplier: Number(data.athlete_multiplier),
    } satisfies FamilySettingsDto;
  }),

  /** Convenience: assert profile exists (throws NOT_FOUND otherwise). */
  requireMe: authedProcedure.query(async ({ ctx }) => {
    const { data, error } = await ctx.supabase
      .from("profile")
      .select("id, household_id, display_name, role")
      .eq("id", ctx.userId)
      .maybeSingle();
    if (error) throwFromPostgrest(error);
    assertFound(data, "Profile not provisioned — waiting for family invite");
    return {
      id: data.id as string,
      householdId: data.household_id as string,
      displayName: data.display_name as string,
      role: data.role as "admin" | "member",
    } satisfies ProfileDto;
  }),
});
