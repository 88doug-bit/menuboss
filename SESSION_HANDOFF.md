# Session handoff — MenuBoss (Grok)

**Last updated:** 2026-07-15  
**Branch:** `main` (tracks `origin/main`)  
**Remote:** `https://github.com/88doug-bit/menuboss.git`  
**Uncommitted (at handoff):** `DOCKER_SETUP.md` only (untracked) unless more was added later

Use this file to resume after a restart. Prefer it over reconstructing chat history.

---

## Standing instruction

User asked to **monitor the repo for design briefs** named `grok_01`, `grok_02`, … and **execute them** using **agent mode** from `agents.md`:

- Parallel subagents: **Implementer, Reviewer, Researcher, Tester**
- Each in **isolated git worktree** / separate branches
- Integrate deliverables into main workspace under `drafts/` and materialize code as appropriate

Restart the file monitor (poll for `^grok_\d+` files) if it is not already running.

---

## Project instructions (always apply)

| File | Role |
|------|------|
| `agents.md` | Parallel Implementer / Reviewer / Researcher / Tester + worktrees |
| `claude.md` | Plan-mode style review protocol (AskUserQuestion, numbered issues) — apply when in plan/review mode |
| `PHASE1_PLAN.md` | Wave ownership: Grok drafts, Opus materializes, Claude security/QA |
| `DOCKER_SETUP.md` | Windows Docker + WSL2 + Supabase local stack walkthrough |

**Grok code-output format:** one markdown file per brief in `drafts/`, with `### FILE: <path>` + fenced blocks; leading `## NOTES` allowed. Extensionless relative imports (no `.js` suffixes) for Turbopack.

---

## Design decisions (ratified 2026-07 design review — remember these)

- **D1** RLS sole auth authority; user JWT only on request paths; service role = migrations/audit/E2E setup only  
- **D2** tRPC inside Next.js; no NestJS; Edge Functions not v1  
- **D3** Portion formula once in `@menu-boss/portion-calc` (pure TS)  
- **D4** Offline v1 = **read-only** cache; no offline writes / background sync  
- **D5–D6** `MealPlanPortionRequirement` + `MealPlanHousehold`; no `protein_portions` JSONB / stored `is_shared`  
- **D7** Content family-global; visibility only on MealPlans  
- **D8** Plans date-ranged; assignment_date in range  
- **D12** Unit conversion within dimension only  
- **D14** Shopping list + weekly protein roll-up = SQL (`0003`)  
- **D17** Adult base oz on PortionCategory Adult Male row; no `FamilySettings.adult_reference_protein_oz`

---

## Brief pipeline status (all 01–16 done)

| Briefs | Outputs (`drafts/grok_out_*`) | Reviews |
|--------|-------------------------------|---------|
| `grok_01`…`grok_16` present | All matching `grok_out_*` present | `review_grok_01`, `_02_05`, `_06_07`, `_08_09`, `_10`, `_11_13`, `_14`, `_15_16` |

**PRD / docs drafts (Wave 0):** database PRD v0.4, product architecture, testing strategy, functional reqs, NFR/roadmap  
**Code drafts materialized in tree:** schema/seed, portion-calc, schemas, content routers, SQL functions, mealPlan RPC/router, Wave 2 UI + E2E, Wave 3 editors/admin/PWA

### Wave map

| Wave | Briefs | Focus |
|------|--------|--------|
| 0 | 01–05 | PRD revisions |
| 1 | 06–09 | Schema, portion-calc, Zod/routers, SQL aggregates |
| 2 | 10–13 | mealPlan backend, calendar UI, content UI, E2E + Scenario 11 |
| 3 | 14–16 | Recipe/ingredient editors, admin screens, PWA/search/perf |

---

## Repo layout (high level)

```
apps/web/          Next.js App Router + tRPC + UI
packages/portion-calc/   Canonical protein formula + contract fixtures
packages/schemas/        Shared Zod (incl. mealPlan, admin)
supabase/migrations/     0001 schema … 0005 auth provisioning
supabase/seed.sql
drafts/            Grok outputs, research, reviews
tests/             PowerShell brief verifiers
scripts/local-db-gate.ps1
DOCKER_SETUP.md    Local Docker/WSL/Supabase install guide
```

Migrations: `0001_schema` → `0002_security` (Claude) → `0003_functions` → `0004_meal_plan_rpc` → `0005_auth_provisioning` (Claude invites).

---

## Integrator nits still open (do not re-author wholesale)

1. **E2E testid / query-param drift** (Tasks 11–13) — alias to Task 13 NOTES  
2. **Dual provider trees** historically — prefer single QueryClient / shell (AuthedShell was merged: admin nav + GlobalSearch)  
3. **Task 14** units via client `SEED_UNITS` until `admin.units.list` / `unit.list` wired end-to-end for editors  
4. **Task 10** `listRange` should include assignments (applied from Task 11 worktree when integrated)  
5. **pnpm install** may still be needed for lockfile after Wave 3 dep adds  
6. **Docker not installed** on dev machine at last check — user has `DOCKER_SETUP.md`; next step after install is `supabase start` + env wiring  

---

## Security / product invariants (do not regress)

- No service-role in app request paths  
- Realtime: **notify-then-refetch only** — never render event payloads  
- No signup UI; invite-only (0005); waiting-for-invite when no profile  
- Soft-delete: list filters `deleted_at`; byId does not  
- Creating household membership on a plan is never removable  

---

## User preferences (from project rules)

- DRY aggressively; well-tested preferred over thin tests  
- Engineered enough (not under- or over-engineered)  
- Explicit over clever; handle edge cases  
- Claude plan-mode: section-by-section, options with numbers/letters, recommend first, AskUserQuestion  

---

## Resume checklist (next session)

1. Read this file + `PHASE1_PLAN.md` + `agents.md`  
2. `git status` — note untracked/uncommitted (`DOCKER_SETUP.md` at handoff)  
3. Restart **grok brief monitor** if user wants continued brief watching  
4. If user finished Docker: walk `supabase start`, env vars (`NEXT_PUBLIC_SUPABASE_*`, `DATABASE_URL`, `E2E_SUPABASE_URL`), local-db-gate  
5. On new `grok_17+` brief: spawn parallel worktree agents, integrate to `drafts/`  

---

## Do not

- Re-implement completed briefs from scratch without a changed brief  
- Add NestJS / Edge Functions / offline writes in v1  
- Commit secrets or service-role keys  
- Touch Claude-owned security policy content without coordinator  
