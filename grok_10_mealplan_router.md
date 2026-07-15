# Brief for Grok — Task 10 (Wave 2): mealPlan backend — RPC migration, router, schemas, integration tests

**Context:** Wave 1 shipped the schema (0001), security layer (0002, coordinator-owned), and aggregation functions (0003). This task adds the meal-planning write path and its API. The Wave 1 gate is green: 52 RLS assertions, 14 function tests, 10 contract cases.

**Attachments required:** `Recipe_Meal_Planning_Database_PRD_v0.4.md`, `Product_PRD_v0.2.md` (§8.2, §8.3, §10.3). Also attach `supabase/migrations/0002_security.sql` (read-only context: policy names + helper functions you must NOT duplicate).

**Output:** one markdown file, saved as `drafts/grok_out_mealplan_router.md`, repo files as `### FILE:` headers + fenced blocks. **Extensionless relative imports everywhere** (no `.js` suffixes — Turbopack).

## Core design constraint — atomic multi-table writes

Creating/updating a plan touches four tables (meal_plan, meal_plan_household, meal_plan_portion_requirement, meal_plan_assignment). The Supabase JS client has **no transactions**, so the write path is a single Postgres RPC:

### FILE: supabase/migrations/0004_meal_plan_rpc.sql
`meal_plan_create_or_update(p_payload jsonb) RETURNS uuid` — **`SECURITY INVOKER`** (non-negotiable: RLS is the sole authorization authority, D1; the function must run as the caller so every INSERT/UPDATE hits the 0002 policies). `SET search_path = public`. Behavior:
- Payload: `{ id?, title, description?, startDate, endDate, householdIds: uuid[], portionRequirements: [{portionCategoryId, count, athleteCount}], assignments: [{id?, recipeId, assignmentDate, mealSlot, servings, notes?}] }`.
- INSERT or UPDATE `meal_plan` (id present → update). On insert, `created_by_household_id`/`created_by_user_id` from `current_household_id()`/`auth.uid()` — never from the payload.
- Reconcile children set-based (delete rows not in payload, upsert the rest). ALWAYS ensure the creating household's membership row exists and never delete it (the mph_delete policy blocks it anyway — do not fight it, just exclude it from reconciliation).
- Portion rows with `count = 0` are deleted, not stored (DB PRD rule).
- No validation logic beyond structure — RLS + triggers (date range, athlete_count ≤ count) are the authority; let their errors propagate with their SQLSTATEs.
- Add pgTAP tests in `supabase/tests/functions/meal_plan_rpc.test.sql` (arithmetic/reconciliation as creator persona; RLS denial cases are coordinator matrix territory — include ONE smoke case: member_b calling the RPC on A's plan fails). Use the shim-compatible assertion set: plan/is/ok/lives_ok/throws_ok/results_eq/finish only. Guard the pgtap extension load exactly like `supabase/tests/functions/aggregation.test.sql` does (DO block, notice fallback).

### FILE: packages/schemas/src/mealPlan.ts (+ export from index)
Zod: `mealPlanUpsertInput` matching the payload (dates as ISO strings, `athleteCount ≤ count` via `.refine`, `endDate ≥ startDate`, assignments within range checked here for friendly errors — DB triggers are the authority), `shoppingListQuery` (`mealPlanIds: uuid[]`), `proteinRollupQuery` (`start`, `end`).

### FILE: apps/web/src/server/routers/mealPlan.ts (+ wire into _app.ts, + mapper)
Procedures (all `authedProcedure`, caller-JWT client, NO service role, NO authorization logic):
- `upsert` — Zod parse → `supabase.rpc('meal_plan_create_or_update', ...)` → map SQLSTATE 42501 → FORBIDDEN, 23514 → BAD_REQUEST with the trigger message.
- `byId` / `listRange(start, end)` — plan + children + derived `isShared` (membership count > 1) + `effectiveProteinOz` computed with `@menu-boss/portion-calc` (client of record for display math — do NOT reimplement the formula).
- `generateShoppingList` — wraps the `generate_shopping_list` RPC; formats display units (largest unit of the dimension yielding quantity ≥ 1, from the `unit` table); groups cross-dimension rows under one ingredient heading; separates the Optional group.
- `proteinRollup` — wraps `weekly_protein_rollup`.
- `softDelete` — sets `deleted_at`.
- `share`/`unshare` — insert/delete `meal_plan_household` rows directly (single-row ops need no RPC).

### FILE: apps/web/src/server/routers/__tests__/mealPlan.integration.test.ts
Vitest, env-guarded exactly like `packages/portion-calc/src/contract.integration.test.ts` (`describe.skipIf(!process.env.DATABASE_URL)`, `pg` client, per-test BEGIN/ROLLBACK): upsert creates all four tables' rows; reconciliation deletes removed assignments; zero-count portion rows not stored; out-of-range assignment surfaces 23514; shopping list display-unit formatting (680 g → "1.5 lb"); creating-household membership survives reconciliation.

## Constraints
- Do not touch 0001/0002/0003, the security helpers, or the RLS policies.
- Do not add service-role usage anywhere.
- Flag ambiguity with `<!-- TODO(coordinator): … -->`; do not invent endpoints beyond the list.
