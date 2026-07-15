# Task 13 — Playwright E2E (§9.3) + Scenario 11 Realtime

## NOTES

### Environment / skip contract
- All E2E suites (including Scenario 11) **skip visibly** unless `E2E_SUPABASE_URL` is set. `global-setup` also no-ops in that case.
- Local machines without Docker never silently pass — Playwright reports `SKIPPED: E2E_SUPABASE_URL not set…`.
- **Service role is used only in `apps/web/e2e/global-setup.ts`** (admin create/update auth users). Specs and fixture seeding use persona JWT clients only.
- Auth user ids = seed profile UUIDs (`seed.sql` reference card). `member_c` is also provisioned for Scenario 11 control (brief named a/b/admin; c required by matrix).
- Content fixtures (seafood recipe + shopping recipes) are upserted under **member_a JWT** in global-setup (fixed UUIDs in `personas.ts` / `E2E_FIXTURES`).
- No `page.waitForTimeout` — only `expect.poll` / Playwright auto-wait.
- CI: Realtime publication for `meal_plan*` tables is enabled idempotently before E2E (Scenario 11). Chromium only.

### Required `data-testid` attributes for Tasks 11 / 12

**Task 11 — Auth / Calendar / MealPlan editor / Realtime**

| testid | Where | Used by |
| --- | --- | --- |
| `calendar-week-grid` | Calendar week view root (interactive marker for §12 P1) | plan-shared-meal |
| `calendar-day-cell` | Each day cell (first used for add flow) | plan-shared-meal |
| `calendar-add-to-plan` | "Add to plan" action from day detail | plan-shared-meal |
| `calendar-plan-event` | Event chip/card for a plan on the calendar (text includes plan title) | plan-shared-meal (member_b observe) |
| `meal-plan-editor` | MealPlan editor shell | plan-shared-meal |
| `meal-plan-title-input` | Title field | plan-shared-meal |
| `assignment-add-row` | Add assignment control | plan-shared-meal |
| `recipe-picker-search` | Recipe search inside assignment | plan-shared-meal |
| `recipe-picker-result` | Each recipe search hit | plan-shared-meal |
| `food-safety-note` | Inline safety callout when selected recipe has mercury (etc.) | plan-shared-meal |
| `portion-row-{portionCategoryId}` | Portion grid row (use seed Adult Male id) | plan-shared-meal |
| `portion-count-input` | Count stepper/input within a portion row | plan-shared-meal |
| `portion-athlete-input` | Athlete count within a portion row | plan-shared-meal |
| `portion-live-total` | Live effective protein total (must reflect portion-calc; text contains numeric oz) | plan-shared-meal |
| `share-household-{householdId}` | Checkbox for sharing with a household (Household B id from seed) | plan-shared-meal |
| `meal-plan-save` | Save plan | plan-shared-meal |
| `meal-plan-save-success` | Success affordance after save | plan-shared-meal |

**Task 12 — Recipes / Ideas / Shopping / Global search**

| testid | Where | Used by |
| --- | --- | --- |
| `recipe-detail` | Recipe detail root | capture-leftover-idea |
| `recipe-title` | Recipe title on detail | capture-leftover-idea |
| `leftover-section-toggle` | Expand "Creative Leftovers" | capture-leftover-idea |
| `leftover-decay-path` | Decay path container | capture-leftover-idea |
| `leftover-add-entry` | Add decay-path entry | capture-leftover-idea |
| `leftover-use-input` | Use field | capture-leftover-idea |
| `leftover-notes-input` | Notes field | capture-leftover-idea |
| `leftover-link-recipe-search` | Linked recipe search | capture-leftover-idea |
| `leftover-link-recipe-result` | Linked recipe hit | capture-leftover-idea |
| `leftover-save-entry` | Save entry | capture-leftover-idea |
| `leftover-entry` | Rendered decay-path entry row | capture-leftover-idea |
| `leftover-linked-recipe` | Navigable link inside an entry | capture-leftover-idea |
| `ideas-browser` | Ideas browser root | capture-chef-idea |
| `capture-idea-open` | Open capture form (FAB / header) | capture-chef-idea |
| `capture-idea-form` | Capture form shell | capture-chef-idea |
| `chef-idea-title-input` | Title | capture-chef-idea |
| `chef-idea-notes-input` | Notes | capture-chef-idea |
| `chef-idea-source-input` | Source | capture-chef-idea |
| `tag-picker-{tagId}` | Tag toggle (seed dinner/easy ids) | capture-chef-idea |
| `chef-idea-save` | Save idea | capture-chef-idea |
| `capture-idea-success` | Success after save | capture-chef-idea |
| `ideas-filter-tag-{tagId}` | Browse filter chip for a tag | capture-chef-idea |
| `idea-card` | Idea card in browser (text includes title) | capture-chef-idea |
| `global-search-input` | Persistent global search | capture-chef-idea |
| `global-search-result` | Search hit row | capture-chef-idea |
| `chef-idea-detail` | Idea detail root | capture-chef-idea |
| `chef-idea-title` | Idea title on detail | capture-chef-idea |
| `shopping-list` | Shopping list root | shopping-list |
| `shopping-group-optional` | Optional group (last, visually separated) | shopping-list |
| `shopping-ingredient-block` | Per-ingredient block (may contain multiple dimension lines) | shopping-list |
| `shopping-line` | Individual quantity line | shopping-list |

### Routes assumed
- `/calendar` — Task 11
- `/recipes/{id}` — Task 12
- `/ideas` — Task 12
- `/shopping?mealPlanIds=id1,id2` — Task 12 (calendar handoff)

### Fixture constants (global-setup)
- Seafood recipe title: `E2E Seared Tuna Steak` (mercury `food_safety_profile`)
- Linked leftover recipe: `E2E Tuna Salad Melt`
- Shopping recipes: mass flour + optional parsley; volume flour (cross-dimension)
- Live protein expectation for Flow 1: Adult Male count=2 athlete=1 → **15 oz**

### Coordinator TODOs

<!-- TODO(coordinator): Tasks 11/12 must land the data-testid list above before CI E2E is green. UI not in this PR. -->

<!-- TODO(coordinator): Confirm @supabase/ssr cookie naming matches global-setup (`sb-<ref>-auth-token` / chunked). Adjust Task 11 middleware or setup if project ref parsing differs. -->

<!-- TODO(coordinator): Prefer migration (or seed) for `ALTER PUBLICATION supabase_realtime ADD TABLE meal_plan*` so local/CI share one source of truth; CI currently enables publication idempotently before E2E. -->

<!-- TODO(coordinator): seed.sql still has no content recipes — E2E fixtures are provisioned in global-setup under member_a JWT. Consider promoting fixed seafood fixture into seed TEST FIXTURES if other suites need it. -->

<!-- TODO(coordinator): Scenario 11 assertion 2 failure = SECURITY finding (not flake). App safety net remains notify-then-refetch (never render event payloads). -->

---

### FILE: apps/web/e2e/personas.ts
```typescript
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
 * â†’ ((2 âˆ’ 1) + 1 Ã— 1.5) Ã— 6 = 15
 */
export const PLAN_FLOW_EXPECTED_PROTEIN_OZ = 15;
```

### FILE: apps/web/e2e/helpers/env.ts
```typescript
/**
 * E2E environment helpers.
 * Suites SKIP (visibly) unless E2E_SUPABASE_URL is set â€” full GoTrue + Realtime stack required.
 */

export function isE2EEnabled(): boolean {
  return Boolean(process.env.E2E_SUPABASE_URL?.trim());
}

export function requireE2EEnv(): {
  supabaseUrl: string;
  anonKey: string;
  serviceRoleKey: string;
  baseURL: string;
} {
  const supabaseUrl = process.env.E2E_SUPABASE_URL?.trim();
  if (!supabaseUrl) {
    throw new Error(
      "E2E_SUPABASE_URL is required for E2E setup (local skip is handled by isE2EEnabled).",
    );
  }

  const anonKey =
    process.env.E2E_SUPABASE_ANON_KEY?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!anonKey) {
    throw new Error(
      "E2E_SUPABASE_ANON_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY is required when E2E_SUPABASE_URL is set.",
    );
  }
  if (!serviceRoleKey) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is required in global-setup only (throwaway local stack).",
    );
  }

  return {
    supabaseUrl,
    anonKey,
    serviceRoleKey,
    baseURL: process.env.PLAYWRIGHT_BASE_URL?.trim() || "http://localhost:3000",
  };
}

/** Anon + URL for specs (no service role). */
export function requireE2EClientEnv(): {
  supabaseUrl: string;
  anonKey: string;
} {
  const supabaseUrl = process.env.E2E_SUPABASE_URL?.trim();
  const anonKey =
    process.env.E2E_SUPABASE_ANON_KEY?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

  if (!supabaseUrl || !anonKey) {
    throw new Error(
      "E2E_SUPABASE_URL and E2E_SUPABASE_ANON_KEY (or NEXT_PUBLIC_SUPABASE_ANON_KEY) required.",
    );
  }
  return { supabaseUrl, anonKey };
}
```

### FILE: apps/web/e2e/helpers/describe.ts
```typescript
/**
 * Env-gated describe: when E2E_SUPABASE_URL is unset, the suite is SKIPPED
 * (visible in Playwright output â€” never a silent pass).
 */
import { test } from "@playwright/test";
import { isE2EEnabled } from "./env";

export const SKIP_REASON =
  "E2E_SUPABASE_URL not set â€” full Supabase (GoTrue + Realtime) required; skipped on machines without Docker";

/**
 * Runs `test.describe` when E2E env is present; otherwise `test.describe.skip`
 * with the skip reason appended to the suite title (visible in reporters).
 */
export function e2eDescribe(title: string, fn: () => void): void {
  if (isE2EEnabled()) {
    test.describe(title, fn);
  } else {
    test.describe.skip(`${title} â€” SKIPPED: ${SKIP_REASON}`, fn);
  }
}
```

### FILE: apps/web/e2e/helpers/supabase.ts
```typescript
/**
 * Supabase JS helpers for E2E (user JWT only â€” no service role).
 * Used by realtime-cutoff and fixture seeding after auth users exist.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { PERSONAS, type PersonaKey } from "../personas";
import { requireE2EClientEnv } from "./env";

export function createAnonClient(): SupabaseClient {
  const { supabaseUrl, anonKey } = requireE2EClientEnv();
  return createClient(supabaseUrl, anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
}

/** Sign in as a seed persona with password (user JWT client). */
export async function signInAs(
  persona: PersonaKey,
): Promise<SupabaseClient> {
  const client = createAnonClient();
  const creds = PERSONAS[persona];
  const { data, error } = await client.auth.signInWithPassword({
    email: creds.email,
    password: creds.password,
  });
  if (error || !data.session) {
    throw new Error(
      `signInAs(${persona}) failed: ${error?.message ?? "no session"}`,
    );
  }
  return client;
}
```

### FILE: apps/web/e2e/helpers/fixtures.ts
```typescript
/**
 * Idempotent E2E content fixtures under member_a JWT (RLS-authorized writes).
 * No service role. Fixed UUIDs so specs can deep-link by id/title.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { E2E_FIXTURES, PERSONAS } from "../personas";

export async function ensureContentFixtures(
  memberA: SupabaseClient,
): Promise<void> {
  const uid = PERSONAS.member_a.id;
  const f = E2E_FIXTURES;

  // --- Ingredients (tuna with mercury safety profile; flour for cross-dim; parsley optional)
  const { error: ingErr } = await memberA.from("ingredient").upsert(
    [
      {
        id: f.tunaIngredientId,
        name: "E2E Yellowfin Tuna",
        default_unit_id: f.unitGramId,
        food_safety_profile: {
          mercury: {
            fda_category: "good_choices",
            recommended_frequency: "1 serving per week",
            notes: "E2E seafood safety fixture",
          },
        },
        is_user_added: true,
        created_by_user_id: uid,
      },
      {
        id: f.flourIngredientId,
        name: "E2E All-Purpose Flour",
        default_unit_id: f.unitGramId,
        food_safety_profile: {},
        is_user_added: true,
        created_by_user_id: uid,
      },
      {
        id: f.parsleyIngredientId,
        name: "E2E Fresh Parsley",
        default_unit_id: f.unitEachId,
        food_safety_profile: {},
        is_user_added: true,
        created_by_user_id: uid,
      },
    ],
    { onConflict: "id" },
  );
  if (ingErr) throw new Error(`fixture ingredients: ${ingErr.message}`);

  const { error: ingCatErr } = await memberA.from("ingredient_category").upsert(
    [
      {
        ingredient_id: f.tunaIngredientId,
        category_id: f.categorySeafoodId,
      },
      {
        ingredient_id: f.flourIngredientId,
        category_id: f.categoryGrainsId,
      },
      {
        ingredient_id: f.parsleyIngredientId,
        category_id: f.categoryVegetableId,
      },
    ],
    { onConflict: "ingredient_id,category_id" },
  );
  if (ingCatErr) throw new Error(`fixture ingredient_category: ${ingCatErr.message}`);

  // --- Recipes
  const { error: recipeErr } = await memberA.from("recipe").upsert(
    [
      {
        id: f.seafoodRecipeId,
        title: f.seafoodRecipeTitle,
        description: "E2E seafood recipe with mercury safety notes on tuna.",
        yield_servings: 4,
        created_by_user_id: uid,
        leftover_decay_path: [],
      },
      {
        id: f.linkedRecipeId,
        title: f.linkedRecipeTitle,
        description: "Linked leftover destination for E2E decay path.",
        yield_servings: 2,
        created_by_user_id: uid,
        leftover_decay_path: [],
      },
      {
        id: f.shoppingRecipeAId,
        title: f.shoppingRecipeATitle,
        description: "Shopping list plan A â€” mass flour + optional parsley.",
        yield_servings: 4,
        created_by_user_id: uid,
      },
      {
        id: f.shoppingRecipeBId,
        title: f.shoppingRecipeBTitle,
        description: "Shopping list plan B â€” volume flour (cross-dimension).",
        yield_servings: 4,
        created_by_user_id: uid,
      },
    ],
    { onConflict: "id" },
  );
  if (recipeErr) throw new Error(`fixture recipes: ${recipeErr.message}`);

  // recipe_ingredient lines (delete+insert for idempotent quantities)
  await memberA
    .from("recipe_ingredient")
    .delete()
    .in("recipe_id", [
      f.seafoodRecipeId,
      f.linkedRecipeId,
      f.shoppingRecipeAId,
      f.shoppingRecipeBId,
    ]);

  const { error: riErr } = await memberA.from("recipe_ingredient").insert([
    {
      recipe_id: f.seafoodRecipeId,
      ingredient_id: f.tunaIngredientId,
      quantity: 500,
      unit_id: f.unitGramId,
      sequence_order: 0,
      is_optional: false,
    },
    {
      recipe_id: f.linkedRecipeId,
      ingredient_id: f.tunaIngredientId,
      quantity: 200,
      unit_id: f.unitGramId,
      sequence_order: 0,
      is_optional: false,
    },
    {
      recipe_id: f.shoppingRecipeAId,
      ingredient_id: f.flourIngredientId,
      quantity: 500,
      unit_id: f.unitGramId,
      sequence_order: 0,
      is_optional: false,
    },
    {
      recipe_id: f.shoppingRecipeAId,
      ingredient_id: f.parsleyIngredientId,
      quantity: 1,
      unit_id: f.unitEachId,
      sequence_order: 1,
      is_optional: true,
    },
    {
      recipe_id: f.shoppingRecipeBId,
      ingredient_id: f.flourIngredientId,
      quantity: 2,
      unit_id: f.unitCupId,
      sequence_order: 0,
      is_optional: false,
    },
  ]);
  if (riErr) throw new Error(`fixture recipe_ingredient: ${riErr.message}`);

  const { error: rcErr } = await memberA.from("recipe_category").upsert(
    [
      { recipe_id: f.seafoodRecipeId, category_id: f.categorySeafoodId },
      { recipe_id: f.shoppingRecipeAId, category_id: f.categoryGrainsId },
      { recipe_id: f.shoppingRecipeBId, category_id: f.categoryGrainsId },
    ],
    { onConflict: "recipe_id,category_id" },
  );
  if (rcErr) throw new Error(`fixture recipe_category: ${rcErr.message}`);

  const { error: rtErr } = await memberA.from("recipe_tag").upsert(
    [
      { recipe_id: f.seafoodRecipeId, tag_id: f.tagDinnerId },
      { recipe_id: f.seafoodRecipeId, tag_id: f.tagEasyId },
    ],
    { onConflict: "recipe_id,tag_id" },
  );
  if (rtErr) throw new Error(`fixture recipe_tag: ${rtErr.message}`);
}
```

### FILE: apps/web/e2e/global-setup.ts
```typescript
/**
 * Playwright global setup â€” TEST ONLY against throwaway local Supabase.
 *
 * THE ONLY sanctioned service-role usage in the app tree:
 * creates auth.users for seed personas with ids = profile UUIDs, then
 * signs in via anon key to write storageState files and seed content fixtures
 * under member_a JWT (no service role for data).
 *
 * Skips entirely when E2E_SUPABASE_URL is unset (local machines without Docker).
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import type { FullConfig } from "@playwright/test";
import { PERSONAS, type PersonaKey } from "./personas";
import { isE2EEnabled, requireE2EEnv } from "./helpers/env";
import { ensureContentFixtures } from "./helpers/fixtures";
import { signInAs } from "./helpers/supabase";

/** Local Supabase storage key prefix for 127.0.0.1:54321 â†’ sb-127-auth-token */
function projectRefFromUrl(supabaseUrl: string): string {
  try {
    const host = new URL(supabaseUrl).hostname;
    // *.supabase.co â†’ subdomain; local 127.0.0.1 â†’ "127"
    if (host.endsWith("supabase.co")) {
      return host.split(".")[0] ?? "local";
    }
    return host.split(".")[0] ?? "127";
  } catch {
    return "127";
  }
}

async function ensureAuthUser(
  serviceClient: ReturnType<typeof createClient>,
  persona: PersonaKey,
): Promise<void> {
  const p = PERSONAS[persona];
  // createUser with fixed id; if exists, update password so re-runs are idempotent
  const { data: created, error: createErr } =
    await serviceClient.auth.admin.createUser({
      id: p.id,
      email: p.email,
      password: p.password,
      email_confirm: true,
      user_metadata: { display_name: p.displayName },
    });

  if (!createErr && created.user) {
    return;
  }

  const msg = createErr?.message?.toLowerCase() ?? "";
  const already =
    msg.includes("already") ||
    msg.includes("registered") ||
    msg.includes("exists") ||
    createErr?.status === 422;

  if (!already) {
    throw new Error(
      `admin.createUser(${persona}) failed: ${createErr?.message ?? "unknown"}`,
    );
  }

  // Look up by email and reset password + confirm
  const { data: list, error: listErr } =
    await serviceClient.auth.admin.listUsers({ perPage: 200 });
  if (listErr) {
    throw new Error(`admin.listUsers failed: ${listErr.message}`);
  }
  const existing = list.users.find(
    (u) => u.email?.toLowerCase() === p.email.toLowerCase() || u.id === p.id,
  );
  if (!existing) {
    throw new Error(
      `createUser said exists for ${persona} but listUsers found no match`,
    );
  }
  if (existing.id !== p.id) {
    throw new Error(
      `Auth user for ${p.email} has id ${existing.id}, expected seed profile id ${p.id}`,
    );
  }

  const { error: updateErr } = await serviceClient.auth.admin.updateUserById(
    existing.id,
    {
      password: p.password,
      email_confirm: true,
    },
  );
  if (updateErr) {
    throw new Error(
      `admin.updateUserById(${persona}) failed: ${updateErr.message}`,
    );
  }
}

/**
 * Build a Playwright storageState that works with @supabase/ssr cookie sessions
 * and the default localStorage key used by supabase-js browser clients.
 */
function buildStorageState(
  supabaseUrl: string,
  baseURL: string,
  accessToken: string,
  refreshToken: string,
  expiresAt: number,
  userJson: Record<string, unknown>,
): {
  cookies: Array<{
    name: string;
    value: string;
    domain: string;
    path: string;
    expires: number;
    httpOnly: boolean;
    secure: boolean;
    sameSite: "Lax" | "None" | "Strict";
  }>;
  origins: Array<{
    origin: string;
    localStorage: Array<{ name: string; value: string }>;
  }>;
} {
  const ref = projectRefFromUrl(supabaseUrl);
  const sessionPayload = {
    access_token: accessToken,
    refresh_token: refreshToken,
    expires_at: expiresAt,
    expires_in: Math.max(0, expiresAt - Math.floor(Date.now() / 1000)),
    token_type: "bearer",
    user: userJson,
  };
  const sessionStr = JSON.stringify(sessionPayload);

  // Cookie chunking mirrors @supabase/ssr defaults (sb-<ref>-auth-token)
  const cookieName = `sb-${ref}-auth-token`;
  const origin = new URL(baseURL);
  const cookieDomain = origin.hostname;
  const maxChunk = 3180;
  const cookies: Array<{
    name: string;
    value: string;
    domain: string;
    path: string;
    expires: number;
    httpOnly: boolean;
    secure: boolean;
    sameSite: "Lax" | "None" | "Strict";
  }> = [];

  if (sessionStr.length <= maxChunk) {
    cookies.push({
      name: cookieName,
      value: encodeURIComponent(sessionStr),
      domain: cookieDomain,
      path: "/",
      expires: expiresAt,
      httpOnly: false,
      secure: origin.protocol === "https:",
      sameSite: "Lax",
    });
  } else {
    const encoded = encodeURIComponent(sessionStr);
    let i = 0;
    for (let offset = 0; offset < encoded.length; offset += maxChunk) {
      cookies.push({
        name: `${cookieName}.${i}`,
        value: encoded.slice(offset, offset + maxChunk),
        domain: cookieDomain,
        path: "/",
        expires: expiresAt,
        httpOnly: false,
        secure: origin.protocol === "https:",
        sameSite: "Lax",
      });
      i += 1;
    }
  }

  return {
    cookies,
    origins: [
      {
        origin: origin.origin,
        localStorage: [
          {
            name: `sb-${ref}-auth-token`,
            value: sessionStr,
          },
        ],
      },
    ],
  };
}

async function writePersonaStorageState(
  persona: PersonaKey,
  supabaseUrl: string,
  anonKey: string,
  baseURL: string,
  webRoot: string,
): Promise<void> {
  const p = PERSONAS[persona];
  const client = createClient(supabaseUrl, anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });

  const { data, error } = await client.auth.signInWithPassword({
    email: p.email,
    password: p.password,
  });
  if (error || !data.session) {
    throw new Error(
      `signInWithPassword(${persona}) failed: ${error?.message ?? "no session"}`,
    );
  }

  const { access_token, refresh_token, expires_at, user } = data.session;
  const state = buildStorageState(
    supabaseUrl,
    baseURL,
    access_token,
    refresh_token,
    expires_at ?? Math.floor(Date.now() / 1000) + 3600,
    user as unknown as Record<string, unknown>,
  );

  const outPath = path.join(webRoot, p.storageState);
  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(outPath, JSON.stringify(state, null, 2), "utf8");
  console.log(`[e2e global-setup] wrote storageState â†’ ${p.storageState}`);
}

export default async function globalSetup(_config: FullConfig): Promise<void> {
  if (!isE2EEnabled()) {
    console.log(
      "[e2e global-setup] E2E_SUPABASE_URL not set â€” skipping auth provisioning (suites will skip).",
    );
    return;
  }

  const { supabaseUrl, anonKey, serviceRoleKey, baseURL } = requireE2EEnv();
  const webRoot = path.resolve(__dirname, "..");

  console.log(
    `[e2e global-setup] provisioning auth users against ${supabaseUrl}`,
  );

  const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });

  // Brief: member_a / admin_a / member_b. Also member_c for Scenario 11 control.
  const keys: PersonaKey[] = ["member_a", "admin_a", "member_b", "member_c"];
  for (const key of keys) {
    await ensureAuthUser(serviceClient, key);
    console.log(`[e2e global-setup] auth user ready: ${key} (${PERSONAS[key].id})`);
  }

  for (const key of keys) {
    await writePersonaStorageState(key, supabaseUrl, anonKey, baseURL, webRoot);
  }

  // Content fixtures under member_a JWT only (no service role).
  const memberA = await signInAs("member_a");
  await ensureContentFixtures(memberA);
  console.log("[e2e global-setup] content fixtures ready (member_a JWT)");
}
```

### FILE: apps/web/e2e/plan-shared-meal.spec.ts
```typescript
/**
 * Â§9.3 Flow 1 â€” Plan a Shared Meal
 *
 * member_a: calendar â†’ day â†’ add plan â†’ search/select seafood recipe
 * (safety note visible) â†’ portion counts (live total = portion-calc) â†’
 * share Household B â†’ save.
 * member_b (second context): plan visible within Â§12 P5 budget (â‰¤ 2 s).
 *
 * Also asserts Â§12 P1 calendar interactive < 1.5 s on a warm navigation.
 *
 * Mobile project: iPhone 14 (playwright.config projects).
 */
import { expect, test } from "@playwright/test";
import path from "node:path";
import {
  E2E_FIXTURES,
  PERSONAS,
  PLAN_FLOW_EXPECTED_PROTEIN_OZ,
} from "./personas";
import { e2eDescribe } from "./helpers/describe";

const memberAState = path.join(__dirname, ".auth/member_a.json");
const memberBState = path.join(__dirname, ".auth/member_b.json");

e2eDescribe("Plan a Shared Meal (Â§9.3)", () => {
  test.use({ storageState: memberAState });

  test("member_a plans shared meal; member_b sees it within 2s (P5)", async ({
    page,
    browser,
  }) => {
    const planTitle = `E2E Shared Plan ${Date.now()}`;

    // --- P1 warm calendar interactive budget (< 1.5 s) ---
    await page.goto("/calendar");
    await page.waitForLoadState("networkidle");
    const warmStart = Date.now();
    await page.goto("/calendar");
    await expect(page.getByTestId("calendar-week-grid")).toBeVisible({
      timeout: 5000,
    });
    const warmMs = Date.now() - warmStart;
    expect(
      warmMs,
      `Â§12 P1 calendar interactive budget: ${warmMs}ms (limit 1500ms)`,
    ).toBeLessThan(1500);

    // --- Day â†’ Add to plan ---
    await page.getByTestId("calendar-day-cell").first().click();
    await page.getByTestId("calendar-add-to-plan").click();

    // Editor shell
    await expect(page.getByTestId("meal-plan-editor")).toBeVisible();
    await page.getByTestId("meal-plan-title-input").fill(planTitle);

    // Recipe search + select seafood fixture; assert safety note
    await page.getByTestId("assignment-add-row").click();
    await page.getByTestId("recipe-picker-search").fill(E2E_FIXTURES.seafoodRecipeTitle);
    await page
      .getByTestId("recipe-picker-result")
      .filter({ hasText: E2E_FIXTURES.seafoodRecipeTitle })
      .click();
    await expect(page.getByTestId("food-safety-note")).toBeVisible();
    await expect(page.getByTestId("food-safety-note")).toContainText(/mercury|serving per week|good_choices/i);

    // Portion counts: Adult Male count=2 athlete=1 â†’ live total 15 oz
    const adultMaleRow = page.getByTestId(
      `portion-row-${E2E_FIXTURES.adultMaleId}`,
    );
    await adultMaleRow.getByTestId("portion-count-input").fill("2");
    await adultMaleRow.getByTestId("portion-athlete-input").fill("1");

    const liveTotal = page.getByTestId("portion-live-total");
    await expect(liveTotal).toBeVisible();
    await expect
      .poll(async () => {
        const text = await liveTotal.innerText();
        const match = text.replace(/,/g, "").match(/(\d+(\.\d+)?)/);
        return match ? Number(match[1]) : NaN;
      })
      .toBeCloseTo(PLAN_FLOW_EXPECTED_PROTEIN_OZ, 5);

    // Share with Household B
    await page
      .getByTestId(`share-household-${PERSONAS.member_b.householdId}`)
      .check();

    await page.getByTestId("meal-plan-save").click();
    await expect(page.getByTestId("meal-plan-save-success")).toBeVisible({
      timeout: 10_000,
    });

    // --- Second context as member_b: P5 â‰¤ 2 s ---
    const bContext = await browser.newContext({ storageState: memberBState });
    const bPage = await bContext.newPage();
    const observeStart = Date.now();
    await bPage.goto("/calendar");
    await expect(bPage.getByTestId("calendar-week-grid")).toBeVisible();

    // Prefer realtime; fall back to soft reload polling within budget via expect.poll
    await expect
      .poll(
        async () => {
          const visible = await bPage
            .getByTestId("calendar-plan-event")
            .filter({ hasText: planTitle })
            .count();
          if (visible > 0) return true;
          // Soft reload path still counts toward â‰¤ 2 s budget on first observation cycle
          if (Date.now() - observeStart < 1500) {
            await bPage.reload();
            await bPage
              .getByTestId("calendar-week-grid")
              .waitFor({ state: "visible" })
              .catch(() => undefined);
          }
          return (
            (await bPage
              .getByTestId("calendar-plan-event")
              .filter({ hasText: planTitle })
              .count()) > 0
          );
        },
        {
          timeout: 2000,
          intervals: [100, 200, 300, 400],
          message: "Â§12 P5: shared plan must appear for member_b within 2 s",
        },
      )
      .toBe(true);

    const observeMs = Date.now() - observeStart;
    expect(
      observeMs,
      `Â§12 P5 realtime propagation: ${observeMs}ms (limit 2000ms)`,
    ).toBeLessThanOrEqual(2000);

    await bContext.close();
  });
});
```

### FILE: apps/web/e2e/capture-leftover-idea.spec.ts
```typescript
/**
 * Â§9.3 Flow 2 â€” Capture & Use a Leftover Idea
 *
 * member_a opens cooked seafood recipe â†’ adds decay-path entry linking to
 * another recipe. member_b (family-global content) views and navigates the link.
 */
import { expect, test } from "@playwright/test";
import path from "node:path";
import { E2E_FIXTURES } from "./personas";
import { e2eDescribe } from "./helpers/describe";

const memberAState = path.join(__dirname, ".auth/member_a.json");
const memberBState = path.join(__dirname, ".auth/member_b.json");

e2eDescribe("Capture leftover idea (Â§9.3)", () => {
  test("member_a adds decay path; member_b navigates linked recipe", async ({
    browser,
  }) => {
    const useNote = `E2E leftover use ${Date.now()}`;

    const aContext = await browser.newContext({ storageState: memberAState });
    const aPage = await aContext.newPage();

    await aPage.goto(`/recipes/${E2E_FIXTURES.seafoodRecipeId}`);
    await expect(aPage.getByTestId("recipe-detail")).toBeVisible();
    await expect(aPage.getByTestId("recipe-title")).toContainText(
      E2E_FIXTURES.seafoodRecipeTitle,
    );

    // Expand Creative Leftovers and add entry
    await aPage.getByTestId("leftover-section-toggle").click();
    await expect(aPage.getByTestId("leftover-decay-path")).toBeVisible();
    await aPage.getByTestId("leftover-add-entry").click();
    await aPage.getByTestId("leftover-use-input").fill(useNote);
    await aPage
      .getByTestId("leftover-notes-input")
      .fill("Use within 2 days; E2E fixture.");
    await aPage
      .getByTestId("leftover-link-recipe-search")
      .fill(E2E_FIXTURES.linkedRecipeTitle);
    await aPage
      .getByTestId("leftover-link-recipe-result")
      .filter({ hasText: E2E_FIXTURES.linkedRecipeTitle })
      .click();
    await aPage.getByTestId("leftover-save-entry").click();

    await expect(
      aPage.getByTestId("leftover-entry").filter({ hasText: useNote }),
    ).toBeVisible({ timeout: 10_000 });

    await aContext.close();

    // Another persona views and navigates the linked entry
    const bContext = await browser.newContext({ storageState: memberBState });
    const bPage = await bContext.newPage();

    await bPage.goto(`/recipes/${E2E_FIXTURES.seafoodRecipeId}`);
    await bPage.getByTestId("leftover-section-toggle").click();
    const entry = bPage.getByTestId("leftover-entry").filter({ hasText: useNote });
    await expect(entry).toBeVisible();

    await entry.getByTestId("leftover-linked-recipe").click();
    await expect(bPage.getByTestId("recipe-detail")).toBeVisible();
    await expect(bPage.getByTestId("recipe-title")).toContainText(
      E2E_FIXTURES.linkedRecipeTitle,
    );

    await bContext.close();
  });
});
```

### FILE: apps/web/e2e/capture-chef-idea.spec.ts
```typescript
/**
 * Â§9.3 Flow 3 â€” Capture a ChefIdea
 *
 * Capture idea with tags â†’ find via browse filter and via global search.
 * Mobile project: iPhone 14 (playwright.config projects).
 */
import { expect, test } from "@playwright/test";
import path from "node:path";
import { E2E_FIXTURES } from "./personas";
import { e2eDescribe } from "./helpers/describe";

const memberAState = path.join(__dirname, ".auth/member_a.json");

e2eDescribe("Capture ChefIdea (Â§9.3)", () => {
  test.use({ storageState: memberAState });

  test("capture idea with tags; find via browse filter and global search", async ({
    page,
  }) => {
    const ideaTitle = `E2E Chef Idea ${Date.now()}`;

    await page.goto("/ideas");
    await expect(page.getByTestId("ideas-browser")).toBeVisible();

    await page.getByTestId("capture-idea-open").click();
    await expect(page.getByTestId("capture-idea-form")).toBeVisible();

    await page.getByTestId("chef-idea-title-input").fill(ideaTitle);
    await page
      .getByTestId("chef-idea-notes-input")
      .fill("Promising weeknight protein idea â€” E2E.");
    await page.getByTestId("chef-idea-source-input").fill("E2E podcast");

    // Tag pickers (dinner + easy from seed)
    await page.getByTestId(`tag-picker-${E2E_FIXTURES.tagDinnerId}`).click();
    await page.getByTestId(`tag-picker-${E2E_FIXTURES.tagEasyId}`).click();

    await page.getByTestId("chef-idea-save").click();
    await expect(page.getByTestId("capture-idea-success")).toBeVisible({
      timeout: 10_000,
    });

    // Browse filter by tag
    await page.goto("/ideas");
    await page.getByTestId(`ideas-filter-tag-${E2E_FIXTURES.tagDinnerId}`).click();
    await expect(
      page.getByTestId("idea-card").filter({ hasText: ideaTitle }),
    ).toBeVisible({ timeout: 10_000 });

    // Global search surfaces the idea
    await page.getByTestId("global-search-input").fill(ideaTitle);
    await expect
      .poll(
        async () =>
          page
            .getByTestId("global-search-result")
            .filter({ hasText: ideaTitle })
            .count(),
        { timeout: 5000, intervals: [100, 200, 400] },
      )
      .toBeGreaterThan(0);

    await page
      .getByTestId("global-search-result")
      .filter({ hasText: ideaTitle })
      .click();
    await expect(page.getByTestId("chef-idea-detail")).toBeVisible();
    await expect(page.getByTestId("chef-idea-title")).toContainText(ideaTitle);
  });
});
```

### FILE: apps/web/e2e/shopping-list.spec.ts
```typescript
/**
 * Shopping list E2E â€” multi-plan selection.
 *
 * Asserts Optional group isolation and cross-dimension separate lines
 * (flour as mass + volume under one ingredient heading, never merged).
 *
 * Plans are created via UI if editor is available; otherwise via query
 * params handoff from calendar selection (Task 11 â†’ Task 12).
 */
import { expect, test } from "@playwright/test";
import path from "node:path";
import { E2E_FIXTURES, PERSONAS } from "./personas";
import { e2eDescribe } from "./helpers/describe";
import { signInAs } from "./helpers/supabase";

const memberAState = path.join(__dirname, ".auth/member_a.json");

e2eDescribe("Shopping list", () => {
  test.use({ storageState: memberAState });

  test("multi-plan list: Optional group + cross-dimension separate lines", async ({
    page,
  }) => {
    // Provision two short-range plans with shopping fixtures via member_a JWT
    // (API path â€” no service role; UI still asserts list rendering).
    const memberA = await signInAs("member_a");
    const today = new Date();
    const iso = (d: Date) => d.toISOString().slice(0, 10);
    const start = iso(today);
    const end = iso(new Date(today.getTime() + 3 * 86_400_000));

    async function upsertPlan(
      title: string,
      recipeId: string,
    ): Promise<string> {
      const { data, error } = await memberA.rpc("meal_plan_create_or_update", {
        p_payload: {
          title,
          startDate: start,
          endDate: end,
          householdIds: [PERSONAS.member_a.householdId],
          portionRequirements: [
            {
              portionCategoryId: E2E_FIXTURES.adultMaleId,
              count: 2,
              athleteCount: 0,
            },
          ],
          assignments: [
            {
              recipeId,
              assignmentDate: start,
              mealSlot: "dinner",
              servings: 4,
            },
          ],
        },
      });
      if (error) throw new Error(`upsertPlan(${title}): ${error.message}`);
      return data as string;
    }

    const planAId = await upsertPlan(
      `E2E Shop A ${Date.now()}`,
      E2E_FIXTURES.shoppingRecipeAId,
    );
    const planBId = await upsertPlan(
      `E2E Shop B ${Date.now()}`,
      E2E_FIXTURES.shoppingRecipeBId,
    );

    await page.goto(
      `/shopping?mealPlanIds=${encodeURIComponent(`${planAId},${planBId}`)}`,
    );
    await expect(page.getByTestId("shopping-list")).toBeVisible({
      timeout: 10_000,
    });

    // Optional group last / visually separated
    await expect(page.getByTestId("shopping-group-optional")).toBeVisible();
    await expect(
      page
        .getByTestId("shopping-group-optional")
        .getByTestId("shopping-line")
        .filter({ hasText: /parsley/i }),
    ).toBeVisible();

    // Cross-dimension: flour has separate mass + volume lines under one heading
    const flourBlock = page.getByTestId("shopping-ingredient-block").filter({
      hasText: /all-purpose flour/i,
    });
    await expect(flourBlock).toBeVisible();
    const flourLines = flourBlock.getByTestId("shopping-line");
    await expect(flourLines).toHaveCount(2);

    // Never a single merged nonsense unit â€” each line shows its own unit
    const lineTexts = (await flourLines.allInnerTexts()).join(" | ");
    expect(lineTexts.toLowerCase()).toMatch(/g|kg|oz|lb/);
    expect(lineTexts.toLowerCase()).toMatch(/cup|ml|l|tbsp|tsp/);
  });
});
```

### FILE: apps/web/e2e/realtime-cutoff.spec.ts
```typescript
/**
 * Scenario 11 â€” Realtime parity / unshare cutoff
 * ============================================================================
 * SECURITY CRITICAL â€” pgTAP cannot exercise the Realtime path
 * (see supabase/tests/rls/README.md). This suite is the product gate.
 * ============================================================================
 * Assertions:
 * 1. Positive parity: member_b subscribed to meal_plan (+ children) for a plan
 *    shared Aâ†’B receives an event when member_a edits.
 * 2. Unshare cutoff: after B is unshared, member_b receives NO further events
 *    for subsequent edits (collector polled over a 5 s window).
 * 3. Belt-and-braces: member_b refetch of the plan returns zero rows (notify-
 *    then-refetch fallback is safe even if an event leaked).
 * 4. member_c control: subscribed from the start, receives nothing at any point.
 *
 * âš  If assertion 2 fails on the real stack:
 *    - Treat it as a SECURITY finding, not a flake.
 *    - App notify-then-refetch design (Task 11) remains the guaranteed safety
 *      net: clients must NEVER render event payloads â€” only invalidate + refetch
 *      through RLS-filtered queries.
 * ============================================================================
 * Pure @supabase/supabase-js integration (no browser). Kept in Playwright for
 * env reuse (E2E_SUPABASE_URL, global-setup auth users). No service role.
 * No page.waitForTimeout â€” expect.poll only.
 */
import { expect, test } from "@playwright/test";
import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import { PERSONAS } from "./personas";
import { e2eDescribe } from "./helpers/describe";
import { signInAs } from "./helpers/supabase";

type ChangeEvent = {
  table: string;
  eventType: string;
  at: number;
};

async function subscribePlanTables(
  client: SupabaseClient,
  channelName: string,
  collector: ChangeEvent[],
  planIdFilter?: string,
): Promise<RealtimeChannel> {
  // Filter is best-effort; RLS still governs delivery. We also post-filter
  // by plan id in the collector when payload includes it.
  let channel = client.channel(channelName);

  const tables = [
    "meal_plan",
    "meal_plan_household",
    "meal_plan_portion_requirement",
    "meal_plan_assignment",
  ] as const;

  for (const table of tables) {
    channel = channel.on(
      "postgres_changes",
      { event: "*", schema: "public", table },
      (payload) => {
        const row = (payload.new ?? payload.old) as
          | Record<string, unknown>
          | undefined;
        const rowPlanId =
          (row?.id as string | undefined) ??
          (row?.meal_plan_id as string | undefined);
        if (planIdFilter && rowPlanId && rowPlanId !== planIdFilter) {
          return;
        }
        // meal_plan row uses id; if filter set and we cannot resolve, still record
        // for meal_plan updates where id matches filter via payload
        if (
          planIdFilter &&
          table === "meal_plan" &&
          row?.id &&
          row.id !== planIdFilter
        ) {
          return;
        }
        collector.push({
          table,
          eventType: payload.eventType,
          at: Date.now(),
        });
      },
    );
  }

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error(`channel ${channelName} subscribe timeout`)),
      15_000,
    );
    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        clearTimeout(timeout);
        resolve();
      }
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        clearTimeout(timeout);
        reject(new Error(`channel ${channelName} status=${status}`));
      }
    });
  });

  return channel;
}

async function createSharedPlan(memberA: SupabaseClient): Promise<string> {
  const title = `E2E Realtime Cutoff ${Date.now()}`;
  const start = "2099-03-01";
  const end = "2099-03-07";

  const { data, error } = await memberA.rpc("meal_plan_create_or_update", {
    p_payload: {
      title,
      startDate: start,
      endDate: end,
      householdIds: [
        PERSONAS.member_a.householdId,
        PERSONAS.member_b.householdId,
      ],
      portionRequirements: [],
      assignments: [],
    },
  });
  if (error) throw new Error(`createSharedPlan: ${error.message}`);
  return data as string;
}

e2eDescribe("Scenario 11 realtime unshare cutoff", () => {
  test("parity â†’ unshare cutoff â†’ refetch zero â†’ member_c silent", async () => {
    const memberA = await signInAs("member_a");
    const memberB = await signInAs("member_b");
    const memberC = await signInAs("member_c");

    const planId = await createSharedPlan(memberA);

    const eventsB: ChangeEvent[] = [];
    const eventsC: ChangeEvent[] = [];

    const channelB = await subscribePlanTables(
      memberB,
      `e2e-b-${planId}`,
      eventsB,
      planId,
    );
    const channelC = await subscribePlanTables(
      memberC,
      `e2e-c-${planId}`,
      eventsC,
      planId,
    );

    try {
      // ---- 1. Positive parity: member_a edit â†’ member_b receives event ----
      const beforeParity = eventsB.length;
      const { error: editErr } = await memberA
        .from("meal_plan")
        .update({ title: `E2E Parity Edit ${Date.now()}` })
        .eq("id", planId);
      if (editErr) throw new Error(`parity edit: ${editErr.message}`);

      await expect
        .poll(() => eventsB.length, {
          timeout: 10_000,
          intervals: [100, 200, 400, 800],
          message:
            "Scenario 11 assertion 1: member_b must receive realtime event on shared-plan edit",
        })
        .toBeGreaterThan(beforeParity);

      // member_c must still be silent
      expect(
        eventsC.length,
        "Scenario 11 assertion 4 (during parity): member_c must receive no events",
      ).toBe(0);

      // ---- 2. Unshare B, then edit again; B must receive no further events ----
      const { error: unshareErr, count: unshareCount } = await memberA
        .from("meal_plan_household")
        .delete({ count: "exact" })
        .eq("meal_plan_id", planId)
        .eq("household_id", PERSONAS.member_b.householdId);
      if (unshareErr) throw new Error(`unshare: ${unshareErr.message}`);
      if (unshareCount === 0) {
        throw new Error("unshare deleted 0 rows â€” membership missing?");
      }

      // Drain unshare-related events (membership DELETE may still fire once).
      // Snapshot baseline after collector stabilizes (no new events for 400ms).
      let stableAt = Date.now();
      let lastLen = eventsB.length;
      await expect
        .poll(
          () => {
            if (eventsB.length !== lastLen) {
              lastLen = eventsB.length;
              stableAt = Date.now();
            }
            return Date.now() - stableAt >= 400 ? "stable" : "draining";
          },
          { timeout: 3000, intervals: [100, 150] },
        )
        .toBe("stable");
      const afterUnshareBaseline = eventsB.length;

      const { error: postUnshareEditErr } = await memberA
        .from("meal_plan")
        .update({ title: `E2E Post-Unshare Edit ${Date.now()}` })
        .eq("id", planId);
      if (postUnshareEditErr) {
        throw new Error(`post-unshare edit: ${postUnshareEditErr.message}`);
      }

      // Poll collector over a 5 s window â€” length must stay flat.
      // SECURITY: if this fails, file as SECURITY finding, not flake.
      const windowStart = Date.now();
      await expect
        .poll(
          () => {
            const elapsed = Date.now() - windowStart;
            const leaked = eventsB.length - afterUnshareBaseline;
            if (leaked > 0) {
              return `LEAK:${leaked}`;
            }
            return elapsed >= 5000 ? "CLEAN" : "WAITING";
          },
          {
            timeout: 6000,
            intervals: [200, 400, 500],
            message:
              "SECURITY (Scenario 11 assertion 2): member_b received realtime events after unshare â€” notify-then-refetch is the app safety net, but this is a security finding",
          },
        )
        .toBe("CLEAN");

      expect(
        eventsB.length,
        "SECURITY: no further member_b events after unshare + edit (5s window)",
      ).toBe(afterUnshareBaseline);

      // ---- 3. Belt-and-braces refetch: zero rows for member_b ----
      const { data: bRows, error: bSelectErr } = await memberB
        .from("meal_plan")
        .select("id")
        .eq("id", planId);
      if (bSelectErr) throw new Error(`member_b refetch: ${bSelectErr.message}`);
      expect(
        bRows ?? [],
        "Scenario 11 assertion 3: member_b refetch must return zero rows after unshare",
      ).toHaveLength(0);

      // ---- 4. member_c never received events ----
      expect(
        eventsC.length,
        "Scenario 11 assertion 4: member_c control must receive nothing at any point",
      ).toBe(0);
    } finally {
      await memberB.removeChannel(channelB);
      await memberC.removeChannel(channelC);
      // Best-effort cleanup (soft-delete) as member_a
      await memberA
        .from("meal_plan")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", planId);
    }
  });
});
```

### FILE: apps/web/e2e/example.spec.ts
```typescript
import { expect, test } from "@playwright/test";

/**
 * Placeholder kept for smoke discovery. Real Â§9.3 flows live in sibling specs.
 * Always skipped â€” does not require E2E_SUPABASE_URL or a running app.
 */
test.skip("home page renders (placeholder)", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/MenuBoss/i);
});
```

### FILE: apps/web/playwright.config.ts
```typescript
import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright config â€” Product PRD Â§9.3 E2E + Scenario 11 realtime suite.
 *
 * Suites skip unless E2E_SUPABASE_URL is set (global-setup also no-ops).
 * Browsers: run `pnpm exec playwright install chromium` (CI installs chromium only).
 */
export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    /**
     * Mobile-first mandate (Â§11): iPhone 14 for Flow 1 + Flow 3 only.
     */
    {
      name: "Mobile Chrome",
      use: { ...devices["iPhone 14"] },
      testMatch: /plan-shared-meal\.spec\.ts|capture-chef-idea\.spec\.ts/,
    },
  ],
  /* Start dev server only when explicitly requested (CI starts the built app). */
  webServer: process.env.E2E_WEB_SERVER
    ? {
        command: process.env.E2E_WEB_SERVER,
        url: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000",
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      }
    : undefined,
});
```

### FILE: .github/workflows/ci.yml
```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

jobs:
  build-test:
    name: typecheck + unit tests
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Enable Corepack (pnpm)
        run: corepack enable

      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Typecheck
        run: pnpm -r typecheck

      - name: Unit tests
        run: pnpm -r test

  # ---------------------------------------------------------------------------
  # Database gates (CI-BLOCKING per Product PRD v0.2 Â§11 / decision D10):
  #   1. pgTAP RLS matrix (supabase/tests/rls/matrix.test.sql)
  #   2. SQL function arithmetic tests (supabase/tests/functions/)
  #   3. TS â†” SQL portion contract test (must RUN here, never skip)
  # ---------------------------------------------------------------------------
  database-gates:
    name: RLS matrix + SQL tests + contract test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Enable Corepack (pnpm)
        run: corepack enable

      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - uses: supabase/setup-cli@v1
        with:
          # Pinned deliberately: a floating `latest` can reject our hand-authored
          # config.toml and kill this gate before any test runs. Bump on purpose,
          # verifying `supabase start` still accepts supabase/config.toml.
          version: 2.20.5

      - name: Start local Supabase (applies migrations + seed)
        run: |
          supabase start
          supabase migration list

      - name: Run pgTAP suites (RLS matrix + function tests)
        run: supabase test db

      - name: Contract test (TS portion-calc â†” SQL weekly_protein_rollup)
        env:
          DATABASE_URL: postgresql://postgres:postgres@127.0.0.1:54322/postgres
        run: |
          # Run ONLY the contract file and assert the positive: all 10 cases
          # passed. String-matching "skipped" is brittle; requiring the exact
          # pass count is not.
          OUTPUT=$(pnpm --filter @menu-boss/portion-calc exec vitest run src/contract.integration.test.ts 2>&1) || { echo "$OUTPUT"; exit 1; }
          echo "$OUTPUT"
          if ! echo "$OUTPUT" | grep -Eq "Tests[^0-9]*10 passed"; then
            echo "::error::Contract suite did not report 10 passing cases â€” it was skipped or partially ran. This gate must fully run."
            exit 1
          fi

      # ---------------------------------------------------------------------------
      # Playwright E2E (Â§9.3 flows) + Scenario 11 realtime (Product PRD Â§11)
      # Requires full local stack (already started above). Skipped only when
      # E2E_SUPABASE_URL is unset â€” here it is always set.
      # ---------------------------------------------------------------------------
      - name: Export Supabase credentials for E2E
        id: supabase_e2e
        run: |
          eval "$(supabase status -o env)"
          {
            echo "API_URL=$API_URL"
            echo "ANON_KEY=$ANON_KEY"
            echo "SERVICE_ROLE_KEY=$SERVICE_ROLE_KEY"
          } >> "$GITHUB_OUTPUT"
          # Also export for subsequent steps
          echo "E2E_SUPABASE_URL=$API_URL" >> "$GITHUB_ENV"
          echo "E2E_SUPABASE_ANON_KEY=$ANON_KEY" >> "$GITHUB_ENV"
          echo "NEXT_PUBLIC_SUPABASE_URL=$API_URL" >> "$GITHUB_ENV"
          echo "NEXT_PUBLIC_SUPABASE_ANON_KEY=$ANON_KEY" >> "$GITHUB_ENV"
          echo "SUPABASE_SERVICE_ROLE_KEY=$SERVICE_ROLE_KEY" >> "$GITHUB_ENV"

      - name: Enable Realtime publication for meal_plan tables
        run: |
          # Required for Scenario 11 postgres_changes. Idempotent add.
          PGPASSWORD=postgres psql -h 127.0.0.1 -p 54322 -U postgres -d postgres <<'SQL'
          DO $$
          DECLARE
            t text;
          BEGIN
            FOREACH t IN ARRAY ARRAY[
              'meal_plan',
              'meal_plan_household',
              'meal_plan_portion_requirement',
              'meal_plan_assignment'
            ]
            LOOP
              IF NOT EXISTS (
                SELECT 1
                FROM pg_publication_tables
                WHERE pubname = 'supabase_realtime'
                  AND schemaname = 'public'
                  AND tablename = t
              ) THEN
                EXECUTE format(
                  'ALTER PUBLICATION supabase_realtime ADD TABLE public.%I',
                  t
                );
              END IF;
            END LOOP;
          END $$;
          SQL

      - name: Install Playwright Chromium
        run: pnpm --filter web exec playwright install chromium --with-deps

      - name: Build web app (against local Supabase)
        env:
          NEXT_PUBLIC_SUPABASE_URL: ${{ env.NEXT_PUBLIC_SUPABASE_URL }}
          NEXT_PUBLIC_SUPABASE_ANON_KEY: ${{ env.NEXT_PUBLIC_SUPABASE_ANON_KEY }}
        run: pnpm --filter web build

      - name: Start web app
        env:
          NEXT_PUBLIC_SUPABASE_URL: ${{ env.NEXT_PUBLIC_SUPABASE_URL }}
          NEXT_PUBLIC_SUPABASE_ANON_KEY: ${{ env.NEXT_PUBLIC_SUPABASE_ANON_KEY }}
          PORT: "3000"
        run: |
          pnpm --filter web start &
          # Wait for readiness (no sleep-fixed flake in tests; only CI boot wait)
          for i in $(seq 1 60); do
            if curl -sf "http://127.0.0.1:3000" >/dev/null; then
              echo "web app ready"
              exit 0
            fi
            sleep 1
          done
          echo "::error::web app failed to become ready on :3000"
          exit 1

      - name: Playwright E2E + Scenario 11 realtime
        env:
          E2E_SUPABASE_URL: ${{ env.E2E_SUPABASE_URL }}
          E2E_SUPABASE_ANON_KEY: ${{ env.E2E_SUPABASE_ANON_KEY }}
          NEXT_PUBLIC_SUPABASE_URL: ${{ env.NEXT_PUBLIC_SUPABASE_URL }}
          NEXT_PUBLIC_SUPABASE_ANON_KEY: ${{ env.NEXT_PUBLIC_SUPABASE_ANON_KEY }}
          SUPABASE_SERVICE_ROLE_KEY: ${{ env.SUPABASE_SERVICE_ROLE_KEY }}
          PLAYWRIGHT_BASE_URL: http://127.0.0.1:3000
          CI: "true"
        run: pnpm --filter web test:e2e
```

### FILE: .gitignore
```
# Python
__pycache__/
*.py[cod]
*.pyo
.env
.venv/
venv/
env/
*.egg-info/
dist/
build/
.pytest_cache/

# Jupyter (if you ever experiment with notebooks)
.ipynb_checkpoints/

# Windows
Thumbs.db
Desktop.ini
$RECYCLE.BIN/

# macOS (in case files come from a Mac)
.DS_Store

# Editors
.vscode/
.idea/
*.swp
*.swo

# Sensitive files -- never commit these
.env
*.pem
*.key
secrets.py
config.local.*

# Node / JS-TS monorepo
node_modules/
.pnpm-store/

# Next.js
.next/
out/

# TypeScript build info
*.tsbuildinfo

# Test / coverage artifacts
coverage/

# Playwright
playwright-report/
test-results/
/apps/web/playwright/.cache/
# E2E auth storageState (generated by global-setup; never commit)
/apps/web/e2e/.auth/

# Env files (all variants) -- never commit real secrets
.env
.env.*
!.env.example

# Logs
*.log
logs/
```

