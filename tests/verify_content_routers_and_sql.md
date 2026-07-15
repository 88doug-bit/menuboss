# Content Routers + SQL Functions Verification Checklist (Tasks 08–09)

Automated checks for the Grok Task 08 and Task 09 draft outputs against coordinator briefs:

| Task | Draft | Brief (repo root) |
|------|--------|-------------------|
| 08 | `drafts/grok_out_content_routers.md` | `grok_08_zod_schemas_content_routers.md` |
| 09 | `drafts/grok_out_sql_functions.md` | `grok_09_sql_aggregation_functions.md` |

- Script: `tests/verify_content_routers_and_sql.ps1`
- Checklist: this file
- Branch (tester): `test/grok-08-09`

## How to run

From the repository root (Windows PowerShell):

```powershell
# Verify real drafts (exit 1 on any failure)
powershell -NoProfile -File tests/verify_content_routers_and_sql.ps1

# Optional: custom drafts directory
powershell -NoProfile -File tests/verify_content_routers_and_sql.ps1 -DraftsDir drafts

# Self-test script logic with pass/fail fixtures (no real drafts required)
powershell -NoProfile -File tests/verify_content_routers_and_sql.ps1 -SelfTest
```

Exit codes:

| Code | Meaning |
|------|---------|
| 0 | All checks passed (or self-test passed) |
| 1 | One or more checks failed |

### Copying drafts from main workspace or implementer worktrees

If drafts are missing in this worktree, copy from the main MenuBoss checkout or implementer branches when present:

```powershell
$dst = "drafts"
$candidates = @(
  "C:\Users\dougr\01gitprojects\menu_boss\drafts",
  "C:\Users\dougr\.grok\worktrees\01gitprojects-menu-boss\subagent-019f6452-924e-78f3-9f70-4cbcd6fe55dd\drafts",  # implement/grok-08-content-routers
  "C:\Users\dougr\.grok\worktrees\01gitprojects-menu-boss\subagent-019f6452-924e-78f3-9f70-4cc113015a5f\drafts"   # implement/grok-09-sql-functions
)
@(
  "grok_out_content_routers.md",
  "grok_out_sql_functions.md"
) | ForEach-Object {
  $name = $_
  $copied = $false
  foreach ($src in $candidates) {
    $from = Join-Path $src $name
    if (Test-Path -LiteralPath $from) {
      Copy-Item -LiteralPath $from -Destination (Join-Path $dst $name) -Force
      Write-Host "Copied $name from $src"
      $copied = $true
      break
    }
  }
  if (-not $copied) { Write-Host "Not found: $name" }
}
```

---

## Checklist (what the script enforces)

### 0. File presence

| # | Check | Rule |
|---|--------|------|
| F1 | Content routers draft exists | `drafts/grok_out_content_routers.md` |
| F2 | SQL functions draft exists | `drafts/grok_out_sql_functions.md` |

---

### 1. Content routers (`grok_out_content_routers.md`) — Task 08

| # | Check | Rule |
|---|--------|------|
| R1 | packages/schemas FILE header | `### FILE:` covering `packages/schemas` (package.json / src tree) |
| R2 | trpc.ts FILE header | `### FILE:` covering `trpc.ts` (e.g. `apps/web/src/server/trpc.ts`) |
| R3 | recipe router FILE header | `### FILE:` covering recipe router (e.g. `routers/recipe.ts`) |
| R4 | ingredient router FILE header | `### FILE:` covering ingredient router (e.g. `routers/ingredient.ts`) |
| R5 | _app.ts FILE header | `### FILE:` covering `_app.ts` (app router merge) |
| R6 | schemas.test.ts FILE header | `### FILE:` covering `schemas.test.ts` (Vitest Zod boundary tests) |
| R7 | Soft-delete semantics | Mentions `softDelete` **or** `deleted_at` (case-insensitive; also accepts `soft_delete`) |
| R8 | No mealPlan as main deliverable | Must **not** have a `### FILE:` line for a mealPlan router / `mealPlan.create` / `mealPlan.ts` (Wave 2 — out of scope) |

Notes:

- Brief also expects category/tag/chefIdea/recipeCombination routers; this verifier focuses on the coordinator-named core set from the tester brief (schemas package, trpc, recipe, ingredient, _app, schemas tests).
- Mentions of `mealPlan` in prose/NOTES or as a deferred Wave 2 note are fine; only a **### FILE** deliverable for mealPlan fails R8.

---

### 2. SQL aggregation functions (`grok_out_sql_functions.md`) — Task 09

| # | Check | Rule |
|---|--------|------|
| Q1 | 0003_functions.sql | `### FILE:` or path reference to `0003_functions.sql` |
| Q2 | generate_shopping_list | Function name `generate_shopping_list` present |
| Q3 | weekly_protein | `weekly_protein` present (matches `weekly_protein_rollup` and/or `weekly_protein_total`) |
| Q4 | SECURITY INVOKER | `SECURITY INVOKER` present |
| Q5 | No SECURITY DEFINER | Must **not** use `SECURITY DEFINER` as a function attribute. Prose bans ("No SECURITY DEFINER") are allowed. |
| Q6 | aggregation.test.sql | `### FILE:` or path reference to `aggregation.test.sql` (pgTAP smoke tests) |

Notes:

- Decision D14: shopping-list aggregation + weekly protein roll-up are the only sanctioned SQL business-logic functions.
- Pure SQL preferred; PL/pgSQL only if justified in NOTES (not automated here).

---

## Out of scope (manual / other suites)

- Full tRPC procedure matrix for category/tag/chefIdea/recipeCombination
- Zod shape completeness vs Product PRD §10
- pgTAP execution against a live Postgres 15 / Supabase instance
- Numeric contract pin of `weekly_protein_rollup` to `@menu-boss/portion-calc` fixtures
- Prose quality of `## NOTES` blocks

---

## Related

- Schema + portion verifier: `tests/verify_schema_and_portion_calc.ps1` / `tests/verify_schema_and_portion_calc.md`
- Database PRD verifier: `tests/verify_database_prd_v04.ps1` / `tests/verify_database_prd_v04.md`
- Product PRD outputs verifier: `tests/verify_product_prd_outputs.ps1` / `tests/verify_product_prd_outputs.md`
- Briefs: `grok_08_zod_schemas_content_routers.md`, `grok_09_sql_aggregation_functions.md`

---

## Run log (tester, branch `test/grok-08-09`)

| Suite | Result | Counts | Notes |
|-------|--------|--------|-------|
| Script self-test (`-SelfTest`) | **PASS** | pass fixture 18/18; fail fixture 13 expected failures | Logic OK |
| Draft verifier (this worktree `drafts/`) | **FAIL** | **8 passed, 2 failed, 10 total** | See breakdown |

### Draft source locations

| Artifact | Source | Copied to tester `drafts/`? |
|----------|--------|-------------------------------|
| `grok_out_content_routers.md` | **Not found** in main (`C:\Users\dougr\01gitprojects\menu_boss\drafts\`) or implement/grok-08 worktree | No |
| `grok_out_sql_functions.md` | `…\subagent-019f6452-924e-78f3-9f70-4cc113015a5f\drafts\` (branch `implement/grok-09-sql-functions`) | Yes |

### Draft verifier breakdown (8 pass / 2 fail)

**Task 08 content routers — FAIL (2 checks; remaining markers not evaluated because file missing):**

1. `ROUTERS: file exists (grok_out_content_routers.md)` — missing
2. `ROUTERS: content loadable` — cannot evaluate markers

Note: implement/grok-08-content-routers worktree has partial **materialized** code (`packages/schemas/*`, `apps/web/src/server/trpc.ts`, mappers) but no `drafts/grok_out_content_routers.md` and no recipe/ingredient router `.ts`, `_app.ts`, or `schemas.test.ts` yet. Verifier targets the draft markdown per coordinator brief.

**Task 09 SQL functions — all PASS (8 checks):** file exists, content loadable, `0003_functions.sql`, `generate_shopping_list`, `weekly_protein`, `SECURITY INVOKER`, no actual `SECURITY DEFINER` usage, `aggregation.test.sql`.

### Overall tester verdict

| Area | Verdict |
|------|---------|
| Task 08 draft markers | **FAIL** (missing `drafts/grok_out_content_routers.md`) |
| Task 09 draft markers | **PASS** (8/8) |
| Combined draft script exit | **FAIL** (exit 1) until content routers draft is produced or copied |
| Script self-test | **PASS** |
