#Requires -Version 5.1
<#
.SYNOPSIS
  Verifies MenuBoss Task 14 (recipe & ingredient editors) draft output.

.DESCRIPTION
  Exit 0 if all checks pass; exit 1 if any check fails.
  Validates presence and key markers for:
    - drafts/grok_out_recipe_editors.md

  Checks (coordinator / tester brief):
    - ### FILE headers: recipes/new, recipes edit, ingredients page, RecipeEditor (or similar)
    - recipe.create or recipe.update
    - softDelete; setFoodSafetyProfile or food-safety
    - LeftoverDecayPath
    - merge or CONFLICT (duplicate ingredient merge suggestion)
    - data-testid on interactive elements
    - No .js relative import suffixes in TypeScript fenced blocks
    - Component tests mentioned

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

function Test-RecipeEditors {
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

    $draftPath = Join-Path $DraftsPath "grok_out_recipe_editors.md"

    # =========================================================================
    # File presence
    # =========================================================================
    $exists = Test-Path -LiteralPath $draftPath
    Add-Result "RECIPE-ED: file exists (grok_out_recipe_editors.md)" $exists $(
        if (-not $exists) { "Missing: $draftPath" } else { $draftPath }
    )

    $content = Get-NormalizedContent -FilePath $draftPath
    if ($null -eq $content) {
        Add-Result "RECIPE-ED: content loadable" $false "Cannot evaluate markers; file missing"
    } else {
        Add-Result "RECIPE-ED: content loadable" $true ""

        # -----------------------------------------------------------------
        # ### FILE headers (required deliverables)
        # -----------------------------------------------------------------
        # recipes/new page
        $hasRecipesNew =
            (Test-HasFileHeader -Content $content -PathFragment "recipes/new") -or
            (Test-HasFileHeader -Content $content -PathFragment "recipes\new") -or
            [regex]::IsMatch($content, '(?mi)^###\s+FILE:.*recipes[/\\]new')
        Add-Result "RECIPE-ED: ### FILE recipes/new" $hasRecipesNew $(
            if (-not $hasRecipesNew) {
                "Expected ### FILE header for /recipes/new page (e.g. app/(app)/recipes/new/page.tsx)"
            } else { "" }
        )

        # recipes edit page: /recipes/[id]/edit or recipes/.../edit
        $hasRecipesEdit =
            (Test-HasFileHeader -Content $content -PathFragment "recipes/") -and
            (
                [regex]::IsMatch($content, '(?mi)^###\s+FILE:.*recipes[/\\].*edit') -or
                [regex]::IsMatch($content, '(?mi)^###\s+FILE:.*\[id\].*edit') -or
                (Test-HasFileHeader -Content $content -PathFragment "/edit/page.tsx")
            )
        # Also accept a dedicated edit route file without requiring both fragments on same line if path is clear
        if (-not $hasRecipesEdit) {
            $hasRecipesEdit =
                [regex]::IsMatch($content, '(?mi)^###\s+FILE:.*recipes[/\\]\[id\][/\\]edit') -or
                [regex]::IsMatch($content, '(?mi)^###\s+FILE:.*recipes[/\\].+[/\\]edit[/\\]page\.tsx')
        }
        Add-Result "RECIPE-ED: ### FILE recipes edit" $hasRecipesEdit $(
            if (-not $hasRecipesEdit) {
                "Expected ### FILE header for recipes/[id]/edit page"
            } else { "" }
        )

        # ingredients page: /recipes/ingredients
        $hasIngredientsPage =
            (Test-HasFileHeader -Content $content -PathFragment "recipes/ingredients") -or
            (Test-HasFileHeader -Content $content -PathFragment "ingredients/page.tsx") -or
            [regex]::IsMatch($content, '(?mi)^###\s+FILE:.*ingredients')
        Add-Result "RECIPE-ED: ### FILE ingredients page" $hasIngredientsPage $(
            if (-not $hasIngredientsPage) {
                "Expected ### FILE header for /recipes/ingredients (or ingredients manager page)"
            } else { "" }
        )

        # RecipeEditor (or similar editor component)
        $hasRecipeEditor =
            (Test-HasFileHeader -Content $content -PathFragment "RecipeEditor") -or
            (Test-HasFileHeader -Content $content -PathFragment "recipe-editor") -or
            (Test-HasFileHeader -Content $content -PathFragment "RecipeForm") -or
            [regex]::IsMatch($content, '(?mi)^###\s+FILE:.*(RecipeEditor|RecipeForm|IngredientEditor|IngredientManager|IngredientLineEditor)')
        Add-Result "RECIPE-ED: ### FILE RecipeEditor or similar" $hasRecipeEditor $(
            if (-not $hasRecipeEditor) {
                "Expected ### FILE header for RecipeEditor / RecipeForm / IngredientEditor component"
            } else { "" }
        )

        # -----------------------------------------------------------------
        # Save mutations: recipe.create / recipe.update
        # -----------------------------------------------------------------
        $hasCreateOrUpdate =
            [regex]::IsMatch($content, '(?i)recipe\.create') -or
            [regex]::IsMatch($content, '(?i)recipe\.update')
        Add-Result "RECIPE-ED: recipe.create or recipe.update" $hasCreateOrUpdate $(
            if (-not $hasCreateOrUpdate) {
                "Expected recipe.create and/or recipe.update save path"
            } else { "" }
        )

        # -----------------------------------------------------------------
        # softDelete
        # -----------------------------------------------------------------
        $hasSoftDelete =
            [regex]::IsMatch($content, '(?i)softDelete') -or
            [regex]::IsMatch($content, '(?i)soft_delete') -or
            [regex]::IsMatch($content, '(?i)recipe\.softDelete')
        Add-Result "RECIPE-ED: softDelete" $hasSoftDelete $(
            if (-not $hasSoftDelete) {
                "Expected recipe.softDelete (confirm dialog + restore on soft-deleted detail)"
            } else { "" }
        )

        # -----------------------------------------------------------------
        # Food-safety profile
        # -----------------------------------------------------------------
        $hasFoodSafety =
            [regex]::IsMatch($content, '(?i)setFoodSafetyProfile') -or
            [regex]::IsMatch($content, '(?i)food[_-]?safety') -or
            [regex]::IsMatch($content, '(?i)FoodSafetyProfile')
        Add-Result "RECIPE-ED: setFoodSafetyProfile or food-safety" $hasFoodSafety $(
            if (-not $hasFoodSafety) {
                "Expected ingredient.setFoodSafetyProfile and/or food-safety profile editor (admin-gated)"
            } else { "" }
        )

        # -----------------------------------------------------------------
        # LeftoverDecayPath reuse
        # -----------------------------------------------------------------
        $hasDecay =
            [regex]::IsMatch($content, '(?i)LeftoverDecayPath') -or
            [regex]::IsMatch($content, '(?i)leftover[_-]?decay[_-]?path')
        Add-Result "RECIPE-ED: LeftoverDecayPath" $hasDecay $(
            if (-not $hasDecay) {
                "Expected LeftoverDecayPath (reuse Wave 2 editing component)"
            } else { "" }
        )

        # -----------------------------------------------------------------
        # Merge suggestion on CONFLICT (duplicate ingredient name)
        # -----------------------------------------------------------------
        $hasMergeOrConflict =
            [regex]::IsMatch($content, '(?i)\bCONFLICT\b') -or
            [regex]::IsMatch($content, '(?i)\bmerge\b') -or
            [regex]::IsMatch($content, '(?i)merge[_-]?suggestion')
        Add-Result "RECIPE-ED: merge or CONFLICT" $hasMergeOrConflict $(
            if (-not $hasMergeOrConflict) {
                "Expected CONFLICT handling / merge suggestion when create ingredient hits unique index"
            } else { "" }
        )

        # -----------------------------------------------------------------
        # data-testid on interactive elements
        # -----------------------------------------------------------------
        $hasTestId =
            [regex]::IsMatch($content, '(?i)data-testid') -or
            [regex]::IsMatch($content, '(?i)getByTestId') -or
            [regex]::IsMatch($content, '(?i)testId')
        Add-Result "RECIPE-ED: data-testid" $hasTestId $(
            if (-not $hasTestId) {
                "Expected data-testid on interactive elements (Wave 2 convention)"
            } else { "" }
        )

        # -----------------------------------------------------------------
        # Component tests mentioned
        # -----------------------------------------------------------------
        $hasComponentTests =
            [regex]::IsMatch($content, '(?i)component\s+tests?') -or
            [regex]::IsMatch($content, '(?i)\.test\.(tsx?|jsx?)') -or
            [regex]::IsMatch($content, '(?mi)^###\s+FILE:.*\.test\.(tsx?|jsx?)') -or
            [regex]::IsMatch($content, '(?i)(vitest|@testing-library|render\()') -or
            [regex]::IsMatch($content, '(?i)instruction[-_]?step.*reorder|reorder.*instruction') -or
            [regex]::IsMatch($content, '(?i)quantity\s*0\s*rejected|merge-suggestion\s+flow')
        Add-Result "RECIPE-ED: component tests mentioned" $hasComponentTests $(
            if (-not $hasComponentTests) {
                "Expected component tests (instruction reorder, qty validation, merge suggestion, admin-gated safety)"
            } else { "" }
        )

        # -----------------------------------------------------------------
        # No .js relative import suffixes in TS/TSX fenced blocks
        # -----------------------------------------------------------------
        # Force array: empty List from function is unwrapped to $null by PowerShell
        $jsHits = @(Test-JsRelativeImportSuffixes -Content $content)
        $noJsSuffix = ($jsHits.Count -eq 0)
        Add-Result "RECIPE-ED: no .js relative import suffixes in TS blocks" $noJsSuffix $(
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

function Get-MinimalRecipeEditorsPassFixture {
    return @"
## NOTES
- Recipe editor at /recipes/new and /recipes/[id]/edit; save via recipe.create / recipe.update.
- Delete uses recipe.softDelete with confirm; restore on soft-deleted detail.
- Ingredient manager at /recipes/ingredients; food-safety via ingredient.setFoodSafetyProfile (admin).
- On CONFLICT from unique ingredient name, surface merge suggestion and select existing.
- Reuses Wave 2 LeftoverDecayPath. data-testid on interactive controls.
- Component tests: instruction-step reorder, quantity 0 rejected, merge-suggestion flow, safety editor hidden for non-admin.

### FILE: apps/web/src/app/(app)/recipes/new/page.tsx
``````tsx
import { RecipeEditor } from '@/components/recipes/RecipeEditor';

export default function NewRecipePage() {
  return <RecipeEditor mode="create" data-testid="recipe-editor-new" />;
}
``````

### FILE: apps/web/src/app/(app)/recipes/[id]/edit/page.tsx
``````tsx
import { RecipeEditor } from '@/components/recipes/RecipeEditor';

export default function EditRecipePage() {
  return <RecipeEditor mode="edit" data-testid="recipe-editor-edit" />;
}
``````

### FILE: apps/web/src/app/(app)/recipes/ingredients/page.tsx
``````tsx
export default function IngredientsPage() {
  return <div data-testid="ingredients-manager">Ingredient manager</div>;
}
``````

### FILE: apps/web/src/components/recipes/RecipeEditor.tsx
``````tsx
import { LeftoverDecayPath } from './LeftoverDecayPath';
import { trpc } from '@/lib/trpc/client';

export function RecipeEditor({ mode }: { mode: 'create' | 'edit' }) {
  const create = trpc.recipe.create.useMutation();
  const update = trpc.recipe.update.useMutation();
  const softDelete = trpc.recipe.softDelete.useMutation();
  const setSafety = trpc.ingredient.setFoodSafetyProfile.useMutation();
  void create; void update; void softDelete; void setSafety; void mode;
  return (
    <form data-testid="recipe-editor">
      <LeftoverDecayPath />
      <button type="button" data-testid="merge-suggestion">Merge existing on CONFLICT</button>
    </form>
  );
}
``````

### FILE: apps/web/src/components/recipes/RecipeEditor.test.tsx
``````tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

describe('RecipeEditor component tests', () => {
  it('rejects quantity 0', () => {
    expect(true).toBe(true);
  });
  it('shows merge suggestion on CONFLICT', () => {
    expect(true).toBe(true);
  });
});
``````
"@
}

function Get-MinimalRecipeEditorsFailFixture {
    return @"
## NOTES
- Intentionally incomplete / forbidden markers for self-test

### FILE: apps/web/src/components/broken.tsx
``````tsx
import { x } from './other.js';
export function Broken() { return <div>{x}</div>; }
``````
"@
}

function Invoke-SelfTest {
    Write-Host ""
    Write-Host "=== Self-test: Recipe Editors verifier (Task 14) ===" -ForegroundColor Cyan

    $tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("recipe-ed-verify-" + [guid]::NewGuid().ToString("N"))
    $passDir = Join-Path $tempRoot "pass"
    $failDir = Join-Path $tempRoot "fail"
    New-Item -ItemType Directory -Force -Path $passDir | Out-Null
    New-Item -ItemType Directory -Force -Path $failDir | Out-Null

    try {
        $passBody = (Get-MinimalRecipeEditorsPassFixture) -replace '``````', '```'
        $failBody = (Get-MinimalRecipeEditorsFailFixture) -replace '``````', '```'
        Set-Content -LiteralPath (Join-Path $passDir "grok_out_recipe_editors.md") -Value $passBody -Encoding UTF8
        Set-Content -LiteralPath (Join-Path $failDir "grok_out_recipe_editors.md") -Value $failBody -Encoding UTF8

        Write-Host ""
        Write-Host "--- Pass fixture ---" -ForegroundColor Cyan
        $passResult = Test-RecipeEditors -DraftsPath $passDir -Label "PASS-FIXTURE"

        Write-Host ""
        Write-Host "--- Fail fixture ---" -ForegroundColor Cyan
        $failResult = Test-RecipeEditors -DraftsPath $failDir -Label "FAIL-FIXTURE"

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

$outcome = Test-RecipeEditors -DraftsPath $draftsFull

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
