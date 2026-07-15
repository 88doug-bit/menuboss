#Requires -Version 5.1
<#
.SYNOPSIS
  Verifies drafts/grok_out_database_prd_v0.4.md complies with grok_01_database_prd_v0.4_revision.md.

.DESCRIPTION
  Exit 0 if all checks pass; exit 1 if any check fails.
  Use -SelfTest to exercise pass and fail fixtures without a real draft.
  Use -Path to point at a specific document (default: drafts/grok_out_database_prd_v0.4.md).

.PARAMETER Path
  Path to the Database PRD v0.4 markdown file (relative to repo root or absolute).

.PARAMETER SelfTest
  Run built-in fixture tests that validate script logic (pass fixture must pass; fail fixture must fail).

.PARAMETER RepoRoot
  Repository root. Defaults to parent of the tests/ directory containing this script.
#>
[CmdletBinding()]
param(
    [string]$Path = "drafts/grok_out_database_prd_v0.4.md",
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

function Test-DatabasePrdV04 {
    param(
        [Parameter(Mandatory = $true)]
        [string]$FilePath,
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

    # --- File exists ---
    if (-not (Test-Path -LiteralPath $FilePath)) {
        Add-Result "File exists" $false "Missing: $FilePath"
        return [pscustomobject]@{
            Passed    = $false
            PassCount = 0
            FailCount = $results.Count
            Results   = $results
            Failures  = @($results | Where-Object { -not $_.Passed } | ForEach-Object {
                if ($_.Detail) { "$($_.Name): $($_.Detail)" } else { $_.Name }
            })
        }
    }
    Add-Result "File exists" $true $FilePath

    $content = Get-Content -LiteralPath $FilePath -Raw -Encoding UTF8
    if ($null -eq $content) { $content = "" }
    $normalized = $content -replace "`r`n", "`n" -replace "`r", "`n"

    # --- INTEGRATION NOTES ---
    $hasIntegration = [regex]::IsMatch($normalized, '(?m)^##\s+INTEGRATION NOTES\b') -or ($normalized -like '*## INTEGRATION NOTES*')
    Add-Result "Contains ## INTEGRATION NOTES" $hasIntegration $(if (-not $hasIntegration) { "Expected heading ## INTEGRATION NOTES" } else { "" })

    # --- Version / date / status ---
    $hasVersion04 = [regex]::IsMatch($normalized, '(?i)(document\s+version|version)[:\s]*.*\b0\.4\b') -or
        [regex]::IsMatch($normalized, '(?i)\bv0\.4\b') -or
        [regex]::IsMatch($normalized, '(?i)\b0\.4\b')
    Add-Result "Version 0.4 present" $hasVersion04 $(if (-not $hasVersion04) { "Expected Document Version 0.4 / v0.4" } else { "" })

    $hasDate = [regex]::IsMatch($normalized, '(?i)July\s+15[,\s]+2026') -or
        [regex]::IsMatch($normalized, '2026-07-15') -or
        [regex]::IsMatch($normalized, '(?i)15\s+July\s+2026')
    Add-Result "Date July 15 2026 present" $hasDate $(if (-not $hasDate) { "Expected July 15, 2026 (or 2026-07-15)" } else { "" })

    $hasStatus = [regex]::IsMatch($normalized, '(?i)Revised per design review')
    Add-Result "Status 'Revised per design review'" $hasStatus $(if (-not $hasStatus) { "Expected status: Revised per design review" } else { "" })

    # --- Required placeholders (exact) ---
    $placeholders = @(
        '<!-- CLAUDE_SECTION: NEW_TABLE_SCHEMAS -->',
        '<!-- CLAUDE_SECTION: SHOPPING_LIST_VIEW -->',
        '<!-- CLAUDE_SECTION: RLS_POLICIES -->'
    )
    foreach ($ph in $placeholders) {
        $found = $normalized.Contains($ph)
        Add-Result "Placeholder present: $ph" $found $(if (-not $found) { "Exact string missing" } else { "" })
    }

    # --- Forbidden residual strings ---
    $proteinHits = [regex]::Matches($normalized, '(?i)protein_portions')
    Add-Result "FORBIDDEN residual: protein_portions (any occurrence)" ($proteinHits.Count -eq 0) $(
        if ($proteinHits.Count -gt 0) { "Found $($proteinHits.Count) occurrence(s) - human review required" } else { "" }
    )

    $visHits = [regex]::Matches($normalized, '(?i)visible_to_households')
    Add-Result "FORBIDDEN residual: visible_to_households" ($visHits.Count -eq 0) $(
        if ($visHits.Count -gt 0) { "Found $($visHits.Count) occurrence(s)" } else { "" }
    )

    $adultRefHits = [regex]::Matches($normalized, '(?i)adult_reference_protein_oz')
    Add-Result "FORBIDDEN residual: adult_reference_protein_oz" ($adultRefHits.Count -eq 0) $(
        if ($adultRefHits.Count -gt 0) { "Found $($adultRefHits.Count) occurrence(s) (D17 removed)" } else { "" }
    )

    # Category level/path as key fields
    $forbidLevelPath = $false
    $levelPathDetail = ""
    if ([regex]::IsMatch($normalized, '(?i)`level`')) {
        $forbidLevelPath = $true
        $levelPathDetail = "Found backtick-level as field token"
    }
    if ([regex]::IsMatch($normalized, '(?i)`path`\s*\(materialized') -or
        [regex]::IsMatch($normalized, '(?i)`path`\s*\([^)]*ltree') -or
        [regex]::IsMatch($normalized, '(?i),\s*`path`') -or
        [regex]::IsMatch($normalized, '(?i)`level`[^\n]{0,120}`path`') -or
        [regex]::IsMatch($normalized, '(?i)Category[^\n]{0,200}`level`')) {
        $forbidLevelPath = $true
        if (-not $levelPathDetail) { $levelPathDetail = "Category level/path key fields present" }
        else { $levelPathDetail = "$levelPathDetail; path as key field" }
    }
    Add-Result "FORBIDDEN residual: Category level/path as key fields" (-not $forbidLevelPath) $(
        if ($forbidLevelPath) { $levelPathDetail } else { "" }
    )

    # plan_date as alternative (D8)
    $planDateAlt = [regex]::IsMatch($normalized, '(?i)`plan_date`\s*or\s*`start_date`') -or
        [regex]::IsMatch($normalized, '(?i)plan_date\s+or\s+start_date') -or
        [regex]::IsMatch($normalized, '(?i)`plan_date`') -or
        [regex]::IsMatch($normalized, '(?i)\bplan_date\b')
    Add-Result "FORBIDDEN residual: plan_date (as field/alternative)" (-not $planDateAlt) $(
        if ($planDateAlt) { "plan_date must not appear; use start_date/end_date only (D8)" } else { "" }
    )

    # Trigger-based full-text alternative forbidden (D13)
    $triggerFts = [regex]::IsMatch($normalized, '(?i)(generated\s+tsvector|tsvector).{0,40}(or\s+triggers?|via\s+triggers?)') -or
        [regex]::IsMatch($normalized, '(?i)(triggers?|trigger-based).{0,60}(full-?text|tsvector|FTS)') -or
        [regex]::IsMatch($normalized, '(?i)full-?text[^\n]{0,80}(or\s+triggers?|via\s+triggers?)') -or
        [regex]::IsMatch($normalized, '(?i)tsvector columns or triggers')
    Add-Result "FORBIDDEN residual: trigger-based full-text alternative" (-not $triggerFts) $(
        if ($triggerFts) { "D13 requires generated tsvector only; drop trigger alternative" } else { "" }
    )

    # --- Required concepts ---
    $required = @(
        @{ Name = "MealPlanHousehold"; Pattern = '(?i)MealPlanHousehold' },
        @{ Name = "MealPlanPortionRequirement"; Pattern = '(?i)MealPlanPortionRequirement' },
        @{ Name = "Unit (entity/table)"; Pattern = '(?i)\bUnit\b' },
        @{ Name = "start_date"; Pattern = '(?i)start_date' },
        @{ Name = "end_date"; Pattern = '(?i)end_date' },
        @{ Name = "assignment_date"; Pattern = '(?i)assignment_date' },
        @{ Name = "generated tsvector OR tsvector"; Pattern = '(?i)(generated\s+tsvector|tsvector)' },
        @{ Name = "recursive CTE"; Pattern = '(?i)recursive\s+CTE' },
        @{ Name = "athlete_multiplier"; Pattern = '(?i)athlete_multiplier' },
        @{ Name = "created_by_user_id (ChefIdea context)"; Pattern = '(?i)created_by_user_id' },
        @{ Name = "tRPC"; Pattern = '(?i)tRPC' },
        @{ Name = "RLS"; Pattern = '(?i)\bRLS\b|Row Level Security' },
        @{ Name = "family-global (or family global)"; Pattern = '(?i)family[-\s]global' }
    )
    foreach ($req in $required) {
        $ok = [regex]::IsMatch($normalized, $req.Pattern)
        Add-Result "REQUIRED concept: $($req.Name)" $ok $(if (-not $ok) { "Pattern not found: $($req.Pattern)" } else { "" })
    }

    # ChefIdea proximity for created_by_user_id
    $chefIdeaBlock = [regex]::Match($normalized, '(?is)\*\*ChefIdea\*\*.{0,1200}')
    if ($chefIdeaBlock.Success) {
        $chefHasCreatedBy = [regex]::IsMatch($chefIdeaBlock.Value, '(?i)created_by_user_id')
        Add-Result "ChefIdea includes created_by_user_id (proximity)" $chefHasCreatedBy $(
            if (-not $chefHasCreatedBy) { "ChefIdea section found but created_by_user_id not nearby" } else { "" }
        )
    } else {
        Add-Result "ChefIdea includes created_by_user_id (proximity)" $false "ChefIdea section not found for proximity check"
    }

    # --- Section 7: body essentially only RLS placeholder ---
    $sec7Match = [regex]::Match($normalized, '(?ms)^##\s*7\.\s*Security and Access Control\s*\n(.*?)(?=^##\s*\d+\.|\z)')
    if (-not $sec7Match.Success) {
        Add-Result "Section 7 Security and Access Control exists" $false "Heading not found"
        Add-Result "Section 7 body is essentially only RLS placeholder" $false "Cannot evaluate body"
    } else {
        Add-Result "Section 7 Security and Access Control exists" $true ""
        $body = $sec7Match.Groups[1].Value.Trim()
        $hasRlsPh = $body.Contains('<!-- CLAUDE_SECTION: RLS_POLICIES -->')
        $bodyWithoutPh = ($body -replace '<!--\s*CLAUDE_SECTION:\s*RLS_POLICIES\s*-->', '').Trim()
        $bodyWithoutPh = [regex]::Replace($bodyWithoutPh, '(?m)^\s*[-*]\s*$', '').Trim()
        $bodyWithoutPh = [regex]::Replace($bodyWithoutPh, '\s+', ' ').Trim()
        $wordCount = 0
        if ($bodyWithoutPh) { $wordCount = ($bodyWithoutPh -split '\s+').Count }
        $looksLikeEssay = [regex]::IsMatch($body, '(?i)will enforce') -or
            [regex]::IsMatch($body, '(?i)visible_to_households') -or
            [regex]::IsMatch($body, '(?i)editing rights') -or
            ($wordCount -gt 40)
        $sec7Ok = $hasRlsPh -and (-not $looksLikeEssay)
        $detail7 = ""
        if (-not $hasRlsPh) { $detail7 = "Missing RLS_POLICIES placeholder in section 7 body" }
        elseif ($looksLikeEssay) { $detail7 = "Section 7 body has substantial prose beyond placeholder (wordCount=$wordCount)" }
        Add-Result "Section 7 body is essentially only RLS placeholder" $sec7Ok $detail7
    }

    # --- Open items: must not re-list resolved design choices ---
    $openMatch = [regex]::Match($normalized, '(?ms)^##\s*8\.\s*Open Items[^\n]*\n(.*?)(?=^##\s|\z|^---\s*$|^\*\*End of)')
    $openBody = ""
    if ($openMatch.Success) {
        $openBody = $openMatch.Groups[1].Value
    } else {
        $openMatch2 = [regex]::Match($normalized, '(?ms)^##\s*.*Open Items[^\n]*\n(.*?)(?=^##\s|\z)')
        if ($openMatch2.Success) { $openBody = $openMatch2.Groups[1].Value }
    }

    if ([string]::IsNullOrWhiteSpace($openBody)) {
        Add-Result "Open items section present for resolved-item scan" $false "Could not locate section 8 Open Items body"
    } else {
        Add-Result "Open items section present for resolved-item scan" $true ""

        $openJsonbVsNorm = [regex]::IsMatch($openBody, '(?i)(JSONB.*vs\.?.*normali[sz]ed|Final decision between JSONB|protein_portions.*junction|normali[sz]ed.*MealPlanPortionRequirement.*favored|JSONB currently favored)')
        Add-Result "Open items must NOT re-list JSONB-vs-normalized portions as open" (-not $openJsonbVsNorm) $(
            if ($openJsonbVsNorm) { "Resolved by D5 - remove from open items" } else { "" }
        )

        $openVis = [regex]::IsMatch($openBody, '(?i)(visibility storage|visible_to_households|visibility.*(JSONB|junction|pending|decision))')
        Add-Result "Open items must NOT re-list visibility storage as open" (-not $openVis) $(
            if ($openVis) { "Resolved by D6 - remove from open items" } else { "" }
        )

        $openRls = [regex]::IsMatch($openBody, '(?i)(Detailed RLS|RLS policy definitions.*pending|pending final system architecture|RLS.*pending.*architecture|authorization model \(pending)')
        Add-Result "Open items must NOT re-list RLS pending architecture as open" (-not $openRls) $(
            if ($openRls) { "Architecture decided; section 7 is placeholder - do not list RLS as open item" } else { "" }
        )
    }

    $failList = @($results | Where-Object { -not $_.Passed } | ForEach-Object {
        if ($_.Detail) { "$($_.Name): $($_.Detail)" } else { $_.Name }
    })
    $passCount = @($results | Where-Object { $_.Passed }).Count
    $failCount = @($results | Where-Object { -not $_.Passed }).Count

    return [pscustomobject]@{
        Passed    = ($failCount -eq 0)
        PassCount = $passCount
        FailCount = $failCount
        Results   = $results
        Failures  = $failList
    }
}

function Get-MinimalCompliantDraft {
    $bt = [char]96
    $lines = @(
        '## INTEGRATION NOTES',
        '- Bumped version to 0.4; status Revised per design review (2026-07-15).',
        '- D5: portions normalized to MealPlanPortionRequirement (removed prior JSONB design).',
        '- D6: MealPlanHousehold junction; sharedness derived.',
        '- D7: family-global content entities with created_by_user_id.',
        '- D8: start_date/end_date; assignment_date in range.',
        '- D12-D15, D17: Unit table, indexes, recursive CTEs, athlete_multiplier on FamilySettings.',
        '- D1/D2: RLS sole auth; tRPC in Next.js.',
        '',
        '# Database Product Requirements Document (PRD)',
        '## Recipe & Meal Planning Application',
        '',
        '**Document Version:** 0.4',
        '**Date:** July 15, 2026',
        '**Status:** Revised per design review',
        '**Changes in v0.4:** Normalized portions; MealPlanHousehold; family-global content; date ranges; Unit; generated tsvector; recursive CTEs; tRPC/RLS architecture.',
        '',
        '> **Critical Note to Reader (LLM):**',
        '> This document reflects the 2026-07 design review. Architecture is decided: tRPC inside Next.js; RLS as sole authorization authority.',
        '',
        '## 3. Assumptions',
        '- Backend is tRPC hosted inside Next.js.',
        '- RLS is the sole authorization authority with user-JWT clients.',
        '- Content is family-global; MealPlans use MealPlanHousehold.',
        '',
        '## 4. Core Entities and Data Model',
        '### 4.1 Primary Entities',
        '',
        '**Category**',
        ('Key fields: {0}id{0}, {0}name{0}, {0}slug{0}, {0}parent_id{0} (nullable), {0}category_type{0}, {0}sort_order{0}.' -f $bt),
        'Hierarchy via parent_id + recursive CTEs; ltree is a future optimization.',
        '',
        '**FamilySettings**',
        ('Key fields: {0}id{0}, {0}athlete_multiplier{0} (default 1.5), {0}other_global_defaults{0} (JSONB).' -f $bt),
        '',
        '**MealPlan**',
        ('Key fields: {0}id{0}, {0}title{0}, {0}start_date{0}, {0}end_date{0}, {0}created_by_household_id{0}, {0}created_by_user_id{0}.' -f $bt),
        'Relationships: has many MealPlanAssignment, MealPlanHousehold, MealPlanPortionRequirement.',
        '',
        '**MealPlanAssignment**',
        ('Key fields: {0}id{0}, {0}meal_plan_id{0}, {0}recipe_id{0}, {0}assignment_date{0}, {0}meal_slot{0}.' -f $bt),
        'Invariant: assignment_date within parent plan start_date/end_date.',
        '',
        '**ChefIdea**',
        ('Key fields: {0}id{0}, {0}title{0}, {0}created_by_user_id{0}, {0}status{0}.' -f $bt),
        '',
        '<!-- CLAUDE_SECTION: NEW_TABLE_SCHEMAS -->',
        '',
        '## 5. Extensibility Strategy',
        '- Unit is an explicit admin-editable lookup (dimension + factor_to_base).',
        '- Category depth via recursive CTEs.',
        '',
        '## 6. Data Integrity, Constraints, and Indexing',
        '- Full-text search via generated tsvector columns on Recipe.title and description.',
        '- Index-by-query-pattern only.',
        '<!-- CLAUDE_SECTION: SHOPPING_LIST_VIEW -->',
        '',
        '## 7. Security and Access Control',
        '',
        '<!-- CLAUDE_SECTION: RLS_POLICIES -->',
        '',
        '## 8. Open Items and Future Considerations',
        '',
        '- Integration strategy with potential AI-assisted features.',
        '- Performance validation of aggregation queries at real volumes.',
        '- Potential addition of pantry/inventory tracking.',
        '- Multi-macro scaling beyond protein-only.',
        '- Evolution of food-safety lookup normalization.',
        '',
        '---',
        '',
        '**End of Database PRD v0.4**'
    )
    return ($lines -join "`n")
}

function Get-MinimalNonCompliantDraft {
    $bt = [char]96
    $lines = @(
        '# Database Product Requirements Document (PRD)',
        '**Document Version:** 0.3',
        '**Date:** July 14, 2026',
        '**Status:** Draft for Review',
        '',
        '## 4. Core Entities',
        ('**Category** Key fields: {0}id{0}, {0}name{0}, {0}level{0}, {0}path{0} (materialized or via ltree).' -f $bt),
        '**MealPlan** plan_date or start_date/end_date, visible_to_households, protein_portions JSONB, adult_reference_protein_oz.',
        '**ChefIdea** title only - no attribution field.',
        '',
        '## 6. Indexing',
        'Full-text search indexes (via generated tsvector columns or triggers).',
        '',
        '## 7. Security and Access Control',
        '',
        '- **Row Level Security (RLS)** policies (to be detailed in the system architecture phase) will enforce:',
        '  - A user can only read/write data belonging to their own household unless shared via MealPlan.is_shared / visible_to_households.',
        '  - Shared meal plans are visible to all listed households but editing rights may be restricted to the creating household or family admins.',
        '- Integration with Supabase Auth for user identity and session management.',
        '- Family-level administrator role(s) for managing global FamilySettings.',
        '- Audit logging on sensitive changes is recommended.',
        '',
        '## 8. Open Items and Future Considerations',
        '',
        '- Final decision between JSONB (protein_portions) vs. a normalized MealPlanPortionRequirement junction table (JSONB currently favored for v1 flexibility).',
        '- Detailed RLS policy definitions and complete authentication/authorization model (pending final system architecture).',
        '- Visibility storage approach still under discussion for visible_to_households.',
        '',
        '**End of Database PRD v0.3**'
    )
    return ($lines -join "`n")
}

# -------------------- Main --------------------
$script:exitCode = 0

if ($SelfTest) {
    Write-Host "=== Self-test: verify_database_prd_v04.ps1 ===" -ForegroundColor Cyan
    $tmp = Join-Path ([System.IO.Path]::GetTempPath()) ("mb-prd-v04-selftest-" + [guid]::NewGuid().ToString("n"))
    New-Item -ItemType Directory -Path $tmp -Force | Out-Null
    try {
        $passFile = Join-Path $tmp "pass.md"
        $failFile = Join-Path $tmp "fail.md"
        [System.IO.File]::WriteAllText($passFile, (Get-MinimalCompliantDraft), [System.Text.UTF8Encoding]::new($false))
        [System.IO.File]::WriteAllText($failFile, (Get-MinimalNonCompliantDraft), [System.Text.UTF8Encoding]::new($false))

        Write-Host ""
        Write-Host "-- Fixture: COMPLIANT (expect all pass) --" -ForegroundColor Cyan
        $passResult = Test-DatabasePrdV04 -FilePath $passFile -Label "pass-fixture"
        Write-Host ("Pass fixture: PassCount={0} FailCount={1}" -f $passResult.PassCount, $passResult.FailCount)

        Write-Host ""
        Write-Host "-- Fixture: NON-COMPLIANT (expect failures) --" -ForegroundColor Cyan
        $failResult = Test-DatabasePrdV04 -FilePath $failFile -Label "fail-fixture"
        Write-Host ("Fail fixture: PassCount={0} FailCount={1}" -f $failResult.PassCount, $failResult.FailCount)

        $selfOk = $true
        if (-not $passResult.Passed) {
            Write-Host "SELFTEST FAIL: compliant fixture did not fully pass" -ForegroundColor Red
            $passResult.Failures | ForEach-Object { Write-Host "  - $_" -ForegroundColor Red }
            $selfOk = $false
        } else {
            Write-Host "SELFTEST OK: compliant fixture passed all checks" -ForegroundColor Green
        }

        if ($failResult.Passed) {
            Write-Host "SELFTEST FAIL: non-compliant fixture unexpectedly passed" -ForegroundColor Red
            $selfOk = $false
        } elseif ($failResult.FailCount -lt 5) {
            Write-Host "SELFTEST FAIL: non-compliant fixture failed too few checks ($($failResult.FailCount)); script may be too weak" -ForegroundColor Red
            $selfOk = $false
        } else {
            Write-Host "SELFTEST OK: non-compliant fixture failed $($failResult.FailCount) checks (as expected)" -ForegroundColor Green
        }

        Write-Host ""
        Write-Host "-- Fixture: MISSING FILE (expect fail) --" -ForegroundColor Cyan
        $missing = Test-DatabasePrdV04 -FilePath (Join-Path $tmp "no-such-file.md") -Label "missing"
        if ($missing.Passed -or $missing.FailCount -lt 1) {
            Write-Host "SELFTEST FAIL: missing file should fail" -ForegroundColor Red
            $selfOk = $false
        } else {
            Write-Host "SELFTEST OK: missing file failed as expected" -ForegroundColor Green
        }

        if ($selfOk) {
            Write-Host ""
            Write-Host "=== SELF-TEST SUMMARY: PASS ===" -ForegroundColor Green
            $script:exitCode = 0
        } else {
            Write-Host ""
            Write-Host "=== SELF-TEST SUMMARY: FAIL ===" -ForegroundColor Red
            $script:exitCode = 1
        }
    } finally {
        Remove-Item -LiteralPath $tmp -Recurse -Force -ErrorAction SilentlyContinue
    }
    exit $script:exitCode
}

# Default: verify real draft path
$resolved = $Path
if (-not [System.IO.Path]::IsPathRooted($resolved)) {
    $resolved = Join-Path $RepoRoot $Path
}

Write-Host "=== verify_database_prd_v04 ===" -ForegroundColor Cyan
Write-Host "Target: $resolved"
Write-Host "RepoRoot: $RepoRoot"
Write-Host ""

$outcome = Test-DatabasePrdV04 -FilePath $resolved

Write-Host ""
Write-Host ("SUMMARY: {0} passed, {1} failed (total {2})" -f $outcome.PassCount, $outcome.FailCount, ($outcome.PassCount + $outcome.FailCount)) -ForegroundColor $(if ($outcome.Passed) { "Green" } else { "Yellow" })

if (-not $outcome.Passed) {
    Write-Host "FAILURES:" -ForegroundColor Red
    foreach ($f in $outcome.Failures) {
        Write-Host "  - $f" -ForegroundColor Red
    }
    exit 1
}

Write-Host "All checks passed." -ForegroundColor Green
exit 0