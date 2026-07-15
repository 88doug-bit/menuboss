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

Write-Output '=== [1/5] Recreate database + apply stub, migrations, seed, shim'
# WITH (FORCE): terminate lingering connections (e.g., a pooled client from a
# previous contract-test run) instead of hanging the whole gate on the DROP.
& "$pg\psql.exe" @conn -d postgres -c "DROP DATABASE IF EXISTS $db WITH (FORCE);" | Out-Null
& "$pg\psql.exe" @conn -d postgres -c "CREATE DATABASE $db;" | Out-Null
Invoke-Psql $db @('-f', "$repo\supabase\tests\local\00_supabase_stub.sql")
Invoke-Psql $db @('-f', "$repo\supabase\migrations\0001_schema.sql")
Invoke-Psql $db @('-f', "$repo\supabase\migrations\0002_security.sql")
Invoke-Psql $db @('-f', "$repo\supabase\migrations\0003_functions.sql")
Invoke-Psql $db @('-f', "$repo\supabase\seed.sql")
Invoke-Psql $db @('-f', "$repo\supabase\tests\local\01_pgtap_shim.sql")

Write-Output '=== [2/5] RLS matrix (supabase/tests/rls/matrix.test.sql)'
$matrixOut = (& "$pg\psql.exe" @conn -d $db -f "$repo\supabase\tests\rls\matrix.test.sql" 2>&1 | ForEach-Object { "$_" }) -join "`n"
if ($LASTEXITCODE -ne 0 -or $matrixOut -match 'TAP-FAIL|NOT OK') {
    Write-Output $matrixOut
    throw 'RLS matrix FAILED'
}
Write-Output ($matrixOut -split "`n" | Where-Object { $_ -match 'TAP: all' })

Write-Output '=== [3/5] SQL function tests (supabase/tests/functions/aggregation.test.sql)'
$fnOut = (& "$pg\psql.exe" @conn -d $db -f "$repo\supabase\tests\functions\aggregation.test.sql" 2>&1 | ForEach-Object { "$_" }) -join "`n"
if ($LASTEXITCODE -ne 0 -or $fnOut -match 'TAP-FAIL|NOT OK') {
    Write-Output $fnOut
    throw 'SQL function tests FAILED'
}
Write-Output ($fnOut -split "`n" | Where-Object { $_ -match 'TAP: all' })

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
