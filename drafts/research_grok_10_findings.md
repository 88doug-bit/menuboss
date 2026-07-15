# Research Brief — Task 10 (mealPlan backend)

**Agent:** Researcher  
**Branch (intended):** `research/grok-10-mealplan`  
**Date:** 2026-07-15  
**Audience:** Implementer / Tester / Reviewer for `grok_10_mealplan_router.md`  
**Scope:** Investigation only. **Do not** treat this as migration SQL, router source, or Zod package source. **Do not invent** endpoints beyond the brief.

**Primary inputs (read fully):**

| File | Role |
|------|------|
| `grok_10_mealplan_router.md` | Task 10 brief: RPC, schemas, router, integration tests |
| `supabase/migrations/0001_schema.sql` | Authoritative columns for the four write tables + `unit` |
| `supabase/migrations/0002_security.sql` | Helpers + meal_plan / mph policies (do not touch) |
| `supabase/migrations/0003_functions.sql` | `generate_shopping_list` + `weekly_protein_rollup` return shapes |
| `Product_PRD_v0.2.md` §8.7, §10.3 | Procedure contracts + shopping-list ACs |
| `Recipe_Meal_Planning_Database_PRD_v0.4.md` §4.1, §6 | count=0 rule, D12 conversion, shopping-list columns |
| `drafts/claude_authored_sections.md` | Display-unit algorithm wording (largest unit ≥ 1) |
| `apps/web/src/server/routers/*` | Existing content-router style (Wave 1) |
| `supabase/seed.sql` | Persona + unit + portion_category fixed UUIDs |
| `packages/portion-calc/src/index.ts` | Canonical TS protein formula for `effectiveProteinOz` display |

**Out of scope (do not implement here):** calendar UI (Task 11), Realtime hooks, service-role clients, edits to 0001/0002/0003.

---

## 1. Exact table columns for the four write tables

Source: `supabase/migrations/0001_schema.sql` (as shipped). These are the **only** tables the RPC mutates.

### 1.1 `meal_plan`

| Column | Type | Null | Default / constraint | Notes |
|--------|------|------|----------------------|--------|
| `id` | uuid | NOT NULL | `gen_random_uuid()` PK | Present in payload → UPDATE; absent → INSERT |
| `title` | text | NOT NULL | — | From payload |
| `description` | text | NULL | — | From payload optional |
| `start_date` | date | NOT NULL | — | Payload `startDate` (ISO date string) |
| `end_date` | date | NOT NULL | — | Payload `endDate`; CHECK `end_date >= start_date` |
| `created_by_household_id` | uuid | NOT NULL | FK → `household(id)` RESTRICT | **Never from payload** — set to `current_household_id()` on INSERT |
| `created_by_user_id` | uuid | NOT NULL | FK → `profile(id)` RESTRICT | **Never from payload** — set to `auth.uid()` on INSERT |
| `created_at` | timestamptz | NOT NULL | `now()` | Immutable in practice (no meal_plan attribution trigger, but do not rewrite) |
| `updated_at` | timestamptz | NOT NULL | `now()` | Touch trigger `trg_meal_plan_updated_at` |
| `deleted_at` | timestamptz | NULL | — | Soft-delete only; no hard DELETE policy |

**Not columns (derived / never stored):** `is_shared`, `visible_to_households`, `protein_portions`, `effective_protein_oz`.

### 1.2 `meal_plan_assignment`

| Column | Type | Null | Default / constraint | Notes |
|--------|------|------|----------------------|--------|
| `id` | uuid | NOT NULL | `gen_random_uuid()` PK | Optional in payload for upsert identity |
| `meal_plan_id` | uuid | NOT NULL | FK → `meal_plan` CASCADE | Parent plan |
| `recipe_id` | uuid | NOT NULL | FK → `recipe` RESTRICT | Payload `recipeId` |
| `assignment_date` | date | NOT NULL | — | Must fall in plan range (trigger `trg_assignment_in_range`, SQLSTATE `23514`) |
| `meal_slot` | text | NOT NULL | — | Free text in schema (e.g. breakfast/lunch/dinner/snack); no CHECK enum |
| `servings` | numeric | NOT NULL | `1`, CHECK `servings > 0` | Scale numerator for shopping list |
| `notes` | text | NULL | — | Optional |
| `created_at` | timestamptz | NOT NULL | `now()` | No `updated_at` on this table |

**Triggers (0002):** insert/update date must be in parent `[start_date, end_date]`; shrinking plan range with stranded assignments fails with `23514`.

### 1.3 `meal_plan_household` (membership / sharing)

| Column | Type | Null | Default / constraint | Notes |
|--------|------|------|----------------------|--------|
| `meal_plan_id` | uuid | NOT NULL | FK → `meal_plan` CASCADE | Composite PK part 1 |
| `household_id` | uuid | NOT NULL | FK → `household` RESTRICT | Composite PK part 2; payload `householdIds[]` |
| `added_by_user_id` | uuid | NULL | FK → `profile` | Policy: `NULL` OR `= auth.uid()` on INSERT |
| `created_at` | timestamptz | NOT NULL | `now()` | No UPDATE policy — insert/delete only |

**Creating-household rule:** membership row for `created_by_household_id` must always exist after save; never delete it (policy + RPC reconciliation).

### 1.4 `meal_plan_portion_requirement`

| Column | Type | Null | Default / constraint | Notes |
|--------|------|------|----------------------|--------|
| `meal_plan_id` | uuid | NOT NULL | FK → `meal_plan` CASCADE | Composite PK part 1 |
| `portion_category_id` | uuid | NOT NULL | FK → `portion_category` RESTRICT | Payload `portionCategoryId` |
| `count` | smallint | NOT NULL | CHECK `count >= 0` | **Rows with `count = 0` are not stored** (delete on save; absence = zero) |
| `athlete_count` | smallint | NOT NULL | `0`, CHECK `>= 0` | CHECK `athlete_count <= count` (`athlete_within_count`) |
| `updated_at` | timestamptz | NOT NULL | `now()` | Touch trigger |

No surrogate `id`. Upsert key = `(meal_plan_id, portion_category_id)`.

---

## 2. Policy constraints the RPC must respect (SECURITY INVOKER)

**Non-negotiable:** `meal_plan_create_or_update(p_payload jsonb)` is **`SECURITY INVOKER`** + `SET search_path = public`. Every DML statement is evaluated under the caller’s JWT against 0002 policies. Do **not** use SECURITY DEFINER; do **not** use service role in request path.

### 2.1 Helpers (0002 — call / rely, never reimplement)

| Function | Security | Meaning |
|----------|----------|---------|
| `current_household_id()` | DEFINER | `profile.household_id` where `profile.id = auth.uid()` |
| `is_family_admin()` | DEFINER | profile.role = `'admin'` |
| `can_view_meal_plan(id)` | DEFINER | creator household **OR** mph membership **OR** admin |
| `can_edit_meal_plan(id)` | DEFINER | creator household **OR** admin only (shared members **read-only** in v1) |
| `plan_creating_household(id)` | DEFINER | `meal_plan.created_by_household_id` |

EXECUTE granted to `authenticated`; revoked from PUBLIC.

### 2.2 Policies that gate RPC writes

| Table | Op | Policy | Predicate the RPC must satisfy |
|-------|-----|--------|--------------------------------|
| `meal_plan` | INSERT | `meal_plan_insert` | `created_by_household_id = current_household_id()` **AND** `created_by_user_id = auth.uid()` |
| `meal_plan` | UPDATE | `meal_plan_update` | `can_edit_meal_plan(id)` (USING + WITH CHECK) |
| `meal_plan` | DELETE | *(none)* | Soft-delete via UPDATE `deleted_at` only |
| `meal_plan_assignment` | I/U/D | `*_insert/update/delete` | `can_edit_meal_plan(meal_plan_id)` |
| `meal_plan_portion_requirement` | I/U/D | same pattern | `can_edit_meal_plan(meal_plan_id)` |
| `meal_plan_household` | INSERT | `mph_insert` | `can_edit_meal_plan(meal_plan_id)` AND (`added_by_user_id` IS NULL OR = `auth.uid()`) |
| `meal_plan_household` | DELETE | `mph_delete` | `can_edit_meal_plan` AND `household_id IS DISTINCT FROM plan_creating_household(...)` |
| `meal_plan_household` | UPDATE | *(none)* | Never mutate membership rows in place |

**SELECT** for all four uses `can_view_meal_plan` (creator disjunct allows bootstrap without mph row; still **always insert** creator mph).

### 2.3 SECURITY INVOKER implications (implementer checklist)

1. **Attribution on INSERT** must come from session helpers only. If payload tried to set another household’s `created_by_*`, INSERT fails RLS (`42501` / RLS violation).
2. **Update path:** caller must `can_edit` — member_b on household A’s plan fails (brief: one smoke `throws_ok` case).
3. **Membership reconciliation:** never DELETE the creating household’s mph row (policy blocks even admin). Algorithm: ensure creator household in set; delete only mph rows whose `household_id` is not creator and not in payload `householdIds`.
4. **Shared household members** can SELECT (if in mph) but cannot INSERT/UPDATE children or mph — RPC must fail cleanly, not catch-and-retry as DEFINER.
5. **Admin** (`is_family_admin`) can edit any plan via `can_edit_meal_plan` even if not creator household — same RPC path works for admin_a editing A’s plan.
6. **Trigger errors are not RLS:** out-of-range assignment / stranded range → SQLSTATE **`23514`** (map to BAD_REQUEST). Privilege → **`42501`** (FORBIDDEN).
7. **RPC grants:** new function needs `REVOKE EXECUTE FROM PUBLIC; GRANT EXECUTE TO authenticated` (same pattern as 0002 helpers / 0003 functions if they grant).
8. **Transactionality:** single function body = single statement transaction from client’s perspective; child reconcile must be inside the function so partial multi-table writes cannot leak via PostgREST (no client-side multi-roundtrip).

### 2.4 Share / unshare (router, not RPC)

Brief: single-row ops hit tables directly under JWT.

- `share`: `INSERT INTO meal_plan_household (meal_plan_id, household_id, added_by_user_id)` with `added_by_user_id = auth.uid()` or NULL.
- `unshare`: `DELETE` mph where household is **not** creating household; deleting creator is denied by policy (surface FORBIDDEN / zero-row as product prefers).

### 2.5 Soft delete

`softDelete` = `UPDATE meal_plan SET deleted_at = now() WHERE id = …` under `meal_plan_update` / `can_edit`. No DELETE policy. Soft-deleted plans are **excluded** from `generate_shopping_list` and `weekly_protein_rollup` by function WHERE (`deleted_at IS NULL`), not by RLS.

---

## 3. Payload JSON key mapping (camelCase → snake_case)

### 3.1 RPC payload (brief JSON keys — **camelCase in jsonb**)

Brief payload shape for `meal_plan_create_or_update(p_payload jsonb)`:

```json
{
  "id": "uuid?",
  "title": "string",
  "description": "string?",
  "startDate": "YYYY-MM-DD",
  "endDate": "YYYY-MM-DD",
  "householdIds": ["uuid", "..."],
  "portionRequirements": [
    { "portionCategoryId": "uuid", "count": 0, "athleteCount": 0 }
  ],
  "assignments": [
    {
      "id": "uuid?",
      "recipeId": "uuid",
      "assignmentDate": "YYYY-MM-DD",
      "mealSlot": "string",
      "servings": 1,
      "notes": "string?"
    }
  ]
}
```

**SQL function should read camelCase keys** (as brief specifies). Map to columns:

| JSON key | Column / target |
|----------|-----------------|
| `id` | `meal_plan.id` |
| `title` | `meal_plan.title` |
| `description` | `meal_plan.description` |
| `startDate` | `meal_plan.start_date` |
| `endDate` | `meal_plan.end_date` |
| `householdIds[]` | `meal_plan_household.household_id` rows (+ force-include creator household) |
| `portionRequirements[].portionCategoryId` | `meal_plan_portion_requirement.portion_category_id` |
| `portionRequirements[].count` | `…count` (skip/delete if 0) |
| `portionRequirements[].athleteCount` | `…athlete_count` |
| `assignments[].id` | `meal_plan_assignment.id` |
| `assignments[].recipeId` | `…recipe_id` |
| `assignments[].assignmentDate` | `…assignment_date` |
| `assignments[].mealSlot` | `…meal_slot` |
| `assignments[].servings` | `…servings` |
| `assignments[].notes` | `…notes` |
| *(not in payload)* | `created_by_household_id` ← `current_household_id()` |
| *(not in payload)* | `created_by_user_id` ← `auth.uid()` |
| *(not in payload)* | `meal_plan_household.added_by_user_id` ← `auth.uid()` or NULL |

### 3.2 Zod / tRPC API (packages/schemas + router)

Align with Product PRD §10.3 names, but **brief procedure names win** for the router:

| Product §10.3 name | Brief procedure | Input schema (brief) |
|--------------------|-----------------|----------------------|
| `mealPlan.createOrUpdate` | **`mealPlan.upsert`** | `mealPlanUpsertInput` (= payload above; dates ISO strings; refine `athleteCount ≤ count`, `endDate ≥ startDate`, assignments in range for friendly errors) |
| `mealPlan.generateShoppingList` | `generateShoppingList` | `shoppingListQuery` → `{ mealPlanIds: uuid[] }` |
| *(not in §10.3 examples)* | `proteinRollup` | `proteinRollupQuery` → `{ start, end }` dates |
| *(not in §10.3)* | `byId`, `listRange`, `softDelete`, `share`, `unshare` | id / range / membership as needed |

### 3.3 Read DTOs (mapper snake → camel) — mirror Wave 1 style

Follow `recipeMapper.ts`: explicit field renames, no ORM.

| DB | DTO |
|----|-----|
| `start_date` / `end_date` | `startDate` / `endDate` |
| `created_by_household_id` | `createdByHouseholdId` |
| `created_by_user_id` | `createdByUserId` |
| `deleted_at` | `deletedAt` (+ derived `isDeleted`) |
| `assignment_date` | `assignmentDate` |
| `meal_slot` | `mealSlot` |
| `recipe_id` | `recipeId` |
| `portion_category_id` | `portionCategoryId` |
| `athlete_count` | `athleteCount` |
| `household_id` | `householdId` |
| `added_by_user_id` | `addedByUserId` |

**Derived (not DB columns):**

| Field | Rule |
|-------|------|
| `isShared` | count of `meal_plan_household` for plan **> 1** |
| `effectiveProteinOz` | `@menu-boss/portion-calc` `calculateEffectiveProteinOz` over requirement rows + portion categories + family_settings (**do not reimplement formula**; do not use SQL rollup for byId display math per brief) |

### 3.4 Shopping-list RPC return → camelCase API

`generate_shopping_list` columns (0003) → formatter output:

| SQL column | Suggested API |
|------------|---------------|
| `ingredient_id` | `ingredientId` |
| `ingredient_name` | `ingredientName` |
| `dimension` | `dimension` |
| `total_quantity_base` | `totalQuantityBase` (raw) + formatted display fields |
| `is_optional` | `isOptional` |
| `category_name` | `categoryName` |
| `source_recipe_ids` | `sourceRecipeIds` |
| `includes_deleted_recipe` | `includesDeletedRecipe` |

`weekly_protein_rollup`: `meal_plan_id` → `mealPlanId`, `effective_protein_oz` → `effectiveProteinOz`, dates as ISO.

### 3.5 Error mapping (existing `dbErrors.ts`)

| SQLSTATE / signal | tRPC code | Notes |
|-------------------|-----------|--------|
| `42501` / RLS message | FORBIDDEN | Brief + `throwFromPostgrest` |
| `23514` | BAD_REQUEST | Trigger messages (range / athlete_within_count if surfaced) |
| `23505` | CONFLICT | Unlikely on plan write |
| `23502` / `23503` | BAD_REQUEST | null / FK |
| empty row on byId | NOT_FOUND | `assertFound` |

---

## 4. Display-unit algorithm notes (`factor_to_base`)

### 4.1 Where conversion happens

| Layer | Responsibility |
|-------|----------------|
| SQL `generate_shopping_list` | Aggregate to **base units only**: `sum(quantity × factor_to_base × scale_factor)` per `(ingredient_id, dimension, is_optional)`. **No** display-unit selection. |
| tRPC `mealPlan.generateShoppingList` | Load `unit` rows; format each base total; group cross-dimension under one ingredient heading; separate Optional group. |

### 4.2 Scale (SQL, already implemented)

```
scale_factor = meal_plan_assignment.servings::numeric / NULLIF(recipe.yield_servings, 0)
total_quantity_base = Σ (quantity × unit.factor_to_base × scale_factor)
```

If any line has NULL scale (zero yield), entire group’s `total_quantity_base` is NULL (0003 CASE/bool_or). Soft-deleted **recipes** included; soft-deleted **plans** excluded.

### 4.3 Display-unit selection (tRPC — authoritative wording)

From `drafts/claude_authored_sections.md` / DB PRD §6:

> the tRPC wrapper picks the **largest active unit of the row's dimension that yields a quantity ≥ 1**. The SQL function returns base quantities only.

**Algorithm (recommended concrete interpretation):**

1. Base dimensions (seed comments + schema):  
   - mass → gram (`factor_to_base = 1`)  
   - volume → milliliter (`1`)  
   - count → each (`1`)
2. For a row with `(dimension, total_quantity_base)`:  
   - Load units where `dimension = row.dimension` AND `is_active = true` (and `factor_to_base > 0`).
3. For each candidate unit `u`:  
   `displayQty = total_quantity_base / u.factor_to_base`
4. Filter candidates where `displayQty >= 1`.
5. Among those, pick the unit with the **largest** `factor_to_base` (“largest unit”).
6. If none have `displayQty >= 1` (sub-unit totals, e.g. 0.5 g), fall back to the **base unit** of the dimension (smallest `factor_to_base`, typically 1) so the quantity is never forced into a fractional “lb” when under 1 lb—or equivalently the unit that maximizes `factor_to_base` among those with `displayQty` still useful; **flag if coordinator wants strict “always base when all < 1”**.
7. Emit something like `{ quantity: number, unitId, unitAbbreviation, unitName }` plus a display string.

### 4.4 Brief test fixture: 680 g → `"1.5 lb"`

Seed mass units (`supabase/seed.sql`):

| Unit | `factor_to_base` (g) |
|------|----------------------|
| gram | 1 |
| kilogram | 1000 |
| ounce | 28.3495 |
| pound | 453.592 |

`680 / 453.592 ≈ 1.49915…` → format as **1.5 lb** (display rounding required; suggest sensible fixed decimals, e.g. trim trailing zeros / 1–3 decimal places — **not specified**).

`680 / 1000 = 0.68 < 1` → kg excluded; lb wins as largest with qty ≥ 1.

### 4.5 Grouping / Optional (Product §8.7)

- Group API lines by `ingredientId` (heading).
- Within ingredient: one line per **dimension** (never merge mass+volume).
- `isOptional === true` lines go only under **Optional** section; never add into main quantity.
- Cross-dimension example: flour mass + flour volume → one heading, two lines.

### 4.6 Unit seed IDs (for tests)

| id | name | abbr | dimension | factor |
|----|------|------|-----------|--------|
| `…0101` | gram | g | mass | 1 |
| `…0102` | kilogram | kg | mass | 1000 |
| `…0103` | ounce | oz | mass | 28.3495 |
| `…0104` | pound | lb | mass | 453.592 |
| `…0111` | milliliter | ml | volume | 1 |
| `…0115` | cup | cup | volume | 236.588 |
| `…0121` | each | ea | count | 1 |

Full UUID prefix: `00000000-0000-4000-8000-00000000` + suffix above.

---

## 5. Seed UUIDs for personas (pgTAP)

From `supabase/seed.sql` TEST FIXTURES + RLS matrix header.

### 5.1 Households

| Persona key | UUID | Name |
|-------------|------|------|
| `household_a` | `00000000-0000-4000-8000-0000000000a0` | Household A |
| `household_b` | `00000000-0000-4000-8000-0000000000b0` | Household B |
| `household_c` | `00000000-0000-4000-8000-0000000000c0` | Household C |

### 5.2 Profiles (id = auth.uid() convention)

| Persona | UUID | Household | Role |
|---------|------|-----------|------|
| `member_a` | `00000000-0000-4000-8000-0000000000a1` | A (`…0a0`) | `member` |
| `admin_a` | `00000000-0000-4000-8000-0000000000a2` | A (`…0a0`) | `admin` |
| `member_b` | `00000000-0000-4000-8000-0000000000b1` | B (`…0b0`) | `member` |
| `member_c` | `00000000-0000-4000-8000-0000000000c1` | C (`…0c0`) | `member` |
| `anon` | *(no profile row)* | — | role `anon` |

### 5.3 pgTAP JWT impersonation pattern (from `matrix.test.sql`)

```sql
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
-- … exercise meal_plan_create_or_update as member_a …
RESET ROLE;
```

Smoke denial: same with `member_b` (`…0b1`) against A-owned plan → expect failure (`throws_ok` / RLS).

### 5.4 Useful seed IDs for portion / unit fixtures

| Entity | UUID | Notes |
|--------|------|-------|
| family_settings | `…000301` | `athlete_multiplier = 1.5` |
| portion Adult Male | `…000207` | `base_protein_oz = 6.0` |
| portion Adult Female | `…000206` | `5.0` |
| unit gram / lb | `…000101` / `…000104` | display-unit tests |

Use a **non-colliding** fixture range for new meal_plan_rpc tests (aggregation uses `…09xx`; RLS uses `…e00x` / `…d00x` / `…f00x`). Suggest e.g. `…0a1x` plans under `00000000-0000-4000-8000-00000000a1xx` or `…0b0x` — document chosen range in test file header.

### 5.5 Assertion surface (brief)

Shim-compatible only: `plan` / `is` / `ok` / `lives_ok` / `throws_ok` / `results_eq` / `finish`. Guard pgtap extension load like `aggregation.test.sql` DO block.

---

## 6. Existing router style (Wave 1 patterns to copy)

| Pattern | Location | Apply to mealPlan |
|---------|----------|-------------------|
| `authedProcedure` only (JWT supabase) | `trpc.ts` | All procedures; **no** service role |
| Zod from `@menu-boss/schemas` | e.g. `recipe.ts` | New `mealPlan.ts` schemas |
| `throwFromPostgrest` / `assertFound` | `dbErrors.ts` | upsert RPC errors + byId |
| Explicit mapper files | `*Mapper.ts` | `mealPlanMapper.ts` |
| Wire into root | `_app.ts` | Add `mealPlan: mealPlanRouter` (replace “Wave 2 omitted” comment) |
| Extensionless imports | Turbopack | No `.js` suffixes |
| Soft-delete browse vs byId | content routers | listRange: `deleted_at IS NULL` (recommended); byId: allow deleted for history/badge — **confirm** (content rule is byId no filter) |
| Integration env guard | `portion-calc` contract test | `describe.skipIf(!process.env.DATABASE_URL)` + `pg` BEGIN/ROLLBACK |

**Reconciliation style:** content routers use delete-all + insert for junctions (non-atomic across tables). Meal plan **must not** do multi-table client writes — single RPC only.

---

## 7. Ambiguities for NOTES / `<!-- TODO(coordinator): … -->`

Numbered for implementer flagging. Prefer brief over Product naming when they conflict, unless coordinator resolves.

1. **Procedure name `upsert` vs Product `createOrUpdate`**  
   Brief and Task 11 (`mealPlan.upsert`) use **upsert**. Product §10.3 / §9.3 still say `createOrUpdate`. Recommend implement **`upsert`**; leave Product rename to a docs pass.

2. **Payload key casing inside Postgres jsonb**  
   Brief shows camelCase keys in the RPC payload. Confirm implementer parses camelCase in SQL (`p_payload->>'startDate'`) rather than converting to snake in the client before RPC. Zod input is camelCase either way.

3. **Creator household omitted from `householdIds`**  
   Spec: always ensure creator mph exists. If client omits creator id, RPC should still insert creator membership (and not error). If client includes only other households, still force-include creator.

4. **Assignment reconcile strategy**  
   Brief: “delete rows not in payload, upsert the rest.” Options:  
   (a) delete all plan assignments then insert payload;  
   (b) delete where id not in payload ids + upsert by id.  
   Prefer (b) if assignment `id`s are stable for UI; (a) is simpler and fine if UI always resends full set. **ids optional** complicates (b) — new rows without id get new UUIDs.

5. **Portion `count = 0` in payload**  
   DB PRD: not stored. RPC should delete existing row for that category and skip insert. Zod may still allow 0 so the client can “clear” a category in one save.

6. **`listRange` overlap predicate**  
   Brief: `listRange(start, end)`. Recommend same as `weekly_protein_rollup`:  
   `start_date <= end AND end_date >= start` (inclusive overlap). Soft-deleted: exclude on list (browse rule).

7. **`byId` / `listRange` protein source**  
   Brief: compute `effectiveProteinOz` with **portion-calc TS**. Product createOrUpdate step 2 also mentions portion-calc before persist — that is display/cache, not a stored column. Do not write protein total to DB.

8. **Display-unit rounding**  
   “1.5 lb” from 680 g needs rounding policy (fixed 1 decimal? significant figures? `round` half-up?). Also inactive units (`is_active = false`) should be excluded — assumed.

9. **Sub-base quantities (`displayQty < 1` for all non-base units)**  
   Spec only defines “largest … ≥ 1”. Fallback to base unit is the natural choice; confirm.

10. **`meal_slot` vocabulary**  
    Free `text` in DB. Zod: free string vs enum `breakfast|lunch|dinner|snack`? Recommend free trimmed non-empty string unless coordinator freezes enum.

11. **RPC EXECUTE grants & `GRANT` on tables**  
    0002 already grants table privileges to authenticated. New RPC must be executable by authenticated; document in 0004.

12. **Integration test auth**  
    Vitest + `pg` runs as DB owner/superuser unless it sets JWT claims + `SET ROLE authenticated` like pgTAP. Tests that assert RLS denial need the same impersonation; pure reconcile/arithmetic tests may run as superuser **only if** they do not claim to test RLS (brief RLS smoke is in pgTAP).

13. **Share/unshare input shape**  
    Not fully specified. Suggest `{ mealPlanId, householdId }` each. Unshare of creator → FORBIDDEN or BAD_REQUEST with clear message.

14. **Empty `portionRequirements` / empty `assignments`**  
    Allowed: zero protein, empty shopping list, no error (Product ACs).

15. **Plan title / description validation**  
    Brief: structure only; recommend `title` non-empty trimmed in Zod (friendly) even if DB only has NOT NULL.

16. **Concurrent edits**  
    Last-write-wins via full reconcile; no version column. Acceptable for v1; flag if optimistic locking desired later.

17. **`weekly_protein_total`**  
    Exists in 0003; brief only requires wrapping `weekly_protein_rollup` for `proteinRollup`. Do not invent a second procedure unless needed for grand total (can sum client-side).

18. **Historical soft-deleted plan on byId**  
    Content routers: byId does not filter `deleted_at`. Apply same for meal plans so calendar deep-links can badge deleted plans.

---

## 8. Deliverable checklist (for Implementer — not done by Researcher)

| Artifact | Path (brief) |
|----------|----------------|
| RPC migration | `supabase/migrations/0004_meal_plan_rpc.sql` |
| pgTAP | `supabase/tests/functions/meal_plan_rpc.test.sql` |
| Zod | `packages/schemas/src/mealPlan.ts` + export from `index.ts` |
| Router | `apps/web/src/server/routers/mealPlan.ts` + mapper + `_app.ts` |
| Integration tests | `apps/web/src/server/routers/__tests__/mealPlan.integration.test.ts` |
| Implementer writeup | `drafts/grok_out_mealplan_router.md` |

**Do not touch:** `0001_schema.sql`, `0002_security.sql`, `0003_functions.sql`, security helpers, RLS policies.

---

## 9. Quick reference — four-table write graph

```
meal_plan_create_or_update(payload)
  ├─ INSERT/UPDATE meal_plan
  │    attribution: current_household_id(), auth.uid()
  ├─ RECONCILE meal_plan_household
  │    always keep created_by_household_id
  │    upsert payload householdIds
  │    delete others (policy blocks creator delete)
  ├─ RECONCILE meal_plan_portion_requirement
  │    drop count=0; upsert rest by (plan, category)
  └─ RECONCILE meal_plan_assignment
       delete missing; upsert present
       range / athlete CHECKs via triggers + constraints
```

---

*End of research brief. No code was implemented.*
