#Requires -Version 5.1
<#
.SYNOPSIS
  Verifies MenuBoss Task 08 (Zod schemas + content routers) and Task 09 (SQL aggregation functions) draft outputs.

.DESCRIPTION
  Exit 0 if all checks pass; exit 1 if any check fails.
  Validates presence and key markers for:
    - drafts/grok_out_content_routers.md
    - drafts/grok_out_sql_functions.md

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
    # Accept exact ### FILE: line or a looser substring match (implementers may group packages)
    $escaped = [regex]::Escape($PathFragment)
    $exact = [regex]::IsMatch($Content, ('(?m)^###\s+FILE:\s*.*' + $escaped + '.*$'))
    $loose = $Content -like "*### FILE: *$PathFragment*"
    return ($exact -or $loose)
}

function Test-ContentRoutersAndSql {
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

    $routersPath = Join-Path $DraftsPath "grok_out_content_routers.md"
    $sqlPath     = Join-Path $DraftsPath "grok_out_sql_functions.md"

    # =========================================================================
    # Task 08 - Zod schemas + content routers draft
    # =========================================================================
    $routersExists = Test-Path -LiteralPath $routersPath
    Add-Result "ROUTERS: file exists (grok_out_content_routers.md)" $routersExists $(
        if (-not $routersExists) { "Missing: $routersPath" } else { $routersPath }
    )

    $routers = Get-NormalizedContent -FilePath $routersPath
    if ($null -eq $routers) {
        Add-Result "ROUTERS: content loadable" $false "Cannot evaluate markers; file missing"
    } else {
        Add-Result "ROUTERS: content loadable" $true ""

        # FILE headers required by coordinator brief / tester brief
        $requiredFileFragments = @(
            @{ Name = "packages/schemas";         Fragments = @("packages/schemas") },
            @{ Name = "trpc.ts";                  Fragments = @("trpc.ts", "server/trpc.ts") },
            @{ Name = "recipe router";            Fragments = @("routers/recipe.ts", "routers/recipe", "recipe.ts") },
            @{ Name = "ingredient router";        Fragments = @("routers/ingredient.ts", "routers/ingredient", "ingredient.ts") },
            @{ Name = "_app.ts";                  Fragments = @("_app.ts", "routers/_app.ts") },
            @{ Name = "schemas.test.ts";          Fragments = @("schemas.test.ts", "__tests__/schemas.test.ts") }
        )

        foreach ($req in $requiredFileFragments) {
            $matched = $false
            $matchedFrag = ""
            foreach ($frag in $req.Fragments) {
                if (Test-HasFileHeader -Content $routers -PathFragment $frag) {
                    $matched = $true
                    $matchedFrag = $frag
                    break
                }
            }
            # Also accept ### FILE headers that mention the logical deliverable even if path shape varies
            if (-not $matched) {
                $nameEsc = [regex]::Escape($req.Name)
                if ([regex]::IsMatch($routers, ('(?mi)^###\s+FILE:.*' + $nameEsc))) {
                    $matched = $true
                    $matchedFrag = $req.Name
                }
            }
            Add-Result ("ROUTERS: ### FILE header covers {0}" -f $req.Name) $matched $(
                if (-not $matched) {
                    "Expected ### FILE header for one of: $($req.Fragments -join ', ')"
                } else {
                    "Matched: $matchedFrag"
                }
            )
        }

        # Soft-delete semantics: softDelete procedure and/or deleted_at column usage
        $hasSoftDelete = [regex]::IsMatch($routers, '(?i)softDelete') -or
            [regex]::IsMatch($routers, '(?i)soft_delete') -or
            [regex]::IsMatch($routers, '(?i)deleted_at')
        Add-Result "ROUTERS: softDelete or deleted_at present" $hasSoftDelete $(
            if (-not $hasSoftDelete) {
                "Expected softDelete procedure and/or deleted_at filter/column"
            } else { "" }
        )

        # mealPlan is Wave 2 - must NOT appear as a main deliverable ### FILE
        # Flag ### FILE lines that look like a mealPlan router (or mealPlan.create as a FILE header)
        $mealPlanFileHits = [regex]::Matches(
            $routers,
            '(?mi)^###\s+FILE:\s*.*(mealPlan\.create|meal[_-]?plan\.create|routers/mealPlan|routers/meal_plan|mealPlan\.ts|meal_plan\.ts|mealPlan/|/mealPlan\b).*'
        )
        $hasMealPlanFile = $mealPlanFileHits.Count -gt 0
        Add-Result "ROUTERS: no mealPlan router as ### FILE deliverable" (-not $hasMealPlanFile) $(
            if ($hasMealPlanFile) {
                $examples = ($mealPlanFileHits | ForEach-Object { $_.Value.Trim() } | Select-Object -First 3) -join "; "
                "mealPlan is Wave 2 - remove as main ### FILE (found: $examples)"
            } else { "" }
        )
    }

    # =========================================================================
    # Task 09 - SQL aggregation functions draft
    # =========================================================================
    $sqlExists = Test-Path -LiteralPath $sqlPath
    Add-Result "SQL: file exists (grok_out_sql_functions.md)" $sqlExists $(
        if (-not $sqlExists) { "Missing: $sqlPath" } else { $sqlPath }
    )

    $sql = Get-NormalizedContent -FilePath $sqlPath
    if ($null -eq $sql) {
        Add-Result "SQL: content loadable" $false "Cannot evaluate markers; file missing"
    } else {
        Add-Result "SQL: content loadable" $true ""

        $has0003 = Test-HasFileHeader -Content $sql -PathFragment "0003_functions.sql"
        if (-not $has0003) {
            $has0003 = [regex]::IsMatch($sql, '(?i)0003_functions\.sql')
        }
        Add-Result "SQL: ### FILE / path 0003_functions.sql" $has0003 $(
            if (-not $has0003) { "Expected ### FILE: supabase/migrations/0003_functions.sql" } else { "" }
        )

        $hasShopping = [regex]::IsMatch($sql, '(?i)generate_shopping_list')
        Add-Result "SQL: generate_shopping_list" $hasShopping $(
            if (-not $hasShopping) { "Expected generate_shopping_list function" } else { "" }
        )

        $hasWeeklyProtein = [regex]::IsMatch($sql, '(?i)weekly_protein')
        Add-Result "SQL: weekly_protein (rollup/total)" $hasWeeklyProtein $(
            if (-not $hasWeeklyProtein) {
                "Expected weekly_protein_rollup and/or weekly_protein_total"
            } else { "" }
        )

        $hasInvoker = [regex]::IsMatch($sql, '(?i)SECURITY\s+INVOKER')
        Add-Result "SQL: SECURITY INVOKER present" $hasInvoker $(
            if (-not $hasInvoker) { "Expected SECURITY INVOKER on sanctioned functions" } else { "" }
        )

        # Fail only on actual SECURITY DEFINER usage, not NOTES that ban it
        # ("No SECURITY DEFINER", "never ... SECURITY DEFINER", etc. are OK)
        $hasDefiner = $false
        $definerDetail = ""
        foreach ($line in ($sql -split "`n")) {
            if ($line -notmatch '(?i)SECURITY\s+DEFINER') { continue }
            $isNegation =
                ($line -match '(?i)(no|not|never|without|avoid|forbid|disallow|ban|must\s+not|do\s+not|don''t).{0,60}SECURITY\s+DEFINER') -or
                ($line -match '(?i)SECURITY\s+DEFINER.{0,60}(never|not\s+used|not\s+allowed|forbidden|disallowed|banned|must\s+not)')
            if ($isNegation) { continue }
            $hasDefiner = $true
            $definerDetail = $line.Trim()
            if ($definerDetail.Length -gt 120) { $definerDetail = $definerDetail.Substring(0, 120) + "..." }
            break
        }
        Add-Result "SQL: no SECURITY DEFINER" (-not $hasDefiner) $(
            if ($hasDefiner) {
                "Functions must not bypass RLS - remove SECURITY DEFINER (found: $definerDetail)"
            } else { "" }
        )

        $hasAggTest = Test-HasFileHeader -Content $sql -PathFragment "aggregation.test.sql"
        if (-not $hasAggTest) {
            $hasAggTest = [regex]::IsMatch($sql, '(?i)aggregation\.test\.sql')
        }
        Add-Result "SQL: aggregation.test.sql" $hasAggTest $(
            if (-not $hasAggTest) {
                "Expected ### FILE: supabase/tests/functions/aggregation.test.sql (or path reference)"
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

function Get-MinimalRoutersPassFixture {
    return @"
## NOTES
- Wave 1 content routers only; mealPlan deferred to Wave 2

### FILE: packages/schemas/package.json
``````json
{ "name": "@menu-boss/schemas", "dependencies": { "zod": "^3.23.0" } }
``````

### FILE: packages/schemas/src/common.ts
``````ts
import { z } from 'zod';
export const uuid = z.string().uuid();
``````

### FILE: apps/web/src/server/trpc.ts
``````ts
import { initTRPC, TRPCError } from '@trpc/server';
export const t = initTRPC.context<{ supabase: unknown; session: unknown }>().create();
export const authedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.session) throw new TRPCError({ code: 'UNAUTHORIZED' });
  return next({ ctx });
});
``````

### FILE: apps/web/src/server/routers/recipe.ts
``````ts
export const recipeRouter = {
  list: async () => [],
  byId: async () => null,
  create: async () => ({}),
  softDelete: async ({ input }) => {
    // sets deleted_at; browse filters deleted_at IS NULL
    return { deleted_at: new Date().toISOString() };
  },
};
``````

### FILE: apps/web/src/server/routers/ingredient.ts
``````ts
export const ingredientRouter = {
  list: async () => [],
  create: async () => ({}),
  softDelete: async () => ({ deleted_at: new Date().toISOString() }),
};
``````

### FILE: apps/web/src/server/routers/_app.ts
``````ts
import { recipeRouter } from './recipe';
import { ingredientRouter } from './ingredient';
export const appRouter = { recipe: recipeRouter, ingredient: ingredientRouter };
``````

### FILE: apps/web/src/server/routers/__tests__/schemas.test.ts
``````ts
import { describe, it, expect } from 'vitest';
describe('schemas', () => {
  it('rejects empty combination', () => { expect(true).toBe(true); });
});
``````
"@
}

function Get-MinimalSqlPassFixture {
    return @"
## NOTES
- SECURITY INVOKER only; no DEFINER

### FILE: supabase/migrations/0003_functions.sql
``````sql
CREATE OR REPLACE FUNCTION generate_shopping_list(p_meal_plan_ids uuid[])
RETURNS TABLE (
  ingredient_id uuid,
  ingredient_name text,
  dimension text,
  total_quantity_base numeric,
  is_optional boolean,
  category_name text,
  source_recipe_ids uuid[],
  includes_deleted_recipe boolean
)
LANGUAGE sql
STABLE
SECURITY INVOKER
AS 'SELECT NULL::uuid WHERE false';

CREATE OR REPLACE FUNCTION weekly_protein_rollup(p_start date, p_end date)
RETURNS TABLE (
  meal_plan_id uuid,
  title text,
  start_date date,
  end_date date,
  effective_protein_oz numeric
)
LANGUAGE sql
STABLE
SECURITY INVOKER
AS 'SELECT NULL::uuid WHERE false';
``````

### FILE: supabase/tests/functions/aggregation.test.sql
``````sql
-- pgTAP smoke: generate_shopping_list + weekly_protein_rollup
SELECT plan(1);
SELECT ok(true, 'placeholder');
SELECT * FROM finish();
``````
"@
}

function Invoke-SelfTest {
    Write-Host ""
    Write-Host "=== Self-test: Content Routers + SQL Functions verifier ===" -ForegroundColor Cyan

    $tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("content-sql-verify-" + [guid]::NewGuid().ToString("N"))
    $passDir = Join-Path $tempRoot "pass"
    $failDir = Join-Path $tempRoot "fail"
    New-Item -ItemType Directory -Force -Path $passDir | Out-Null
    New-Item -ItemType Directory -Force -Path $failDir | Out-Null

    try {
        $routersPass = (Get-MinimalRoutersPassFixture) -replace '``````', '```'
        $sqlPass = (Get-MinimalSqlPassFixture) -replace '``````', '```'
        Set-Content -LiteralPath (Join-Path $passDir "grok_out_content_routers.md") -Value $routersPass -Encoding UTF8
        Set-Content -LiteralPath (Join-Path $passDir "grok_out_sql_functions.md") -Value $sqlPass -Encoding UTF8

        # Fail fixtures: missing required markers + forbidden mealPlan FILE + SECURITY DEFINER
        $routersFail = @"
### FILE: apps/web/src/server/routers/mealPlan.ts
``````ts
export const mealPlanRouter = { create: async () => ({}) };
``````

### FILE: apps/web/src/server/routers/mealPlan.create
``````ts
// should not be a deliverable FILE
``````
"@
        $routersFail = $routersFail -replace '``````', '```'
        $sqlFail = @"
### FILE: supabase/migrations/0003_functions.sql
``````sql
CREATE FUNCTION something() LANGUAGE sql SECURITY DEFINER AS 'SELECT 1';
``````
"@
        $sqlFail = $sqlFail -replace '``````', '```'
        Set-Content -LiteralPath (Join-Path $failDir "grok_out_content_routers.md") -Value $routersFail -Encoding UTF8
        Set-Content -LiteralPath (Join-Path $failDir "grok_out_sql_functions.md") -Value $sqlFail -Encoding UTF8

        Write-Host ""
        Write-Host "--- Pass fixture ---" -ForegroundColor Cyan
        $passResult = Test-ContentRoutersAndSql -DraftsPath $passDir -Label "PASS-FIXTURE"

        Write-Host ""
        Write-Host "--- Fail fixture ---" -ForegroundColor Cyan
        $failResult = Test-ContentRoutersAndSql -DraftsPath $failDir -Label "FAIL-FIXTURE"

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

$outcome = Test-ContentRoutersAndSql -DraftsPath $draftsFull

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
