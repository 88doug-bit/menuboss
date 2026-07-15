# Wave 2 Frontend Verification Checklist (Tasks 11–13)

Automated checks for the Grok Wave 2 frontend draft outputs against the coordinator briefs:

| Task | Draft | Brief (repo root) |
|------|--------|-------------------|
| 11 | `drafts/grok_out_calendar_screens.md` | `grok_11_calendar_plan_screens.md` |
| 12 | `drafts/grok_out_content_screens.md` | `grok_12_content_screens.md` |
| 13 | `drafts/grok_out_e2e_realtime.md` | `grok_13_e2e_realtime.md` |

- Script: `tests/verify_wave2_frontend.ps1`
- Checklist: this file
- Branch (tester): `test/grok-11-13`

## How to run

From the repository root (Windows PowerShell):

```powershell
# Verify real drafts (exit 1 on any failure)
powershell -NoProfile -File tests/verify_wave2_frontend.ps1

# Optional: custom drafts directory
powershell -NoProfile -File tests/verify_wave2_frontend.ps1 -DraftsDir drafts

# Self-test script logic with pass/fail fixtures (no real drafts required)
powershell -NoProfile -File tests/verify_wave2_frontend.ps1 -SelfTest
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
$names = @(
  "grok_out_calendar_screens.md",
  "grok_out_content_screens.md",
  "grok_out_e2e_realtime.md"
)
$candidates = @(
  "C:\Users\dougr\01gitprojects\menu_boss\drafts",
  # Peer Grok Task 11–13 worktrees (implement / review / research) under .grok\worktrees
  "C:\Users\dougr\.grok\worktrees\01gitprojects-menu-boss"
)
foreach ($name in $names) {
  $copied = $false
  foreach ($root in $candidates) {
    if ($copied) { break }
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
      }
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
| F1 | Calendar screens draft exists | `drafts/grok_out_calendar_screens.md` |
| F2 | Content screens draft exists | `drafts/grok_out_content_screens.md` |
| F3 | E2E realtime draft exists | `drafts/grok_out_e2e_realtime.md` |
| F4–F6 | Content loadable | Each present file readable as UTF-8 text |

When a draft file is **missing**, only the presence + loadable checks fail for that draft (marker checks are not inventing false positives beyond "cannot evaluate"). When present, all marker checks below are enforced.

---

### 1. Calendar screens (`grok_out_calendar_screens.md`) — Task 11

| # | Check | Rule |
|---|--------|------|
| C1 | login | Mentions `/login` **or** whole-word `login` (auth page / magic-link + password) |
| C2 | realtime invalidation | Mentions `useRealtimePlanInvalidation`, **or** realtime+invalidat*, **or** invalidat*+(query\|cache\|realtime), **or** `notify-then-refetch` |
| C3 | portion-calc | Mentions `portion-calc`, `@menu-boss/portion-calc`, **or** `calculateEffectiveProteinOz` |
| C4 | react-big-calendar | Mentions `react-big-calendar` |

---

### 2. Content screens (`grok_out_content_screens.md`) — Task 12

| # | Check | Rule |
|---|--------|------|
| S1 | shopping list | Mentions `shopping list` / `shopping-list` / `shopping_list`, **or** `generateShoppingList` |
| S2 | chefIdea | Mentions `chefIdea`, `chef_idea` / `chef-idea`, **or** `ChefIdea` |
| S3 | leftover | Mentions `leftover`, `decay-path` / `decay_path`, **or** `setLeftoverDecayPath` |
| S4 | safety | Mentions `food_safety` / `food-safety`, `safety note` / `safety-flag`, `mercury`, **or** whole-word `safety` |

---

### 3. E2E + realtime (`grok_out_e2e_realtime.md`) — Task 13

| # | Check | Rule |
|---|--------|------|
| E1 | plan-shared-meal | Mentions `plan-shared-meal` **or** `plan_shared_meal` |
| E2 | realtime-cutoff | Mentions `realtime-cutoff` **or** `realtime_cutoff` |
| E3 | global-setup | Mentions `global-setup`, `global_setup`, **or** `globalSetup` |
| E4 | E2E_SUPABASE_URL | Mentions `E2E_SUPABASE_URL` env guard |
| E5 | no waitForTimeout | Must **not** use `waitForTimeout` / `page.waitForTimeout` as a sleep. Prose bans ("No page.waitForTimeout") are allowed. |

---

## Expected check counts

| Suite state | Checks |
|-------------|--------|
| Full suite (all 3 drafts present + markers) | **19** (3×(exists+loadable) + 4 calendar + 4 content + 5 e2e) |
| All drafts missing | **6** evaluated (3 missing + 3 not loadable); **0 pass / 6 fail** |
| Self-test pass fixture | **19/19** pass |
| Self-test fail fixture | multiple expected failures (missing markers + waitForTimeout usage) |

---

## Out of scope (manual / other suites)

- Full Playwright run against Supabase (requires Docker / CI `supabase start`)
- Vitest component test execution for portion grid / safety callout
- Materialized files on disk vs draft-only markdown
- Accessibility audit (WCAG 2.2 AA)
- CI workflow step correctness beyond marker presence
- Prose quality of `## NOTES` blocks

---

## Related

- MealPlan router verifier: `tests/verify_mealplan_router.ps1` / `tests/verify_mealplan_router.md`
- Content routers + SQL verifier: `tests/verify_content_routers_and_sql.ps1` / `tests/verify_content_routers_and_sql.md`
- Briefs: `grok_11_calendar_plan_screens.md`, `grok_12_content_screens.md`, `grok_13_e2e_realtime.md`

---

## Run log (tester, branch `test/grok-11-13`)

| Suite | Result | Counts | Notes |
|-------|--------|--------|-------|
| Script self-test (`-SelfTest`) | **PASS** | pass fixture **19/19**; fail fixture **13** expected failures | Logic OK (exit 0) |
| Draft verifier (this worktree `drafts/`) | **FAIL** | **0 passed, 6 failed, 6 total** | All three draft files missing — only presence/loadable evaluated |

### Draft source locations

| Artifact | Source | Copied to tester `drafts/`? |
|----------|--------|-------------------------------|
| `grok_out_calendar_screens.md` | **Not found** in `C:\Users\dougr\01gitprojects\menu_boss\drafts\` or peer worktrees under `.grok\worktrees\01gitprojects-menu-boss` | No |
| `grok_out_content_screens.md` | **Not found** (same search) | No |
| `grok_out_e2e_realtime.md` | **Not found** (same search) | No |

### Draft verifier breakdown (0 pass / 6 fail)

1. `CALENDAR: file exists (grok_out_calendar_screens.md)` — missing
2. `CALENDAR: content loadable` — cannot evaluate markers
3. `CONTENT: file exists (grok_out_content_screens.md)` — missing
4. `CONTENT: content loadable` — cannot evaluate markers
5. `E2E: file exists (grok_out_e2e_realtime.md)` — missing
6. `E2E: content loadable` — cannot evaluate markers

When the implementer publishes the three drafts, re-run:

```powershell
# copy then verify
Copy-Item <implementer>\drafts\grok_out_calendar_screens.md drafts\ -Force
Copy-Item <implementer>\drafts\grok_out_content_screens.md drafts\ -Force
Copy-Item <implementer>\drafts\grok_out_e2e_realtime.md drafts\ -Force
powershell -NoProfile -File tests/verify_wave2_frontend.ps1
```

Expected full suite: **19 checks** (3× exists+loadable + 4 calendar markers + 4 content markers + 5 e2e markers).

### Overall tester verdict

| Area | Verdict |
|------|---------|
| Task 11 calendar markers | **FAIL** (missing `drafts/grok_out_calendar_screens.md`) |
| Task 12 content markers | **FAIL** (missing `drafts/grok_out_content_screens.md`) |
| Task 13 e2e markers | **FAIL** (missing `drafts/grok_out_e2e_realtime.md`) |
| Script self-test | **PASS** (19/19 pass fixture; fail fixture correctly fails with 13 failures) |
| Combined draft script exit | **FAIL** (exit 1) until drafts are produced or copied |
