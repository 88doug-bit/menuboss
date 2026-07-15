# Review: Phase 1 Task 10 (mealPlan backend) — Final

**Reviewer:** Review agent (`review/grok-10-mealplan`)  
**Date:** 2026-07-15  
**Mode:** **Final fidelity review**  
**Brief:** `grok_10_mealplan_router.md`  
**Draft:** `C:\Users\dougr\01gitprojects\menu_boss\drafts\grok_out_mealplan_router.md`  
**Materialized (spot-checked):** `0004_meal_plan_rpc.sql`, `meal_plan_rpc.test.sql`, `packages/schemas/src/mealPlan.ts`, `mealPlan.ts` / `mealPlanMapper.ts` / integration test, `_app.ts`

| Task | Brief | Draft | Verdict |
|------|-------|-------|---------|
| **10** mealPlan RPC + router + schemas + integration tests | `grok_10_mealplan_router.md` | `grok_out_mealplan_router.md` | **Approve with nits** |

**Overall for integrator:** **Integrate.** No re-author required. Fix numbered nits on materialize (especially **T10-1** `plan(13)` and **T10-2** `listRange` assignments; ensure **T10-3** web `package.json` from draft wins over the incomplete tree copy). All nine focus gates **Pass**.

---

## Executive summary

1. **Task 10 — Approve with nits.** Atomic `meal_plan_create_or_update` is `SECURITY INVOKER` + `search_path = public`; reconciles all four tables; forces creator household membership and never deletes it; drops `count = 0` portions; router is JWT-only with no service role; display totals use `@menu-boss/portion-calc`; imports are extensionless; integration suite is `DATABASE_URL`-guarded; pgTAP uses only shim assertions + the aggregation DO-block load pattern.
2. **Must-fix on merge:** `SELECT plan(12)` → **`plan(13)`** (13 real assertions today — gate will fail TAP).
3. **High product/brief nit:** `listRange` returns plan + memberships + portions but **not assignments**, while brief says “plan + children” and Task 11 calendar expects assignments from `listRange`.
4. **Materialization gap:** draft’s `apps/web/package.json` correctly adds `@menu-boss/portion-calc` + `pg`/`@types/pg`; on-disk `apps/web/package.json` still lacks them — apply draft version on integrate.

---

## Focus acceptance gates

| Gate | Status | Evidence |
|------|--------|----------|
| **SECURITY INVOKER on RPC** | **Pass** | `0004_meal_plan_rpc.sql` L6–10: `LANGUAGE plpgsql` + `SECURITY INVOKER` + `SET search_path = public`. No DEFINER. |
| **No service role** | **Pass** | Router uses `ctx.supabase` / `authedProcedure` only; GRANT EXECUTE to `authenticated`; REVOKE FROM PUBLIC; comments forbid service role. No `SERVICE_ROLE` / service-role client. |
| **Atomic create/update of 4 tables** | **Pass** | Single function transaction: `meal_plan` INSERT/UPDATE → `meal_plan_household` → `meal_plan_portion_requirement` → `meal_plan_assignment`; returns `uuid`. |
| **Creating household membership never deleted** | **Pass** | Force-append `v_creating_hh` into set; DELETE uses `household_id IS DISTINCT FROM v_creating_hh`. Integration + pgTAP assert survival when omitted from `householdIds`. |
| **count=0 portions not stored** | **Pass** | INSERT filters `(pr->>'count')::smallint > 0`; DELETE removes rows not present with count>0. Covered by pgTAP + integration. |
| **portion-calc used for display totals** | **Pass** | `import { calculateEffectiveProteinOz } from "@menu-boss/portion-calc"`; `computeEffectiveProteinOz` on byId / listRange / upsert detail. No formula reimplementation. (`proteinRollup` correctly wraps SQL aggregate.) |
| **Extensionless imports** | **Pass** | Relative imports use `./mealPlan`, `../dbErrors`, `./common` — no `.js` suffixes. |
| **Integration test env-guarded** | **Pass** | `describe.skipIf(!process.env.DATABASE_URL)` + `pg` + per-test BEGIN/ROLLBACK; pure display-unit test always runs (680 g → 1.5 lb). |
| **pgTAP shim assertions only** | **Pass** | Only `plan` / `is` / `lives_ok` / `throws_ok` / `finish`. DO-block pgtap load matches `aggregation.test.sql`. (Word `results_eq` appears only in comments.) |

---

## Brief compliance

| # | Criterion | Status |
|---|-----------|--------|
| 10-O1 | `drafts/grok_out_mealplan_router.md` with `## NOTES` + `### FILE:` blocks | **Pass** |
| 10-O2 | `0004_meal_plan_rpc.sql` + pgTAP + schemas + router + mapper + `_app` + integration test | **Pass** (+ package.json patches in draft) |
| 10-B1 | Payload shape + authorship from `current_household_id()` / `auth.uid()` only | **Pass** |
| 10-B2 | Set-based child reconciliation | **Pass** |
| 10-B3 | Zod: athlete≤count, end≥start, assignments in range; shoppingListQuery; proteinRollupQuery | **Pass** |
| 10-B4 | Procedures: upsert, byId, listRange, generateShoppingList, proteinRollup, softDelete, share, unshare | **Pass** (surface present) |
| 10-B5 | upsert → RPC; 42501→FORBIDDEN; 23514→BAD_REQUEST via `throwFromPostgrest` | **Pass** |
| 10-B6 | Shopping list display units + optional group | **Pass** (`formatDisplayQuantity` / `buildShoppingListDto`) |
| 10-B7 | Did not touch 0001/0002/0003 or RLS helpers | **Pass** (NOTES + new 0004 only) |
| 10-B8 | listRange returns full children (assignments) | **Partial** — see T10-2 |

---

## Findings

### T10-1 — pgTAP `plan(12)` under-counts (13 assertions)

- **Severity:** High (will fail TAP finish if strict plan check)
- **Location:** `supabase/tests/functions/meal_plan_rpc.test.sql` — `SELECT plan(12);`
- **Problem:** Counted assertions: 2× `lives_ok` + 9× `is` + 2× `throws_ok` = **13**. `plan(12)` mismatches.
- **Recommended fix on merge:** Change to `SELECT plan(13);`. Effort: trivial. Risk: none.

### T10-2 — `listRange` omits assignments (“children”)

- **Severity:** High (brief + Task 11 calendar consumer)
- **Location:** `apps/web/src/server/routers/mealPlan.ts` `listRange` (and draft equivalent)
- **Problem:** Brief: `byId` / `listRange` return plan + **children** + `isShared` + `effectiveProteinOz`. Implementation loads memberships + portion requirements only; **no** `meal_plan_assignment` batch. Task 11 expects calendar events/assignments from `listRange`.
- **Options:**  
  A. **(Recommended)** Batch-load assignments for `planIds`, group by plan, return `assignments[]` on each list item (mirror byId shape minus nothing critical).  
  B. Keep listRange lean; Task 11 N+1 `byId` — worse latency, fights brief.  
  C. Do nothing — blocks clean Task 11.
- **Recommended:** A on materialize. Effort: small. Risk: low (same RLS child SELECT as byId).

### T10-3 — Materialized `apps/web/package.json` missing draft deps

- **Severity:** High (build/link risk under pnpm)
- **Location:** Draft `### FILE: apps/web/package.json` has `@menu-boss/portion-calc`, `pg`, `@types/pg`; on-disk `apps/web/package.json` does **not**.
- **Problem:** Router imports `@menu-boss/portion-calc`; integration test imports `pg`. Without workspace dep declaration, pnpm may not link the package.
- **Recommended fix:** Apply draft `package.json` (or equivalent dep patches) and re-run `pnpm install`.

### T10-4 — Mojibake in draft comments

- **Severity:** Nit
- **Location:** Draft (e.g. `â€"`, `Â§`, `â‰¥`); some materialized files may already be clean UTF-8
- **Recommended fix:** Prefer on-disk UTF-8 sources over mojibake draft bytes when materializing comments.

### T10-5 — Assignment upsert `ON CONFLICT … WHERE meal_plan_id = v_id`

- **Severity:** Low / edge case
- **Location:** `0004` assignment INSERT…ON CONFLICT DO UPDATE … `WHERE meal_plan_assignment.meal_plan_id = v_id`
- **Problem:** If a client supplies an assignment `id` owned by another plan, conflict may no-op without raising (row not updated, not re-parented).
- **Recommended fix:** Optional: reject when conflicting row has different `meal_plan_id` (RAISE). Acceptable v1 if UUIDs are client-generated only for own plan. Document or harden later.

### T10-6 — Soft-delete visibility (documented TODO)

- **Severity:** Info
- **Location:** NOTES TODO — byId returns soft-deleted if RLS-visible; listRange filters `deleted_at IS NULL`
- **Recommended:** Keep; aligns with content routers (list excludes, byId can show deleted badge). Coordinator confirm only if product wants otherwise.

### T10-7 — Positive notes

- Authorship never from payload; fail-closed update when RLS/soft-delete yields 0 rows (`42501`).
- Creator membership forced even when `householdIds` omits it; DELETE excludes creator.
- Zero-count portions covered in SQL + both test layers.
- Display unit pure unit test always runs; 680 g → 1.5 lb.
- One RLS smoke (`member_b` → 42501) as briefed; no policy matrix expansion.
- share/unshare single-row path without RPC; softDelete only sets `deleted_at`.

---

## Verdict

| Item | Result |
|------|--------|
| **Task 10** | **Approve with nits** |
| **Integrator** | **Integrate** — apply T10-1, T10-2, T10-3 on merge |
| **Re-author?** | **No** |

**One-line summary:** Task 10 is faithful and gate-green (INVOKER, atomic four-table write, creator membership, count=0, portion-calc, extensionless imports, env-guarded tests, shim-only pgTAP); fix `plan(13)`, add `listRange` assignments, and materialize web package deps.
