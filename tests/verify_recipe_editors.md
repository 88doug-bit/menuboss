# Recipe & Ingredient Editors Verification Checklist (Task 14)

Automated checks for the Grok Task 14 draft output against the coordinator brief:

| Task | Draft | Brief (repo root) |
|------|--------|-------------------|
| 14 | `drafts/grok_out_recipe_editors.md` | `grok_14_recipe_ingredient_editors.md` |

- Script: `tests/verify_recipe_editors.ps1`
- Checklist: this file
- Branch (tester): `test/grok-14`

## How to run

From the repository root (Windows PowerShell):

```powershell
# Verify real draft (exit 1 on any failure)
powershell -NoProfile -File tests/verify_recipe_editors.ps1

# Optional: custom drafts directory
powershell -NoProfile -File tests/verify_recipe_editors.ps1 -DraftsDir drafts

# Self-test script logic with pass/fail fixtures (no real draft required)
powershell -NoProfile -File tests/verify_recipe_editors.ps1 -SelfTest
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
$name = "grok_out_recipe_editors.md"
$candidates = @(
  "C:\Users\dougr\01gitprojects\menu_boss\drafts",
  # Peer Grok Task-14 worktrees (implement / review / research) under .grok\worktrees
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
| F1 | Recipe editors draft exists | `drafts/grok_out_recipe_editors.md` |
| F2 | Content loadable | File readable as UTF-8 text |

When the draft file is **missing**, only the presence + loadable checks fail (marker checks are not evaluated). When present, all marker checks below are enforced.

---

### 1. ### FILE headers (deliverables)

| # | Check | Rule |
|---|--------|------|
| H1 | recipes/new | `### FILE:` covering `recipes/new` (create page route) |
| H2 | recipes edit | `### FILE:` covering `recipes/[id]/edit` (or `recipes/.../edit/page.tsx`) |
| H3 | ingredients page | `### FILE:` covering `recipes/ingredients` **or** an ingredients manager page path |
| H4 | RecipeEditor or similar | `### FILE:` covering `RecipeEditor`, `RecipeForm`, `IngredientEditor`, `IngredientManager`, or `IngredientLineEditor` |

---

### 2. Mutations & domain features

| # | Check | Rule |
|---|--------|------|
| M1 | Save path | Mentions `recipe.create` **or** `recipe.update` |
| M2 | softDelete | Mentions `softDelete`, `soft_delete`, **or** `recipe.softDelete` |
| M3 | Food-safety | Mentions `setFoodSafetyProfile`, `food-safety` / `food_safety`, **or** `FoodSafetyProfile` |
| M4 | LeftoverDecayPath | Mentions `LeftoverDecayPath` **or** leftover-decay-path style naming |
| M5 | Merge / CONFLICT | Mentions whole-word `CONFLICT`, whole-word `merge`, **or** `merge-suggestion` (duplicate ingredient AC) |

---

### 3. UI conventions + tests + import style

| # | Check | Rule |
|---|--------|------|
| U1 | data-testid | Mentions `data-testid`, `getByTestId`, **or** `testId` |
| U2 | Component tests | Mentions component tests, `*.test.tsx` FILE headers, vitest/testing-library, **or** brief test scenarios (reorder / qty 0 / merge-suggestion) |
| U3 | No `.js` relative imports | TypeScript/TSX fenced blocks must not use relative `from './x.js'` / `import('./x.js')` (Turbopack — extensionless relative imports only) |

---

## Out of scope (manual / other suites)

- Full RHF + Zod form wiring correctness against `@menu-boss/schemas`
- Actual admin-gate runtime behavior (`family.me` role mock beyond draft mention)
- Materialized files on disk vs draft-only markdown
- Prose quality of `## NOTES` blocks
- Image upload (Phase 2 deferred slot)

---

## Related

- Wave 2 frontend verifier: `tests/verify_wave2_frontend.ps1` / `tests/verify_wave2_frontend.md` (LeftoverDecayPath, content screens)
- Content routers + SQL verifier: `tests/verify_content_routers_and_sql.ps1` / `tests/verify_content_routers_and_sql.md`
- Brief: `grok_14_recipe_ingredient_editors.md`

---

## Run log (tester, branch `test/grok-14`)

| Suite | Result | Counts | Notes |
|-------|--------|--------|-------|
| Script self-test (`-SelfTest`) | **PASS** | pass fixture **14/14**; fail fixture **12** expected failures | Logic OK (exit 0) |
| Draft verifier (this worktree `drafts/`) | **FAIL** | **0 passed, 2 failed, 2 total** | Draft file missing — only presence/loadable evaluated |

### Draft source locations

| Artifact | Source | Copied to tester `drafts/`? |
|----------|--------|-------------------------------|
| `grok_out_recipe_editors.md` | **Not found** in `C:\Users\dougr\01gitprojects\menu_boss\drafts\`, git `main`, or peer Task-14 worktrees (`research/grok-14`, implement/review still on `main` with no draft) | No |

### Draft verifier breakdown (0 pass / 2 fail)

1. `RECIPE-ED: file exists (grok_out_recipe_editors.md)` — missing
2. `RECIPE-ED: content loadable` — cannot evaluate markers

When the implementer publishes `drafts/grok_out_recipe_editors.md`, re-run:

```powershell
# copy then verify
Copy-Item <implementer>\drafts\grok_out_recipe_editors.md drafts\ -Force
powershell -NoProfile -File tests/verify_recipe_editors.ps1
```

Expected full suite: **14 checks** (file + loadable + 4 FILE headers + create/update + softDelete + food-safety + LeftoverDecayPath + merge/CONFLICT + data-testid + component tests + no `.js` relative imports).

When draft is missing: **2 checks** (exists + loadable), both fail.

### Overall tester verdict

| Area | Verdict |
|------|---------|
| Task 14 draft markers | **FAIL** (missing `drafts/grok_out_recipe_editors.md`) |
| Script self-test | **PASS** (14/14 pass fixture; fail fixture correctly fails with 12 failures) |
| Combined draft script exit | **FAIL** (exit 1) until draft is produced or copied |
