# Review: Phase 1 Tasks 11–13 (Calendar Screens + Content Screens + E2E/Realtime) — Final

**Reviewer:** Review agent (`review/grok-11-13`)  
**Date:** 2026-07-15  
**Branch:** `review/grok-11-13`  
**Mode:** **Final fidelity review** (drafts present)

**Drafts reviewed:**
- `C:\Users\dougr\01gitprojects\menu_boss\drafts\grok_out_calendar_screens.md`
- `C:\Users\dougr\01gitprojects\menu_boss\drafts\grok_out_content_screens.md`
- `C:\Users\dougr\01gitprojects\menu_boss\drafts\grok_out_e2e_realtime.md`

**Briefs:**
- `grok_11_calendar_plan_screens.md`
- `grok_12_content_screens.md`
- `grok_13_e2e_realtime.md`

| Task | Brief | Draft | Verdict |
|------|-------|-------|---------|
| **11** Auth + calendar + plan editor + realtime | `grok_11_…` | `grok_out_calendar_screens.md` | **Approve with nits** |
| **12** Recipes / ideas / combos / shopping + nav | `grok_12_…` | `grok_out_content_screens.md` | **Approve with nits** |
| **13** Playwright E2E + Scenario 11 + CI | `grok_13_…` | `grok_out_e2e_realtime.md` | **Approve with nits** |

**Overall for integrator:** **Integrate all three.** No full re-author. Reconcile cross-task **provider paths**, **data-testid aliases**, and **shopping query param** on materialize (or a single follow-up PR) before expecting CI E2E green. **Key gates G1–G5 all Pass.**

---

## Executive summary

1. **Task 11 — Approve with nits.** Invite-only auth; notify-then-refetch realtime (payload ignored); live portion preview via `@menu-boss/portion-calc` only; calendar + editor + Vitest coverage present. Nits: E2E testids diverge from Task 13; dual AppProviders/tRPC path vs Task 12; assignment picker is `<select>` without inline safety note.
2. **Task 12 — Approve with nits.** Nav shell, recipe/idea/combo/shopping surfaces, interleaved ChefIdeas, Optional isolation, component tests. Nits: testid names vs Task 13; leftover linked-recipe **add** incomplete; no persistent global search; shopping accepts `planIds`/`plans` but not `mealPlanIds`.
3. **Task 13 — Approve with nits.** Strong env skip contract; service-role confined to `global-setup.ts`; Scenario 11 all four assertions + SECURITY language; CI extends `database-gates` only. Nits: documented testid contract not yet implemented by 11/12; shopping URL uses `mealPlanIds`; mojibake in comments.

---

## Key gates (G1–G5)

| # | Gate | Status | Evidence |
|---|------|--------|----------|
| **G1** | No event payload render | **Pass** | `useRealtimePlanInvalidation.ts`: channel handlers `() => schedule()` with comment “Intentionally ignore payload”; only `queryClient.invalidateQueries` |
| **G2** | No signup | **Pass** | `LoginForm`: `signInWithPassword` / `signInWithOtp` + `shouldCreateUser: false`; copy “No self-registration”; no `signUp` / `/signup` |
| **G3** | Live preview client-side | **Pass** | `PortionGrid`: `calculateEffectiveProteinOz` + `calculatePerCategoryBreakdown` in `useMemo`; no tRPC on count change; save remains `mealPlan.upsert` |
| **G4** | Service-role only global-setup | **Pass** | Admin `createUser`/`updateUserById` only in `e2e/global-setup.ts`; helpers/specs use anon + persona JWT; CI exports key for setup only |
| **G5** | Scenario 11 unshare cutoff | **Pass** | `realtime-cutoff.spec.ts`: parity → unshare → 5s clean collector → refetch 0 rows → member_c silent; header SECURITY finding language; `expect.poll` only |

---

# Task 11 — Calendar / auth / editor / realtime

**Verdict: Approve with nits**

## Brief compliance (condensed)

| Area | Status |
|------|--------|
| Output format (`## NOTES` + `### FILE:`) | **Pass** |
| Auth: login + middleware + waiting-for-invite; no signup | **Pass** (G2) |
| Calendar: react-big-calendar week/month; shared/private; rollup; mobile list | **Pass** |
| Editor: RHF + `mealPlanUpsertInput`; share checklist creator disabled; portion grid D11 | **Pass** |
| Live preview portion-calc only | **Pass** (G3) |
| Realtime notify-then-refetch + 250ms debounce + hook test | **Pass** (G1) |
| Component tests: portion clamp/badge/total; share creator disabled; debounce | **Pass** |
| No moment.js; react-big-calendar + date-fns | **Pass** |
| COORDINATOR 0005 markers | **Pass** |

## Findings (Task 11)

### T11-1 — E2E `data-testid` set largely missing / renamed (High — merge reconcile)
- **Location:** Calendar / PortionGrid / MealPlanEditor vs Task 13 NOTES table  
- **Problem:** Draft uses `calendar-desktop` / `calendar-mobile`, `portion-total`, `portion-row-{slug}`; E2E expects `calendar-week-grid`, `portion-live-total`, `portion-row-{portionCategoryId}`, plus `meal-plan-editor`, `meal-plan-save`, `recipe-picker-*`, `food-safety-note`, `share-household-{id}`, `calendar-add-to-plan`, etc.  
- **Fix on merge:** Alias testids to Task 13 contract (or dual-attribute).

### T11-2 — Provider / tRPC path conflicts with Task 12 (High — merge)
- **Location:** Task 11 `@/trpc/client`, `@/providers/AppProviders` vs Task 12 `@/lib/trpc/client`, `@/components/providers/AppProviders`  
- **Problem:** Two provider trees risk double QueryClient and broken invalidation.  
- **Fix:** Single path; nest session inside one AppProviders (Task 12 TODO already flags).

### T11-3 — Assignment recipe UX under-powered for Flow 1 (Medium)
- **Location:** `MealPlanEditor` assignment row = `<select>` over first 50 recipes; no search, no safety callout  
- **Problem:** Brief/E2E expect recipe search + safety note during plan flow.  
- **Fix:** Reuse recipe picker + safety note testids; optional on materialize if Flow 1 can open recipe detail first (weaker).

### T11-4 — Positive: G1/G2/G3 implementation quality
- Payload-ignored realtime, invite-only OTP, pure client portion preview, stranded-assignment error mapping — solid.

---

# Task 12 — Content screens + nav

**Verdict: Approve with nits**

## Brief compliance (condensed)

| Area | Status |
|------|--------|
| Output format | **Pass** (Summary + FILE blocks; NOTES-style coordinator TODOs) |
| Nav: Calendar \| Recipes \| Ideas \| Shopping | **Pass** |
| Recipe browser/detail, safety callout, decay path, rating optimistic | **Pass** (core) |
| ChefIdea capture + browser + convertToRecipe | **Pass** |
| Combination creator (up/down, no dnd lib) | **Pass** |
| Shopping: Optional last, cross-dim separate, deleted badge, localStorage, print/copy | **Pass** |
| `<!-- TODO(coordinator): Phase 2 check-state sync -->` | **Pass** |
| Tests: safety, decay, shopping grouping, rating rollback | **Pass** |
| `chefIdea.byId` added | **Pass** (needed; small Wave 1 gap fill) |

## Findings (Task 12)

### T12-1 — Testid / URL contract drift vs Task 13 (High — merge reconcile)
| Draft (12) | E2E expects (13) |
|------------|------------------|
| `shopping-list-view` | `shopping-list` |
| `shopping-section-optional` | `shopping-group-optional` |
| `capture-idea-fab` / `capture-idea-header` | `capture-idea-open` |
| `idea-title` etc. | `chef-idea-title-input` |
| Leftover: partial ids | `leftover-section-toggle`, `leftover-add-entry`, `leftover-use-input`, … |
| Query `planIds` / `plans` | `?mealPlanIds=` |

### T12-2 — Leftover form: no linked-recipe picker (Medium)
- **Location:** `LeftoverDecayPath.tsx` — add/edit is use + notes only  
- **Problem:** Brief: entries with `linked_recipe_ids` navigate on tap; E2E Flow 2 requires link search/results. Display of existing links may work; **add** path incomplete.  
- **Fix:** Add optional linked-recipe search wired into entry payload.

### T12-3 — No persistent global search (Medium)
- **Location:** App shell  
- **Problem:** Product §9.4 + Task 13 Flow 3 need `global-search-input` / results. Browser filter search alone is not enough for the E2E.  
- **Fix:** Thin global search in shell or alias ideas/recipes search for E2E.

### T12-4 — Positive: shopping grouping pure helpers + tests
- Optional isolation and cross-dimension keys are correct and well tested.

---

# Task 13 — E2E + Scenario 11 + CI

**Verdict: Approve with nits**

## Brief compliance (condensed)

| Area | Status |
|------|--------|
| Output format + NOTES testid inventory | **Pass** |
| Skip unless `E2E_SUPABASE_URL`; visible skip message | **Pass** |
| `global-setup.ts`: admin users = seed UUIDs; member_c included | **Pass** |
| Service-role only global-setup | **Pass** (G4) |
| Specs: plan-shared-meal, leftover, chef-idea, shopping-list | **Pass** (files present) |
| Mobile iPhone 14 project for flows 1 & 3 | **Pass** (playwright.config) |
| P1 calendar timing assertion | **Pass** (in plan-shared-meal) |
| Scenario 11 four assertions + SECURITY header | **Pass** (G5) |
| No `page.waitForTimeout` | **Pass** (`waitForLoadState` / `expect.poll` only) |
| CI: extend `database-gates` only; chromium; app start | **Pass** |
| Realtime publication enable in CI | **Pass** (idempotent; coordinator TODO for migration) |

## Findings (Task 13)

### T13-1 — Contract ahead of UI (Info / process — not re-author)
- NOTES correctly list required testids and flag UI not in this PR. Green E2E depends on T11-1 / T12-1 fixes.

### T13-2 — Shopping URL uses `mealPlanIds` (Nit)
- Align with Task 12 (`planIds`/`plans`) or teach shopping page to accept `mealPlanIds`.

### T13-3 — Mojibake in comments (`â€"`, `Â§`) (Nit)
- Re-encode UTF-8 on materialize.

### T13-4 — Positive: G4/G5 rigor
- Service-role fence, member_c control, 5s post-unshare CLEAN window, belt-and-braces refetch, CI publication step — meets brief security intent.

---

## Cross-task merge checklist (integrator)

1. **One** AppProviders + tRPC client path (prefer Task 12 `lib/trpc` + nest Task 11 SessionProvider).  
2. Apply Task 13 testid table as canonical (alias on 11/12 components).  
3. Normalize shopping handoff: accept `mealPlanIds` \| `planIds` \| `plans`.  
4. Prefer Task 12 real recipe/ideas/shopping routes over Task 11 placeholders.  
5. Prefer Task 11 auth/middleware/realtime/calendar/editor over Task 12 stubs.  
6. Do not ship dual `package.json` blindly — union deps (react-big-calendar, testing-library, playwright already planned).

---

## Gate summary for dashboard

| Gate | Task | Result |
|------|------|--------|
| G1 no event payload render | 11 | **Pass** |
| G2 no signup | 11 | **Pass** |
| G3 live preview client-side | 11 | **Pass** |
| G4 service-role only global-setup | 13 | **Pass** |
| G5 Scenario 11 unshare cutoff | 13 | **Pass** |

**Integrator gate:** Integrate 11 + 12 + 13. Reconcile nits T11-1/2, T12-1–3, T13-2 before treating Wave 2 E2E as green.
