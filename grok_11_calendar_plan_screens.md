# Brief for Grok — Task 11 (Wave 2): Auth UI, Calendar dashboard, MealPlan editor, Realtime wiring

**Context:** Wave 2 frontend core. The backend surface you consume: content routers (Wave 1), `mealPlan` router (Task 10 — assume its procedure names/shapes from `grok_10_mealplan_router.md`, attached), `@menu-boss/portion-calc` for live preview math.

**Attachments required:** `Product_PRD_v0.2.md` (§9 UI/UX is your spec — follow it closely, esp. §9.2 Calendar/Dashboard + MealPlan Editor and §9.5 information surfacing), `grok_10_mealplan_router.md`.

**Output:** one markdown file, saved as `drafts/grok_out_calendar_screens.md`, repo files as `### FILE:` headers + fenced blocks. **Extensionless relative imports.** Stack: Next.js App Router + Tailwind v4 + shadcn/ui patterns, TanStack Query + tRPC client, React Hook Form + Zod.

## 1. Auth (minimal, unblocks everything else)
- `/login` page: Supabase email magic-link + password sign-in (`@supabase/ssr` browser client), session provider, middleware redirect for unauthenticated app routes.
- **Do NOT build signup/self-registration.** Profiles are provisioned by an admin invite flow + a SECURITY DEFINER auth hook that is **coordinator-owned** (arrives as migration 0005). Where the hook matters, add `<!-- COORDINATOR: 0005 auth provisioning -->`.
- A user whose session exists but has no `profile` row sees a "waiting for family invite" screen (RLS returns empty — handle gracefully, not as an error).

## 2. Calendar / Meal Planning Dashboard (primary screen, §9.2)
- **react-big-calendar** (decision: lighter than FullCalendar, pure OSS) with week (default) + month views, custom event rendering.
- Events = `mealPlan.listRange` for the visible window; assignments render inside their plan's day cells with meal-slot ordering.
- **Shared vs private visual language** (§9.5): shared plans (derived `isShared`) get a distinct color + family icon; private plans muted styling. Legend in the header.
- Summary strip: weekly protein total via `mealPlan.proteinRollup`, broken down per plan on hover/tap.
- Quick actions per §9.2: tap day → day detail with slots → "Add to plan"; header buttons "New plan", "Shopping list" (route to Task 12's screen with selected plan ids).
- Mobile-first: week view collapses to a vertical day list under `sm:`.

## 3. MealPlan Editor / Portion Calculator (§9.2)
- Form (RHF + `mealPlanUpsertInput` Zod from `@menu-boss/schemas`): title, date range, household sharing checklist (all active households; creating household checked + disabled — it is irremovable), assignments editor (date within range, meal slot select, recipe picker via `recipe.list` search, servings), and the portion grid.
- **Portion grid:** one row per active PortionCategory — `count` and `athleteCount` steppers (athleteCount clamped ≤ count in the UI). Deactivated categories with existing rows render read-only with a "deactivated" badge (D11).
- **Live preview (<100 ms budget):** compute with `calculateEffectiveProteinOz` + `calculatePerCategoryBreakdown` from `@menu-boss/portion-calc` on every change — NO server round-trip for preview. Show total + per-category breakdown.
- Save → `mealPlan.upsert`; map FORBIDDEN/BAD_REQUEST errors to inline messages (esp. the stranded-assignments range error).

## 4. Realtime wiring (notify-then-refetch — security decision, do not deviate)
Per DB PRD v0.4 §7: clients subscribe to postgres_changes on `meal_plan*` tables but treat events ONLY as invalidation signals — **on any event, invalidate the TanStack Query caches for the visible range and refetch through normal RLS-filtered queries**. Never render payload data from the event itself. Implement as a `useRealtimePlanInvalidation(range)` hook; debounce bursts (250 ms).

## 5. Tests
- Vitest component tests for the portion grid (clamping, deactivated badge, live total updates) and the sharing checklist (creator row disabled).
- Hook test for debounced invalidation (fake timers, mocked channel).

## Constraints
- No new dependencies beyond react-big-calendar + date-fns (and shadcn/ui component code). No moment.js.
- All server data via tRPC/TanStack Query — no ad-hoc fetch. Optimistic updates only for rating-style toggles, not plan saves.
- Accessibility: keyboard-reachable steppers and calendar day cells (WCAG 2.2 AA target, §9.1).
- Flag ambiguity with `<!-- TODO(coordinator): … -->`.
