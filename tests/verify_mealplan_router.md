# MealPlan Router Verification Checklist (Task 10)

Automated checks for the Grok Task 10 draft output against the coordinator brief:

| Task | Draft | Brief (repo root) |
|------|--------|-------------------|
| 10 | `drafts/grok_out_mealplan_router.md` | `grok_10_mealplan_router.md` |

- Script: `tests/verify_mealplan_router.ps1`
- Checklist: this file
- Branch (tester): `test/grok-10-mealplan`

## How to run

From the repository root (Windows PowerShell):

```powershell
# Verify real draft (exit 1 on any failure)
powershell -NoProfile -File tests/verify_mealplan_router.ps1

# Optional: custom drafts directory
powershell -NoProfile -File tests/verify_mealplan_router.ps1 -DraftsDir drafts

# Self-test script logic with pass/fail fixtures (no real draft required)
powershell -NoProfile -File tests/verify_mealplan_router.ps1 -SelfTest
```

Exit codes:

| Code | Meaning |
|------|---------|
| 0 | All checks passed (or self-test passed) |
| 1 | One or more checks failed |

### Copying draft from main workspace or implementer worktrees

If the draft is missing in this worktree, copy from the main MenuBoss checkout or implementer branches when present:

```powershell
$dst = "drafts"
$name = "grok_out_mealplan_router.md"
$candidates = @(
  "C:\Users\dougr\01gitprojects\menu_boss\drafts",
  # Peer Grok Task-10 worktrees (implement / review / research) under .grok\worktrees
  "C:\Users\dougr\.grok\worktrees\01gitprojects-menu-boss"
)
$copied = $false
foreach ($root in $candidates) {
  if ($root -like "*worktrees*") {
    Get-ChildItem $root -Directory -ErrorAction SilentlyContinue | ForEach-Object {
      $from = Join-Path $_.FullName "drafts\$name"
      if (-not $copied -and (Test-Path -LiteralPath $from)) {
        Copy-Item -LiteralPath $from -Destination (Join-Path $dst $name) -Force
        Write-Host "Copied $name from $from"
        $copied = $true
      }
    }
  } else {
    $from = Join-Path $root $name
    if (Test-Path -LiteralPath $from) {
      Copy-Item -LiteralPath $from -Destination (Join-Path $dst $name) -Force
      Write-Host "Copied $name from $from"
      $copied = $true
      break
    }
  }
}
if (-not $copied) { Write-Host "Not found: $name" }
```

---

## Checklist (what the script enforces)

### 0. File presence

| # | Check | Rule |
|---|--------|------|
| F1 | MealPlan draft exists | `drafts/grok_out_mealplan_router.md` |
| F2 | Content loadable | File readable as UTF-8 text |

---

### 1. ### FILE headers (deliverables)

| # | Check | Rule |
|---|--------|------|
| H1 | 0004_meal_plan_rpc.sql | `### FILE:` covering `0004_meal_plan_rpc.sql` (migration RPC) |
| H2 | meal_plan_rpc.test.sql | `### FILE:` covering `meal_plan_rpc.test.sql` (pgTAP) |
| H3 | mealPlan.ts schema | `### FILE:` covering `packages/schemas/src/mealPlan.ts` (or schemas path + mealPlan.ts) |
| H4 | mealPlan router | `### FILE:` covering `routers/mealPlan.ts` |
| H5 | mealPlan.integration.test.ts | `### FILE:` covering `mealPlan.integration.test.ts` |

---

### 2. Security + RPC

| # | Check | Rule |
|---|--------|------|
| S1 | SECURITY INVOKER | `SECURITY INVOKER` present (non-negotiable for `meal_plan_create_or_update`) |
| S2 | No SECURITY DEFINER | Must **not** use `SECURITY DEFINER` as a function attribute. Prose bans ("No SECURITY DEFINER") are allowed. |
| S3 | meal_plan_create_or_update | Function / RPC name `meal_plan_create_or_update` present |

---

### 3. Portion-calc + router procedures

| # | Check | Rule |
|---|--------|------|
| P1 | Portion client of record | Mentions `portion-calc`, `@menu-boss/portion-calc`, **or** `calculateEffectiveProteinOz` |
| P2 | softDelete | Mentions `softDelete` **or** `soft_delete` |
| P3 | generateShoppingList | Mentions `generateShoppingList` |
| P4 | share | Whole-word `share` present |
| P5 | unshare | Whole-word `unshare` present |

---

### 4. Integration test guard + import style

| # | Check | Rule |
|---|--------|------|
| I1 | Env guard | Mentions `skipIf` **or** `DATABASE_URL` (matches `describe.skipIf(!process.env.DATABASE_URL)` pattern used by portion-calc contract tests) |
| I2 | No `.js` relative imports | TypeScript/TSX fenced blocks must not use relative `from './x.js'` / `import('./x.js')` (Turbopack — extensionless relative imports only) |

---

## Out of scope (manual / other suites)

- Full SQL reconciliation correctness (pgTAP execution against Postgres 15 / Supabase)
- SQLSTATE → TRPCError mapping completeness (42501 → FORBIDDEN, 23514 → BAD_REQUEST)
- Shopping-list display-unit formatting math (680 g → "1.5 lb")
- `_app.ts` wiring presence (brief requires it; not a separate automated marker)
- Materialized files on disk vs draft-only markdown
- Prose quality of `## NOTES` blocks

---

## Related

- Content routers + SQL verifier: `tests/verify_content_routers_and_sql.ps1` / `tests/verify_content_routers_and_sql.md`
- Schema + portion verifier: `tests/verify_schema_and_portion_calc.ps1` / `tests/verify_schema_and_portion_calc.md`
- Brief: `grok_10_mealplan_router.md`

---

## Run log (tester, branch `test/grok-10-mealplan`)

| Suite | Result | Counts | Notes |
|-------|--------|--------|-------|
| Script self-test (`-SelfTest`) | **PASS** | pass fixture **17/17**; fail fixture **15** expected failures | Logic OK (exit 0) |
| Draft verifier (this worktree `drafts/`) | **FAIL** | **0 passed, 2 failed, 2 total** | Draft file missing — only presence/loadable evaluated |

### Draft source locations

| Artifact | Source | Copied to tester `drafts/`? |
|----------|--------|-------------------------------|
| `grok_out_mealplan_router.md` | **Not found** in `C:\Users\dougr\01gitprojects\menu_boss\drafts\`, git `main`, or implementer worktree `subagent-019f6627-cda0-…` (`implement/grok-10-mealplan-router` — no mealplan draft yet) | No |

### Draft verifier breakdown (0 pass / 2 fail)

1. `MEALPLAN: file exists (grok_out_mealplan_router.md)` — missing
2. `MEALPLAN: content loadable` — cannot evaluate markers

When the implementer publishes `drafts/grok_out_mealplan_router.md`, re-run:

```powershell
# copy then verify
Copy-Item <implementer>\drafts\grok_out_mealplan_router.md drafts\ -Force
powershell -NoProfile -File tests/verify_mealplan_router.ps1
```

Expected full suite: **17 checks** (file + loadable + 5 FILE headers + INVOKER + no DEFINER + RPC name + portion-calc + softDelete + generateShoppingList + share + unshare + skipIf/DATABASE_URL + no `.js` relative imports).

### Overall tester verdict

| Area | Verdict |
|------|---------|
| Task 10 draft markers | **FAIL** (missing `drafts/grok_out_mealplan_router.md`) |
| Script self-test | **PASS** (17/17 pass fixture; fail fixture correctly fails) |
| Combined draft script exit | **FAIL** (exit 1) until draft is produced or copied |
