/**
 * Seed persona IDs (supabase/seed.sql reference card) + E2E auth credentials.
 * Auth user ids MUST equal profile UUIDs so RLS helpers (auth.uid()) line up.
 */

export const PERSONAS = {
  member_a: {
    id: "00000000-0000-4000-8000-0000000000a1",
    email: "member_a@test.menuboss.local",
    password: "e2e-test-password-member-a",
    displayName: "Member A",
    householdId: "00000000-0000-4000-8000-0000000000a0",
    storageState: "e2e/.auth/member_a.json",
  },
  admin_a: {
    id: "00000000-0000-4000-8000-0000000000a2",
    email: "admin_a@test.menuboss.local",
    password: "e2e-test-password-admin-a",
    displayName: "Admin A",
    householdId: "00000000-0000-4000-8000-0000000000a0",
    storageState: "e2e/.auth/admin_a.json",
  },
  member_b: {
    id: "00000000-0000-4000-8000-0000000000b1",
    email: "member_b@test.menuboss.local",
    password: "e2e-test-password-member-b",
    displayName: "Member B",
    householdId: "00000000-0000-4000-8000-0000000000b0",
    storageState: "e2e/.auth/member_b.json",
  },
  /** Control persona for Scenario 11 (never shared). Storage state optional. */
  member_c: {
    id: "00000000-0000-4000-8000-0000000000c1",
    email: "member_c@test.menuboss.local",
    password: "e2e-test-password-member-c",
    displayName: "Member C",
    householdId: "00000000-0000-4000-8000-0000000000c0",
    storageState: "e2e/.auth/member_c.json",
  },
} as const;

export type PersonaKey = keyof typeof PERSONAS;

/** Fixed UUIDs for E2E content fixtures provisioned in global-setup (idempotent). */
export const E2E_FIXTURES = {
  seafoodRecipeId: "00000000-0000-4000-8000-00000000e101",
  linkedRecipeId: "00000000-0000-4000-8000-00000000e102",
  shoppingRecipeAId: "00000000-0000-4000-8000-00000000e103",
  shoppingRecipeBId: "00000000-0000-4000-8000-00000000e104",
  tunaIngredientId: "00000000-0000-4000-8000-00000000e201",
  flourIngredientId: "00000000-0000-4000-8000-00000000e202",
  parsleyIngredientId: "00000000-0000-4000-8000-00000000e203",
  unitGramId: "00000000-0000-4000-8000-000000000101",
  unitCupId: "00000000-0000-4000-8000-000000000115",
  unitEachId: "00000000-0000-4000-8000-000000000121",
  categorySeafoodId: "00000000-0000-4000-8000-000000000411",
  categoryGrainsId: "00000000-0000-4000-8000-000000000421",
  categoryVegetableId: "00000000-0000-4000-8000-000000000403",
  tagDinnerId: "00000000-0000-4000-8000-000000000503",
  tagEasyId: "00000000-0000-4000-8000-000000000541",
  adultMaleId: "00000000-0000-4000-8000-000000000207",
  adultFemaleId: "00000000-0000-4000-8000-000000000206",
  seafoodRecipeTitle: "E2E Seared Tuna Steak",
  linkedRecipeTitle: "E2E Tuna Salad Melt",
  shoppingRecipeATitle: "E2E Shopping Plan A Loaf",
  shoppingRecipeBTitle: "E2E Shopping Plan B Loaf",
} as const;

/**
 * Expected live protein total for the plan-shared-meal flow:
 * Adult Male count=2 athlete=1, base 6.0 oz, family multiplier 1.5
 * → ((2 − 1) + 1 × 1.5) × 6 = 15
 */
export const PLAN_FLOW_EXPECTED_PROTEIN_OZ = 15;
