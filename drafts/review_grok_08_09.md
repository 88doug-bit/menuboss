# Review: Phase 1 Tasks 08–09 (Content Routers + SQL Aggregation Functions)

**Reviewer:** Review agent (`review/grok-08-09`)  
**Date:** 2026-07-15  
**Mode:** **Final fidelity review**  
**Drafts reviewed:**
- `C:\Users\dougr\01gitprojects\menu_boss\drafts\grok_out_content_routers.md`
- `C:\Users\dougr\01gitprojects\menu_boss\drafts\grok_out_sql_functions.md`

| Task | Brief | Draft | Verdict |
|------|-------|-------|---------|
| **08** Zod + content routers | `grok_08_zod_schemas_content_routers.md` | `grok_out_content_routers.md` | **Approve with nits** |
| **09** SQL aggregation functions | `grok_09_sql_aggregation_functions.md` | `grok_out_sql_functions.md` | **Approve with nits** |

**Overall for integrator:** **Integrate both.** No task needs re-author. Fix numbered nits on materialize/merge (especially T08-1 pagination filter correctness and T08-2 search filter safety). Focus gates (D1 JWT-only, no service role, no mealPlan, soft-delete, SECURITY INVOKER, scale_factor, soft-deleted recipes, formula fidelity, return columns) all **Pass**.

---

## Executive summary

1. **Task 08 — Approve with nits.** Schemas complete; tRPC context is JWT-scoped with no service role; Wave 2 routers omitted; soft-delete list/byId rules correct; ingredient CONFLICT merge path present; adminProcedure on food-safety + vocab writes; Vitest boundary suite matches brief. Nits: category/tag post-filter can empty pages; chefIdea `ilike` filter interpolation; tag.reorder no-op (documented); convertToRecipe non-atomic (documented, brief-allowed); mojibake in comments; tests not run in authoring env.
2. **Task 09 — Approve with nits.** Faithful PRD §6 / §4.1 implementation: pure SQL, STABLE, SECURITY INVOKER; servings/yield scale with NULLIF; soft-deleted recipes included + flag; exact return columns; recursive root category; companion `weekly_protein_total`; full-precision formula; strong pgTAP arithmetic coverage. Nits: primary-category heuristic (no `is_primary`); fail-closed if `family_settings` empty; soft-deleted meal plans not filtered (documented).

---

# Task 08 — Zod schemas + tRPC content routers

**Verdict: Approve with nits**

## Brief compliance (output + architecture)

| # | Criterion | Status |
|---|-----------|--------|
| 08-O1 | `drafts/grok_out_content_routers.md` present | **Pass** |
| 08-O2 | Leading `## NOTES`; `### FILE:` + fenced blocks | **Pass** |
| 08-O3 | `@menu-boss/schemas`, zod only runtime dep | **Pass** |
| 08-O4 | common + recipe/ingredient/category/tag/chefIdea/recipeCombination | **Pass** |
| 08-O5 | trpc.ts + routers + mappers + `_app.ts` + schemas.test.ts | **Pass** (+ helpful `dbErrors.ts`, `index.ts`) |
| 08-B1 | D1: no household/role auth beyond adminProcedure display gate | **Pass** |
| 08-B2 | JWT supabase context; **no service-role** | **Pass** |
| 08-B3 | Soft-delete: list filters `deleted_at IS NULL`; byId does not; softDelete sets timestamp | **Pass** (recipe, ingredient, combination) |
| 08-B4 | Family-global: no visibility filters | **Pass** |
| 08-B5 | snake↔camel explicit mappers; no ORM | **Pass** |
| 08-B6 | **EXCLUDE** mealPlan / shoppingList | **Pass** |

## Schema / procedure inventory

| # | Criterion | Status |
|---|-----------|--------|
| 08-A1 | common: uuid, pagination limit ≤ 100, rating 1–5, nonEmptyTrimmed | **Pass** |
| 08-A2 | Recipe instructions / ingredients / leftoverDecayPath / yield > 0 | **Pass** |
| 08-A3 | foodSafetyProfile mercury+general + catchall | **Pass** |
| 08-A4 | ChefIdea status enum, priority 1–3, convertedRecipeId | **Pass** |
| 08-A5 | Combination recipes min 1, roleInMeal enum | **Pass** |
| 08-A6 | No portion/athlete inputs in domain | **Pass** |
| 08-D1 | recipe: list/byId/create/update/softDelete/restore/rate/setLeftoverDecayPath | **Pass** |
| 08-D2 | ingredient: list/byId/create/update/softDelete + setFoodSafetyProfile admin | **Pass** |
| 08-D3 | ingredient create → CONFLICT + existingId on unique | **Pass** |
| 08-D4 | category list tree; admin create/update/deactivate/reorder | **Pass** |
| 08-D5 | tag list + admin mutations | **Pass** (reorder no-op — see T08-4) |
| 08-D6 | chefIdea list/create/update/setStatus/convertToRecipe | **Pass** |
| 08-D7 | recipeCombination list/byId/create/update/rate/softDelete | **Pass** |
| 08-D8 | created_by_user_id from session on writes | **Pass** |
| 08-D9 | Postgres errors → FORBIDDEN / NOT_FOUND / CONFLICT | **Pass** (dbErrors + assertFound) |
| 08-E1 | Vitest: invalid enums, qty 0, rating 6, empty recipes, decay without use, novel contaminant | **Pass** |

## Focus gates (user-requested)

| Gate | Status | Evidence |
|------|--------|----------|
| D1 JWT-only | **Pass** | `createTRPCContext({ supabase, session })`; comments forbid service-role; all queries use `ctx.supabase` |
| No service role | **Pass** | No `SERVICE_ROLE` / service-role client in draft |
| No mealPlan router | **Pass** | `_app.ts` content-only; NOTES §5 |
| Soft-delete rules | **Pass** | list `.is("deleted_at", null)`; byId no filter; softDelete sets `deleted_at` |
| adminProcedure display-only | **Pass** | `is_family_admin` RPC; RLS still on path |

## Findings (Task 08)

### T08-1 — Category/tag filters applied after `limit` (pagination correctness)
- **Severity:** High (nit — do not block integrate)
- **Location:** `recipe.ts` / `ingredient.ts` / `chefIdea.ts` list handlers (post-filter junction pattern)
- **Problem:** Query applies `.limit(limit+1)` then filters by category/tag in memory. Filtered pages can return fewer than `limit` (or empty) while more matches exist.
- **Recommended fix on merge:** Filter via junction subquery / `.in("id", …)` before limit, or over-fetch with a documented max, or RPC.

### T08-2 — chefIdea search builds PostgREST `or` filter from raw `q`
- **Severity:** High (security hygiene)
- **Location:** `chefIdea.ts` list: `` `title.ilike.%${input.q}%,notes.ilike.%${input.q}%` ``
- **Problem:** Unescaped `%`, `,`, `)` in `q` can break or widen the filter expression.
- **Recommended fix:** Escape `%`/`_` and strip filter metacharacters, or use parameterized RPC / `textSearch`.

### T08-3 — `createServerClient` not in `trpc.ts` (context factory only)
- **Severity:** Nit
- **Location:** `apps/web/src/server/trpc.ts`
- **Problem:** Brief wording suggested JWT client creation lives in trpc init; draft correctly accepts an injected client (route-handler responsibility). Safe if scaffold wires `@supabase/ssr` with cookies — not shown in this draft.
- **Recommended fix:** Materializer/scaffold must create JWT client only; optional one-line factory comment already present.

### T08-4 — `tag.reorder` does not persist
- **Severity:** Nit (documented in NOTES §3)
- **Location:** tag schema + router
- **Problem:** No `sort_order` on tag in 0001; procedure is API symmetry only.
- **Recommended fix:** Keep; surface as no-op in OpenAPI/docs or drop until column exists.

### T08-5 — `convertToRecipe` not a single transaction
- **Severity:** Nit (documented; brief allows sequential inserts)
- **Location:** `chefIdea.ts` convertToRecipe
- **Problem:** Partial failure can leave orphan recipe without idea link.
- **Recommended fix:** Later SECURITY INVOKER RPC (NOTES already flags).

### T08-6 — Mojibake in comments / string literals (`â€"`, `â‰¤`)
- **Severity:** Nit
- **Location:** scattered in schemas and routers
- **Problem:** Encoding corruption of en-dash / ≤ characters.
- **Recommended fix:** Re-encode UTF-8 on materialize.

### T08-7 — Schema tests not executed in authoring environment
- **Severity:** Nit / process
- **Location:** NOTES §11
- **Problem:** Vitest suite present but not run.
- **Recommended fix:** Opus/CI run `pnpm test` after materialize.

### T08-8 — Positive notes
- Ingredient CONFLICT + `existingId` backs merge-suggestion AC.
- Soft-delete / restore on recipe correct; byId exposes `isDeleted` badge field via mapper.
- Food safety correctly on `ingredient.setFoodSafetyProfile` (NOTES clarifies PRD naming).

---

# Task 09 — `0003_functions.sql` + pgTAP

**Verdict: Approve with nits**

## Brief compliance (output)

| # | Criterion | Status |
|---|-----------|--------|
| 09-O1 | `drafts/grok_out_sql_functions.md` present | **Pass** |
| 09-O2 | `### FILE: supabase/migrations/0003_functions.sql` | **Pass** |
| 09-O3 | `### FILE: supabase/tests/functions/aggregation.test.sql` | **Pass** |
| 09-O4 | NOTES document scale NULL rule, companion total, pure SQL | **Pass** |
| 09-O5 | No SECURITY DEFINER; pure `LANGUAGE sql` | **Pass** |

## `generate_shopping_list`

| # | Criterion | Status |
|---|-----------|--------|
| 09-A1 | Signature + RETURNS TABLE columns exact | **Pass** |
| 09-A2 | `LANGUAGE sql STABLE SECURITY INVOKER` | **Pass** |
| 09-A3 | Join: plans → assignments → recipe → recipe_ingredient → unit → ingredient → category roots | **Pass** |
| 09-A4 | Soft-deleted recipes **included** (no `recipe.deleted_at IS NULL`) | **Pass** |
| 09-A5 | `scale_factor = servings::numeric / NULLIF(yield_servings, 0)` | **Pass** |
| 09-A6 | NULL scale → `total_quantity_base` NULL (group not dropped) | **Pass** (`bool_or` + CASE) |
| 09-A7 | GROUP BY `(ingredient_id, dimension, is_optional)` | **Pass** |
| 09-A8 | `total_quantity_base` = Σ quantity × factor_to_base × scale_factor | **Pass** |
| 09-A9 | `source_recipe_ids` uuid[]; `includes_deleted_recipe` bool_or | **Pass** |
| 09-A10 | Recursive CTE root category (parent_id / D15) | **Pass** |
| 09-A11 | No display-unit selection; no cross-dimension conversion | **Pass** |
| 09-A12 | `ORDER BY category_name NULLS LAST, ingredient_name, dimension` (+ is_optional) | **Pass** |
| 09-A13 | Empty array / invisible plans → zero rows (no error) | **Pass** (RLS + ANY filter) |

## `weekly_protein_rollup` / total

| # | Criterion | Status |
|---|-----------|--------|
| 09-B1 | SECURITY INVOKER; date overlap `[p_start, p_end]` | **Pass** |
| 09-B2 | Formula `((count − athlete_count) + athlete_count × mult) × base_protein_oz` | **Pass** |
| 09-B3 | Full precision; no `round()` | **Pass** |
| 09-B4 | Returns meal_plan_id, title, start_date, end_date, effective_protein_oz | **Pass** |
| 09-B5 | Companion `weekly_protein_total` (stated in NOTES) | **Pass** |
| 09-B6 | Only sanctioned SQL copy of portion formula | **Pass** |

## pgTAP coverage

| # | Criterion | Status |
|---|-----------|--------|
| 09-D1 | Empty plan array → 0 rows | **Pass** |
| 09-D2 | Multi-recipe mass dedup → 550 g | **Pass** (hand math: 400+100+50) |
| 09-D3 | Soft-deleted contributes + `includes_deleted_recipe` + sources | **Pass** |
| 09-D4 | Cross-dimension flour → 2 rows (946.352 ml + 100 g) | **Pass** |
| 09-D5 | Optional garnish isolated (2 ea) | **Pass** |
| 09-D6 | Root category Poultry → Protein | **Pass** |
| 09-D7 | yield 0 → total NULL | **Pass** |
| 09-D8 | Roll-up 15 + 16; total companion consistency | **Pass** |

## Focus gates (user-requested)

| Gate | Status | Evidence |
|------|--------|----------|
| SECURITY INVOKER | **Pass** | All three functions |
| scale_factor | **Pass** | servings / NULLIF(yield, 0); not protein-driven |
| Soft-deleted recipes included | **Pass** | JOIN recipe without deleted filter; bool_or flag |
| Formula fidelity | **Pass** | §4.1; tests assert 15.0 worked path + multi-cat 16 |
| Return columns | **Pass** | Exact PRD set |

## Findings (Task 09)

### T09-1 — Primary category is heuristic (`DISTINCT ON` sort_order/name)
- **Severity:** Nit (documented NOTES §3)
- **Location:** `primary_category` CTE
- **Problem:** No `is_primary` on `ingredient_category`; deterministic pick may not match product “primary” if multi-category.
- **Recommended fix:** Accept for v1; add `is_primary` later if product requires.

### T09-2 — Empty `family_settings` fails closed (no rollup rows)
- **Severity:** Nit (documented NOTES §10)
- **Location:** `CROSS JOIN LATERAL … family_settings LIMIT 1`
- **Problem:** Missing settings row yields empty rollup instead of 0 with default multiplier.
- **Recommended fix:** Seed guarantees one row; optional later default 1.5.

### T09-3 — Soft-deleted meal plans still roll up if RLS-visible
- **Severity:** Nit (documented NOTES §9)
- **Location:** `weekly_protein_rollup` WHERE date overlap only
- **Problem:** Lifecycle filter not applied; brief said RLS-visible only.
- **Recommended fix:** Coordinator may add `deleted_at IS NULL` if product requires.

### T09-4 — Positive notes
- NULL scale rule stronger than naive SUM (won't silently ignore bad lines).
- Pure SQL only; search_path pinned; comments document D14 contracts.
- Test UUID ranges avoid seed collisions; transaction ROLLBACK.

---

# Cross-task / integration notes

| ID | Note | Action |
|----|------|--------|
| X1 | Task 08 does not re-implement shopping aggregation | Good — Wave 2 only |
| X2 | Task 09 formula aligns with Task 07 worked example (15.0) | Contract-test ready |
| X3 | `is_family_admin` RPC assumed from Claude 0002 | Scaffold order dependency |
| X4 | `search_vector` column name must match 0001 generated tsvector | Verify on materialize |
| X5 | superjson dep for tRPC transformer | Add on scaffold if missing |

---

# Verdicts (final)

| Task | Verdict | Integrate? |
|------|---------|------------|
| **08 Zod + content routers** | **Approve with nits** | **Yes** — address T08-1/T08-2 soon after materialize |
| **09 SQL aggregation functions** | **Approve with nits** | **Yes** — safe for Claude coordinator review + materialize |

**Integrator instruction:** Materialize both drafts. Do not re-author. Prefer fixing T08-1 and T08-2 in the same PR as materialize if cheap; remaining nits can follow. Task 09 is coordinator-sensitive — still **Approve with nits** on contract fidelity.

---

*End of final review.*
