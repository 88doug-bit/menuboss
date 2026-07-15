# MenuBoss — Phase 1 Execution Plan

**Date:** 2026-07-15 · **Basis:** Product PRD v0.2 §13.2 (Phase 1 MVP) + Database PRD v0.4
**Delegation model:** Grok drafts all text-shaped code via briefs (`grok_NN_*.md` → outputs in `drafts/`); Opus agents handle local scaffolding and materializing code into the repo; Claude (coordinator) authors only security-critical code and runs QA gates.

## Ownership split

| Owner | Work |
|---|---|
| **Grok** | Schema migration + seed data, portion-calc package + unit tests, Zod schemas, tRPC content routers, SQL aggregation functions, (Wave 2) mealPlan router, frontend screens, Playwright specs |
| **Opus agents** | Monorepo scaffold, materializing Grok code outputs into the repo, build/test verification runs, adversarial code review |
| **Claude** | `0002_security.sql` (RLS policies, helper functions, profile guard trigger, attribution-immutability trigger, date-range triggers, audit triggers), RLS test matrix harness, TS↔SQL portion contract test, all QA gates |

## Repo conventions (all briefs and agents follow these)

- **Monorepo:** pnpm workspaces.
  - `apps/web` — Next.js (App Router, TypeScript strict, Tailwind, shadcn/ui), hosts tRPC v11 under `apps/web/src/server/` (routers per Product PRD §10.2), TanStack Query client.
  - `packages/portion-calc` — pure TS, zero runtime deps, Vitest.
  - `packages/schemas` — Zod schemas shared by routers and forms.
- **Supabase:** `supabase/migrations/` with strict ordering:
  - `0001_schema.sql` — all tables, constraints, indexes (Grok, from DB PRD v0.4 §4.1/§6) — **excludes** policies/triggers/functions.
  - `0002_security.sql` — RLS enable-all, policies, helper fns, security triggers, audit tables (Claude).
  - `0003_functions.sql` — `generate_shopping_list`, `weekly_protein_rollup` (Grok draft per DB PRD v0.4 §6 contract; Claude review).
  - `supabase/seed.sql` — units, portion categories, category/tag taxonomy starter, 3 households + 5 test personas (matrix fixtures).
  - `supabase/tests/rls/` — pgTAP matrix (Claude).
- **Auth context:** every tRPC procedure builds a Supabase client from the caller's JWT; no service-role usage in request paths (Product PRD §10.5).
- **Grok code-output format:** one markdown file per brief in `drafts/`, containing repo files as `### FILE: <repo-relative-path>` headers each followed by a single fenced code block. No prose between files except a leading `## NOTES` block. The materializer writes them verbatim.

## Waves

**Wave 1 (now):** scaffold; `0001_schema.sql` + seed (grok_06); portion-calc (grok_07); Zod schemas + content routers — recipe, ingredient, category, tag, chefIdea, recipeCombination (grok_08); SQL functions (grok_09); Claude security migration + RLS harness + contract test. Gate: `pnpm typecheck` + all unit tests + RLS matrix green against local Supabase.

**Wave 2:** briefs grok_10 (mealPlan backend: `0004_meal_plan_rpc.sql` SECURITY INVOKER RPC + router + integration tests), grok_11 (auth UI + calendar + plan editor + realtime notify-then-refetch wiring), grok_12 (recipe/ChefIdea/combination/shopping-list screens + nav shell), grok_13 (Playwright E2E over §9.3 flows + Realtime Scenario-11 unshare-cutoff test + CI wiring). Claude-owned in Wave 2: `0005_auth_provisioning.sql` (SECURITY DEFINER on-signup hook + profile↔auth.users FK), security review of the 0004 RPC, full RLS grid harness (task backlog), Wave 2 QA gate. Gate: integration tests + §9.3 flow E2E (plan a shared meal) + Scenario 11.

**Wave 3:** remaining screens (ChefIdea, combinations, decay paths, shopping list UI), PWA read-only offline, search, performance-budget E2E checks. Gate: full Phase 1 success criteria (Product PRD §13.2).

## Sequencing constraints

- grok_06/07/08/09 are independent of the scaffold and each other → run in parallel.
- Claude's `0002_security.sql` and pgTAP harness land after grok_06 materializes (table names are locked by the PRD, but the migration must apply on top of 0001).
- Wave 2 briefs are written after Wave 1 gate passes (router conventions proven by then).
