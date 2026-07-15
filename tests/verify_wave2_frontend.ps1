#Requires -Version 5.1
<#
.SYNOPSIS
  Verifies MenuBoss Wave 2 frontend draft outputs (Tasks 11-13).

.DESCRIPTION
  Exit 0 if all checks pass; exit 1 if any check fails.
  Validates presence and key markers for:
    - drafts/grok_out_calendar_screens.md   (Task 11)
    - drafts/grok_out_content_screens.md    (Task 12)
    - drafts/grok_out_e2e_realtime.md       (Task 13)

  Checks (coordinator / tester brief):
    Task 11 calendar screens:
      - login
      - realtime invalidation (useRealtimePlanInvalidation / invalidate)
      - portion-calc / calculateEffectiveProteinOz
      - react-big-calendar
    Task 12 content screens:
      - shopping list / generateShoppingList
      - chefIdea
      - leftover / decay path
      - safety (food-safety notes)
    Task 13 e2e + realtime:
      - plan-shared-meal
      - realtime-cutoff
      - global-setup
      - E2E_SUPABASE_URL
      - no page.waitForTimeout (usage)

.PARAMETER DraftsDir
  Directory containing the draft files. Default: drafts (relative to repo root).

.PARAMETER SelfTest
  Run built-in fixture tests that validate script logic (pass fixture must pass; fail fixture must fail).

.PARAMETER RepoRoot
  Repository root. Defaults to parent of the tests/ directory containing this script.
#>
[CmdletBinding()]
param(
    [string]$DraftsDir = "drafts",
    [switch]$SelfTest,
    [string]$RepoRoot = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if (-not $RepoRoot) {
    $RepoRoot = Split-Path -Parent $PSScriptRoot
    if (-not $RepoRoot) { $RepoRoot = (Get-Location).Path }
}

function Write-CheckResult {
    param(
        [string]$Name,
        [bool]$Passed,
        [string]$Detail = ""
    )
    $status = if ($Passed) { "PASS" } else { "FAIL" }
    $line = "[{0}] {1}" -f $status, $Name
    if ($Detail) { $line = "$line - $Detail" }
    if ($Passed) {
        Write-Host $line -ForegroundColor Green
    } else {
        Write-Host $line -ForegroundColor Red
    }
}

function Get-NormalizedContent {
    param([string]$FilePath)
    if (-not (Test-Path -LiteralPath $FilePath)) {
        return $null
    }
    $content = Get-Content -LiteralPath $FilePath -Raw -Encoding UTF8
    if ($null -eq $content) { $content = "" }
    return ($content -replace "`r`n", "`n" -replace "`r", "`n")
}

function Test-HasWaitForTimeoutUsage {
    param([string]$Content)
    # Fail only on actual waitForTimeout usage, not NOTES that ban it
    foreach ($line in ($Content -split "`n")) {
        if ($line -notmatch '(?i)waitForTimeout') { continue }
        $isNegation =
            ($line -match '(?i)(no|not|never|without|avoid|forbid|disallow|ban|must\s+not|do\s+not|don''t).{0,80}waitForTimeout') -or
            ($line -match '(?i)waitForTimeout.{0,80}(never|not\s+used|not\s+allowed|forbidden|disallowed|banned|must\s+not|no\s+sleeps?)') -or
            ($line -match '(?i)(No|no)\s+`?page\.waitForTimeout')
        if ($isNegation) { continue }
        $detail = $line.Trim()
        if ($detail.Length -gt 120) { $detail = $detail.Substring(0, 120) + "..." }
        return @{ Found = $true; Detail = $detail }
    }
    return @{ Found = $false; Detail = "" }
}

function Test-Wave2Frontend {
    param(
        [Parameter(Mandatory = $true)]
        [string]$DraftsPath,
        [string]$Label = ""
    )

    $results = New-Object System.Collections.Generic.List[object]
    $prefix = if ($Label) { "[$Label] " } else { "" }

    function Add-Result {
        param([string]$Name, [bool]$Passed, [string]$Detail = "")
        $results.Add([pscustomobject]@{
            Name   = $Name
            Passed = $Passed
            Detail = $Detail
        }) | Out-Null
        Write-CheckResult -Name ("{0}{1}" -f $prefix, $Name) -Passed $Passed -Detail $Detail
    }

    $calendarPath = Join-Path $DraftsPath "grok_out_calendar_screens.md"
    $contentPath  = Join-Path $DraftsPath "grok_out_content_screens.md"
    $e2ePath      = Join-Path $DraftsPath "grok_out_e2e_realtime.md"

    # =========================================================================
    # Task 11 - Calendar / auth / realtime screens draft
    # =========================================================================
    $calendarExists = Test-Path -LiteralPath $calendarPath
    Add-Result "CALENDAR: file exists (grok_out_calendar_screens.md)" $calendarExists $(
        if (-not $calendarExists) { "Missing: $calendarPath" } else { $calendarPath }
    )

    $calendar = Get-NormalizedContent -FilePath $calendarPath
    if ($null -eq $calendar) {
        Add-Result "CALENDAR: content loadable" $false "Cannot evaluate markers; file missing"
    } else {
        Add-Result "CALENDAR: content loadable" $true ""

        $hasLogin =
            [regex]::IsMatch($calendar, '(?i)/login') -or
            [regex]::IsMatch($calendar, '(?i)\blogin\b')
        Add-Result "CALENDAR: login" $hasLogin $(
            if (-not $hasLogin) {
                "Expected /login page or login auth flow"
            } else { "" }
        )

        $hasRealtimeInvalidation =
            [regex]::IsMatch($calendar, '(?i)useRealtimePlanInvalidation') -or
            [regex]::IsMatch($calendar, '(?i)realtime.{0,40}invalidat') -or
            [regex]::IsMatch($calendar, '(?i)invalidat.{0,40}(query|cache|realtime)') -or
            [regex]::IsMatch($calendar, '(?i)notify-then-refetch')
        Add-Result "CALENDAR: realtime invalidation" $hasRealtimeInvalidation $(
            if (-not $hasRealtimeInvalidation) {
                "Expected useRealtimePlanInvalidation / invalidate-on-realtime / notify-then-refetch"
            } else { "" }
        )

        $hasPortion =
            [regex]::IsMatch($calendar, '(?i)portion-calc') -or
            [regex]::IsMatch($calendar, '(?i)@menu-boss/portion-calc') -or
            [regex]::IsMatch($calendar, '(?i)calculateEffectiveProteinOz')
        Add-Result "CALENDAR: portion-calc" $hasPortion $(
            if (-not $hasPortion) {
                "Expected @menu-boss/portion-calc and/or calculateEffectiveProteinOz for live preview"
            } else { "" }
        )

        $hasBigCal = [regex]::IsMatch($calendar, '(?i)react-big-calendar')
        Add-Result "CALENDAR: react-big-calendar" $hasBigCal $(
            if (-not $hasBigCal) {
                "Expected react-big-calendar for week/month dashboard"
            } else { "" }
        )
    }

    # =========================================================================
    # Task 12 - Content screens draft
    # =========================================================================
    $contentExists = Test-Path -LiteralPath $contentPath
    Add-Result "CONTENT: file exists (grok_out_content_screens.md)" $contentExists $(
        if (-not $contentExists) { "Missing: $contentPath" } else { $contentPath }
    )

    $content = Get-NormalizedContent -FilePath $contentPath
    if ($null -eq $content) {
        Add-Result "CONTENT: content loadable" $false "Cannot evaluate markers; file missing"
    } else {
        Add-Result "CONTENT: content loadable" $true ""

        $hasShopping =
            [regex]::IsMatch($content, '(?i)shopping[\s_-]?list') -or
            [regex]::IsMatch($content, '(?i)generateShoppingList')
        Add-Result "CONTENT: shopping list" $hasShopping $(
            if (-not $hasShopping) {
                "Expected shopping list UI and/or generateShoppingList"
            } else { "" }
        )

        $hasChefIdea =
            [regex]::IsMatch($content, '(?i)chefIdea') -or
            [regex]::IsMatch($content, '(?i)chef[_-]?idea') -or
            [regex]::IsMatch($content, '(?i)ChefIdea')
        Add-Result "CONTENT: chefIdea" $hasChefIdea $(
            if (-not $hasChefIdea) {
                "Expected chefIdea capture/browser (chefIdea / ChefIdea)"
            } else { "" }
        )

        $hasLeftover =
            [regex]::IsMatch($content, '(?i)leftover') -or
            [regex]::IsMatch($content, '(?i)decay[_-]?path') -or
            [regex]::IsMatch($content, '(?i)setLeftoverDecayPath')
        Add-Result "CONTENT: leftover" $hasLeftover $(
            if (-not $hasLeftover) {
                "Expected leftover / decay-path / setLeftoverDecayPath"
            } else { "" }
        )

        $hasSafety =
            [regex]::IsMatch($content, '(?i)food[_-]?safety') -or
            [regex]::IsMatch($content, '(?i)safety[\s_-]?note') -or
            [regex]::IsMatch($content, '(?i)safety[\s_-]?flag') -or
            [regex]::IsMatch($content, '(?i)mercury') -or
            [regex]::IsMatch($content, '(?i)\bsafety\b')
        Add-Result "CONTENT: safety" $hasSafety $(
            if (-not $hasSafety) {
                "Expected food-safety notes / safety callout / mercury profile handling"
            } else { "" }
        )
    }

    # =========================================================================
    # Task 13 - E2E + realtime integration draft
    # =========================================================================
    $e2eExists = Test-Path -LiteralPath $e2ePath
    Add-Result "E2E: file exists (grok_out_e2e_realtime.md)" $e2eExists $(
        if (-not $e2eExists) { "Missing: $e2ePath" } else { $e2ePath }
    )

    $e2e = Get-NormalizedContent -FilePath $e2ePath
    if ($null -eq $e2e) {
        Add-Result "E2E: content loadable" $false "Cannot evaluate markers; file missing"
    } else {
        Add-Result "E2E: content loadable" $true ""

        $hasPlanShared =
            [regex]::IsMatch($e2e, '(?i)plan-shared-meal') -or
            [regex]::IsMatch($e2e, '(?i)plan_shared_meal')
        Add-Result "E2E: plan-shared-meal" $hasPlanShared $(
            if (-not $hasPlanShared) {
                "Expected plan-shared-meal.spec.ts (Flow 1 E2E)"
            } else { "" }
        )

        $hasCutoff =
            [regex]::IsMatch($e2e, '(?i)realtime-cutoff') -or
            [regex]::IsMatch($e2e, '(?i)realtime_cutoff')
        Add-Result "E2E: realtime-cutoff" $hasCutoff $(
            if (-not $hasCutoff) {
                "Expected realtime-cutoff.spec.ts (Scenario 11 unshare cutoff)"
            } else { "" }
        )

        $hasGlobalSetup =
            [regex]::IsMatch($e2e, '(?i)global-setup') -or
            [regex]::IsMatch($e2e, '(?i)global_setup') -or
            [regex]::IsMatch($e2e, '(?i)globalSetup')
        Add-Result "E2E: global-setup" $hasGlobalSetup $(
            if (-not $hasGlobalSetup) {
                "Expected global-setup.ts (auth user provisioning via service role)"
            } else { "" }
        )

        $hasE2eUrl = [regex]::IsMatch($e2e, '(?i)E2E_SUPABASE_URL')
        Add-Result "E2E: E2E_SUPABASE_URL" $hasE2eUrl $(
            if (-not $hasE2eUrl) {
                "Expected E2E_SUPABASE_URL env guard (skip unless set)"
            } else { "" }
        )

        $timeout = Test-HasWaitForTimeoutUsage -Content $e2e
        Add-Result "E2E: no waitForTimeout" (-not $timeout.Found) $(
            if ($timeout.Found) {
                "No page.waitForTimeout sleeps - use expect-polling (found: $($timeout.Detail))"
            } else { "" }
        )
    }

    $failCount = @($results | Where-Object { -not $_.Passed }).Count
    $passCount = @($results | Where-Object { $_.Passed }).Count

    return [pscustomobject]@{
        Passed    = ($failCount -eq 0)
        PassCount = $passCount
        FailCount = $failCount
        Results   = $results
        Failures  = @($results | Where-Object { -not $_.Passed } | ForEach-Object {
            if ($_.Detail) { "$($_.Name): $($_.Detail)" } else { $_.Name }
        })
    }
}

function Get-MinimalCalendarPassFixture {
    return @"
## NOTES
- Auth: /login with magic-link + password; no self-registration.
- Realtime: notify-then-refetch via useRealtimePlanInvalidation(range).
- Live preview uses @menu-boss/portion-calc calculateEffectiveProteinOz.

### FILE: apps/web/src/app/login/page.tsx
``````tsx
export default function LoginPage() {
  return <form data-testid="login-form">Sign in</form>;
}
``````

### FILE: apps/web/src/hooks/useRealtimePlanInvalidation.ts
``````ts
import { useQueryClient } from '@tanstack/react-query';

export function useRealtimePlanInvalidation(range: { start: Date; end: Date }) {
  const qc = useQueryClient();
  // on any postgres_changes event, invalidate caches - never render payload
  void range;
  void qc;
}
``````

### FILE: apps/web/src/components/calendar/MealPlanCalendar.tsx
``````tsx
import { Calendar, dateFnsLocalizer } from 'react-big-calendar';
import { calculateEffectiveProteinOz } from '@menu-boss/portion-calc';

export function MealPlanCalendar() {
  const total = calculateEffectiveProteinOz({
    categories: [],
    settings: { athleteMultiplier: 1.5 },
    requirements: [],
  });
  return <Calendar localizer={dateFnsLocalizer({})} events={[]} protein={total} />;
}
``````
"@
}

function Get-MinimalContentPassFixture {
    return @"
## NOTES
- Shopping list UI calls mealPlan.generateShoppingList.
- ChefIdea capture + leftover decay-path + food-safety callouts.

### FILE: apps/web/src/app/shopping/page.tsx
``````tsx
export default function ShoppingListPage() {
  // generateShoppingList grouped by category_name; Optional last
  return <div data-testid="shopping-list">Shopping List</div>;
}
``````

### FILE: apps/web/src/app/ideas/page.tsx
``````tsx
export default function ChefIdeaBrowser() {
  return <button data-testid="capture-chef-idea">+ Capture Idea</button>;
}
``````

### FILE: apps/web/src/components/recipe/LeftoverDecayPath.tsx
``````tsx
export function LeftoverDecayPath() {
  // recipe.setLeftoverDecayPath
  return <section data-testid="leftover-decay-path">Creative Leftovers</section>;
}
``````

### FILE: apps/web/src/components/recipe/SafetyNote.tsx
``````tsx
export function SafetyNote({ profile }: { profile?: { mercury?: string } }) {
  if (!profile?.mercury) return null;
  return <aside data-testid="food-safety-note">Safety note</aside>;
}
``````
"@
}

function Get-MinimalE2ePassFixture {
    return @"
## NOTES
- Skip unless E2E_SUPABASE_URL is set. No page.waitForTimeout - use expect-polling.
- testids for Tasks 11/12 reconciliation listed below.

### FILE: apps/web/e2e/global-setup.ts
``````ts
// Creates auth users via SUPABASE_SERVICE_ROLE_KEY; ids match seeded profiles.
export default async function globalSetup() {
  if (!process.env.E2E_SUPABASE_URL) return;
}
``````

### FILE: apps/web/e2e/plan-shared-meal.spec.ts
``````ts
import { test, expect } from '@playwright/test';

const e2eUrl = process.env.E2E_SUPABASE_URL;

test.skip(!e2eUrl, 'requires E2E_SUPABASE_URL');

test('Flow 1 plan-shared-meal', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('calendar')).toBeVisible();
});
``````

### FILE: apps/web/e2e/realtime-cutoff.spec.ts
``````ts
import { test, expect } from '@playwright/test';

const e2eUrl = process.env.E2E_SUPABASE_URL;

test.skip(!e2eUrl, 'requires E2E_SUPABASE_URL');

test('Scenario 11 realtime-cutoff unshare', async () => {
  expect(true).toBe(true);
});
``````
"@
}

function Get-MinimalCalendarFailFixture {
    return @"
## NOTES
- Intentionally incomplete calendar draft for self-test

### FILE: apps/web/src/components/broken.tsx
``````tsx
export function Broken() { return null; }
``````
"@
}

function Get-MinimalContentFailFixture {
    return @"
## NOTES
- Intentionally incomplete content screens draft

### FILE: apps/web/src/app/empty/page.tsx
``````tsx
export default function Empty() { return <div>empty</div>; }
``````
"@
}

function Get-MinimalE2eFailFixture {
    return @"
## NOTES
- Intentionally bad E2E draft: uses waitForTimeout sleep

### FILE: apps/web/e2e/bad.spec.ts
``````ts
import { test } from '@playwright/test';
test('flake', async ({ page }) => {
  await page.waitForTimeout(5000);
});
``````
"@
}

function Invoke-SelfTest {
    Write-Host ""
    Write-Host "=== Self-test: Wave 2 Frontend verifier (Tasks 11-13) ===" -ForegroundColor Cyan

    $tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("wave2-fe-verify-" + [guid]::NewGuid().ToString("N"))
    $passDir = Join-Path $tempRoot "pass"
    $failDir = Join-Path $tempRoot "fail"
    New-Item -ItemType Directory -Force -Path $passDir | Out-Null
    New-Item -ItemType Directory -Force -Path $failDir | Out-Null

    try {
        $calPass = (Get-MinimalCalendarPassFixture) -replace '``````', '```'
        $conPass = (Get-MinimalContentPassFixture) -replace '``````', '```'
        $e2ePass = (Get-MinimalE2ePassFixture) -replace '``````', '```'
        Set-Content -LiteralPath (Join-Path $passDir "grok_out_calendar_screens.md") -Value $calPass -Encoding UTF8
        Set-Content -LiteralPath (Join-Path $passDir "grok_out_content_screens.md") -Value $conPass -Encoding UTF8
        Set-Content -LiteralPath (Join-Path $passDir "grok_out_e2e_realtime.md") -Value $e2ePass -Encoding UTF8

        $calFail = (Get-MinimalCalendarFailFixture) -replace '``````', '```'
        $conFail = (Get-MinimalContentFailFixture) -replace '``````', '```'
        $e2eFail = (Get-MinimalE2eFailFixture) -replace '``````', '```'
        Set-Content -LiteralPath (Join-Path $failDir "grok_out_calendar_screens.md") -Value $calFail -Encoding UTF8
        Set-Content -LiteralPath (Join-Path $failDir "grok_out_content_screens.md") -Value $conFail -Encoding UTF8
        Set-Content -LiteralPath (Join-Path $failDir "grok_out_e2e_realtime.md") -Value $e2eFail -Encoding UTF8

        Write-Host ""
        Write-Host "--- Pass fixture ---" -ForegroundColor Cyan
        $passResult = Test-Wave2Frontend -DraftsPath $passDir -Label "PASS-FIXTURE"

        Write-Host ""
        Write-Host "--- Fail fixture ---" -ForegroundColor Cyan
        $failResult = Test-Wave2Frontend -DraftsPath $failDir -Label "FAIL-FIXTURE"

        $selfOk = $passResult.Passed -and (-not $failResult.Passed)
        Write-Host ""
        if ($selfOk) {
            Write-Host ("[PASS] Self-test: pass fixture passed ({0} checks); fail fixture failed ({1} failures) as expected" -f $passResult.PassCount, $failResult.FailCount) -ForegroundColor Green
            return 0
        } else {
            if (-not $passResult.Passed) {
                Write-Host "[FAIL] Self-test: pass fixture should have passed. Failures:" -ForegroundColor Red
                foreach ($f in $passResult.Failures) { Write-Host "  - $f" -ForegroundColor Red }
            }
            if ($failResult.Passed) {
                Write-Host "[FAIL] Self-test: fail fixture should have failed but passed" -ForegroundColor Red
            }
            return 1
        }
    } finally {
        Remove-Item -LiteralPath $tempRoot -Recurse -Force -ErrorAction SilentlyContinue
    }
}

# --- Main ---
if ($SelfTest) {
    $code = Invoke-SelfTest
    exit $code
}

$draftsFull = if ([System.IO.Path]::IsPathRooted($DraftsDir)) {
    $DraftsDir
} else {
    Join-Path $RepoRoot $DraftsDir
}

Write-Host "Repo root : $RepoRoot"
Write-Host "Drafts dir: $draftsFull"
Write-Host ""

$outcome = Test-Wave2Frontend -DraftsPath $draftsFull

Write-Host ""
Write-Host "========================================"
Write-Host ("Summary: {0} passed, {1} failed, {2} total" -f $outcome.PassCount, $outcome.FailCount, ($outcome.PassCount + $outcome.FailCount))
if ($outcome.Passed) {
    Write-Host "RESULT: PASS" -ForegroundColor Green
    exit 0
} else {
    Write-Host "RESULT: FAIL" -ForegroundColor Red
    Write-Host ""
    Write-Host "Failures:" -ForegroundColor Red
    foreach ($f in $outcome.Failures) {
        Write-Host "  - $f" -ForegroundColor Red
    }
    exit 1
}
