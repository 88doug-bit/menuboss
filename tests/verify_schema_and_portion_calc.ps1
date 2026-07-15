#Requires -Version 5.1
<#
.SYNOPSIS
  Verifies MenuBoss Task 06 (schema migration + seed) and Task 07 (portion-calc) draft outputs.

.DESCRIPTION
  Exit 0 if all checks pass; exit 1 if any check fails.
  Validates presence and key markers for:
    - drafts/grok_out_schema_migration.md
    - drafts/grok_out_portion_calc.md
  Optionally reports whether packages/portion-calc is materialized (informational when draft-only).

.PARAMETER DraftsDir
  Directory containing the draft files. Default: drafts (relative to repo root).

.PARAMETER SelfTest
  Run built-in fixture tests that validate script logic (pass fixture must pass; fail fixture must fail).

.PARAMETER RepoRoot
  Repository root. Defaults to parent of the tests/ directory containing this script.

.PARAMETER RunPackageTests
  If packages/portion-calc exists with a package.json, attempt to run Vitest (npm/pnpm/npx).
#>
[CmdletBinding()]
param(
    [string]$DraftsDir = "drafts",
    [switch]$SelfTest,
    [string]$RepoRoot = "",
    [switch]$RunPackageTests
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

function Test-SchemaAndPortionCalc {
    param(
        [Parameter(Mandatory = $true)]
        [string]$DraftsPath,
        [string]$Label = "",
        [string]$PackageRoot = ""
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

    $schemaPath  = Join-Path $DraftsPath "grok_out_schema_migration.md"
    $portionPath = Join-Path $DraftsPath "grok_out_portion_calc.md"

    # =========================================================================
    # Task 06 - Schema migration draft
    # =========================================================================
    $schemaExists = Test-Path -LiteralPath $schemaPath
    Add-Result "SCHEMA: file exists (grok_out_schema_migration.md)" $schemaExists $(
        if (-not $schemaExists) { "Missing: $schemaPath" } else { $schemaPath }
    )

    $schema = Get-NormalizedContent -FilePath $schemaPath
    if ($null -eq $schema) {
        Add-Result "SCHEMA: content loadable" $false "Cannot evaluate markers; file missing"
    } else {
        Add-Result "SCHEMA: content loadable" $true ""

        # FILE headers for migration + seed
        $hasMigFile = [regex]::IsMatch($schema, '(?m)^###\s+FILE:\s*supabase/migrations/0001_schema\.sql\s*$') -or
            ($schema -like '*### FILE: supabase/migrations/0001_schema.sql*')
        Add-Result "SCHEMA: ### FILE: supabase/migrations/0001_schema.sql" $hasMigFile $(
            if (-not $hasMigFile) { "Expected ### FILE: supabase/migrations/0001_schema.sql" } else { "" }
        )

        $hasSeedFile = [regex]::IsMatch($schema, '(?m)^###\s+FILE:\s*supabase/seed\.sql\s*$') -or
            ($schema -like '*### FILE: supabase/seed.sql*')
        Add-Result "SCHEMA: ### FILE: supabase/seed.sql" $hasSeedFile $(
            if (-not $hasSeedFile) { "Expected ### FILE: supabase/seed.sql" } else { "" }
        )

        # CREATE TABLE for required entities
        $requiredTables = @(
            "household",
            "profile",
            "ingredient",
            "recipe",
            "meal_plan",
            "meal_plan_household",
            "meal_plan_portion_requirement",
            "unit",
            "portion_category",
            "family_settings",
            "chef_idea",
            "recipe_combination"
        )
        foreach ($table in $requiredTables) {
            # Match CREATE TABLE [IF NOT EXISTS] table_name with optional quoting/schema
            $tableRe = '(?is)CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:"?public"?\.)?"?' + [regex]::Escape($table) + '"?\s*\('
            $hasTable = [regex]::IsMatch($schema, $tableRe)
            Add-Result "SCHEMA: CREATE TABLE $table" $hasTable $(
                if (-not $hasTable) { "Expected CREATE TABLE for $table" } else { "" }
            )
        }

        # Indexes / UUID helpers
        $hasUqIngredient = [regex]::IsMatch($schema, '(?i)uq_ingredient_name')
        Add-Result "SCHEMA: uq_ingredient_name" $hasUqIngredient $(
            if (-not $hasUqIngredient) { "Expected unique index name uq_ingredient_name" } else { "" }
        )

        $hasIdxMph = [regex]::IsMatch($schema, '(?i)idx_mph_household')
        Add-Result "SCHEMA: idx_mph_household" $hasIdxMph $(
            if (-not $hasIdxMph) { "Expected index name idx_mph_household" } else { "" }
        )

        $hasUuidHelper = [regex]::IsMatch($schema, '(?i)gen_random_uuid') -or
            [regex]::IsMatch($schema, '(?i)pgcrypto')
        Add-Result "SCHEMA: gen_random_uuid or pgcrypto" $hasUuidHelper $(
            if (-not $hasUuidHelper) { "Expected gen_random_uuid() and/or pgcrypto extension" } else { "" }
        )

        # 0001 excludes: RLS enable / policies
        $hasRlsEnable = [regex]::IsMatch($schema, '(?i)ENABLE\s+ROW\s+LEVEL\s+SECURITY')
        Add-Result "SCHEMA: no ENABLE ROW LEVEL SECURITY (0001 exclude)" (-not $hasRlsEnable) $(
            if ($hasRlsEnable) { "0001 must not enable RLS (belongs in 0002_security.sql)" } else { "" }
        )

        $hasCreatePolicy = [regex]::IsMatch($schema, '(?i)CREATE\s+POLICY\b')
        Add-Result "SCHEMA: no CREATE POLICY (0001 exclude)" (-not $hasCreatePolicy) $(
            if ($hasCreatePolicy) { "0001 must not CREATE POLICY (belongs in 0002_security.sql)" } else { "" }
        )

        # FamilySettings must not have adult_reference_protein_oz
        $hasAdultRef = [regex]::IsMatch($schema, '(?i)adult_reference_protein_oz')
        Add-Result "SCHEMA: no adult_reference_protein_oz" (-not $hasAdultRef) $(
            if ($hasAdultRef) { "FamilySettings must not include adult_reference_protein_oz" } else { "" }
        )
    }

    # =========================================================================
    # Task 07 - Portion calc package draft
    # =========================================================================
    $portionExists = Test-Path -LiteralPath $portionPath
    Add-Result "PORTION: file exists (grok_out_portion_calc.md)" $portionExists $(
        if (-not $portionExists) { "Missing: $portionPath" } else { $portionPath }
    )

    $portion = Get-NormalizedContent -FilePath $portionPath
    if ($null -eq $portion) {
        Add-Result "PORTION: content loadable" $false "Cannot evaluate markers; file missing"
    } else {
        Add-Result "PORTION: content loadable" $true ""

        # Package file headers
        $pkgFiles = @(
            "packages/portion-calc/package.json",
            "packages/portion-calc/src/index.ts",
            "packages/portion-calc/src/index.test.ts",
            "packages/portion-calc/tsconfig.json",
            "packages/portion-calc/fixtures/contract-fixtures.json"
        )
        foreach ($pf in $pkgFiles) {
            $hasPf = [regex]::IsMatch($portion, ('(?m)^###\s+FILE:\s*' + [regex]::Escape($pf) + '\s*$')) -or
                ($portion -like "*### FILE: $pf*")
            Add-Result "PORTION: ### FILE: $pf" $hasPf $(
                if (-not $hasPf) { "Expected ### FILE: $pf" } else { "" }
            )
        }

        $hasCalc = [regex]::IsMatch($portion, 'calculateEffectiveProteinOz')
        Add-Result "PORTION: calculateEffectiveProteinOz" $hasCalc $(
            if (-not $hasCalc) { "Expected calculateEffectiveProteinOz" } else { "" }
        )

        $hasErr = [regex]::IsMatch($portion, 'PortionCalcError')
        Add-Result "PORTION: PortionCalcError" $hasErr $(
            if (-not $hasErr) { "Expected PortionCalcError (base error class)" } else { "" }
        )

        $hasFixtures = [regex]::IsMatch($portion, 'contract-fixtures\.json')
        Add-Result "PORTION: contract-fixtures.json" $hasFixtures $(
            if (-not $hasFixtures) { "Expected contract-fixtures.json reference/file" } else { "" }
        )

        $hasVitest = [regex]::IsMatch($portion, '(?i)vitest')
        Add-Result "PORTION: vitest" $hasVitest $(
            if (-not $hasVitest) { "Expected vitest (devDependency / test runner)" } else { "" }
        )

        # Worked example: effective protein 15.0 (PRD: adult_male 2 people / 1 athlete, base 6.0, mult 1.5)
        $has15 = [regex]::IsMatch($portion, '(?i)15\.0\b') -or
            [regex]::IsMatch($portion, '(?i)"expectedEffectiveOz"\s*:\s*15(\.0+)?\b') -or
            [regex]::IsMatch($portion, '(?i)toBe\(15(\.0)?\)') -or
            [regex]::IsMatch($portion, '(?i)toEqual\(15(\.0)?\)') -or
            [regex]::IsMatch($portion, '(?i)toBeCloseTo\(\s*15(\.0)?')
        Add-Result "PORTION: worked example expected 15.0 in tests/fixtures" $has15 $(
            if (-not $has15) { "Expected 15.0 in tests or contract-fixtures (worked example)" } else { "" }
        )
    }

    # =========================================================================
    # Optional: materialized packages/portion-calc presence (not a hard fail if draft-only)
    # =========================================================================
    if ($PackageRoot) {
        $matPkg = Join-Path $PackageRoot "packages\portion-calc"
        $matExists = Test-Path -LiteralPath $matPkg
        # Informational only - recorded as pass with detail if missing (draft is source of truth for T06/T07)
        Add-Result "PKG: packages/portion-calc present (optional materialize)" $true $(
            if ($matExists) { "Found: $matPkg" } else { "Not materialized (draft-only OK for this verifier)" }
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

function Get-MinimalSchemaPassFixture {
    return @"
## NOTES
- UUID via pgcrypto / gen_random_uuid()

### FILE: supabase/migrations/0001_schema.sql
``````sql
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE household (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid()
);
CREATE TABLE profile (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid()
);
CREATE TABLE ingredient (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  deleted_at timestamptz
);
CREATE TABLE recipe (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid()
);
CREATE TABLE meal_plan (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid()
);
CREATE TABLE meal_plan_household (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid()
);
CREATE TABLE meal_plan_portion_requirement (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid()
);
CREATE TABLE unit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid()
);
CREATE TABLE portion_category (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid()
);
CREATE TABLE family_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_multiplier numeric NOT NULL
);
CREATE TABLE chef_idea (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid()
);
CREATE TABLE recipe_combination (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid()
);

CREATE UNIQUE INDEX uq_ingredient_name ON ingredient (lower(name)) WHERE deleted_at IS NULL;
CREATE INDEX idx_mph_household ON meal_plan_household (household_id);
``````

### FILE: supabase/seed.sql
``````sql
INSERT INTO unit (id) VALUES ('00000000-0000-0000-0000-000000000001') ON CONFLICT DO NOTHING;
``````
"@
}

function Get-MinimalPortionPassFixture {
    return @"
## NOTES
- Formula reference implementation

### FILE: packages/portion-calc/package.json
``````json
{
  "name": "@menu-boss/portion-calc",
  "type": "module",
  "devDependencies": { "vitest": "^2.0.0" },
  "scripts": { "test": "vitest run", "typecheck": "tsc --noEmit" }
}
``````

### FILE: packages/portion-calc/src/index.ts
``````ts
export class PortionCalcError extends Error {}
export function calculateEffectiveProteinOz(requirements, categories, settings): number {
  return 15.0;
}
``````

### FILE: packages/portion-calc/src/index.test.ts
``````ts
import { describe, it, expect } from 'vitest';
import { calculateEffectiveProteinOz } from './index';

describe('calculateEffectiveProteinOz', () => {
  it('worked example adult_male → 15.0', () => {
    expect(calculateEffectiveProteinOz([], [], { athleteMultiplier: 1.5 })).toBe(15.0);
  });
});
``````

### FILE: packages/portion-calc/tsconfig.json
``````json
{ "compilerOptions": { "strict": true, "target": "ES2022", "isolatedModules": true } }
``````

### FILE: packages/portion-calc/fixtures/contract-fixtures.json
``````json
[
  {
    "name": "worked-example-adult-male",
    "categories": [],
    "settings": { "athleteMultiplier": 1.5 },
    "requirements": [],
    "expectedEffectiveOz": 15.0
  }
]
``````
"@
}

function Invoke-SelfTest {
    Write-Host ""
    Write-Host "=== Self-test: Schema + Portion Calc verifier ===" -ForegroundColor Cyan

    $tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("schema-portion-verify-" + [guid]::NewGuid().ToString("N"))
    $passDir = Join-Path $tempRoot "pass"
    $failDir = Join-Path $tempRoot "fail"
    New-Item -ItemType Directory -Force -Path $passDir | Out-Null
    New-Item -ItemType Directory -Force -Path $failDir | Out-Null

    try {
        # Pass fixtures: minimal content that satisfies all markers
        # Use 4-backtick fences in fixtures so nested sql/ts blocks stay intact in source
        $schemaPass = (Get-MinimalSchemaPassFixture) -replace '``````', '```'
        $portionPass = (Get-MinimalPortionPassFixture) -replace '``````', '```'
        Set-Content -LiteralPath (Join-Path $passDir "grok_out_schema_migration.md") -Value $schemaPass -Encoding UTF8
        Set-Content -LiteralPath (Join-Path $passDir "grok_out_portion_calc.md") -Value $portionPass -Encoding UTF8

        # Fail fixtures: stubs / forbidden markers
        $schemaFail = @"
### FILE: supabase/migrations/0001_schema.sql
``````sql
CREATE TABLE household (id uuid);
ENABLE ROW LEVEL SECURITY;
CREATE POLICY p ON household FOR ALL USING (true);
adult_reference_protein_oz numeric
``````
"@
        $schemaFail = $schemaFail -replace '``````', '```'
        Set-Content -LiteralPath (Join-Path $failDir "grok_out_schema_migration.md") -Value $schemaFail -Encoding UTF8
        "stub" | Set-Content -LiteralPath (Join-Path $failDir "grok_out_portion_calc.md") -Encoding UTF8

        Write-Host ""
        Write-Host "--- Pass fixture ---" -ForegroundColor Cyan
        $passResult = Test-SchemaAndPortionCalc -DraftsPath $passDir -Label "PASS-FIXTURE" -PackageRoot $tempRoot

        Write-Host ""
        Write-Host "--- Fail fixture ---" -ForegroundColor Cyan
        $failResult = Test-SchemaAndPortionCalc -DraftsPath $failDir -Label "FAIL-FIXTURE" -PackageRoot $tempRoot

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

function Invoke-PackageVitest {
    param([string]$Root)

    $pkgDir = Join-Path $Root "packages\portion-calc"
    $pkgJson = Join-Path $pkgDir "package.json"
    if (-not (Test-Path -LiteralPath $pkgJson)) {
        Write-Host "[SKIP] packages/portion-calc not materialized - no Vitest run" -ForegroundColor Yellow
        return [pscustomobject]@{ Ran = $false; Passed = $true; Detail = "not materialized" }
    }

    Write-Host ""
    Write-Host "=== Materialized package: running Vitest ===" -ForegroundColor Cyan
    Write-Host "Package dir: $pkgDir"

    Push-Location $pkgDir
    try {
        $npm = Get-Command npm -ErrorAction SilentlyContinue
        $pnpm = Get-Command pnpm -ErrorAction SilentlyContinue
        $npx = Get-Command npx -ErrorAction SilentlyContinue

        if (Test-Path -LiteralPath (Join-Path $pkgDir "node_modules")) {
            # deps already installed
        } elseif ($pnpm) {
            Write-Host "Installing deps with pnpm..."
            & pnpm install 2>&1 | Out-Host
        } elseif ($npm) {
            Write-Host "Installing deps with npm..."
            & npm install 2>&1 | Out-Host
        } else {
            Write-Host "[SKIP] No npm/pnpm available to install deps" -ForegroundColor Yellow
            return [pscustomobject]@{ Ran = $false; Passed = $true; Detail = "no package manager" }
        }

        $exitCode = 1
        if ($pnpm -and (Test-Path -LiteralPath (Join-Path $pkgDir "package.json"))) {
            & pnpm test 2>&1 | Out-Host
            $exitCode = $LASTEXITCODE
        } elseif ($npm) {
            & npm test 2>&1 | Out-Host
            $exitCode = $LASTEXITCODE
        } elseif ($npx) {
            & npx vitest run 2>&1 | Out-Host
            $exitCode = $LASTEXITCODE
        }

        $ok = ($exitCode -eq 0)
        if ($ok) {
            Write-Host "[PASS] Vitest in packages/portion-calc" -ForegroundColor Green
        } else {
            Write-Host "[FAIL] Vitest in packages/portion-calc (exit $exitCode)" -ForegroundColor Red
        }
        return [pscustomobject]@{ Ran = $true; Passed = $ok; Detail = "exit $exitCode" }
    } finally {
        Pop-Location
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

$outcome = Test-SchemaAndPortionCalc -DraftsPath $draftsFull -PackageRoot $RepoRoot

# Optional Vitest when package is on disk
$vitestOutcome = $null
if ($RunPackageTests) {
    $vitestOutcome = Invoke-PackageVitest -Root $RepoRoot
    if ($vitestOutcome.Ran -and -not $vitestOutcome.Passed) {
        $outcome = [pscustomobject]@{
            Passed    = $false
            PassCount = $outcome.PassCount
            FailCount = ($outcome.FailCount + 1)
            Results   = $outcome.Results
            Failures  = @($outcome.Failures + @("PKG: vitest run failed: $($vitestOutcome.Detail)"))
        }
    }
} else {
    # Auto-attempt when package exists (Task brief: try running tests if materialized)
    $matPkg = Join-Path $RepoRoot "packages\portion-calc\package.json"
    if (Test-Path -LiteralPath $matPkg) {
        $vitestOutcome = Invoke-PackageVitest -Root $RepoRoot
        if ($vitestOutcome.Ran -and -not $vitestOutcome.Passed) {
            $outcome = [pscustomobject]@{
                Passed    = $false
                PassCount = $outcome.PassCount
                FailCount = ($outcome.FailCount + 1)
                Results   = $outcome.Results
                Failures  = @($outcome.Failures + @("PKG: vitest run failed: $($vitestOutcome.Detail)"))
            }
        }
    } else {
        Write-Host ""
        Write-Host "[INFO] packages/portion-calc not on disk - skipping Vitest (draft validation only)" -ForegroundColor Yellow
    }
}

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
