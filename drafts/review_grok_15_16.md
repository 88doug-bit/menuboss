# Review: Phase 1 Tasks 15–16 (Admin screens + PWA/search/perf) — Final

**Reviewer:** Review agent (`review/grok-15-16`)  
**Date:** 2026-07-15  
**Branch:** `review/grok-15-16`  
**Mode:** **Final fidelity review** (drafts present)

**Drafts reviewed:**
- `C:\Users\dougr\.grok\worktrees\01gitprojects-menu-boss\subagent-019f6691-763e-7f10-9523-bb148191a190\drafts\grok_out_admin_screens.md` (also copied to worktree `drafts/`)
- `C:\Users\dougr\.grok\worktrees\01gitprojects-menu-boss\subagent-019f6691-763e-7f10-9523-bb23abc66386\drafts\grok_out_pwa_search_perf.md` (also copied to worktree `drafts/`)

**Briefs:**
- `grok_15_admin_screens.md`
- `grok_16_pwa_search_perf.md`

| Task | Brief | Draft | Verdict |
|------|-------|-------|---------|
| **15** Admin router + `/admin` UI + tests | `grok_15_…` | `grok_out_admin_screens.md` | **Approve with nits** |
| **16** PWA D4 offline + global search + §12 budgets | `grok_16_…` | `grok_out_pwa_search_perf.md` | **Approve with nits** |

**Overall for integrator:** **Integrate both.** No full re-author. **Must merge AuthedShell** so Admin nav (15) and GlobalSearch (16) both land. **Key gates G1–G5 all Pass.**

---

## Executive summary

1. **Task 15 — Approve with nits.** New `admin` tRPC router is exclusively `adminProcedure`; thin Supabase JWT pass-throughs; no service-role; no SQL/RLS/migration files. Invites create/list/revoke (pending DELETE only; accepted BAD_REQUEST + `accepted_at IS NULL` filter), households/portionCategories/units/settings/audit/members present. `/admin` tabs cover invites/members, D17 portion editor, units, categories/tags, portion-calc athlete example, audit diff. Component + env-guarded integration tests match brief intent. Nits: AuthedShell/AppNav dual-path merge, taxonomy reorder UI not wired, integration tests SQL-level not tRPC-level, mojibake.
2. **Task 16 — Approve with nits.** D4 is hard: hand-rolled `sw.js` never caches non-GET or `/api/*`; no background-sync/periodicsync/mutation queue; TanStack persist dehydrates only allowlisted read routers; mutations `networkMode: 'online'`; offline banner + reconnect invalidation + save disables + calendar stale/empty states. Global search parallel lists + keyboard + recent. Budgets centralized in `e2e/budgets.ts` with soft@1× / hard@2× for E2E; P3 Vitest micro-bench. Nits: AuthedShell lacks Admin entry (merge with 15), P5 poll may reload (not pure realtime), SW interval cleanup leak, shopping page not explicitly offline-gated, mojibake, CI wiring left as coordinator TODO.

---

## Key gates (G1–G5)

| # | Gate | Status | Evidence |
|---|------|--------|----------|
| **G1** | Admin procedures = `adminProcedure` only | **Pass** | `admin.ts`: every `invites` / `households` / `portionCategories` / `units` / `familySettings` / `audit` / `members` procedure is `adminProcedure`. No `authedProcedure` on this router. Import is only `{ adminProcedure, createTRPCRouter }`. |
| **G2** | No service-role | **Pass** | Admin draft NOTES + all writes via `ctx.supabase` (JWT). No `SERVICE_ROLE` / service-role client / `createClient` admin key. PWA draft same; E2E uses persona JWT / storageState (service-role remains Wave 2 `global-setup` only if present elsewhere). |
| **G3** | No SQL / migration / RLS changes | **Pass** | Task 15 file set is schemas + routers + UI + tests only. No `### FILE:` under `supabase/migrations/`. NOTES: “No service-role; no SQL/RLS changes.” Relies on existing 0002 Shape C + 0005 `household_invite` policies. |
| **G4** | D4 read-only offline (no write queue / background sync) | **Pass** | `sw.js`: non-GET return; `/api/*` pass-through; comments forbid sync; no `sync` / `periodicsync` listeners. `shouldDehydrateMutation: () => false`; `shouldPersistQuery` rejects mutations + non-allowlist. Mutations `networkMode: "online"`. Grep for background-sync code finds only intentional “NO background sync” comments. |
| **G5** | Performance budgets P1–P5 wired | **Pass** | `e2e/budgets.ts`: P1=1500, P2=2000, P3=100, P4=500, P5=2000 ms. `perf-budgets.spec.ts` covers P1/P2/P4/P5 with `assertPerfBudget` (log always; soft >1×; hard throw >2×). P3: `portionPreview.bench.test.ts` 50× `calculateEffectiveProteinOz` under 100 ms (hard also asserts &lt;200 ms). |

---

# Task 15 — Family admin screens

**Verdict: Approve with nits**

## Brief compliance (condensed)

| Area | Status |
|------|--------|
| Output format (`## NOTES` / Summary + `### FILE:`) | **Pass** |
| `packages/schemas/src/admin.ts` email trim+lowercase+email; positive finite; role enum | **Pass** |
| Admin router surface: invites / households / portionCategories / units / familySettings / audit (+ members) | **Pass** |
| Every procedure `adminProcedure`; 42501 → FORBIDDEN via `throwFromPostgrest` | **Pass** |
| Invite revoke = DELETE pending only; accepted history | **Pass** |
| `/admin` in `(app)` tree; nav admin-gated; route friendly non-admin state | **Pass** |
| Portion categories: base oz, sort, active; D17 Adult Male hint; no hard delete | **Pass** |
| Units grouped by dimension; factor warning copy | **Pass** |
| Categories & tags editors; reparenting deferred note | **Partial** — create/rename/deactivate present; **reorder not wired** (see T15-2) |
| Family settings athlete example via `@menu-boss/portion-calc` | **Pass** |
| Audit paged + before/after expander | **Pass** |
| Component tests: email normalize, base oz ≤0, admins-only | **Pass** |
| Integration env-guarded invite create/revoke/accepted/member RLS | **Pass** (SQL semantics; not tRPC stack — T15-3) |
| No service-role; no SQL | **Pass** (G2/G3) |

## Focus gate detail (Task 15)

| Gate | Result | Notes |
|------|--------|-------|
| adminProcedure only | **Pass** | Full nested router tree |
| No service-role | **Pass** | JWT `ctx.supabase` only |
| No SQL changes | **Pass** | No migration FILE blocks |

## Findings (Task 15)

### T15-1 — AuthedShell merge conflict with Task 16 (High — merge)

- **Location:** Task 15 `AuthedShell.tsx` adds Admin to nav when `family.me.role === 'admin'`; Task 16 `AuthedShell.tsx` adds `GlobalSearch` but **drops** Admin entry and keeps static 4-item `NAV`.
- **Problem:** Last writer wins → either missing Admin or missing Search.
- **Fix on merge:** Single shell with (a) Admin item when `isAdmin`, (b) `<GlobalSearch />` in header, (c) prefer `@/lib/trpc/client` (shim at `@/trpc/client` already re-exports — either works).
- Effort: small. Risk: low if done once.

### T15-2 — Category/tag “reorder” advertised but not implemented (Medium)

- **Location:** `AdminPage` taxonomy copy: “Add child, rename, reorder, deactivate”; `CategoryTreeEditor` props are only `onCreate` / `onRename` / `onDeactivate` — no up/down or `category.reorder` mutation.
- **Problem:** Brief asks for reorder on categories tree. Existing Wave 1 `category.reorder` / `tag.reorder` adminProcedures unused by UI.
- **Recommended fix:** Wire up/down buttons calling `category.reorder` / `tag.reorder` (or numeric sort like portion categories). Acceptable v1 defer only if coordinator accepts partial.
- Effort: small–medium. Risk: low.

### T15-3 — Integration tests exercise SQL, not tRPC `admin.invites.*` (Low)

- **Location:** `admin.integration.test.ts` — direct `INSERT`/`DELETE` under JWT claims + `authenticated` role.
- **Problem:** Brief names `admin.invites.create` / revoke; tests prove 0005 + RLS correctly but skip Zod + `adminProcedure` middleware path.
- **Recommended:** Keep SQL tests (RLS truth); optional add one tRPC caller test later. Not a merge blocker.
- Effort: optional medium.

### T15-4 — AppNav `showAdmin` may be dead code (Nit)

- **Location:** Task 15 patches `AppNav.tsx` with `showAdmin`; `(app)/layout.tsx` uses `AuthedShell` only (not AppNav).
- **Fix:** Either wire AppNav into AuthedShell for DRY or drop unused AppNav patch on materialize.

### T15-5 — Mojibake in draft comments (`â€"`, `Â§`, `Ã—`) (Nit)

- Re-encode UTF-8 on materialize.

### T15-6 — Positive notes

- Invite email Zod transform + client normalize + tests; 0005 copy in dialog.
- Revoke double-guards accepted invites (router BAD_REQUEST + DELETE filter).
- Portion categories: no delete button (test asserts); Shape C deactivate-only.
- Live athlete example uses `calculatePerCategoryBreakdown` + `roundOz` only.
- Audit cursor pagination by bigint id; filters `table_name` / `record_id`.
- Non-admin `data-testid="admins-only"`; admin hub gated on `profile.role`.

---

# Task 16 — PWA read-only offline, global search, perf budgets

**Verdict: Approve with nits**

## Brief compliance (condensed)

| Area | Status |
|------|--------|
| Output format + NOTES justification | **Pass** |
| PWA: SW + manifest + icons; serwist fallback justified | **Pass** (hand-rolled `public/sw.js`) |
| Shell SWR / nav network-first; no API/POST cache | **Pass** |
| Read cache via TanStack persist + allowlist | **Pass** |
| Never cache/replay mutations; no background sync | **Pass** (G4) |
| Offline banner; calendar cached vs empty; save disabled + D4 copy | **Pass** (calendar, plan editor, combo, chef idea; shopping list view is read/checkoff) |
| Reconnect invalidate all queries | **Pass** (`OfflineReconnect`) |
| Global search: parallel recipes/ideas/combos/ingredients; badges; keyboard; recent | **Pass** |
| `e2e/budgets.ts` + P1/P2/P4/P5 E2E + P3 Vitest | **Pass** (G5) |
| Soft warn @ budget, hard fail @ 2× | **Pass** (E2E `assertPerfBudget`; P3 stricter hard at 1× too) |
| Env-guards like Wave 2 E2E | **Pass** (`e2eDescribe`) |
| No heavy deps beyond persister (+ optional serwist — none) | **Pass** |
| Coordinator TODOs for CI / pnpm install | **Pass** |

## Focus gate detail (Task 16)

| Gate | Result | Notes |
|------|--------|-------|
| D4 read-only offline | **Pass** | SW + persister + mutation networkMode + UX disables |
| Budgets P1–P5 | **Pass** | constants + specs + P3 bench |
| No service-role | **Pass** | No app service-role in draft |

## Findings (Task 16)

### T16-1 — AuthedShell missing Admin nav (High — merge with 15)

- Same as **T15-1**. Task 16 shell is the search-complete version; Task 15 shell is the admin-complete version. Union both.

### T16-2 — P5 measurement may include page reload (Medium)

- **Location:** `perf-budgets.spec.ts` P5 `expect.poll` reloads `pageB` while still under budget window if text not found.
- **Problem:** Brief wants realtime propagation timing; reload+refetch can pass without notify-then-refetch path.
- **Recommended:** Prefer invalidation-only wait first (match Wave 2 Scenario 11 style); use reload only as soft diagnostic outside hard budget, or document that reload is allowed flaky-margin.
- Effort: small. Risk: low (may make P5 harder to pass — good).

### T16-3 — ServiceWorkerRegister interval cleanup leak (Low)

- **Location:** `ServiceWorkerRegister.tsx` — `.then` returns a clearer function that is never invoked; effect cleanup only sets `cancelled`.
- **Fix:** Store interval id in outer scope; clear in effect return.
- Effort: trivial.

### T16-4 — Shopping generation not explicitly offline-gated in UI (Low)

- **Location:** `ShoppingListView` is display/checkoff only; draft does not patch shopping **page** generate path with `useOnlineStatus`.
- **Problem:** Brief: shopping-list generation requires connectivity with clear offline message. Mutations elsewhere are gated; generate is typically a query and will fail offline without cache — UX may be raw error vs D4 copy.
- **Recommended:** On shopping page, if offline and no cached list, show offline empty state (mirror calendar).
- Effort: small.

### T16-5 — P1 uses `Date.now()` wall clock (Nit)

- Brief prefers `performance.now` bracketed navigation; warm `page.goto` + wall clock is acceptable for cross-document navigations. Optional improve with Performance Navigation Timing.

### T16-6 — CI wiring deferred to coordinator TODO (Info)

- Correctly flags appending `perf-budgets.spec.ts` after Wave 2 E2E in `database-gates`. Integrator/CI owner must land this for G5 to gate in CI (draft ships the suite).

### T16-7 — Mojibake in comments (Nit)

- Same as Task 15; fix on materialize.

### T16-8 — Positive notes

- Clear NOTES on serwist vs hand-rolled and persister vs SW API cache — matches brief choice points.
- `PERSIST_ROUTERS` allowlist excludes `admin` / `health` writes surface; mutations rejected by type and dehydrate filter.
- Offline calendar: `calendar-offline-stale` vs `calendar-offline-empty` + disabled New plan.
- Plan save, combo create, idea create disabled offline with `OFFLINE_WRITE_MESSAGE`.
- Global search testids (`global-search`, `global-search-input`, `global-search-hit`) align with P4 E2E and prior Task 13 contract gap fill.
- Budget messages cite §12 ids; raw timings always logged.

---

## Cross-task merge checklist (integrator)

1. **AuthedShell once:** Admin nav (role gate) + GlobalSearch + existing waiting-for-invite / session gate. Prefer one `useTRPC` import path (`@/lib/trpc/client` or shim).
2. Materialize Task 15 admin router + schemas + `/admin` UI + tests.
3. Materialize Task 16 PWA/SW/manifest, persist provider, offline UX patches, search, budgets specs.
4. `pnpm install` for `@tanstack/react-query-persist-client` + `query-sync-storage-persister`.
5. CI: run `perf-budgets.spec.ts` after Wave 2 E2E in existing job (soft@1×, hard@2×).
6. Optional: category/tag reorder UI (T15-2); shopping offline empty (T16-4); SW interval fix (T16-3).
7. UTF-8-clean comments when materializing.

---

## Gate summary for dashboard

| Gate | Task | Result |
|------|------|--------|
| G1 adminProcedure only | 15 | **Pass** |
| G2 no service-role | 15+16 | **Pass** |
| G3 no SQL changes | 15 | **Pass** |
| G4 D4 read-only offline | 16 | **Pass** |
| G5 budgets P1–P5 | 16 | **Pass** |

**Integrator gate:** Integrate **15 + 16**. Reconcile **T15-1 / T16-1** (AuthedShell) before treating Wave 3 UI as complete. Remaining nits non-blocking.

---

## Verdict table

| Item | Result |
|------|--------|
| **Task 15** | **Approve with nits** |
| **Task 16** | **Approve with nits** |
| **Integrator** | **Integrate both** — merge AuthedShell; apply T15-2 optionally; wire CI budgets |
| **Re-author?** | **No** |

**One-line summary:** Tasks 15–16 are gate-green (adminProcedure-only admin surface, no service-role, no SQL, D4 read-only offline with no mutation queue/background sync, §12 budgets centralized with soft/hard thresholds); merge Admin nav + GlobalSearch in one AuthedShell and materialize both drafts without re-author.
