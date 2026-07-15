# Wave 3 Admin + PWA Verification Checklist (Tasks 15–16)

Automated checks for the Grok Wave 3 draft outputs against the coordinator briefs:

| Task | Draft | Brief (repo root) |
|------|--------|-------------------|
| 15 | `drafts/grok_out_admin_screens.md` | `grok_15_admin_screens.md` |
| 16 | `drafts/grok_out_pwa_search_perf.md` | `grok_16_pwa_search_perf.md` |

- Script: `tests/verify_wave3_admin_pwa.ps1`
- Checklist: this file
- Branch (tester): `test/grok-15-16`

## How to run

From the repository root (Windows PowerShell):

```powershell
# Verify real drafts (exit 1 on any failure)
powershell -NoProfile -File tests/verify_wave3_admin_pwa.ps1

# Optional: custom drafts directory
powershell -NoProfile -File tests/verify_wave3_admin_pwa.ps1 -DraftsDir drafts

# Self-test script logic with pass/fail fixtures (no real drafts required)
powershell -NoProfile -File tests/verify_wave3_admin_pwa.ps1 -SelfTest
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
  "grok_out_admin_screens.md",
  "grok_out_pwa_search_perf.md"
)
$candidates = @(
  "C:\Users\dougr\01gitprojects\menu_boss\drafts",
  # Peer Grok Task 15–16 worktrees (implement / review / research) under .grok\worktrees
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
| F1 | Admin screens draft exists | `drafts/grok_out_admin_screens.md` |
| F2 | PWA / search / perf draft exists | `drafts/grok_out_pwa_search_perf.md` |
| F3–F4 | Content loadable | Each present file readable as UTF-8 text |

When a draft file is **missing**, only the presence + loadable checks fail for that draft (marker checks are not inventing false positives beyond "cannot evaluate"). When present, all marker checks below are enforced.

---

### 1. Admin screens (`grok_out_admin_screens.md`) — Task 15

| # | Check | Rule |
|---|--------|------|
| A1 | admin router | Mentions `adminRouter`, **or** `admin router` / `admin tRPC router`, **or** `routers/admin`, **or** `### FILE: …admin.ts`, **or** `export const admin = createTRPCRouter` |
| A2 | invites | Mentions whole-word `invites`, **or** `invite.create`, **or** `invites.list/create/revoke` |
| A3 | portionCategories | Mentions `portionCategories`, `portion_categories` / `portion-categories`, **or** `PortionCategory` |
| A4 | athleteMultiplier | Mentions `athleteMultiplier` **or** `athlete_multiplier` / `athlete-multiplier` |
| A5 | adminProcedure | Mentions `adminProcedure` (every admin procedure gated) |
| A6 | audit | Mentions whole-word `audit`, `audit_log` / `audit-log`, **or** `audit.list` |

---

### 2. PWA / search / perf (`grok_out_pwa_search_perf.md`) — Task 16

Per brief keywords:

| # | Check | Rule |
|---|--------|------|
| P1 | offline | Mentions whole-word `offline` (D4 read-only offline) |
| P2 | workbox or service worker | Mentions `workbox`, `service worker` / `service-worker` / `serviceWorker`, `serwist` / `@serwist/next`, **or** `sw.js` |
| P3 | search | Mentions whole-word `search` (global search) |
| P4 | performance | Mentions `performance`, `performance.now`, **or** `perf-budget` / `perf_budget` |
| P5 | budget | Mentions `budget`…, `budgets.ts`, **or** `perf-budgets` |

---

## Expected check counts

| Suite state | Checks |
|-------------|--------|
| Full suite (both drafts present + markers) | **15** (2×(exists+loadable) + 6 admin + 5 pwa) |
| All drafts missing | **4** evaluated (2 missing + 2 not loadable); **0 pass / 4 fail** |
| Self-test pass fixture | **15/15** pass |
| Self-test fail fixture | multiple expected failures (missing markers) |

---

## Out of scope (manual / other suites)

- Full Playwright perf-budget run against Supabase (requires Docker / CI)
- Vitest component tests for invite dialog / portion-category editor
- Materialized files on disk vs draft-only markdown
- Actual service-worker registration in a browser
- Accessibility audit (WCAG 2.2 AA)
- Prose quality of `## NOTES` blocks
- D4 negative greps for background-sync / mutation-queue (reviewer scope)

---

## Related

- Wave 2 frontend verifier: `tests/verify_wave2_frontend.ps1` / `tests/verify_wave2_frontend.md`
- Briefs: `grok_15_admin_screens.md`, `grok_16_pwa_search_perf.md`

---

## Run log (tester, branch `test/grok-15-16`)

| Suite | Result | Counts | Notes |
|-------|--------|--------|-------|
| Script self-test (`-SelfTest`) | **PASS** | pass fixture **15/15**; fail fixture **11** expected failures | Logic OK (exit 0) |
| Draft verifier (this worktree `drafts/`) | **FAIL** | **0 passed, 4 failed, 4 total** | Both draft files missing — only presence/loadable evaluated |

### Draft source locations

| Artifact | Source | Copied to tester `drafts/`? |
|----------|--------|-------------------------------|
| `grok_out_admin_screens.md` | **Not found** in `C:\Users\dougr\01gitprojects\menu_boss\drafts\` or peer worktrees under `.grok\worktrees\01gitprojects-menu-boss` | No |
| `grok_out_pwa_search_perf.md` | **Not found** (same search) | No |

### Draft verifier breakdown (0 pass / 4 fail)

1. `ADMIN: file exists (grok_out_admin_screens.md)` — missing
2. `ADMIN: content loadable` — cannot evaluate markers
3. `PWA: file exists (grok_out_pwa_search_perf.md)` — missing
4. `PWA: content loadable` — cannot evaluate markers

When the implementer publishes the two drafts, re-run:

```powershell
Copy-Item <implementer>\drafts\grok_out_admin_screens.md drafts\ -Force
Copy-Item <implementer>\drafts\grok_out_pwa_search_perf.md drafts\ -Force
powershell -NoProfile -File tests/verify_wave3_admin_pwa.ps1
```

Expected full suite: **15 checks** (2× exists+loadable + 6 admin markers + 5 pwa markers).

### Overall tester verdict

| Area | Verdict |
|------|---------|
| Task 15 admin markers | **FAIL** (missing `drafts/grok_out_admin_screens.md`) |
| Task 16 PWA/search/perf markers | **FAIL** (missing `drafts/grok_out_pwa_search_perf.md`) |
| Script self-test | **PASS** (15/15 pass fixture; fail fixture correctly fails with 11 failures) |
| Combined draft script exit | **FAIL** (exit 1) until drafts are produced or copied |
