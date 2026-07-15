#Requires -Version 5.1
<#
.SYNOPSIS
  Verifies MenuBoss Task 10 (mealPlan backend) draft output.

.DESCRIPTION
  Exit 0 if all checks pass; exit 1 if any check fails.
  Validates presence and key markers for:
    - drafts/grok_out_mealplan_router.md

  Checks (coordinator / tester brief):
    - ### FILE headers: 0004_meal_plan_rpc.sql, meal_plan_rpc.test.sql,
      mealPlan.ts schema, mealPlan router, mealPlan.integration.test.ts
    - SECURITY INVOKER present; no SECURITY DEFINER (usage)
    - meal_plan_create_or_update
    - portion-calc or calculateEffectiveProteinOz
    - softDelete, generateShoppingList, share, unshare
    - skipIf or DATABASE_URL (integration test env-guard)
    - No .js relative import suffixes in TypeScript fenced blocks

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

function Test-HasFileHeader {
    param(
        [string]$Content,
        [string]$PathFragment
    )
    $escaped = [regex]::Escape($PathFragment)
    $exact = [regex]::IsMatch($Content, ('(?m)^###\s+FILE:\s*.*' + $escaped + '.*$'))
    $loose = $Content -like "*### FILE: *$PathFragment*"
    return ($exact -or $loose)
}

function Test-HasSecurityDefinerUsage {
    param([string]$Content)
    # Fail only on actual SECURITY DEFINER usage, not NOTES that ban it
    foreach ($line in ($Content -split "`n")) {
        if ($line -notmatch '(?i)SECURITY\s+DEFINER') { continue }
        $isNegation =
            ($line -match '(?i)(no|not|never|without|avoid|forbid|disallow|ban|must\s+not|do\s+not|don''t).{0,60}SECURITY\s+DEFINER') -or
            ($line -match '(?i)SECURITY\s+DEFINER.{0,60}(never|not\s+used|not\s+allowed|forbidden|disallowed|banned|must\s+not)')
        if ($isNegation) { continue }
        $detail = $line.Trim()
        if ($detail.Length -gt 120) { $detail = $detail.Substring(0, 120) + "..." }
        return @{ Found = $true; Detail = $detail }
    }
    return @{ Found = $false; Detail = "" }
}

function Get-TypeScriptFencedBlocks {
    param([string]$Content)
    $blocks = New-Object System.Collections.Generic.List[string]
    # Match ```ts / ```typescript / ```tsx fenced blocks (case-insensitive language tag)
    $rx = [regex]::new('(?is)```(?:ts|typescript|tsx)\s*\n(.*?)```')
    foreach ($m in $rx.Matches($Content)) {
        $blocks.Add($m.Groups[1].Value) | Out-Null
    }
    return $blocks
}

function Test-JsRelativeImportSuffixes {
    param([string]$Content)
    $blocks = Get-TypeScriptFencedBlocks -Content $Content
    $hits = New-Object System.Collections.Generic.List[string]
    # Relative imports/exports ending in .js (Turbopack requires extensionless relative imports)
    $importRx = [regex]::new("(?m)(?:from|import)\s+['\`"](\.[^'\`"]*\.js)['\`"]")
    $exportRx = [regex]::new("(?m)export\s+[^;]*?\s+from\s+['\`"](\.[^'\`"]*\.js)['\`"]")
    $dynamicRx = [regex]::new("(?m)import\s*\(\s*['\`"](\.[^'\`"]*\.js)['\`"]\s*\)")
    $i = 0
    foreach ($block in $blocks) {
        $i++
        foreach ($rx in @($importRx, $exportRx, $dynamicRx)) {
            foreach ($m in $rx.Matches($block)) {
                $hits.Add(("block#{0}: {1}" -f $i, $m.Groups[1].Value)) | Out-Null
            }
        }
    }
    return $hits
}

function Test-MealPlanRouter {
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

    $draftPath = Join-Path $DraftsPath "grok_out_mealplan_router.md"

    # =========================================================================
    # File presence
    # =========================================================================
    $exists = Test-Path -LiteralPath $draftPath
    Add-Result "MEALPLAN: file exists (grok_out_mealplan_router.md)" $exists $(
        if (-not $exists) { "Missing: $draftPath" } else { $draftPath }
    )

    $content = Get-NormalizedContent -FilePath $draftPath
    if ($null -eq $content) {
        Add-Result "MEALPLAN: content loadable" $false "Cannot evaluate markers; file missing"
    } else {
        Add-Result "MEALPLAN: content loadable" $true ""

        # -----------------------------------------------------------------
        # ### FILE headers (required deliverables)
        # -----------------------------------------------------------------
        $requiredFileFragments = @(
            @{
                Name      = "0004_meal_plan_rpc.sql"
                Fragments = @(
                    "0004_meal_plan_rpc.sql",
                    "migrations/0004_meal_plan_rpc.sql"
                )
            },
            @{
                Name      = "meal_plan_rpc.test.sql"
                Fragments = @(
                    "meal_plan_rpc.test.sql",
                    "tests/functions/meal_plan_rpc.test.sql"
                )
            },
            @{
                Name      = "mealPlan.ts schema"
                Fragments = @(
                    "packages/schemas/src/mealPlan.ts",
                    "schemas/src/mealPlan.ts",
                    "src/mealPlan.ts"
                )
            },
            @{
                Name      = "mealPlan router"
                Fragments = @(
                    "routers/mealPlan.ts",
                    "server/routers/mealPlan.ts",
                    "apps/web/src/server/routers/mealPlan.ts"
                )
            },
            @{
                Name      = "mealPlan.integration.test.ts"
                Fragments = @(
                    "mealPlan.integration.test.ts",
                    "__tests__/mealPlan.integration.test.ts",
                    "routers/__tests__/mealPlan.integration.test.ts"
                )
            }
        )

        foreach ($req in $requiredFileFragments) {
            $matched = $false
            $matchedFrag = ""
            foreach ($frag in $req.Fragments) {
                if (Test-HasFileHeader -Content $content -PathFragment $frag) {
                    $matched = $true
                    $matchedFrag = $frag
                    break
                }
            }
            # Looser: ### FILE line that names the logical deliverable
            if (-not $matched) {
                $nameEsc = [regex]::Escape($req.Name)
                if ([regex]::IsMatch($content, ('(?mi)^###\s+FILE:.*' + $nameEsc))) {
                    $matched = $true
                    $matchedFrag = $req.Name
                }
            }
            # mealPlan schema: accept mealPlan.ts under packages/schemas even if path order varies
            if (-not $matched -and $req.Name -eq "mealPlan.ts schema") {
                if ([regex]::IsMatch($content, '(?mi)^###\s+FILE:.*mealPlan\.ts') -and
                    [regex]::IsMatch($content, '(?mi)^###\s+FILE:.*(schemas|packages/schemas).*mealPlan\.ts|mealPlan\.ts.*(schema)?')) {
                    # Prefer a FILE header that is clearly the schema (not the router)
                    $schemaFileHits = [regex]::Matches(
                        $content,
                        '(?mi)^###\s+FILE:\s*.*(packages/schemas|schemas/src).*(mealPlan\.ts)|mealPlan\.ts'
                    )
                    foreach ($h in $schemaFileHits) {
                        if ($h.Value -match '(?i)schemas' -and $h.Value -notmatch '(?i)router|routers|integration') {
                            $matched = $true
                            $matchedFrag = $h.Value.Trim()
                            break
                        }
                    }
                }
                if (-not $matched -and (Test-HasFileHeader -Content $content -PathFragment "mealPlan.ts")) {
                    # Disambiguate: require schemas path somewhere on the FILE line
                    if ([regex]::IsMatch($content, '(?mi)^###\s+FILE:\s*.*schemas.*mealPlan\.ts')) {
                        $matched = $true
                        $matchedFrag = "schemas ... mealPlan.ts"
                    }
                }
            }
            Add-Result ("MEALPLAN: ### FILE header covers {0}" -f $req.Name) $matched $(
                if (-not $matched) {
                    "Expected ### FILE header for one of: $($req.Fragments -join ', ')"
                } else {
                    "Matched: $matchedFrag"
                }
            )
        }

        # -----------------------------------------------------------------
        # Security: INVOKER required; DEFINER forbidden (usage)
        # -----------------------------------------------------------------
        $hasInvoker = [regex]::IsMatch($content, '(?i)SECURITY\s+INVOKER')
        Add-Result "MEALPLAN: SECURITY INVOKER present" $hasInvoker $(
            if (-not $hasInvoker) {
                "Expected SECURITY INVOKER on meal_plan_create_or_update RPC"
            } else { "" }
        )

        $definer = Test-HasSecurityDefinerUsage -Content $content
        Add-Result "MEALPLAN: no SECURITY DEFINER" (-not $definer.Found) $(
            if ($definer.Found) {
                "RPC must not bypass RLS - remove SECURITY DEFINER (found: $($definer.Detail))"
            } else { "" }
        )

        # -----------------------------------------------------------------
        # Core RPC name
        # -----------------------------------------------------------------
        $hasRpc = [regex]::IsMatch($content, '(?i)meal_plan_create_or_update')
        Add-Result "MEALPLAN: meal_plan_create_or_update" $hasRpc $(
            if (-not $hasRpc) {
                "Expected meal_plan_create_or_update RPC name"
            } else { "" }
        )

        # -----------------------------------------------------------------
        # Portion-calc client of record for display math
        # -----------------------------------------------------------------
        $hasPortion =
            [regex]::IsMatch($content, '(?i)portion-calc') -or
            [regex]::IsMatch($content, '(?i)@menu-boss/portion-calc') -or
            [regex]::IsMatch($content, '(?i)calculateEffectiveProteinOz')
        Add-Result "MEALPLAN: portion-calc or calculateEffectiveProteinOz" $hasPortion $(
            if (-not $hasPortion) {
                "Expected @menu-boss/portion-calc and/or calculateEffectiveProteinOz for effectiveProteinOz"
            } else { "" }
        )

        # -----------------------------------------------------------------
        # Router procedures
        # -----------------------------------------------------------------
        $hasSoftDelete =
            [regex]::IsMatch($content, '(?i)softDelete') -or
            [regex]::IsMatch($content, '(?i)soft_delete')
        Add-Result "MEALPLAN: softDelete" $hasSoftDelete $(
            if (-not $hasSoftDelete) {
                "Expected softDelete procedure (sets deleted_at)"
            } else { "" }
        )

        $hasShopping = [regex]::IsMatch($content, '(?i)generateShoppingList')
        Add-Result "MEALPLAN: generateShoppingList" $hasShopping $(
            if (-not $hasShopping) {
                "Expected generateShoppingList procedure"
            } else { "" }
        )

        $hasShare = [regex]::IsMatch($content, '(?i)\bshare\b')
        Add-Result "MEALPLAN: share" $hasShare $(
            if (-not $hasShare) {
                "Expected share procedure (meal_plan_household insert)"
            } else { "" }
        )

        $hasUnshare = [regex]::IsMatch($content, '(?i)\bunshare\b')
        Add-Result "MEALPLAN: unshare" $hasUnshare $(
            if (-not $hasUnshare) {
                "Expected unshare procedure (meal_plan_household delete)"
            } else { "" }
        )

        # -----------------------------------------------------------------
        # Integration test env-guard (skipIf / DATABASE_URL)
        # -----------------------------------------------------------------
        $hasSkipGuard =
            [regex]::IsMatch($content, '(?i)skipIf') -or
            [regex]::IsMatch($content, '(?i)DATABASE_URL')
        Add-Result "MEALPLAN: skipIf or DATABASE_URL (integration guard)" $hasSkipGuard $(
            if (-not $hasSkipGuard) {
                "Expected describe.skipIf(!process.env.DATABASE_URL) or DATABASE_URL env guard"
            } else { "" }
        )

        # -----------------------------------------------------------------
        # No .js relative import suffixes in TS/TSX fenced blocks
        # -----------------------------------------------------------------
        # Force array: empty List from function is unwrapped to $null by PowerShell
        $jsHits = @(Test-JsRelativeImportSuffixes -Content $content)
        $noJsSuffix = ($jsHits.Count -eq 0)
        Add-Result "MEALPLAN: no .js relative import suffixes in TS blocks" $noJsSuffix $(
            if (-not $noJsSuffix) {
                $examples = ($jsHits | Select-Object -First 5) -join "; "
                "Turbopack requires extensionless relative imports (found: $examples)"
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

function Get-MinimalMealPlanPassFixture {
    return @"
## NOTES
- Wave 2 mealPlan write path via SECURITY INVOKER RPC (no SECURITY DEFINER).
- Display protein uses @menu-boss/portion-calc calculateEffectiveProteinOz.

### FILE: supabase/migrations/0004_meal_plan_rpc.sql
``````sql
CREATE OR REPLACE FUNCTION meal_plan_create_or_update(p_payload jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS `$`$
BEGIN
  RETURN NULL;
END;
`$`$;
``````

### FILE: supabase/tests/functions/meal_plan_rpc.test.sql
``````sql
-- pgTAP: meal_plan_create_or_update reconciliation
SELECT plan(1);
SELECT ok(true, 'placeholder');
SELECT * FROM finish();
``````

### FILE: packages/schemas/src/mealPlan.ts
``````ts
import { z } from 'zod';
import { uuid } from './common';

export const mealPlanUpsertInput = z.object({
  title: z.string().min(1),
  startDate: z.string(),
  endDate: z.string(),
  householdIds: z.array(uuid),
});
``````

### FILE: apps/web/src/server/routers/mealPlan.ts
``````ts
import { authedProcedure, router } from '../trpc';
import { mealPlanUpsertInput } from '@menu-boss/schemas';
import { calculateEffectiveProteinOz } from '@menu-boss/portion-calc';

export const mealPlanRouter = router({
  upsert: authedProcedure.input(mealPlanUpsertInput).mutation(async ({ ctx, input }) => {
    const { data, error } = await ctx.supabase.rpc('meal_plan_create_or_update', {
      p_payload: input,
    });
    if (error) throw error;
    return data;
  }),
  softDelete: authedProcedure.mutation(async () => ({ deleted_at: new Date().toISOString() })),
  generateShoppingList: authedProcedure.query(async () => []),
  share: authedProcedure.mutation(async () => ({})),
  unshare: authedProcedure.mutation(async () => ({})),
  byId: authedProcedure.query(async () => {
    const effectiveProteinOz = calculateEffectiveProteinOz({
      categories: [],
      settings: { athleteMultiplier: 1.5 },
      requirements: [],
    });
    return { effectiveProteinOz, isShared: false };
  }),
});
``````

### FILE: apps/web/src/server/routers/__tests__/mealPlan.integration.test.ts
``````ts
import { describe, it, expect } from 'vitest';

const databaseUrl = process.env.DATABASE_URL;

describe.skipIf(!databaseUrl)('mealPlan integration', () => {
  it('upsert creates four tables rows', async () => {
    expect(true).toBe(true);
  });
});
``````
"@
}

function Get-MinimalMealPlanFailFixture {
    return @"
## NOTES
- Intentionally incomplete / forbidden markers for self-test

### FILE: supabase/migrations/0003_functions.sql
``````sql
CREATE FUNCTION meal_plan_broken() LANGUAGE sql SECURITY DEFINER AS 'SELECT 1';
``````

### FILE: apps/web/src/server/routers/something.ts
``````ts
import { x } from './other.js';
export const broken = x;
``````
"@
}

function Invoke-SelfTest {
    Write-Host ""
    Write-Host "=== Self-test: MealPlan Router verifier ===" -ForegroundColor Cyan

    $tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("mealplan-verify-" + [guid]::NewGuid().ToString("N"))
    $passDir = Join-Path $tempRoot "pass"
    $failDir = Join-Path $tempRoot "fail"
    New-Item -ItemType Directory -Force -Path $passDir | Out-Null
    New-Item -ItemType Directory -Force -Path $failDir | Out-Null

    try {
        $passBody = (Get-MinimalMealPlanPassFixture) -replace '``````', '```'
        $failBody = (Get-MinimalMealPlanFailFixture) -replace '``````', '```'
        Set-Content -LiteralPath (Join-Path $passDir "grok_out_mealplan_router.md") -Value $passBody -Encoding UTF8
        Set-Content -LiteralPath (Join-Path $failDir "grok_out_mealplan_router.md") -Value $failBody -Encoding UTF8

        Write-Host ""
        Write-Host "--- Pass fixture ---" -ForegroundColor Cyan
        $passResult = Test-MealPlanRouter -DraftsPath $passDir -Label "PASS-FIXTURE"

        Write-Host ""
        Write-Host "--- Fail fixture ---" -ForegroundColor Cyan
        $failResult = Test-MealPlanRouter -DraftsPath $failDir -Label "FAIL-FIXTURE"

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

$outcome = Test-MealPlanRouter -DraftsPath $draftsFull

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
