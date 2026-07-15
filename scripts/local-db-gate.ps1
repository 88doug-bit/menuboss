# MenuBoss local database gate (no-Docker substitute for the CI database-gates job).
# Boots nothing: expects the portable Postgres cluster already running.
#   Server: C:\Users\dougr\tools\pg16\pgsql  ·  data: C:\Users\dougr\tools\pgdata-menuboss  ·  port 54322
# Applies: supabase stub -> migrations 0001..0003 -> seed -> pgTAP shim,
# then runs the RLS matrix, the SQL function tests, and the TS<->SQL contract test.
# Any failure exits non-zero.

# 'Continue', not 'Stop': psql writes NOTICEs to stderr, and PS 5.1 turns
# native stderr under 2>&1 + EAP Stop into a terminating NativeCommandError.
# Failure detection is explicit ($LASTEXITCODE + output scanning) throughout.
$ErrorActionPreference = 'Continue'
$pg   = 'C:\Users\dougr\tools\pg16\pgsql\bin'
$repo = Split-Path -Parent $PSScriptRoot
$db   = 'menuboss_gate'
$conn = @('-h', '127.0.0.1', '-p', '54322', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1', '-q')

function Invoke-Psql {
    # NB: parameter deliberately NOT named $Args — that collides with
    # PowerShell's automatic variable and splats an empty list instead.
    param([string]$Database, [string[]]$PsqlArgs)
    & "$pg\psql.exe" @conn -d $Database @PsqlArgs
    if ($LASTEXITCODE -ne 0) { throw "psql failed ($LASTEXITCODE): $($PsqlArgs -join ' ')" }
}

Write-Output '=== [1/5] Recreate database + apply stub, ALL migrations, seed, shim'
# WITH (FORCE): terminate lingering connections (e.g., a pooled client from a
# previous contract-test run) instead of hanging the whole gate on the DROP.
& "$pg\psql.exe" @conn -d postgres -c "DROP DATABASE IF EXISTS $db WITH (FORCE);" | Out-Null
& "$pg\psql.exe" @conn -d postgres -c "CREATE DATABASE $db;" | Out-Null
$applyFiles = @("$repo\supabase\tests\local\00_supabase_stub.sql")
$applyFiles += (Get-ChildItem "$repo\supabase\migrations\*.sql" | Sort-Object Name | ForEach-Object { $_.FullName })
$applyFiles += @("$repo\supabase\seed.sql", "$repo\supabase\tests\local\01_pgtap_shim.sql")
foreach ($f in $applyFiles) {
    Write-Output ("    applying " + (Split-Path -Leaf $f))
    Invoke-Psql $db @('-f', $f)
}

Write-Output '=== [2/5] pgTAP suites (supabase/tests/rls + supabase/tests/functions)'
$suiteFiles = @()
$suiteFiles += (Get-ChildItem "$repo\supabase\tests\rls\*.test.sql" | Sort-Object Name | ForEach-Object { $_.FullName })
$suiteFiles += (Get-ChildItem "$repo\supabase\tests\functions\*.test.sql" | Sort-Object Name | ForEach-Object { $_.FullName })
foreach ($t in $suiteFiles) {
    $name = Split-Path -Leaf $t
    $out = (& "$pg\psql.exe" @conn -d $db -f $t 2>&1 | ForEach-Object { "$_" }) -join "`n"
    if ($LASTEXITCODE -ne 0 -or $out -match 'TAP-FAIL|NOT OK') {
        Write-Output $out
        throw "pgTAP suite FAILED: $name"
    }
    $summary = ($out -split "`n" | Where-Object { $_ -match 'TAP: all' }) -join ''
    Write-Output ("    " + $name + " -> " + $summary.Trim())
}
Write-Output '=== [3/5] (pgTAP suites consolidated into step 2)'

Write-Output '=== [4/5] Contract test (TS portion-calc <-> SQL weekly_protein_rollup)'
$env:Path = 'C:\Users\dougr\AppData\Local\Programs\nodejs;' + $env:Path
$env:DATABASE_URL = "postgresql://postgres@127.0.0.1:54322/$db"
Push-Location $repo
try {
    $contractOut = (pnpm --filter '@menu-boss/portion-calc' exec vitest run src/contract.integration.test.ts 2>&1 | ForEach-Object { "$_" }) -join "`n"
    Write-Output ($contractOut -split "`n" | Where-Object { $_ -match 'Tests|passed|failed' })
    if ($LASTEXITCODE -ne 0) { Write-Output $contractOut; throw 'Contract test FAILED' }
    if ($contractOut -notmatch 'Tests[^0-9]*10 passed') {
        Write-Output $contractOut
        throw 'Contract suite did not report 10 passing cases (skipped or partial) — gate must fully run'
    }
} finally {
    Pop-Location
    Remove-Item Env:\DATABASE_URL -ErrorAction SilentlyContinue
}

Write-Output '=== [5/5] LOCAL DATABASE GATE: ALL GREEN'
