# Research Brief — Tasks 08 & 09 (Zod Schemas / Content Routers + SQL Aggregation Functions)

**Agent:** Researcher  
**Branch:** `research/grok-08-09`  
**Date:** 2026-07-15  
**Audience:** Implementers for `grok_08_zod_schemas_content_routers.md` and `grok_09_sql_aggregation_functions.md`  
**Scope:** Investigation only. **Do not** treat this as router source, Zod packages, or migration SQL. **Do not** invent endpoints or columns beyond briefs + PRDs.

**Primary inputs (read fully):**

| File | Role |
|------|------|
| `grok_08_zod_schemas_content_routers.md` | Task 08 brief: `@menu-boss/schemas` + content tRPC routers |
| `grok_09_sql_aggregation_functions.md` | Task 09 brief: `0003_functions.sql` + pgTAP smoke |
| `Product_PRD_v0.2.md` §8, §10 | Functional ACs + high-level API contracts |
| `Recipe_Meal_Planning_Database_PRD_v0.4.md` §4.1, §6 | Portion formula + `generate_shopping_list` column contract |
| `drafts/claude_authored_sections.md` | Verbatim shopping-list contract (same as DB PRD §6) |
| `drafts/grok_out_schema_migration.md` | Draft `0001_schema.sql` column shapes (implementer-aligned) |
| `packages/portion-calc/src/index.ts` | Canonical TS formula (reference for SQL mirror) |
| `packages/portion-calc/fixtures/contract-fixtures.json` | Numeric fixtures for TS↔SQL contract test |

**Out of scope for Wave 1 (explicit in brief / PHASE1_PLAN):**  
`mealPlan.*`, `shoppingList.*`, `familySettings.*`, `user`/`household` routers. Those are Wave 2.

---

## 1. Exact procedure list per content router (from brief)

Source: `grok_08_zod_schemas_content_routers.md` “Procedures per router (follow Product PRD §10.2/§10.3)”.  
Cross-check: Product PRD §10.2 lists domain routers; §10.3 examples are partial (content routers expanded by the brief).

### Shared infrastructure (not routers, required by brief)

| Piece | Location | Behavior |
|-------|----------|----------|
| tRPC init | `apps/web/src/server/trpc.ts` | Context `{ supabase, session }`; per-request Supabase client from caller JWT |
| `authedProcedure` | same | Reject unauthenticated |
| `adminProcedure` | same | authed + `is_family_admin` RPC (display/gating only — RLS still enforces) |
| App router | `apps/web/src/server/routers/_app.ts` | Merge content routers only (no mealPlan/shoppingList in Wave 1) |
| Mappers | `mapper.ts` per router | snake_case DB ↔ camelCase TS; no ORM |

**Authorization rule (D1):** routers do **not** re-check household/roles. Surface Postgres/RLS failures as typed `FORBIDDEN` / `NOT_FOUND` (and `CONFLICT` for unique-violations where specified).

**Soft-delete rule (all content with `deleted_at`):**  
- `delete` / softDelete → `SET deleted_at`  
- browse/search → `deleted_at IS NULL`  
- detail-by-id → **do not** filter `deleted_at` (historical plan surfaces need deleted rows, badged)

**Family-global (D7):** no household visibility filters on content queries.

---

### 1.1 `recipe`

| Procedure | Access | Notes |
|-----------|--------|-------|
| `list` | authed | Filters: search `q` (tsvector), `categoryIds`, `tagIds`, `maxTotalMinutes`, `minRating`; cursor pagination |
| `byId` | authed | No `deleted_at` filter |
| `create` | authed | Set `created_by_user_id` from session |
| `update` | authed | Attribution immutable (DB trigger in 0002) |
| `softDelete` | authed | Sets `deleted_at` |
| `restore` | authed | Clears `deleted_at` |
| `rate` | authed | `makeAgainRating` 1–5 |
| `setLeftoverDecayPath` | authed | JSONB array of decay entries |

**Product §8.1 / §8.6 ACs that procedures must support:** soft-delete + restore badges on plan surfaces; decay-path write; family-global browse; soft-deleted excluded from `list` only.

**Do not invent:** `recipe.addOrUpdateFoodSafetyProfile` appears in Product §10.3 examples but safety profile lives on **ingredient** (DB PRD §4.1/§4.2). Brief assigns `ingredient.setFoodSafetyProfile` — follow the **brief**.

---

### 1.2 `ingredient`

| Procedure | Access | Notes |
|-----------|--------|-------|
| `list` | authed | Filters: search, `categoryIds`, `hasSafetyProfile`; `deleted_at IS NULL` |
| `byId` | authed | No `deleted_at` filter |
| `create` | authed | Map unique-violation on `uq_ingredient_name` → typed **CONFLICT** with existing ingredient id (merge-suggestion AC §8.1) |
| `update` | authed | |
| `softDelete` | authed | Allowed even if recipes still reference (badge recipes — app concern) |
| `setFoodSafetyProfile` | **adminProcedure** | Zod-shaped JSONB; RLS still enforces admin write on vocab-adjacent fields if policies require |

**Product §8.1:** case-insensitive unique name; merge suggestion on duplicate create.

---

### 1.3 `category`

| Procedure | Access | Notes |
|-----------|--------|-------|
| `list` | authed | Return **tree** assembled from flat `parent_id` rows (recursive CTE or app assembly) |
| `create` | admin | |
| `update` | admin | |
| `deactivate` | admin | Prefer `is_active = false` (not hard delete) |
| `reorder` | admin | `sortOrder` |

---

### 1.4 `tag`

| Procedure | Access | Notes |
|-----------|--------|-------|
| `list` | authed | Flat list; optional filter by `tagGroup` if useful (PRD has `tag_group`) |
| `create` | admin | |
| `update` | admin | |
| `deactivate` | admin | `is_active = false` |
| `reorder` | admin | Only if schema has sort; draft tag table has **no** `sort_order` — see NOTES ambiguities |

---

### 1.5 `chefIdea`

| Procedure | Access | Notes |
|-----------|--------|-------|
| `list` | authed | Filters: `status`, `priority`, tags/categories, search; soft-delete filter on browse |
| `create` | authed | Family-global; `created_by_user_id` from session |
| `update` | authed | |
| `setStatus` | authed | Enum transition |
| `convertToRecipe` | authed | Creates recipe from idea preserving notes/tags/categories **in one transaction** (single RPC or sequential inserts with error surfacing); links `convertedRecipeId` / `linked_recipe_id` |

**Product §8.5 AC:** convert preserves notes and tags.

**No explicit softDelete in brief** — flag if implementer needs it (schema has `deleted_at`).

---

### 1.6 `recipeCombination`

| Procedure | Access | Notes |
|-----------|--------|-------|
| `list` | authed | Soft-delete filter on browse |
| `byId` | authed | No `deleted_at` filter |
| `create` | authed | Combination + junction rows; min 1 recipe |
| `update` | authed | Including junction rewrite strategy (delete+insert or upsert) — choose in NOTES |
| `rate` | authed | Combination-level `makeAgainRating` (separate from recipe rating) |
| `softDelete` | authed | |

**Product §8.4:** roles `main`/`side`/…; sequence; notes; template flag.

---

### 1.7 Explicit non-list (Wave 2 / other routers)

From Product §10.2 — **do not implement in Task 08:**

- `mealPlan` (createOrUpdate, generateShoppingList, …)
- `shoppingList`
- `familySettings`
- `user` / `household`

---

## 2. Zod schema inventory

Package: `@menu-boss/schemas` — **zod only** runtime dep.  
Files per brief: `packages/schemas/src/{common,recipe,ingredient,category,tag,chefIdea,recipeCombination}.ts`.

### 2.1 `common.ts`

| Export (recommended name) | Shape / constraints | Used by |
|---------------------------|---------------------|---------|
| `uuidSchema` | UUID string | All id fields |
| `paginationInput` | `{ cursor?: string; limit: number }` with `limit ≤ 100` | All `list` |
| `ratingSchema` | int **1–5** (sortable rating) | recipe/combo rate |
| `nonEmptyTrimmed` | string trim, min 1 | titles, names |
| (optional) `cursorPage` | shared list response envelope if implementers want DRY | list outputs |

### 2.2 `recipe.ts`

| Schema | Fields / rules (brief + PRD + draft schema) |
|--------|-----------------------------------------------|
| Instruction step | `{ text: nonEmptyTrimmed; timerMinutes?: number ≥ 0; temperature?: string }` |
| Recipe ingredient line | `{ ingredientId: uuid; quantity: number > 0; unitId: uuid; preparationNote?: string; sequenceOrder: number; isOptional: boolean }` |
| Leftover decay entry | `{ use: nonEmptyTrimmed; notes?: string; linkedRecipeIds?: uuid[] }` — reject entry without `use` |
| Create input | title, description?, instructions[], prep/cook/total minutes ≥ 0 (nullable OK), yieldServings > 0, source? (see ambiguity: url/book vs single field), ingredients[], categoryIds[], tagIds[], makeAgainRating 1–5 optional, leftoverDecayPath? |
| Update input | id + partial of create (or full replace — choose one style consistently) |
| List input | pagination + `q?`, `categoryIds?`, `tagIds?`, `maxTotalMinutes?`, `minRating?` |
| Rate input | `{ id; makeAgainRating: 1–5 }` |
| SoftDelete / restore / byId | `{ id }` |
| setLeftoverDecayPath | `{ id; leftoverDecayPath: decay[] }` |

**Draft DB columns to map:** `source_url`, `source_book`, `instructions` jsonb, `leftover_decay_path`, `yield_servings`, times, `make_again_rating`, `is_template` (brief does not require isTemplate on recipe create — present on combo).

### 2.3 `ingredient.ts`

| Schema | Fields / rules |
|--------|----------------|
| Contaminant shape | `{ fda_category?, risk_level?, recommended_frequency?, notes?, source?, last_reviewed? }` (PRD §4.2 keys) |
| foodSafetyProfile | Known keys `mercury` + `general` typed; **`.catchall()`** same contaminant shape so novel keys accepted |
| Create | name trimmed **1–120** chars; description?; defaultUnitId?; foodSafetyProfile? |
| Update | id + partial |
| List | pagination + search?, categoryIds?, hasSafetyProfile?: boolean |
| setFoodSafetyProfile | `{ id; foodSafetyProfile }` (admin procedure input) |
| softDelete / byId | `{ id }` |

### 2.4 `category.ts`

| Schema | Fields |
|--------|--------|
| Create | name, slug, parentId nullable uuid, categoryType, sortOrder, isActive? |
| Update | id + partial |
| Deactivate | `{ id }` or `{ id; isActive: false }` |
| Reorder | array of `{ id; sortOrder }` (or similar) |
| List | optional filters (type, activeOnly) — brief only requires tree assembly |

### 2.5 `tag.ts`

| Schema | Fields |
|--------|--------|
| Create | name, slug, tagGroup, description?, isActive? |
| Update / deactivate / reorder | mirror category (reorder may be no-op if no sort column) |
| List | optional `tagGroup` filter |

### 2.6 `chefIdea.ts`

| Schema | Fields |
|--------|--------|
| Status enum | `idea \| researching \| tested \| adopted \| abandoned` (matches draft CHECK) |
| Create | title, notes?, source?, status?, priority int **1–3** (brief), categoryIds?, tagIds?, convertedRecipeId? optional |
| Update | id + partial |
| setStatus | `{ id; status }` |
| convertToRecipe | `{ id; …recipe seed fields? }` — brief: create recipe from idea; exact input beyond id is ambiguous |
| List | status?, priority?, tagIds?, categoryIds?, search?, pagination |

### 2.7 `recipeCombination.ts`

| Schema | Fields |
|--------|--------|
| Role enum | `main \| side \| dessert \| appetizer \| other` (brief; **stricter than draft DB** which is free `text`) |
| Recipe line | `{ recipeId: uuid; roleInMeal: enum; sequenceOrder: number }` — **min 1** in array |
| Create | name, notes?, makeAgainRating?, recipes: line[] min 1, isTemplate? |
| Update | id + partial + junction rewrite |
| Rate | `{ id; makeAgainRating: 1–5 }` |
| softDelete / byId / list | standard |

### 2.8 Vitest matrix (brief `schemas.test.ts`)

Must cover (at least):

- Invalid enums  
- quantity **0** rejected  
- rating **6** rejected  
- empty combination recipes array rejected  
- decay-path entry without `use` rejected  
- foodSafetyProfile with **novel contaminant key** accepted  
- Domain has **no portion inputs** (athlete-free)

---

## 3. `generate_shopping_list` column contract (from PRD)

**Authoritative:** Database PRD v0.4 §6 (mirrored in `drafts/claude_authored_sections.md` SHOPPING_LIST_VIEW).  
**Brief alignment:** `grok_09` — where brief and PRD differ, **PRD wins**.

### 3.1 Signature & properties

```
generate_shopping_list(p_meal_plan_ids uuid[])
```

| Property | Value |
|----------|--------|
| Language | `sql` |
| Volatility | `STABLE` |
| Security | **`SECURITY INVOKER`** (never DEFINER) |
| RLS behavior | Invisible plan IDs contribute **zero rows**, never error |
| Empty array | **Zero rows** (brief pgTAP) |
| Ordering | `ORDER BY category_name NULLS LAST, ingredient_name, dimension` (brief) |

### 3.2 Join shape (single set-based query)

```
meal_plan (id = ANY(p_meal_plan_ids), RLS-visible)
  JOIN meal_plan_assignment      ON meal_plan
  JOIN recipe                    ON assignment   -- soft-deleted recipes INCLUDED
  JOIN recipe_ingredient         ON recipe
  JOIN unit                      ON recipe_ingredient.unit_id
  JOIN ingredient                ON recipe_ingredient.ingredient_id
  LEFT JOIN ingredient_category  ON ingredient   -- top-level category for grouping
GROUP BY ingredient_id, unit.dimension, recipe_ingredient.is_optional
```

### 3.3 Exact return columns

| Column | Type (recommended) | Meaning |
|--------|--------------------|---------|
| `ingredient_id` | `uuid` | Identity |
| `ingredient_name` | `text` | Identity / display |
| `dimension` | `text` | `mass` / `volume` / `count` — one row per (ingredient × dimension × is_optional) |
| `total_quantity_base` | `numeric` | Σ `quantity × factor_to_base × scale_factor` |
| `is_optional` | `boolean` | Optional lines aggregate separately (Optional group in UI) |
| `category_name` | `text` (nullable) | **Top-level** ancestor of ingredient’s category (store-aisle grouping) |
| `source_recipe_ids` | `uuid[]` | Recipes that contributed (UI “why is this here?”) |
| `includes_deleted_recipe` | `boolean` | True if any contributing recipe has `deleted_at IS NOT NULL` |

### 3.4 Scaling rule (v1)

```
scale_factor = meal_plan_assignment.servings::numeric
              / NULLIF(recipe.yield_servings, 0)
```

- Protein formula does **not** rescale lines (Product §8.7 / DB §6).  
- Protein totals **inform** user choice of `servings` only.  
- Brief: NULL scale_factor → surface `total_quantity_base` **NULL** rather than drop row (confirm in NOTES if choosing differently).  
- Draft schema CHECK already enforces `yield_servings > 0` and assignment `servings > 0` — NULL path is defense-in-depth for bad data.

### 3.5 Aggregation & conversion rules

| Rule | Behavior |
|------|----------|
| Same ingredient, same dimension, same optional flag | **Sum** base quantities |
| Same ingredient, **different** dimension | **Separate rows** (D12 — never density-guess) |
| `is_optional = true` vs false | Separate groups; optional never merges into required |
| Soft-deleted recipe | Still contributes; `includes_deleted_recipe = true` |
| Display units | **Not** in SQL; tRPC formats base → largest unit ≥ 1 (Wave 2) |
| Cross-dimension conversion | Forbidden in SQL |

### 3.6 Top-level category

- Brief: root ancestor via **recursive CTE** on `category.parent_id` (D15).  
- Draft junction: `ingredient_category (ingredient_id, category_id)` — **no primary flag**. Multiple categories possible → ambiguity (see §5).

### 3.7 Product §8.7 ACs that SQL must make true

- Multi-plan RLS-visible merge; invisible ids silent  
- 200 g + 200 g flour → one 400 g-base line (same dimension)  
- 500 g + 2 cups flour → two lines (mass vs volume)  
- Optional garnish isolated  
- scale by servings/yield  
- Soft-deleted recipe still contributes + badge flag  
- Empty plans / no assignments → empty result, no error  

---

## 4. `weekly_protein_rollup` formula alignment with portion-calc

### 4.1 Canonical formula (DB PRD §4.1 — identical in Product §8.2)

```
effective_protein_oz(plan) =
  Σ over requirement rows r:
    ( (r.count − r.athlete_count)
      + r.athlete_count × family_settings.athlete_multiplier )
    × portion_category.base_protein_oz
```

**Only sanctioned SQL copy** of this formula is the weekly roll-up (D14). Shopping list does **not** use it.

### 4.2 TypeScript reference (`@menu-boss/portion-calc`)

```ts
// weightedPeople = (count - athleteCount) + athleteCount * athleteMultiplier
// row oz = weightedPeople * category.baseProteinOz
// total  = Σ row oz
calculateEffectiveProteinOz(requirements, categories, settings)
```

Behavioral pins:

| Behavior | TS | SQL must match |
|----------|----|----------------|
| Full precision | No internal rounding; `roundOz` display-only | **No `round()` / `trunc()` inside function** |
| Deactivated categories | Still calculate (`isActive` ignored for math) | Join `portion_category` regardless of `is_active` |
| Empty requirements | `0` | Plan with no requirement rows → `0` (or omit plan — see NOTES) |
| athleteCount ≤ count | Throws in TS if violated | DB CHECK `athlete_within_count` prevents bad rows |
| athleteMultiplier > 0 | Throws if ≤ 0 | FamilySettings CHECK `athlete_multiplier > 0` |
| Unknown category | Throws | INNER JOIN drops orphan rows — prefer not to happen under FK |

### 4.3 Contract fixtures (`packages/portion-calc/fixtures/contract-fixtures.json`)

Coordinator contract test runs **TS and SQL against identical cases**. Implementers should treat these as the numeric golden set:

| Fixture name | Expected `effectiveOz` | Hand check |
|--------------|------------------------|------------|
| `prd_worked_example_adult_male` | **15.0** | ((2−1)+1×1.5)×6 = 15 |
| `zero_rows` | **0.0** | empty requirements |
| `zero_counts` | **0.0** | count=0 athlete=0 |
| `all_athlete_group` | **27.0** | (0+3×1.5)×6 = 27 |
| `multi_category_mixed` | **28.0** | 15 + 10 + 3 |
| `deactivated_category_still_calculates` | **15.0** | isActive=false still 15 |
| `floating_point_base_5_3` | **13.25** | 2.5×5.3 |
| `athlete_equals_count_boundary` | **16.0** | (0+2×2)×4 |
| `hand_computed_4dp_mixed_multiplier` | **15.555** | (1+2×1.33)×4.25 |
| `no_athletes_plain_sum` | **24.0** | 4×6 (multiplier unused) |

**SQL type note:** use `numeric` arithmetic end-to-end so `15.555` and `13.25` match without float noise. Avoid casting through `double precision` in the sum.

### 4.4 Brief contract for roll-up function

```
weekly_protein_rollup(p_start date, p_end date)
```

| Aspect | Spec |
|--------|------|
| Security | `SECURITY INVOKER` |
| Scope | RLS-visible `meal_plan` rows **overlapping** `[p_start, p_end]` |
| Joins | `meal_plan` × `meal_plan_portion_requirement` × `portion_category` × `family_settings` |
| Per-plan columns | `(meal_plan_id, title, start_date, end_date, effective_protein_oz numeric)` |
| Grand total | Either a sentinel grand-total **row** **or** companion `weekly_protein_total(p_start, p_end) returns numeric` — **implementer choice; state in NOTES** |

**Overlap definition (recommend explicit in SQL NOTES):**  
`meal_plan.start_date <= p_end AND meal_plan.end_date >= p_start` (inclusive range intersection). Confirm with coordinator if half-open preferred.

**Family settings:** draft has no singleton constraint; seed inserts one row. Roll-up should use the single family settings row (e.g. `FROM family_settings LIMIT 1` or join without plan key). Multi-row is an ambiguity (§5).

### 4.5 Alignment checklist for implementer

1. Per-plan sum must equal `calculateEffectiveProteinOz` for the same requirement + category + settings rows.  
2. Fixture `hand_computed_4dp_mixed_multiplier` and `floating_point_base_5_3` prove full precision.  
3. Fixture `deactivated_category_still_calculates` proves no `is_active` filter in the math path.  
4. Do **not** reimplement formula in shopping-list SQL.  
5. pgTAP brief requires a two-plan hand-computed roll-up assertion.

---

## 5. Ambiguities for NOTES (implementers — do not invent silently)

Flag these in Task 08 / 09 `## NOTES`; prefer PRD when conflicting with brief; ask coordinator if product-level.

### Task 08 (schemas + routers)

| # | Topic | Options / recommendation |
|---|--------|---------------------------|
| A1 | **Food safety procedure ownership** | Product §10.3 shows `recipe.addOrUpdateFoodSafetyProfile`; DB + brief put profile on **ingredient** and `ingredient.setFoodSafetyProfile`. **Recommend brief/DB.** |
| A2 | **Recipe `source` field** | Brief: single `source`. Draft schema: `source_url` + `source_book`. **Recommend** Zod expose both (or a union object) matching 0001. |
| A3 | **ChefIdea link field name** | Brief: `convertedRecipeId`. Draft schema: `linked_recipe_id`. **Recommend** DB column name + camelCase `linkedRecipeId`; alias in NOTES if API wants converted* |
| A4 | **ChefIdea `priority` range** | Brief: int 1–3. Draft: nullable integer **no CHECK**. **Recommend** Zod 1–3; optional null on read |
| A5 | **ChefIdea softDelete** | Schema has `deleted_at`; brief omits softDelete. **Recommend** add softDelete for consistency with A1 content shape, or document intentional omission |
| A6 | **`convertToRecipe` input** | How much recipe body is required on convert? Minimal (title from idea + empty ingredients) vs full recipe create schema. **Recommend** reuse recipe create with defaults from idea; document |
| A7 | **`role_in_meal` strictness** | Brief enum; draft DB free text. **Recommend** Zod enum; optional DB CHECK later |
| A8 | **Tag `reorder`** | Brief lists reorder; draft `tag` has **no** `sort_order`. **Recommend** implement reorder only for category; tag reorder no-op or add column in schema follow-up |
| A9 | **Primary category for list filters** | Multi-category ingredients/recipes — `categoryIds` filter = ANY match (OR). Tree list is category table only |
| A10 | **Postgres error → TRPCError map** | Brief: FORBIDDEN / NOT_FOUND / CONFLICT. Exact SQLSTATE map not specified. **Recommend** document map: `42501`/`PGRST*` → FORBIDDEN; `23505` → CONFLICT; 0 rows update → NOT_FOUND |
| A11 | **`is_family_admin` RPC** | Lives in 0002 (Claude). Wave 1 routers that need `adminProcedure` depend on security migration landing first — scaffold stub acceptable until 0002 |
| A12 | **Recipe `is_template`** | On draft recipe table; not in brief create. Optional field OK |
| A13 | **Combination update junction strategy** | Replace-all vs patch. **Recommend** replace-all for simplicity |
| A14 | **Pagination cursor** | Opaque cursor encoding (created_at+id vs offset) not specified. **Recommend** `(created_at, id)` keyset |

### Task 09 (SQL functions)

| # | Topic | Options / recommendation |
|---|--------|---------------------------|
| B1 | **`yield_servings = 0` / NULL scale** | Brief prefers NULL `total_quantity_base` keep row. Draft CHECK prevents 0. **Recommend** NULLIF path + keep row for defense |
| B2 | **Multiple ingredient categories** | Which becomes top-level `category_name`? Options: (a) arbitrary `MIN(name)`, (b) first by sort_order, (c) require single primary later. **Recommend** deterministic pick: recursive root of **lowest `sort_order` then name** leaf among joined categories; document |
| B3 | **Ingredient with zero categories** | `category_name` NULL; still return ingredient row. ORDER BY NULLS LAST |
| B4 | **Soft-deleted ingredients** | PRD emphasizes soft-deleted **recipes**. Soft-deleted ingredients still joined? **Recommend** include (plans still reference via recipe_ingredient); no badge column unless added — may need NOTES only |
| B5 | **Grand total shape** | Sentinel row (`meal_plan_id` NULL) vs `weekly_protein_total()`. **Recommend** companion function `weekly_protein_total` for cleaner typing; roll-up returns per-plan only |
| B6 | **Date overlap inclusive** | Recommend `start_date <= p_end AND end_date >= p_start` |
| B7 | **Plans with zero protein** | Include with `effective_protein_oz = 0` vs omit. **Recommend** include all overlapping RLS-visible plans for calendar strip honesty |
| B8 | **Multiple `family_settings` rows** | No singleton constraint. **Recommend** `ORDER BY updated_at DESC LIMIT 1` or single seed id; flag for 0001 follow-up |
| B9 | **`source_recipe_ids` order** | `array_agg(DISTINCT … ORDER BY …)` for stability |
| B10 | **Pure SQL vs PL/pgSQL** | Prefer pure SQL; recursive CTE for category root may need WITH. PL/pgSQL only if unavoidable |
| B11 | **Numeric vs float in contract test** | SQL `numeric` vs JS number — fixture values are short decimals; compare with equality on numeric cast or epsilon only if needed |
| B12 | **Empty `p_meal_plan_ids`** | Zero rows (brief). Confirm `= ANY('{}')` behavior |
| B13 | **Deleted meal_plan** | Draft adds `meal_plan.deleted_at`. Should roll-up / shopping list exclude soft-deleted plans? PRD silent. **Recommend** exclude plans with `deleted_at IS NOT NULL` in both functions (lifecycle filter in function, not RLS) |

### Cross-cutting

| # | Topic | Note |
|---|--------|------|
| C1 | Wave boundary | Task 08 must **not** implement shoppingList tRPC wrapper; Task 09 implements SQL only |
| C2 | Contract test owner | PHASE1_PLAN: Claude owns TS↔SQL portion contract test; Grok keeps fixtures/SQL numeric exact |
| C3 | Precedence | PRD > brief when they conflict (stated in grok_09) |

---

## 6. Quick reference — implementer file outputs

### Task 08 → `drafts/grok_out_content_routers.md`

- `packages/schemas/package.json` + `tsconfig.json`  
- `packages/schemas/src/{common,recipe,ingredient,category,tag,chefIdea,recipeCombination}.ts`  
- `apps/web/src/server/trpc.ts`  
- `apps/web/src/server/routers/{recipe,ingredient,category,tag,chefIdea,recipeCombination}.ts` + `_app.ts` + mappers  
- `apps/web/src/server/routers/__tests__/schemas.test.ts`  
- Leading `## NOTES` for ambiguities above  

### Task 09 → `drafts/grok_out_sql_functions.md`

- `supabase/migrations/0003_functions.sql` — `generate_shopping_list`, `weekly_protein_rollup` (+ optional total)  
- `supabase/tests/functions/aggregation.test.sql` — pgTAP arithmetic smoke  
- Leading `## NOTES` for B1–B13  

---

## 7. Sources consulted

- `grok_08_zod_schemas_content_routers.md`  
- `grok_09_sql_aggregation_functions.md`  
- `Product_PRD_v0.2.md` §8.1–§8.8, §10.1–§10.5  
- `Recipe_Meal_Planning_Database_PRD_v0.4.md` §4.1 (entities + formula), §6 (shopping list + roll-up)  
- `drafts/claude_authored_sections.md` (SHOPPING_LIST_VIEW)  
- `drafts/grok_out_schema_migration.md` (column shapes)  
- `packages/portion-calc/src/index.ts`  
- `packages/portion-calc/fixtures/contract-fixtures.json`  
- `PHASE1_PLAN.md` (wave boundaries, migration split)  
