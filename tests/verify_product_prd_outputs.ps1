#Requires -Version 5.1
<#
.SYNOPSIS
  Verifies MenuBoss Product PRD draft outputs for Tasks 02–05 (architecture, testing, functional ACs, NFR/roadmap).

.DESCRIPTION
  Exit 0 if all checks pass; exit 1 if any check fails.
  Validates presence and key markers for:
    - drafts/grok_out_product_architecture.md
    - drafts/grok_out_testing_strategy.md
    - drafts/grok_out_functional_reqs.md
    - drafts/grok_out_nfr_roadmap.md

.PARAMETER DraftsDir
  Directory containing the four draft files. Default: drafts (relative to repo root).

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

# Section sign U+00A7 — build at runtime so PowerShell 5.1 script encoding (no BOM) cannot corrupt it
$script:SectionSign = [string][char]0x00A7
function Get-SectionDelim {
    param([Parameter(Mandatory = $true)][string]$Label)
    return ("=== REPLACEMENT: {0}{1} ===" -f $script:SectionSign, $Label)
}
function Get-PartDelim {
    param([Parameter(Mandatory = $true)][string]$Label)
    return ("=== PART {0} ===" -f $Label)
}

function Test-ProductPrdOutputs {
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

    $files = @{
        Architecture = Join-Path $DraftsPath "grok_out_product_architecture.md"
        Testing      = Join-Path $DraftsPath "grok_out_testing_strategy.md"
        Functional   = Join-Path $DraftsPath "grok_out_functional_reqs.md"
        NfrRoadmap   = Join-Path $DraftsPath "grok_out_nfr_roadmap.md"
    }

    # =========================================================================
    # File presence (all four)
    # =========================================================================
    foreach ($key in @("Architecture", "Testing", "Functional", "NfrRoadmap")) {
        $fp = $files[$key]
        $exists = Test-Path -LiteralPath $fp
        Add-Result "File exists: $(Split-Path -Leaf $fp)" $exists $(if (-not $exists) { "Missing: $fp" } else { $fp })
    }

    # =========================================================================
    # 1. Product architecture (Task 02)
    # =========================================================================
    $archPath = $files.Architecture
    $arch = Get-NormalizedContent -FilePath $archPath
    if ($null -eq $arch) {
        Add-Result "ARCH: content loadable" $false "Cannot evaluate markers; file missing"
    } else {
        Add-Result "ARCH: content loadable" $true ""

        # INTEGRATION NOTES
        $hasInteg = [regex]::IsMatch($arch, '(?m)^##\s+INTEGRATION NOTES\b') -or ($arch -like '*## INTEGRATION NOTES*')
        Add-Result "ARCH: INTEGRATION NOTES" $hasInteg $(if (-not $hasInteg) { "Expected ## INTEGRATION NOTES" } else { "" })

        # Three REPLACEMENT delimiters: §4, §6, §10 API
        $archReplacements = @(
            (Get-SectionDelim "4"),
            (Get-SectionDelim "6"),
            (Get-SectionDelim "10 API")
        )
        $archReplFound = 0
        foreach ($delim in $archReplacements) {
            $found = $arch.Contains($delim)
            if ($found) { $archReplFound++ }
            $display = $delim -replace [char]0x00A7, '§'
            Add-Result "ARCH: delimiter present: $display" $found $(if (-not $found) { "Exact delimiter missing" } else { "" })
        }
        Add-Result "ARCH: three REPLACEMENT delimiters" ($archReplFound -eq 3) $(
            if ($archReplFound -ne 3) { "Found $archReplFound of 3 required REPLACEMENT delimiters" } else { "" }
        )

        # tRPC
        $hasTrpc = [regex]::IsMatch($arch, '(?i)tRPC')
        Add-Result "ARCH: tRPC present" $hasTrpc $(if (-not $hasTrpc) { "Expected tRPC as backend" } else { "" })

        # NestJS not primary backend: may mention NestJS only as rejected/removed, not as the chosen stack
        # Pass if NestJS is absent OR only appears in "no NestJS" / "not NestJS" / "removed" / "instead of NestJS" style context
        $nestjsMatches = [regex]::Matches($arch, '(?i)NestJS')
        $nestjsPrimary = $false
        $nestjsDetail = ""
        if ($nestjsMatches.Count -gt 0) {
            # Fail if NestJS is asserted as the backend without a negation nearby
            $positiveBackend = [regex]::IsMatch($arch, '(?i)(backend\s*[=:]\s*.{0,40}NestJS|NestJS\s+(API\s+)?service\s+in\s+v1|standalone\s+NestJS\s+(API\s+)?service(?!\s+in\s+v1\.\s*There\s+is\s+no)|primary\s+backend.{0,40}NestJS)')
            # Allowed: "no NestJS", "not NestJS", "without NestJS", "NestJS ... removed", "instead of NestJS"
            $allNegated = $true
            foreach ($m in $nestjsMatches) {
                $start = [Math]::Max(0, $m.Index - 80)
                $len = [Math]::Min(160, $arch.Length - $start)
                $window = $arch.Substring($start, $len)
                $negated = [regex]::IsMatch($window, '(?i)(no\s+NestJS|not\s+NestJS|without\s+NestJS|NestJS.{0,40}(removed|not used|not part)|instead of NestJS|separate NestJS)')
                if (-not $negated) { $allNegated = $false }
            }
            # Primary backend check: tRPC should be the affirmative choice; NestJS only as contrast
            $trpcPrimary = [regex]::IsMatch($arch, '(?i)(Backend\s*\|\s*\*?\*?tRPC|tRPC\s+(hosted\s+)?in\s+Next\.js|backend API layer is \*?\*?tRPC)')
            if ($positiveBackend -or (-not $allNegated -and -not $trpcPrimary)) {
                $nestjsPrimary = $true
                $nestjsDetail = "NestJS appears without clear non-primary framing ($($nestjsMatches.Count) hit(s))"
            } else {
                $nestjsDetail = "NestJS mentioned only as non-primary / rejected ($($nestjsMatches.Count) hit(s))"
            }
        } else {
            $nestjsDetail = "NestJS not mentioned (OK)"
        }
        Add-Result "ARCH: NestJS not primary backend" (-not $nestjsPrimary) $nestjsDetail

        # portionRequirements OR householdIds
        $hasPortionReqs = [regex]::IsMatch($arch, '(?i)portionRequirements')
        $hasHouseholdIds = [regex]::IsMatch($arch, '(?i)householdIds')
        $hasEither = $hasPortionReqs -or $hasHouseholdIds
        Add-Result "ARCH: portionRequirements or householdIds" $hasEither $(
            if (-not $hasEither) {
                "Expected portionRequirements and/or householdIds"
            } else {
                $parts = @()
                if ($hasPortionReqs) { $parts += "portionRequirements" }
                if ($hasHouseholdIds) { $parts += "householdIds" }
                $parts -join " + "
            }
        )

        # generate_shopping_list
        $hasShopFn = [regex]::IsMatch($arch, '(?i)generate_shopping_list')
        Add-Result "ARCH: generate_shopping_list" $hasShopFn $(
            if (-not $hasShopFn) { "Expected generate_shopping_list" } else { "" }
        )
    }

    # =========================================================================
    # 2. Testing strategy (Task 03)
    # =========================================================================
    $testPath = $files.Testing
    $test = Get-NormalizedContent -FilePath $testPath
    if ($null -eq $test) {
        Add-Result "TEST: content loadable" $false "Cannot evaluate markers; file missing"
    } else {
        Add-Result "TEST: content loadable" $true ""

        $hasTsHeading = [regex]::IsMatch($test, '(?m)^##\s+Testing Strategy\b') -or
            [regex]::IsMatch($test, '(?i)Testing Strategy')
        Add-Result "TEST: Testing Strategy" $hasTsHeading $(
            if (-not $hasTsHeading) { "Expected Testing Strategy heading/text" } else { "" }
        )

        $hasVitest = [regex]::IsMatch($test, '(?i)Vitest')
        Add-Result "TEST: Vitest" $hasVitest $(if (-not $hasVitest) { "Expected Vitest" } else { "" })

        $hasPlaywright = [regex]::IsMatch($test, '(?i)Playwright')
        Add-Result "TEST: Playwright" $hasPlaywright $(if (-not $hasPlaywright) { "Expected Playwright" } else { "" })

        $rlsPlaceholder = '<!-- CLAUDE_SECTION: RLS_TEST_MATRIX -->'
        $hasRlsPh = $test.Contains($rlsPlaceholder)
        Add-Result "TEST: RLS_TEST_MATRIX placeholder (exact)" $hasRlsPh $(
            if (-not $hasRlsPh) { "Exact string missing: $rlsPlaceholder" } else { "" }
        )

        $hasContract = [regex]::IsMatch($test, '(?i)contract test')
        Add-Result "TEST: contract test mention" $hasContract $(
            if (-not $hasContract) { "Expected 'contract test' wording" } else { "" }
        )
    }

    # =========================================================================
    # 3. Functional requirements (Task 04)
    # =========================================================================
    $fnPath = $files.Functional
    $fn = Get-NormalizedContent -FilePath $fnPath
    if ($null -eq $fn) {
        Add-Result "FN: content loadable" $false "Cannot evaluate markers; file missing"
    } else {
        Add-Result "FN: content loadable" $true ""

        # Five §8.x REPLACEMENT delimiters: 8.1, 8.2, 8.3, 8.7, 8.8
        $fnReplacements = @(
            (Get-SectionDelim "8.1"),
            (Get-SectionDelim "8.2"),
            (Get-SectionDelim "8.3"),
            (Get-SectionDelim "8.7"),
            (Get-SectionDelim "8.8")
        )
        $fnReplFound = 0
        foreach ($delim in $fnReplacements) {
            $found = $fn.Contains($delim)
            if ($found) { $fnReplFound++ }
            $display = $delim -replace [char]0x00A7, 'S'
            Add-Result ("FN: delimiter present: {0}" -f $display) $found $(if (-not $found) { "Exact delimiter missing" } else { "" })
        }
        Add-Result "FN: all five section 8.x REPLACEMENT delimiters" ($fnReplFound -eq 5) $(
            if ($fnReplFound -ne 5) { "Found $fnReplFound of 5 required REPLACEMENT delimiters" } else { "" }
        )

        $hasAthlete = [regex]::IsMatch($fn, '(?i)athleteCount')
        Add-Result "FN: athleteCount" $hasAthlete $(if (-not $hasAthlete) { "Expected athleteCount" } else { "" })

        $hasStart = [regex]::IsMatch($fn, '(?i)start_date') -or [regex]::IsMatch($fn, '(?i)startDate')
        Add-Result "FN: start_date or startDate" $hasStart $(
            if (-not $hasStart) { "Expected start_date or startDate" } else { "" }
        )

        $hasFactor = [regex]::IsMatch($fn, '(?i)factor_to_base')
        Add-Result "FN: factor_to_base" $hasFactor $(if (-not $hasFactor) { "Expected factor_to_base" } else { "" })
    }

    # =========================================================================
    # 4. NFR / roadmap (Task 05)
    # =========================================================================
    $nfrPath = $files.NfrRoadmap
    $nfr = Get-NormalizedContent -FilePath $nfrPath
    if ($null -eq $nfr) {
        Add-Result "NFR: content loadable" $false "Cannot evaluate markers; file missing"
    } else {
        Add-Result "NFR: content loadable" $true ""

        # Three PART delimiters (PART 2 embeds section sign before 11)
        $nfrParts = @(
            (Get-PartDelim "1: NFR SECTION"),
            ("=== PART 2: {0}11 ROADMAP ===" -f $script:SectionSign),
            (Get-PartDelim "3: HYGIENE MAP")
        )
        $nfrPartFound = 0
        foreach ($delim in $nfrParts) {
            $found = $nfr.Contains($delim)
            if ($found) { $nfrPartFound++ }
            $display = $delim -replace [char]0x00A7, 'S'
            Add-Result ("NFR: delimiter present: {0}" -f $display) $found $(if (-not $found) { "Exact delimiter missing" } else { "" })
        }
        Add-Result "NFR: three PART delimiters" ($nfrPartFound -eq 3) $(
            if ($nfrPartFound -ne 3) { "Found $nfrPartFound of 3 required PART delimiters" } else { "" }
        )

        # 1.5 s or 1.5s
        $has15s = [regex]::IsMatch($nfr, '(?i)1\.5\s*s')
        Add-Result "NFR: 1.5 s / 1.5s budget" $has15s $(
            if (-not $has15s) { "Expected 1.5 s or 1.5s (calendar week budget)" } else { "" }
        )

        # 100 ms
        $has100ms = [regex]::IsMatch($nfr, '(?i)100\s*ms')
        Add-Result "NFR: 100 ms budget" $has100ms $(
            if (-not $has100ms) { "Expected 100 ms (portion live-preview budget)" } else { "" }
        )

        # hygiene map
        $hasHygiene = [regex]::IsMatch($nfr, '(?i)hygiene map')
        Add-Result "NFR: hygiene map" $hasHygiene $(
            if (-not $hasHygiene) { "Expected hygiene map" } else { "" }
        )

        # Phase 2 conflict
        $hasPhase2Conflict = [regex]::IsMatch($nfr, '(?is)Phase\s*2.{0,200}conflict') -or
            [regex]::IsMatch($nfr, '(?is)conflict.{0,200}Phase\s*2') -or
            [regex]::IsMatch($nfr, '(?i)Phase\s*2.*conflict') -or
            [regex]::IsMatch($nfr, '(?i)conflict-resolution')
        # Stronger: require Phase 2 near conflict-resolution concept
        $hasPhase2Conflict = [regex]::IsMatch($nfr, '(?is)Phase\s*2.{0,400}conflict') -or
            [regex]::IsMatch($nfr, '(?i)Phase 2 \(conflict') -or
            [regex]::IsMatch($nfr, '(?i)offline.?write.{0,80}conflict') -or
            ([regex]::IsMatch($nfr, '(?i)Phase\s*2') -and [regex]::IsMatch($nfr, '(?i)conflict[- ]resolution'))
        Add-Result "NFR: Phase 2 conflict" $hasPhase2Conflict $(
            if (-not $hasPhase2Conflict) { "Expected Phase 2 + conflict (resolution) linkage" } else { "" }
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

function Invoke-SelfTest {
    Write-Host ""
    Write-Host "=== Self-test: Product PRD outputs verifier ===" -ForegroundColor Cyan

    $tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("prd-verify-" + [guid]::NewGuid().ToString("N"))
    $passDir = Join-Path $tempRoot "pass"
    $failDir = Join-Path $tempRoot "fail"
    New-Item -ItemType Directory -Force -Path $passDir | Out-Null
    New-Item -ItemType Directory -Force -Path $failDir | Out-Null

    try {
        # --- Pass fixtures: minimal content that satisfies all markers ---
        # Use runtime section sign so fixtures match real draft UTF-8 (U+00A7)
        $ss = $script:SectionSign
        $archPass = @"
## INTEGRATION NOTES
- stack notes

=== REPLACEMENT: ${ss}4 ===
tRPC in Next.js

=== REPLACEMENT: ${ss}6 ===
No NestJS service; Backend = tRPC
portionRequirements and householdIds
generate_shopping_list

=== REPLACEMENT: ${ss}10 API ===
tRPC API with portionRequirements householdIds generate_shopping_list
"@
        Set-Content -LiteralPath (Join-Path $passDir "grok_out_product_architecture.md") -Value $archPass -Encoding UTF8

        $testPass = @"
## Testing Strategy
Vitest and Playwright
<!-- CLAUDE_SECTION: RLS_TEST_MATRIX -->
TS <-> SQL contract test green
"@
        Set-Content -LiteralPath (Join-Path $passDir "grok_out_testing_strategy.md") -Value $testPass -Encoding UTF8

        $fnPass = @"
=== REPLACEMENT: ${ss}8.1 ===
=== REPLACEMENT: ${ss}8.2 ===
athleteCount
=== REPLACEMENT: ${ss}8.3 ===
start_date
=== REPLACEMENT: ${ss}8.7 ===
factor_to_base
=== REPLACEMENT: ${ss}8.8 ===
"@
        Set-Content -LiteralPath (Join-Path $passDir "grok_out_functional_reqs.md") -Value $fnPass -Encoding UTF8

        $nfrPass = @"
=== PART 1: NFR SECTION ===
calendar < 1.5 s
portion < 100 ms
=== PART 2: ${ss}11 ROADMAP ===
Phase 2 conflict-resolution design
=== PART 3: HYGIENE MAP ===
## Hygiene map (integrator checklist)
"@
        Set-Content -LiteralPath (Join-Path $passDir "grok_out_nfr_roadmap.md") -Value $nfrPass -Encoding UTF8

        # --- Fail fixtures: empty / missing markers ---
        "stub" | Set-Content -LiteralPath (Join-Path $failDir "grok_out_product_architecture.md") -Encoding UTF8
        "stub" | Set-Content -LiteralPath (Join-Path $failDir "grok_out_testing_strategy.md") -Encoding UTF8
        "stub" | Set-Content -LiteralPath (Join-Path $failDir "grok_out_functional_reqs.md") -Encoding UTF8
        "stub" | Set-Content -LiteralPath (Join-Path $failDir "grok_out_nfr_roadmap.md") -Encoding UTF8

        Write-Host ""
        Write-Host "--- Pass fixture ---" -ForegroundColor Cyan
        $passResult = Test-ProductPrdOutputs -DraftsPath $passDir -Label "PASS-FIXTURE"

        Write-Host ""
        Write-Host "--- Fail fixture ---" -ForegroundColor Cyan
        $failResult = Test-ProductPrdOutputs -DraftsPath $failDir -Label "FAIL-FIXTURE"

        $selfOk = $passResult.Passed -and (-not $failResult.Passed)
        Write-Host ""
        if ($selfOk) {
            Write-Host "[PASS] Self-test: pass fixture passed ($($passResult.PassCount) checks); fail fixture failed ($($failResult.FailCount) failures) as expected" -ForegroundColor Green
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

$outcome = Test-ProductPrdOutputs -DraftsPath $draftsFull

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
