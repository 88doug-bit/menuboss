# MenuBoss local development startup
# From repo root:
#   .\scripts\start-dev.ps1
#   .\scripts\start-dev.ps1 -SkipSupabase
#   .\scripts\start-dev.ps1 -ResetDb
#   .\scripts\start-dev.ps1 -SkipInstall
#
# Boots (when available): local Supabase stack, env wiring for apps/web,
# pnpm install if needed, then Next.js dev server (http://localhost:3000).

[CmdletBinding()]
param(
    # Skip Docker/Supabase; only start the Next.js app
    [switch]$SkipSupabase,

    # Run `supabase db reset` (migrations + seed) after the stack is up
    [switch]$ResetDb,

    # Do not run `pnpm install` even if node_modules looks missing
    [switch]$SkipInstall,

    # Port for Next.js (default 3000)
    [int]$Port = 3000
)

# 'Continue' (not 'Stop'): native CLIs (docker, supabase, pnpm) often write
# progress/NOTICEs to stderr; PS 5.1 can turn those into terminating errors.
# Failures are checked via $LASTEXITCODE explicitly.
$ErrorActionPreference = 'Continue'
$repo = Split-Path -Parent $PSScriptRoot
$webDir = Join-Path $repo 'apps\web'
$envLocal = Join-Path $webDir '.env.local'
$envExample = Join-Path $webDir '.env.example'

function Write-Step {
    param([string]$Message)
    Write-Host ""
    Write-Host "==> $Message" -ForegroundColor Cyan
}

function Write-Ok {
    param([string]$Message)
    Write-Host "    $Message" -ForegroundColor Green
}

function Write-Warn {
    param([string]$Message)
    Write-Host "    $Message" -ForegroundColor Yellow
}

function Write-Fail {
    param([string]$Message)
    Write-Host "    $Message" -ForegroundColor Red
}

function Test-Command {
    param([string]$Name)
    return [bool](Get-Command $Name -ErrorAction SilentlyContinue)
}

function Initialize-NodePath {
    # Node is often installed under Local\Programs\nodejs but missing from PATH
    # (same path used by scripts/local-db-gate.ps1). Prepend known locations.
    if (Test-Command 'node') { return }

    $candidates = @(
        (Join-Path $env:LOCALAPPDATA 'Programs\nodejs'),
        (Join-Path $env:ProgramFiles 'nodejs'),
        (Join-Path ${env:ProgramFiles(x86)} 'nodejs'),
        (Join-Path $env:USERPROFILE 'scoop\apps\nodejs\current'),
        (Join-Path $env:USERPROFILE 'scoop\apps\nodejs-lts\current')
    ) | Where-Object { $_ -and (Test-Path (Join-Path $_ 'node.exe')) }

    foreach ($dir in $candidates) {
        $env:Path = "$dir;$env:Path"
        if (Test-Command 'node') {
            Write-Warn "node was not on PATH; prepended: $dir"
            Write-Warn "To fix permanently (User PATH), run once:"
            Write-Warn "  [Environment]::SetEnvironmentVariable('Path', '$dir;' + [Environment]::GetEnvironmentVariable('Path','User'), 'User')"
            return
        }
    }
}

function Get-EnvFileMap {
    param([string]$Path)
    $map = [ordered]@{}
    if (-not (Test-Path $Path)) { return $map }
    foreach ($line in Get-Content $Path) {
        $trim = $line.Trim()
        if ($trim -eq '' -or $trim.StartsWith('#')) { continue }
        $eq = $trim.IndexOf('=')
        if ($eq -lt 1) { continue }
        $key = $trim.Substring(0, $eq).Trim()
        $val = $trim.Substring($eq + 1).Trim()
        # Strip optional surrounding quotes
        if (($val.StartsWith('"') -and $val.EndsWith('"')) -or ($val.StartsWith("'") -and $val.EndsWith("'"))) {
            $val = $val.Substring(1, $val.Length - 2)
        }
        $map[$key] = $val
    }
    return $map
}

function Set-EnvFileValue {
    param(
        [string]$Path,
        [string]$Key,
        [string]$Value
    )
    $lines = @()
    if (Test-Path $Path) {
        $lines = @(Get-Content $Path)
    }
    $found = $false
    $out = foreach ($line in $lines) {
        if ($line -match "^\s*#") { $line; continue }
        if ($line -match "^\s*$") { $line; continue }
        if ($line -match "^\s*$([regex]::Escape($Key))\s*=") {
            $found = $true
            "$Key=$Value"
        } else {
            $line
        }
    }
    if (-not $found) {
        if ($out.Count -gt 0 -and $out[-1] -ne '') {
            $out = @($out) + @('')
        }
        $out = @($out) + @("$Key=$Value")
    }
    $utf8NoBom = New-Object System.Text.UTF8Encoding $false
    [System.IO.File]::WriteAllLines($Path, $out, $utf8NoBom)
}

function Get-SupabaseStatusMap {
    # `supabase status -o env` prints KEY=value lines suitable for parsing
    $raw = & supabase status -o env 2>&1 | ForEach-Object { "$_" }
    if ($LASTEXITCODE -ne 0) {
        throw "supabase status failed:`n$($raw -join "`n")"
    }
    $map = @{}
    foreach ($line in $raw) {
        $trim = "$line".Trim()
        if ($trim -eq '' -or $trim.StartsWith('#')) { continue }
        $eq = $trim.IndexOf('=')
        if ($eq -lt 1) { continue }
        $key = $trim.Substring(0, $eq).Trim()
        $val = $trim.Substring($eq + 1).Trim().Trim('"').Trim("'")
        $map[$key] = $val
    }
    return $map
}

# ---------------------------------------------------------------------------
Write-Host "MenuBoss local dev startup" -ForegroundColor White
Write-Host "Repo: $repo"

# --- Prerequisites ---------------------------------------------------------
Write-Step "Checking prerequisites"

Initialize-NodePath

if (-not (Test-Command 'node')) {
    Write-Fail "Node.js not found on PATH (need >= 20)."
    Write-Fail "Install from https://nodejs.org or ensure node.exe is on PATH."
    Write-Fail "This machine previously had Node at: $env:LOCALAPPDATA\Programs\nodejs"
    exit 1
}
$nodeVersion = (& node -v 2>$null)
Write-Ok "node $nodeVersion"

if (-not (Test-Command 'pnpm')) {
    Write-Warn "pnpm not found — trying corepack enable..."
    if (Test-Command 'corepack') {
        & corepack enable 2>$null | Out-Null
        & corepack prepare pnpm@11.13.0 --activate 2>$null | Out-Null
    }
}
if (-not (Test-Command 'pnpm')) {
    Write-Fail "pnpm not found. Install via corepack or https://pnpm.io/installation"
    exit 1
}
$pnpmVersion = (& pnpm -v 2>$null)
Write-Ok "pnpm $pnpmVersion"

if (-not (Test-Path $webDir)) {
    Write-Fail "Expected web app at apps\web — not found."
    exit 1
}

# --- Supabase stack --------------------------------------------------------
$supabaseReady = $false
if ($SkipSupabase) {
    Write-Step "Skipping Supabase (-SkipSupabase)"
} else {
    Write-Step "Local Supabase stack"

    if (-not (Test-Command 'supabase')) {
        Write-Warn "Supabase CLI not found. Install it, then re-run (see DOCKER_SETUP.md)."
        Write-Warn "Continuing with web-only; auth/API will fail without a backend."
    } elseif (-not (Test-Command 'docker')) {
        Write-Warn "Docker not found on PATH. Supabase needs Docker Desktop running."
        Write-Warn "See DOCKER_SETUP.md. Continuing with web-only."
    } else {
        # Is Docker daemon up?
        & docker info 1>$null 2>$null
        if ($LASTEXITCODE -ne 0) {
            Write-Warn "Docker is installed but the daemon is not reachable (start Docker Desktop)."
            Write-Warn "Continuing with web-only."
        } else {
            Write-Ok "Docker is running"

            Write-Host "    Starting supabase (no-op if already running)..."
            Push-Location $repo
            try {
                & supabase start
                if ($LASTEXITCODE -ne 0) {
                    Write-Fail "supabase start exited with code $LASTEXITCODE"
                    Write-Warn "Continuing without refreshing env from supabase status."
                } else {
                    $supabaseReady = $true
                    Write-Ok "Supabase stack is up"
                }
            } finally {
                Pop-Location
            }

            if ($supabaseReady -and $ResetDb) {
                Write-Host "    Resetting database (migrations + seed)..."
                Push-Location $repo
                try {
                    & supabase db reset
                    if ($LASTEXITCODE -ne 0) {
                        Write-Fail "supabase db reset exited with code $LASTEXITCODE"
                        exit 1
                    }
                    Write-Ok "Database reset complete"
                } finally {
                    Pop-Location
                }
            }
        }
    }
}

# --- Env file --------------------------------------------------------------
Write-Step "Configuring apps/web/.env.local"

if (-not (Test-Path $envLocal)) {
    if (Test-Path $envExample) {
        Copy-Item $envExample $envLocal
        Write-Ok "Created .env.local from .env.example"
    } else {
        @(
            '# Supabase project connection (client-safe values only).'
            'NEXT_PUBLIC_SUPABASE_URL='
            'NEXT_PUBLIC_SUPABASE_ANON_KEY='
        ) | Set-Content -Path $envLocal -Encoding utf8
        Write-Ok "Created empty .env.local"
    }
}

if ($supabaseReady) {
    try {
        $status = Get-SupabaseStatusMap
        # CLI env output uses API_URL / ANON_KEY (and sometimes NEXT_PUBLIC_* aliases)
        $apiUrl = $status['API_URL']
        if (-not $apiUrl) { $apiUrl = $status['NEXT_PUBLIC_SUPABASE_URL'] }
        $anonKey = $status['ANON_KEY']
        if (-not $anonKey) { $anonKey = $status['NEXT_PUBLIC_SUPABASE_ANON_KEY'] }

        if ($apiUrl) {
            Set-EnvFileValue -Path $envLocal -Key 'NEXT_PUBLIC_SUPABASE_URL' -Value $apiUrl
            Write-Ok "NEXT_PUBLIC_SUPABASE_URL=$apiUrl"
        } else {
            Write-Warn "Could not read API_URL from supabase status"
        }
        if ($anonKey) {
            Set-EnvFileValue -Path $envLocal -Key 'NEXT_PUBLIC_SUPABASE_ANON_KEY' -Value $anonKey
            Write-Ok "NEXT_PUBLIC_SUPABASE_ANON_KEY=(from supabase status)"
        } else {
            Write-Warn "Could not read ANON_KEY from supabase status"
        }
    } catch {
        Write-Warn "Failed to sync env from supabase status: $_"
    }
}

$envMap = Get-EnvFileMap $envLocal
$url = $envMap['NEXT_PUBLIC_SUPABASE_URL']
$anon = $envMap['NEXT_PUBLIC_SUPABASE_ANON_KEY']
if (-not $url -or -not $anon) {
    Write-Warn "NEXT_PUBLIC_SUPABASE_URL and/or NEXT_PUBLIC_SUPABASE_ANON_KEY are empty in .env.local"
    Write-Warn "Fill them from ``supabase status`` (or a remote project) before expecting login to work."
} else {
    Write-Ok "Env looks set (URL + anon key present)"
}

# --- Dependencies ----------------------------------------------------------
Write-Step "Dependencies"

$needInstall = $false
if (-not $SkipInstall) {
    $rootModules = Join-Path $repo 'node_modules'
    $webModules = Join-Path $webDir 'node_modules'
    if (-not (Test-Path $rootModules) -or -not (Test-Path $webModules)) {
        $needInstall = $true
    }
}

if ($needInstall) {
    Write-Host "    Running pnpm install..."
    Push-Location $repo
    try {
        & pnpm install
        if ($LASTEXITCODE -ne 0) {
            Write-Fail "pnpm install failed with exit code $LASTEXITCODE"
            exit 1
        }
        Write-Ok "pnpm install complete"
    } finally {
        Pop-Location
    }
} elseif ($SkipInstall) {
    Write-Ok "Skipped install (-SkipInstall)"
} else {
    Write-Ok "node_modules present (skip install; use pnpm install manually if deps changed)"
}

# --- Dev server ------------------------------------------------------------
Write-Step "Starting Next.js dev server"
Write-Host "    Filter: web  ·  port: $Port"
Write-Host "    Open:   http://localhost:$Port"
Write-Host "    Stop:   Ctrl+C"
Write-Host ""

Push-Location $repo
try {
    $env:PORT = "$Port"
    & pnpm --filter web dev -- --port $Port
    exit $LASTEXITCODE
} finally {
    Pop-Location
}
