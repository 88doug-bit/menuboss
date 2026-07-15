# Schema Migration + Portion Calc Verification Checklist (Tasks 06–07)

Automated checks for the Grok Task 06 and Task 07 draft outputs against coordinator briefs:

| Task | Draft | Brief (repo root) |
|------|--------|-------------------|
| 06 | `drafts/grok_out_schema_migration.md` | `grok_06_schema_migration_and_seed.md` |
| 07 | `drafts/grok_out_portion_calc.md` | `grok_07_portion_calc_package.md` |

- Script: `tests/verify_schema_and_portion_calc.ps1`
- Checklist: this file
- Branch (tester): `test/grok-06-07`

## How to run

From the repository root (Windows PowerShell):

```powershell
# Verify real drafts (exit 1 on any failure)
powershell -NoProfile -File tests/verify_schema_and_portion_calc.ps1

# Optional: custom drafts directory
powershell -NoProfile -File tests/verify_schema_and_portion_calc.ps1 -DraftsDir drafts

# Force attempt to run packages/portion-calc Vitest when materialized
powershell -NoProfile -File tests/verify_schema_and_portion_calc.ps1 -RunPackageTests

# Self-test script logic with pass/fail fixtures (no real drafts required)
powershell -NoProfile -File tests/verify_schema_and_portion_calc.ps1 -SelfTest
```

Exit codes:

| Code | Meaning |
|------|---------|
| 0 | All checks passed (or self-test passed) |
| 1 | One or more checks failed |

### Copying drafts from main workspace

If drafts are missing in this worktree, copy from the main MenuBoss checkout when present:

```powershell
$src = "C:\Users\dougr\01gitprojects\menu_boss\drafts"
$dst = "drafts"
@(
  "grok_out_schema_migration.md",
  "grok_out_portion_calc.md"
) | ForEach-Object {
  $from = Join-Path $src $_
  if (Test-Path -LiteralPath $from) {
    Copy-Item -LiteralPath $from -Destination (Join-Path $dst $_) -Force
    Write-Host "Copied $_"
  } else {
    Write-Host "Not found: $from"
  }
}
```

---

## Checklist (what the script enforces)

### 0. File presence

| # | Check | Rule |
|---|--------|------|
| F1 | Schema migration draft exists | `drafts/grok_out_schema_migration.md` |
| F2 | Portion calc draft exists | `drafts/grok_out_portion_calc.md` |

---

### 1. Schema migration (`grok_out_schema_migration.md`) — Task 06

| # | Check | Rule |
|---|--------|------|
| S1 | Migration FILE header | Exact/containing: `### FILE: supabase/migrations/0001_schema.sql` |
| S2 | Seed FILE header | Exact/containing: `### FILE: supabase/seed.sql` |
| S3 | CREATE TABLE coverage | `CREATE TABLE` present for each of: `household`, `profile`, `ingredient`, `recipe`, `meal_plan`, `meal_plan_household`, `meal_plan_portion_requirement`, `unit`, `portion_category`, `family_settings`, `chef_idea`, `recipe_combination` |
| S4 | Unique ingredient name index | `uq_ingredient_name` present |
| S5 | Meal-plan-household household index | `idx_mph_household` present |
| S6 | UUID helper | `gen_random_uuid` **or** `pgcrypto` present |
| S7 | No RLS enable (0001 exclude) | Must **not** contain `ENABLE ROW LEVEL SECURITY` |
| S8 | No policies (0001 exclude) | Must **not** contain `CREATE POLICY` |
| S9 | No adult reference column | Must **not** contain `adult_reference_protein_oz` |

Notes:

- Full PRD table list is larger (junctions, categories, tags, etc.). This verifier checks the coordinator-named core set from the tester brief.
- RLS/policies and aggregation helpers belong in later migrations (`0002_security.sql`, `0003_functions.sql`), not `0001`.

---

### 2. Portion calc package (`grok_out_portion_calc.md`) — Task 07

| # | Check | Rule |
|---|--------|------|
| P1–P5 | Package FILE headers | `### FILE:` for: `packages/portion-calc/package.json`, `src/index.ts`, `src/index.test.ts`, `tsconfig.json`, `fixtures/contract-fixtures.json` |
| P6 | Canonical API | `calculateEffectiveProteinOz` present |
| P7 | Error hierarchy | `PortionCalcError` present |
| P8 | Contract fixtures | `contract-fixtures.json` referenced/present |
| P9 | Test runner | `vitest` present (case-insensitive) |
| P10 | Worked example | Expected **15.0** appears in tests or fixtures (PRD: adult_male count 2 / athlete 1, base 6.0, multiplier 1.5 → `(1 + 1×1.5) × 6 = 15.0`) |

---

### 3. Materialized package (optional)

| # | Check | Rule |
|---|--------|------|
| M1 | `packages/portion-calc` on disk | Informational if missing (draft is source of truth for Tasks 06–07) |
| M2 | Vitest run | If `packages/portion-calc/package.json` exists, script auto-attempts `pnpm test` / `npm test` / `npx vitest run` (installs deps if needed). Failure of Vitest counts as verifier failure. |

---

## Out of scope (manual / other suites)

- Full SQL apply on Postgres 15 / Supabase
- Seed idempotency and fixed UUID correctness beyond marker presence
- Completeness of every junction table / CHECK / FK from DB PRD §4.1
- TS↔SQL contract test against `weekly_protein_rollup` (coordinator)
- Prose quality of `## NOTES` blocks

---

## Related

- Database PRD verifier: `tests/verify_database_prd_v04.ps1` / `tests/verify_database_prd_v04.md`
- Product PRD outputs verifier: `tests/verify_product_prd_outputs.ps1` / `tests/verify_product_prd_outputs.md`
- Briefs: `grok_06_schema_migration_and_seed.md`, `grok_07_portion_calc_package.md`

---

## Run log (tester, branch `test/grok-06-07`)

| Suite | Result | Counts | Notes |
|-------|--------|--------|-------|
| Script self-test (`-SelfTest`) | **PASS** | pass fixture 35/35; fail fixture 28 expected failures | Logic OK |
| Draft verifier (this worktree `drafts/`) | **FAIL** | **23 passed, 2 failed, 25 total** | See breakdown |
| Materialized Vitest (`implement/grok-07` worktree) | **PASS** | **39 passed, 0 failed** (1 file) | Node v22.17.0; `npm test` |

### Draft source locations

| Artifact | Source | Copied to tester `drafts/`? |
|----------|--------|-------------------------------|
| `grok_out_schema_migration.md` | `…\subagent-019f644d-cccb-72b1-af77-c9e76358cadd\drafts\` (branch `implement/grok-06-schema-migration`) | Yes |
| `grok_out_portion_calc.md` | **Not found** in main (`C:\Users\dougr\01gitprojects\menu_boss\drafts\`) or any sibling worktree | No |
| `packages/portion-calc` | `…\subagent-019f644d-cccc-7ad2-a165-73b38b1e0d97\packages\portion-calc` (branch `implement/grok-07-portion-calc`) | Not copied (Vitest run in place) |

### Draft verifier breakdown (23 pass / 2 fail)

**Task 06 schema — all PASS (22 checks):** file exists, FILE headers for `0001_schema.sql` + `seed.sql`, CREATE TABLE × 12 required entities, `uq_ingredient_name`, `idx_mph_household`, `gen_random_uuid`/`pgcrypto`, no RLS enable, no CREATE POLICY, no `adult_reference_protein_oz`.

**Task 07 portion draft — FAIL (2 checks; remaining markers not evaluated because file missing):**

1. `PORTION: file exists (grok_out_portion_calc.md)` — missing
2. `PORTION: content loadable` — cannot evaluate markers

**Optional PKG info:** packages/portion-calc not on tester worktree disk (expected; implementer worktree only).

### Vitest (materialized package)

```
✓ src/index.test.ts (39 tests)
Test Files  1 passed (1)
Tests       39 passed (39)
```

Package includes `calculateEffectiveProteinOz`, `PortionCalcError`, `fixtures/contract-fixtures.json` with `expectedEffectiveOz: 15.0` (worked example), and vitest as test runner — content expectations of Task 07 are met on disk even though the markdown draft wrapper is absent.

### Overall tester verdict

| Area | Verdict |
|------|---------|
| Task 06 draft markers | **PASS** (22/22) |
| Task 07 draft file | **FAIL** (missing `drafts/grok_out_portion_calc.md`) |
| Task 07 package tests | **PASS** (39/39) |
| Combined draft script exit | **FAIL** (exit 1) until portion draft is produced or copied |
