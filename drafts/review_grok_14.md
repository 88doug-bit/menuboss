# Review: Phase 1 Task 14 (Recipe & Ingredient editors) — Final

**Reviewer:** Review agent (`review/grok-14`)  
**Date:** 2026-07-15  
**Branch:** `review/grok-14`  
**Mode:** **Final fidelity review** (draft present)

**Brief:** `grok_14_recipe_ingredient_editors.md`  
**Draft:** `C:\Users\dougr\01gitprojects\menu_boss\drafts\grok_out_recipe_editors.md`

| Task | Brief | Draft | Verdict |
|------|-------|-------|---------|
| **14** Recipe editor + ingredient manager + admin safety UI | `grok_14_recipe_ingredient_editors.md` | `grok_out_recipe_editors.md` | **Approve with nits** |

**Overall for integrator:** **Integrate.** No re-author required. Apply nits on materialize (UTF-8 mojibake). Key gates **G1–G6 all Pass.** `SEED_UNITS` client catalog is accepted with NOTES/TODO (no unjustified new procedures).

---

## Executive summary

1. **Task 14 — Approve with nits.** Full recipe create/edit UI (`/recipes/new`, `/recipes/[id]/edit`), ingredient manager (`/recipes/ingredients`), admin-gated food-safety editor via `setFoodSafetyProfile`, CONFLICT merge suggestion on duplicate ingredient names, recipe soft-delete confirm + restore on detail, extensionless imports, four mandated component-test themes. Units use seed UUID catalog with coordinator TODO — allowed.
2. **Backend-only constraint held:** no new routers/procedures; no service-role; no portion-calc.
3. **Nits only:** mojibake in comments/strings; safety unit test gates via `isAdmin` prop (wiring from `family.me` is in `IngredientManager`); nutrition advanced field correctly display-only until schema TODO lands.

---

## Focus acceptance gates

| # | Gate | Status | Evidence |
|---|------|--------|----------|
| **G1** | No unjustified new procedures (`SEED_UNITS` OK w/ NOTES) | **Pass** | NOTES L7–8 + `units.ts` TODO: no `unit.list` added. `SEED_UNITS` IDs match `supabase/seed.sql` (`…0101`–`…0124`). Client-side `isUserAdded` filter; no router patches. |
| **G2** | Admin-only safety editor | **Pass** | `IngredientManager`: `isAdmin = meQuery.data?.profile.role === "admin"`; writes only via `trpc.ingredient.setFoodSafetyProfile`; non-admin gets `FoodSafetyProfileEditor isAdmin={false}` → read-only + badge; FORBIDDEN mapped. |
| **G3** | Merge suggestion on duplicate name | **Pass** | `handleCreateIngredient` maps CONFLICT + list-by-name fallback; `IngredientLinesEditor` shows `ingredient-merge-suggestion` / accept selects existing; test covers accept path. |
| **G4** | Soft delete / restore | **Pass** | `RecipeDetail`: `window.confirm` → `recipe.softDelete`; deleted state → `recipe.restore` (`recipe-restore`). Editor blocks edit when `isDeleted` with link to detail. |
| **G5** | Extensionless imports | **Pass** | Relative/`@/`/`@menu-boss/*` imports have no `.js`/`.ts`/`.tsx` suffixes across FILE blocks. |
| **G6** | Tests listed + present | **Pass** | `InstructionStepsEditor.test.tsx` (reorder); `IngredientLinesEditor.test.tsx` (qty 0 + merge); `FoodSafetyProfileEditor.test.tsx` (non-admin hidden). NOTES claim suite green. |

---

## Brief compliance

| # | Criterion | Status |
|---|-----------|--------|
| 14-O1 | `drafts/grok_out_recipe_editors.md` | **Pass** |
| 14-O2 | `## NOTES` + `### FILE:` + fenced blocks | **Pass** |
| 14-O3 | Extensionless imports; RHF + `@menu-boss/schemas`; `@/lib/trpc/client`; testids | **Pass** (RHF on scalars + `recipeCreateInputSchema.safeParse` on submit; arrays in controlled state — valid) |
| 14-R1 | Full form §8.1 fields + instruction add/remove/reorder + timer/temp | **Pass** |
| 14-R2 | Category tree + tag pickers (ContentFilters patterns) | **Pass** (`CategoryTagPickers.tsx`) |
| 14-R3 | Image Phase 2 commented slot | **Pass** (`recipe-image-slot` in comment) |
| 14-R4 | Ingredient lines: `ingredient.list`, qty > 0, units by dimension, prep, optional, reorder | **Pass** (`unitsByDimension` + `recipeIngredientInputSchema`) |
| 14-R5 | Inline create + CONFLICT merge | **Pass** (G3) |
| 14-R6 | Reuse `LeftoverDecayPath` | **Pass** (editor + detail) |
| 14-R7 | Save = `recipe.create` / `recipe.update` | **Pass** |
| 14-R8 | softDelete confirm + restore on soft-deleted detail | **Pass** (G4) |
| 14-I1 | List + search + user-added filter | **Pass** (client filter; NOTES TODO for server) |
| 14-I2 | Edit drawer name/description/defaultUnit; nutrition advanced JSON | **Pass** (nutrition display-only — justified NOTES TODO) |
| 14-I3 | Safety admin-gated mercury + catchall contaminants; non-admin RO | **Pass** (G2) |
| 14-T1–T4 | Four test themes | **Pass** (G6) |
| 14-C1 | No new procedures (SEED_UNITS justified) | **Pass** (G1) |
| 14-C2 | No service-role | **Pass** |
| 14-C3 | No portion-calc / formula | **Pass** |
| 14-C4 | Coordinator TODOs for ambiguities | **Pass** (units, isUserAdded filter, nutrition write) |

### FILE inventory (draft)

| Path | Role |
|------|------|
| `apps/web/src/lib/units.ts` | `SEED_UNITS` + `unitsByDimension` |
| `…/shared/CategoryTagPickers.tsx` | Category tree + tags for forms |
| `…/recipes/InstructionStepsEditor.tsx` (+ test) | Step editor + reorder |
| `…/recipes/IngredientLinesEditor.tsx` (+ test) | Lines + merge UX |
| `…/recipes/FoodSafetyProfileEditor.tsx` (+ test) | Admin safety form |
| `…/recipes/RecipeEditor.tsx` | Create/edit form |
| `…/recipes/IngredientManager.tsx` | Manager + drawer |
| `…/recipes/RecipeDetail.tsx` | Detail + softDelete/restore |
| `…/recipes/RecipeBrowser.tsx` | Links: New recipe / Ingredients |
| `…/recipes/new|/[id]|/[id]/edit|ingredients/page.tsx` | Routes (incl. missing detail page fill) |

---

## Findings

### T14-1 — Mojibake in draft (`â€"`, `Â§`, `â€¦`) (Nit)

- **Severity:** Nit  
- **Location:** Widespread in comments/UI strings (e.g. FoodSafetyProfileEditor header, soft-delete confirm copy).  
- **Fix on materialize:** Prefer UTF-8 source (en/em dashes, §, ellipsis) over mojibake bytes.

### T14-2 — Safety test mocks `isAdmin` prop, not `family.me` (Nit / process)

- **Severity:** Nit  
- **Location:** `FoodSafetyProfileEditor.test.tsx`  
- **Problem:** Brief says “mock `family.me` role”; unit test correctly asserts editor hide/show via prop. Integration of `family.me` → `isAdmin` lives in `IngredientManager` without a dedicated test.  
- **Impact:** Low — gate UI is tested; wiring is straightforward one-liner. Optional follow-up: light IngredientManager test with mocked tRPC `family.me`.

### T14-3 — `nutrition_data` not persisted (Info — justified)

- **Severity:** Info  
- **Location:** Ingredient drawer advanced textarea; NOTES + saveCore TODO  
- **Status:** Correct given schema gap; do not invent write path without schema/router change.

### T14-4 — Positive notes

- Dual-layer safety: UI gate + `adminProcedure` only mutation path; core `ingredient.update` never carries safety JSON.  
- CONFLICT resilience: cause parse + `ingredient.list` name fallback when tRPC strips cause.  
- Soft-deleted recipes cannot be edited until restored (clear UX).  
- SEED_UNITS align with seed.sql fixed UUIDs (spot-checked).  
- Fills Wave 2 gap: `/recipes/[id]` detail route.  
- Browser gains discoverable **New recipe** / **Ingredients** entry points.

---

## Integrator notes

1. Materialize FILE blocks; re-encode UTF-8 (T14-1).  
2. Union with existing Wave 2 recipe components carefully — draft replaces `RecipeDetail` / `RecipeBrowser` wholesale with additive soft-delete/restore + nav links.  
3. Keep `SEED_UNITS` until coordinator ships `unit.list` / `family.units`.  
4. No DB migrations or router changes in this draft.

---

## Gate summary for dashboard

| Gate | Result |
|------|--------|
| G1 no unjustified new procedures (SEED_UNITS OK) | **Pass** |
| G2 admin-only safety editor | **Pass** |
| G3 merge suggestion | **Pass** |
| G4 soft delete/restore | **Pass** |
| G5 extensionless imports | **Pass** |
| G6 tests listed | **Pass** |

---

## Verdict

| Item | Result |
|------|--------|
| **Task 14** | **Approve with nits** |
| **Integrator** | **Integrate** — fix mojibake on materialize |
| **Re-author?** | **No** |

**One-line summary:** Task 14 is faithful and gate-green (admin safety, CONFLICT merge, soft-delete/restore, extensionless imports, four tests, no unjustified procedures with SEED_UNITS justified in NOTES); integrate with UTF-8 cleanup only.
