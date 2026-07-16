# Docker setup (Windows) — MenuBoss local stack

**Purpose:** Install Docker on this Windows development machine so the full local Supabase stack (`supabase start`) can run for migrations, pgTAP, Realtime, and Playwright E2E.

**Machine snapshot (when these notes were written):** Windows 11 (build 22000, AMD64), Docker not installed, hypervisor present, WSL not fully configured.

Admin rights are required. Plan on **one reboot**.

---

## What you need

| Piece | Why |
|--------|-----|
| **WSL 2** | Docker Desktop’s recommended backend on Windows |
| **Docker Desktop** | Runs the Supabase containers |
| **Supabase CLI** (after Docker) | `supabase start`, migrations, local keys |

For MenuBoss, Docker is mainly so `supabase start` can run Postgres, Auth (GoTrue), Realtime, and related services. Without Docker, full-stack E2E suites skip unless `E2E_SUPABASE_URL` is set against a remote stack.

---

## Step 1 — Install / enable WSL 2

Open **PowerShell as Administrator** and run:

```powershell
wsl --install
```

That enables WSL + Virtual Machine Platform and usually installs Ubuntu.

Then **reboot**.

After reboot, finish Ubuntu setup if a window opens (username/password). Then check:

```powershell
wsl -l -v
```

You want something like:

```text
  NAME      STATE           VERSION
* Ubuntu    Running         2
```

If a distro shows **VERSION 1**:

```powershell
wsl --set-default-version 2
wsl --set-version Ubuntu 2
```

**BIOS note:** If install fails with virtualization errors, enable **Intel VT-x / AMD-V** (and “Virtualization” / SVM) in firmware. If `HyperVisorPresent` is already `True` in Windows, you may be fine.

---

## Step 2 — Install Docker Desktop

### Option A — winget (simplest)

In a normal or Admin PowerShell:

```powershell
winget install --id Docker.DockerDesktop -e --accept-package-agreements --accept-source-agreements
```

### Option B — installer

1. Download: https://docs.docker.com/desktop/setup/install/windows-install/
2. Run **Docker Desktop Installer.exe**
3. Leave **“Use WSL 2 instead of Hyper-V”** checked
4. Finish and reboot if asked

---

## Step 3 — First launch and settings

1. Start **Docker Desktop** from the Start menu.
2. Accept the service agreement.
3. Wait until the whale icon is steady (not “starting…”).
4. Open **Settings → General**:
   - **Use the WSL 2 based engine** — on
5. **Settings → Resources → WSL integration**:
   - Enable integration with your Ubuntu distro
6. Apply & restart Docker if prompted

**Sign-in** to Docker Hub is optional for local Supabase; you can skip for now.

---

## Step 4 — Verify Docker works

Open a **new** PowerShell session (so PATH picks up `docker`):

```powershell
docker version
docker run --rm hello-world
```

You should see client **and** server versions, and a “Hello from Docker!” message.

If `docker` is still “not recognized”, log out/in or reboot once so PATH updates.

---

## Step 5 — Tie it to MenuBoss (after Docker is healthy)

From the repo root (`menu_boss`):

### 1) Install Supabase CLI (pick one)

```powershell
# scoop (if you use scoop)
scoop bucket add supabase https://github.com/supabase/scoop-bucket.git
scoop install supabase

# or npm (global)
npm install -g supabase
```

Docs: https://supabase.com/docs/guides/cli

### 2) Start the local stack

```powershell
cd C:\Users\dougr\01gitprojects\menu_boss
supabase start
```

First run pulls several images (several GB; can take a while). When it finishes it prints **API URL**, **anon key**, **service_role key**, and DB URL.

### 3) Point the app / E2E at it

Typical env (exact names match Wave 2/3 briefs and local gates):

```text
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon from supabase status>
SUPABASE_SERVICE_ROLE_KEY=<service_role — E2E global-setup only>
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres
E2E_SUPABASE_URL=http://127.0.0.1:54321
```

Confirm with:

```powershell
supabase status
```

### 4) Migrations / seed

With Docker + CLI up, apply ordered migrations (`0001` → `0005`) and seed the way local gate scripts expect (`scripts/local-db-gate.ps1` or `supabase db reset` if that is how you standardize).

See also `supabase/README.md`.

---

## Resource expectations

| Resource | Rough guidance |
|----------|----------------|
| Disk | **~10–20 GB** free for images + volumes |
| RAM | Docker defaults are OK; give **≥4 GB** if you can (Settings → Resources) |
| CPU | Defaults fine for a single family stack |

Stop the stack when idle:

```powershell
supabase stop
# or quit Docker Desktop entirely
```

---

## Common Windows gotchas

1. **“Hardware assisted virtualization and data execution protection must be enabled”**  
   → BIOS + Windows features (WSL / VM Platform).

2. **WSL not installed / only stub**  
   → Complete Step 1 and reboot; `wsl -l -v` must list a **VERSION 2** distro.

3. **Docker Desktop stuck starting**  
   → Update WSL: `wsl --update`, then restart Docker.

4. **Port conflicts (54321, 54322, 8000, etc.)**  
   → Something else using those ports; stop it or change `supabase/config.toml` ports.

5. **Corporate VPN / antivirus**  
   → Sometimes blocks the Linux VM or image pulls; try offline VPN or allowlist Docker/WSL.

6. **Never put `SUPABASE_SERVICE_ROLE_KEY` in app code**  
   → Only E2E `global-setup` / local admin tooling (Product PRD / Wave 2–3 briefs). App request paths use the caller JWT + RLS only.

---

## Suggested order

1. Admin PowerShell: `wsl --install` → **reboot**
2. Confirm `wsl -l -v` shows Ubuntu **VERSION 2**
3. `winget install Docker.DockerDesktop` → start Desktop → WSL engine on
4. `docker run --rm hello-world`
5. Install Supabase CLI → `supabase start` in `menu_boss`
6. Copy keys into env for web + E2E

---

## Related docs

- `supabase/README.md` — local Supabase layout and CLI notes
- `PHASE1_PLAN.md` — Phase 1 ownership and local stack conventions
- `Product_PRD_v0.2.md` — testing strategy, offline (D4), performance budgets
- Wave 2 E2E: suites skip unless `E2E_SUPABASE_URL` is set (full GoTrue + Realtime stack)
