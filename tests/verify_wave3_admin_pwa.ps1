#Requires -Version 5.1
<#
.SYNOPSIS
  Verifies MenuBoss Wave 3 admin + PWA draft outputs (Tasks 15-16).

.DESCRIPTION
  Exit 0 if all checks pass; exit 1 if any check fails.
  Validates presence and key markers for:
    - drafts/grok_out_admin_screens.md   (Task 15)
    - drafts/grok_out_pwa_search_perf.md (Task 16)

  Checks (coordinator / tester brief):
    Task 15 admin screens:
      - admin router
      - invites
      - portionCategories
      - athleteMultiplier
      - adminProcedure
      - audit
    Task 16 PWA / search / perf (per brief keywords):
      - offline
      - workbox or service worker (serwist / sw.js / serviceWorker ok)
      - search
      - performance
      - budget

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

function Test-Wave3AdminPwa {
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

    $adminPath = Join-Path $DraftsPath "grok_out_admin_screens.md"
    $pwaPath   = Join-Path $DraftsPath "grok_out_pwa_search_perf.md"

    # =========================================================================
    # Task 15 - Admin screens draft
    # =========================================================================
    $adminExists = Test-Path -LiteralPath $adminPath
    Add-Result "ADMIN: file exists (grok_out_admin_screens.md)" $adminExists $(
        if (-not $adminExists) { "Missing: $adminPath" } else { $adminPath }
    )

    $admin = Get-NormalizedContent -FilePath $adminPath
    if ($null -eq $admin) {
        Add-Result "ADMIN: content loadable" $false "Cannot evaluate markers; file missing"
    } else {
        Add-Result "ADMIN: content loadable" $true ""

        $hasAdminRouter =
            [regex]::IsMatch($admin, '(?i)\badminRouter\b') -or
            [regex]::IsMatch($admin, '(?i)\badmin\s+router\b') -or
            [regex]::IsMatch($admin, '(?i)admin\s+tRPC\s+router') -or
            [regex]::IsMatch($admin, '(?i)routers[/\\]admin') -or
            [regex]::IsMatch($admin, '(?i)###\s+FILE:\s*.*admin\.ts') -or
            [regex]::IsMatch($admin, '(?i)admin:\s*adminRouter') -or
            [regex]::IsMatch($admin, '(?i)export\s+const\s+admin\s*=\s*createTRPCRouter')
        Add-Result "ADMIN: admin router" $hasAdminRouter $(
            if (-not $hasAdminRouter) {
                "Expected admin router (adminRouter / admin tRPC router / routers/admin / ### FILE: ...admin.ts)"
            } else { "" }
        )

        $hasInvites =
            [regex]::IsMatch($admin, '(?i)\binvites\b') -or
            [regex]::IsMatch($admin, '(?i)invite\.create') -or
            [regex]::IsMatch($admin, '(?i)invites\.(list|create|revoke)')
        Add-Result "ADMIN: invites" $hasInvites $(
            if (-not $hasInvites) {
                "Expected invites (list/create/revoke) admin capability"
            } else { "" }
        )

        $hasPortionCategories =
            [regex]::IsMatch($admin, '(?i)portionCategories') -or
            [regex]::IsMatch($admin, '(?i)portion[_-]?categories') -or
            [regex]::IsMatch($admin, '(?i)PortionCategory')
        Add-Result "ADMIN: portionCategories" $hasPortionCategories $(
            if (-not $hasPortionCategories) {
                "Expected portionCategories / PortionCategory vocab editor"
            } else { "" }
        )

        $hasAthleteMultiplier =
            [regex]::IsMatch($admin, '(?i)athleteMultiplier') -or
            [regex]::IsMatch($admin, '(?i)athlete[_-]?multiplier')
        Add-Result "ADMIN: athleteMultiplier" $hasAthleteMultiplier $(
            if (-not $hasAthleteMultiplier) {
                "Expected athleteMultiplier in family settings"
            } else { "" }
        )

        $hasAdminProcedure =
            [regex]::IsMatch($admin, '(?i)\badminProcedure\b')
        Add-Result "ADMIN: adminProcedure" $hasAdminProcedure $(
            if (-not $hasAdminProcedure) {
                "Expected adminProcedure on every admin tRPC procedure"
            } else { "" }
        )

        $hasAudit =
            [regex]::IsMatch($admin, '(?i)\baudit\b') -or
            [regex]::IsMatch($admin, '(?i)audit[_-]?log') -or
            [regex]::IsMatch($admin, '(?i)audit\.list')
        Add-Result "ADMIN: audit" $hasAudit $(
            if (-not $hasAudit) {
                "Expected audit log viewer / audit.list / audit_log"
            } else { "" }
        )
    }

    # =========================================================================
    # Task 16 - PWA / search / performance draft
    # =========================================================================
    $pwaExists = Test-Path -LiteralPath $pwaPath
    Add-Result "PWA: file exists (grok_out_pwa_search_perf.md)" $pwaExists $(
        if (-not $pwaExists) { "Missing: $pwaPath" } else { $pwaPath }
    )

    $pwa = Get-NormalizedContent -FilePath $pwaPath
    if ($null -eq $pwa) {
        Add-Result "PWA: content loadable" $false "Cannot evaluate markers; file missing"
    } else {
        Add-Result "PWA: content loadable" $true ""

        $hasOffline = [regex]::IsMatch($pwa, '(?i)\boffline\b')
        Add-Result "PWA: offline" $hasOffline $(
            if (-not $hasOffline) {
                "Expected offline / read-only offline (D4) UX"
            } else { "" }
        )

        $hasServiceWorker =
            [regex]::IsMatch($pwa, '(?i)\bworkbox\b') -or
            [regex]::IsMatch($pwa, '(?i)service[\s_-]?worker') -or
            [regex]::IsMatch($pwa, '(?i)\bserwist\b') -or
            [regex]::IsMatch($pwa, '(?i)@serwist/next') -or
            [regex]::IsMatch($pwa, '(?i)\bsw\.js\b') -or
            [regex]::IsMatch($pwa, '(?i)serviceWorker')
        Add-Result "PWA: workbox or service worker" $hasServiceWorker $(
            if (-not $hasServiceWorker) {
                "Expected workbox, service worker, serwist, or sw.js"
            } else { "" }
        )

        $hasSearch = [regex]::IsMatch($pwa, '(?i)\bsearch\b')
        Add-Result "PWA: search" $hasSearch $(
            if (-not $hasSearch) {
                "Expected global search (header / mobile sheet)"
            } else { "" }
        )

        $hasPerformance =
            [regex]::IsMatch($pwa, '(?i)\bperformance\b') -or
            [regex]::IsMatch($pwa, '(?i)performance\.now') -or
            [regex]::IsMatch($pwa, '(?i)\bperf[-_]?budget')
        Add-Result "PWA: performance" $hasPerformance $(
            if (-not $hasPerformance) {
                "Expected performance / performance.now / perf-budget coverage"
            } else { "" }
        )

        $hasBudget =
            [regex]::IsMatch($pwa, '(?i)\bbudget') -or
            [regex]::IsMatch($pwa, '(?i)budgets\.ts') -or
            [regex]::IsMatch($pwa, '(?i)perf-budgets')
        Add-Result "PWA: budget" $hasBudget $(
            if (-not $hasBudget) {
                "Expected performance budget(s) / budgets.ts / perf-budgets.spec"
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

function Get-MinimalAdminPassFixture {
    return @"
## NOTES
- New admin tRPC router; every procedure uses adminProcedure.
- Invites create/revoke; portionCategories editor; familySettings.athleteMultiplier; audit.list.

### FILE: apps/web/src/server/routers/admin.ts
``````ts
import { createTRPCRouter, adminProcedure } from '../trpc';

export const adminRouter = createTRPCRouter({
  invites: createTRPCRouter({
    list: adminProcedure.query(async () => []),
    create: adminProcedure.mutation(async () => ({ id: '1' })),
    revoke: adminProcedure.mutation(async () => ({ ok: true })),
  }),
  portionCategories: createTRPCRouter({
    list: adminProcedure.query(async () => []),
  }),
  familySettings: createTRPCRouter({
    get: adminProcedure.query(async () => ({ athleteMultiplier: 1.5 })),
    update: adminProcedure.mutation(async () => ({ athleteMultiplier: 1.5 })),
  }),
  audit: createTRPCRouter({
    list: adminProcedure.query(async () => ({ rows: [], total: 0 })),
  }),
});
``````

### FILE: packages/schemas/src/admin.ts
``````ts
export const athleteMultiplierSchema = { positive: true };
``````
"@
}

function Get-MinimalPwaPassFixture {
    return @"
## NOTES
- D4 read-only offline via @serwist/next service worker (Workbox-compatible).
- Global search across recipes/chefIdeas; performance budgets in e2e/budgets.ts.

### FILE: apps/web/public/sw.js
``````js
// service worker registration fallback; offline cache for read paths only
self.addEventListener('fetch', () => {});
``````

### FILE: apps/web/src/components/search/GlobalSearch.tsx
``````tsx
export function GlobalSearch() {
  return <input data-testid="global-search" placeholder="Search" />;
}
``````

### FILE: apps/web/e2e/budgets.ts
``````ts
export const PERF_BUDGETS = {
  P1_calendar_interactive_ms: 1500,
  P4_search_results_ms: 500,
};
``````

### FILE: apps/web/e2e/perf-budgets.spec.ts
``````ts
import { test } from '@playwright/test';
import { PERF_BUDGETS } from './budgets';
test('performance budget P1', async () => {
  const t0 = performance.now();
  void PERF_BUDGETS;
  void t0;
});
``````
"@
}

function Get-MinimalAdminFailFixture {
    return @"
## NOTES
- Intentionally incomplete admin draft for self-test

### FILE: apps/web/src/components/broken.tsx
``````tsx
export function Broken() { return null; }
``````
"@
}

function Get-MinimalPwaFailFixture {
    return @"
## NOTES
- Intentionally incomplete PWA draft for self-test

### FILE: apps/web/src/app/empty/page.tsx
``````tsx
export default function Empty() { return <div>empty</div>; }
``````
"@
}

function Invoke-SelfTest {
    Write-Host ""
    Write-Host "=== Self-test: Wave 3 Admin + PWA verifier (Tasks 15-16) ===" -ForegroundColor Cyan

    $tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("wave3-admin-pwa-verify-" + [guid]::NewGuid().ToString("N"))
    $passDir = Join-Path $tempRoot "pass"
    $failDir = Join-Path $tempRoot "fail"
    New-Item -ItemType Directory -Force -Path $passDir | Out-Null
    New-Item -ItemType Directory -Force -Path $failDir | Out-Null

    try {
        $adminPass = (Get-MinimalAdminPassFixture) -replace '``````', '```'
        $pwaPass   = (Get-MinimalPwaPassFixture) -replace '``````', '```'
        Set-Content -LiteralPath (Join-Path $passDir "grok_out_admin_screens.md") -Value $adminPass -Encoding UTF8
        Set-Content -LiteralPath (Join-Path $passDir "grok_out_pwa_search_perf.md") -Value $pwaPass -Encoding UTF8

        $adminFail = (Get-MinimalAdminFailFixture) -replace '``````', '```'
        $pwaFail   = (Get-MinimalPwaFailFixture) -replace '``````', '```'
        Set-Content -LiteralPath (Join-Path $failDir "grok_out_admin_screens.md") -Value $adminFail -Encoding UTF8
        Set-Content -LiteralPath (Join-Path $failDir "grok_out_pwa_search_perf.md") -Value $pwaFail -Encoding UTF8

        Write-Host ""
        Write-Host "--- Pass fixture ---" -ForegroundColor Cyan
        $passResult = Test-Wave3AdminPwa -DraftsPath $passDir -Label "PASS-FIXTURE"

        Write-Host ""
        Write-Host "--- Fail fixture ---" -ForegroundColor Cyan
        $failResult = Test-Wave3AdminPwa -DraftsPath $failDir -Label "FAIL-FIXTURE"

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

$outcome = Test-Wave3AdminPwa -DraftsPath $draftsFull

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
