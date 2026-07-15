# Review: Phase 1 Tasks 06–07 (Schema Migration + Portion-Calc) — Final

**Reviewer:** Review agent (`review/grok-06-07`)  
**Date:** 2026-07-15  
**Branch:** `review/grok-06-07`  
**Mode:** Full fidelity review (drafts present)  
**Scope:** Implementer drafts vs briefs + Database PRD v0.4 coordinator DDL  

| Task | Brief | Draft | Verdict |
|------|-------|-------|---------|
| **06** Schema migration + seed | `grok_06_schema_migration_and_seed.md` | `C:\Users\dougr\01gitprojects\menu_boss\drafts\grok_out_schema_migration.md` | **Approve with nits** |
| **07** `packages/portion-calc` | `grok_07_portion_calc_package.md` | `C:\Users\dougr\01gitprojects\menu_boss\drafts\grok_out_portion_calc.md` | **Approve with nits** |

**Overall for integrator:** **Integrate both drafts.** No full re-author required. Apply optional nits below during materialization if cheap; none block Wave 1 gate.

---

## Executive summary

1. **Task 06 — Approve with nits.** All required tables; coordinator `unit` / `meal_plan_household` / `meal_plan_portion_requirement` DDL match PRD v0.4; no RLS/policies/security/aggregation functions; indexes + comments; seed units, 9 portion categories (Adult Male 6.0), family_settings 1.5, taxonomy, 3 households + matrix personas; no `level`/`path`, no `adult_reference_protein_oz`, no retired MealPlan columns.
2. **Task 07 — Approve with nits.** Formula matches PRD; worked example → 15.0; typed error hierarchy; Vitest table coverage; **10** contract fixtures (≥8) with hand-checked expected values; **zero** runtime deps; pure deterministic package.

---

# Task 06 — Schema migration + seed

**Verdict: Approve with nits**

### Brief compliance

| Criterion | Status |
|-----------|--------|
| `## NOTES` + `### FILE: supabase/migrations/0001_schema.sql` + `### FILE: supabase/seed.sql` | **Pass** |
| ALL §4.1 tables (household → unit, junctions, combinations, chef_idea) | **Pass** |
| snake_case; UUID PKs `gen_random_uuid()`; timestamps | **Pass** |
| Soft-delete `deleted_at` on content + meal_plan (flagged in NOTES) | **Pass** |
| FK ON DELETE: RESTRICT vocab/household/portion_category; CASCADE plan children & content junctions | **Pass** |
| CHECKs: quantity > 0, counts ≥ 0, athlete ≤ count, rating 1–5, unit dimension/factor, times ≥ 0 | **Pass** |
| Indexes + comments; FK junction indexes; plan dates; assignment_date; `idx_mph_household`; tsvector+GIN; `uq_ingredient_name` | **Pass** |
| **EXCLUDE** RLS / policies / security triggers / audit / shopping & roll-up functions | **Pass** (`set_updated_at` only — allowed) |
| Category: **no** `level` / `path` | **Pass** |
| FamilySettings: **no** `adult_reference_protein_oz` | **Pass** |
| MealPlan: no `protein_portions` / `visible_to_households` / `is_shared` / `plan_date` | **Pass** |
| Unit seed (g/kg/oz/lb, ml/l/tsp/tbsp/cup/fl_oz, each/dozen/clove/head) | **Pass** |
| Nine portion_category rows; Adult Male 6.0; sort_order | **Pass** |
| family_settings athlete_multiplier 1.5, empty JSONB | **Pass** |
| Category taxonomy + tags by tag_group | **Pass** |
| 3 households + personas (member_a/b/c, admin_a; anon no row); fixed UUIDs; ON CONFLICT; fixture markers | **Pass** |
| Extensions: `pgcrypto` | **Pass** (`pg_trgm` correctly omitted — FTS via generated tsvector only) |

### Coordinator DDL fidelity (verbatim gate)

| Block | Status | Notes |
|-------|--------|-------|
| `unit` | **Pass** | Columns, CHECKs, defaults, uniqueness match PRD lines 191–201 (incl. trailing comments). |
| `meal_plan_household` | **Pass** | Exact columns/PK/FKs/ON DELETE; `idx_mph_household` present. Extra `COMMENT ON INDEX` is additive, not a schema drift. |
| `meal_plan_portion_requirement` | **Pass** | Exact columns, smallint CHECKs, `athlete_within_count`, composite PK, RESTRICT/CASCADE. Additive: `idx_mppr_portion_category_id` + allowed `updated_at` touch trigger (PRD §6 recommends portion_category_id index). |

### Findings (Task 06)

#### T06-1 — `EXECUTE PROCEDURE` trigger syntax (legacy alias)
- **Severity:** Nit  
- **Location:** All `CREATE TRIGGER … EXECUTE PROCEDURE set_updated_at()`  
- **Problem:** PostgreSQL prefers `EXECUTE FUNCTION` / `EXECUTE PROCEDURE` both work on PG15; style only.  
- **Recommended fix:** Optional materializer normalize to `EXECUTE FUNCTION` if team style prefers modern form. No functional risk.

#### T06-2 — Extra non-coordinator columns (documented)
- **Severity:** Nit (acceptable)  
- **Location:** `family_settings.created_at`; `profile.updated_at`; `meal_plan.deleted_at`; dual `source_*` / combination link fields  
- **Problem:** Beyond minimal PRD field lists in places.  
- **Recommended fix:** None required — NOTES §1–7/13 already flag conservative choices. Integrator keeps as-is.

#### T06-3 — Seed persona count vs “5 personas” wording
- **Severity:** Info (pass)  
- **Location:** seed TEST FIXTURES  
- **Problem:** None. Brief: member_a, member_b, member_c, admin_a + anon without row = 5 matrix roles; draft has 4 profile rows + documented anon.  
- **Recommended fix:** None.

#### T06-4 — Positive: exclusions and retired columns
- **Severity:** Info (positive)  
- No `ENABLE ROW LEVEL SECURITY`, `CREATE POLICY`, audit tables, `generate_shopping_list`, `weekly_protein_rollup`, assignment-range triggers, attribution triggers. No Category `level`/`path`. No `adult_reference_protein_oz`.

### Checklist snapshot (Task 06)

| Gate | Result |
|------|--------|
| All tables | **Pass** |
| Verbatim coordinator DDL | **Pass** |
| Excluded RLS/security/aggregations | **Pass** |
| Seed fixtures | **Pass** |
| Indexes + comments | **Pass** |
| No level/path | **Pass** |
| No adult_reference_protein_oz | **Pass** |

---

# Task 07 — `packages/portion-calc`

**Verdict: Approve with nits**

### Brief compliance

| Criterion | Status |
|-----------|--------|
| Output shape: NOTES + 5 `### FILE:` blocks | **Pass** |
| `@menu-boss/portion-calc`, type module, scripts test/typecheck | **Pass** |
| **Zero runtime deps** (`dependencies: {}`) | **Pass** |
| Types: PortionCategoryRef, PortionRequirement, FamilySettings | **Pass** |
| `calculateEffectiveProteinOz` pure | **Pass** |
| `calculatePerCategoryBreakdown` with `people` / effectiveOz | **Pass** |
| `hasDeactivatedCategories` (inactive still calculates) | **Pass** |
| `roundOz` display-only (1 decimal); calc paths unrounded | **Pass** |
| Errors: `PortionCalcError` + Unknown / InvalidRequirement / InvalidSettings | **Pass** |
| Unknown id; athleteCount > count; negative/NaN/Infinity; multiplier ≤ 0 | **Pass** (+ non-finite multiplier — good) |
| PRD worked example → **15.0** | **Pass** `((2−1)+1×1.5)×6 = 15` |
| Table-driven tests: zero rows/counts, all-athlete, multi-cat, boundary, throws, deactivated, recompute, FP | **Pass** |
| tsconfig strict + ES2022 + isolatedModules | **Pass** |
| contract-fixtures.json ≥ 8 scenarios | **Pass** (**10** scenarios) |
| Hand-computed expectedOz (incl. 13.25, 15.555) | **Pass** |
| camelCase; no I/O in calc path | **Pass** (fs only in tests for fixture load) |

### Formula & fixture audit (hand math)

| Scenario | Expected | Draft | Check |
|----------|----------|-------|-------|
| PRD worked (2,1)×6 mult 1.5 | 15.0 | 15.0 | **OK** |
| Zero rows / zero counts | 0 | 0 | **OK** |
| All-athlete count=3 | 27.0 | 27.0 | **OK** |
| Multi-cat male+female+child | 28.0 | 28.0 | **OK** |
| Deactivated still calc | 15.0 | 15.0 | **OK** |
| base 5.3, (2,1), mult 1.5 | 13.25 | 13.25 | **OK** |
| athlete=count, base 4, mult 2 | 16.0 | 16.0 | **OK** |
| base 4.25, count 3 athlete 2, mult 1.33 | 15.555 | 15.555 | **OK** `(1+2.66)×4.25` |
| No athletes count 4 | 24.0 | 24.0 | **OK** |

### Findings (Task 07)

#### T07-1 — Mojibake in comments / fixture descriptions
- **Severity:** Nit  
- **Location:** `index.ts` header (e.g. `Â§`, `Î£`, `âˆ’`); test names / JSON `description` strings  
- **Problem:** Encoding corruption of Unicode (section sign, sigma, arrows) in the markdown draft. Does not affect runtime logic.  
- **Recommended fix:** Materializer re-encode as UTF-8 plain ASCII comments or proper Unicode once.

#### T07-2 — `baseProteinOz` not validated (documented)
- **Severity:** Nit  
- **Location:** NOTES + `effectiveOzForRow`  
- **Problem:** Negative/non-finite base would flow into the sum. Brief assigns integrity to DB/callers; NOTES correctly flag.  
- **Recommended fix:** Optional later Zod at tRPC boundary (not a package re-author). Keep package thin.

#### T07-3 — Fractional `count` / `athleteCount` accepted
- **Severity:** Nit  
- **Location:** NOTES + `assertRequirement` (finite ≥ 0 only)  
- **Problem:** DB is `smallint`; package allows floats. Acceptable for UI preview; not specified as invalid in brief.  
- **Recommended fix:** None for Wave 1; optional integer check later if product wants parity with DB.

#### T07-4 — Positive: error hierarchy and contract fixtures
- **Severity:** Info (positive)  
- All three error subclasses extend `PortionCalcError` with prototype fix. Fixtures ≥8 include required worked/zero/all-athlete/deactivated/FP cases plus extra multi-cat and 4-decimal hand case. Zero runtime deps confirmed.

### Checklist snapshot (Task 07)

| Gate | Result |
|------|--------|
| Formula correctness | **Pass** |
| Error classes | **Pass** |
| Test coverage | **Pass** |
| Fixtures ≥ 8 | **Pass** (10) |
| Zero runtime deps | **Pass** |
| Worked example 15.0 | **Pass** |

---

# Cross-task consistency

| Check | Status |
|-------|--------|
| Seed Adult Male 6.0 + multiplier 1.5 ↔ Task 07 worked example | **Aligned** |
| Portion formula single TS source; SQL roll-up deferred to Task 09 | **Aligned** |
| snake_case DB ↔ camelCase package | **Aligned** (boundary mapping not in either draft) |
| Deactivated categories remain calculable (D11) in both DB semantics and package | **Aligned** |

---

# Integrator actions

1. Materialize both drafts as-is into the monorepo.  
2. Optional polish only: UTF-8 cleanup in portion-calc comments (T07-1); trigger syntax (T06-1).  
3. Do **not** block on T06-2 / T07-2 / T07-3.  
4. After materialize: run `pnpm --filter @menu-boss/portion-calc test` and apply `0001` + seed on empty local Postgres 15 before Claude `0002_security.sql`.

---

*End of final review. Pre-implementation risk checklist superseded.*
