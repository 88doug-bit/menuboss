# Research Brief — Tasks 11–13 (Calendar / Content Screens / E2E + Realtime)

**Agent:** Researcher  
**Branch (intended):** `research/grok-11-13`  
**Date:** 2026-07-15  
**Audience:** Implementers / Testers / Reviewers for `grok_11_calendar_plan_screens.md`, `grok_12_content_screens.md`, `grok_13_e2e_realtime.md`  
**Scope:** Investigation only. **Do not** treat this as UI source, Playwright specs, or CI patches. **Do not invent** routes, testids, or env vars beyond briefs + PRDs + existing code.

**Primary inputs (read fully):**

| File | Role |
|------|------|
| `Product_PRD_v0.2.md` §9 (all), §11 E2E, §12 P1–P5 | UI/UX, flows, budgets |
| `grok_11_calendar_plan_screens.md` | Auth, calendar, plan editor, realtime hook |
| `grok_12_content_screens.md` | Recipe / ChefIdea / combination / shopping UI + nav shell |
| `grok_13_e2e_realtime.md` | Playwright §9.3, Scenario 11, CI wiring |
| `drafts/grok_out_mealplan_router.md` + shipped `mealPlan.ts` | Procedure names/shapes (Task 10) |
| `apps/web/src/**` | Current Next app (API only; no app UI shell yet) |
| `packages/portion-calc/src/index.ts` | Live-preview pure functions |
| `packages/schemas/src/mealPlan.ts` (+ content schemas) | Form Zod sources |
| `supabase/seed.sql` | Fixed persona / taxonomy UUIDs |
| `supabase/migrations/0002_security.sql` | REPLICA IDENTITY FULL + household SELECT |
| `supabase/tests/rls/README.md` | Scenario 11 deferred to Wave 2 suite |
| `.github/workflows/ci.yml` | `database-gates` job to extend |
| `Recipe_Meal_Planning_Database_PRD_v0.4.md` §7 Realtime | notify-then-refetch mandate |

**Out of scope (do not implement here):** migrations 0001–0004 edits, service-role in app code, signup/self-registration, Phase 2 shopping check-state sync, `0005` auth hook (coordinator-owned).

---

## 1. Routes map (App Router)

Product §9.4 nav: **Calendar | Recipes | Ideas | Shopping**. Task 12 owns the nav shell; Task 11 plugs calendar/editor/auth into it. No app routes exist yet beyond scaffold `page.tsx` and `api/trpc/[trpc]`.

### 1.1 Recommended path table

| Path | Task | Auth | Primary data | Notes |
|------|------|------|--------------|-------|
| `/login` | 11 | public | Supabase Auth (magic link + password) | No signup. Session via `@supabase/ssr` browser client. |
| `/waiting-invite` (or modal/full-page under authed layout) | 11 | session, no `profile` | empty RLS | Graceful empty state, not error. |
| `/` or `/calendar` | 11 | authed + profile | `mealPlan.listRange`, `mealPlan.proteinRollup` | Primary screen §9.2. Week default; month optional. |
| `/calendar/day/[date]` | 11 | authed | listRange / byId for that day | Day detail + meal slots + “Add to plan”. ISO date segment. |
| `/plans/new` | 11 | authed | `mealPlan.upsert` create | Editor create mode. Query `?date=` / `?recipeId=` from calendar / recipe detail. |
| `/plans/[planId]` | 11 | authed | `mealPlan.byId` | Editor edit mode. Soft-deleted: badge if byId returns (see ambiguities). |
| `/recipes` | 12 | authed | `recipe.list`, `chefIdea.list` (interleave on search), `category.list`, `tag.list` | Browser + “Meals” tab for combinations. |
| `/recipes/[recipeId]` | 12 | authed | `recipe.byId` + ingredient safety enrichment | Soft-deleted badge; Creative Leftovers; rate; Add to Plan/Combination. |
| `/recipes/[recipeId]/edit` | 12 | authed | `recipe.update` / create | Target after ChefIdea convert. |
| `/ideas` | 12 | authed | `chefIdea.list` | Status chips; filters mirror recipes. |
| `/ideas/new` or capture sheet | 12 | authed | `chefIdea.create` | FAB mobile / header desktop. |
| `/ideas/[ideaId]` | 12 | authed | list item / optional byId gap | convertToRecipe → recipe edit. **No `chefIdea.byId` today** — see ambiguities. |
| `/meals` or `/recipes?tab=meals` | 12 | authed | `recipeCombination.list` | Combination browser. |
| `/meals/new`, `/meals/[id]` | 12 | authed | create/update combination | roleInMeal + order (up/down). |
| `/shopping` | 12 | authed | `mealPlan.generateShoppingList` | Query `?planIds=id1,id2` from calendar handoff; or date-range UI if multi-select not available. |
| `/api/trpc/[trpc]` | existing | JWT cookies | all routers | Do not duplicate. |

**Middleware:** unauthenticated users hitting app routes → `/login`. Authenticated without profile → waiting-invite. Do **not** block `/login` or static assets.

**Layout nesting (suggested):**

```
app/
  layout.tsx                    # fonts, globals only
  login/page.tsx
  (app)/                        # authed shell
    layout.tsx                  # SessionProvider, TRPC/Query providers, bottom/side nav
    waiting-invite/page.tsx
    calendar/...
    plans/...
    recipes/...
    ideas/...
    meals/...
    shopping/...
  api/trpc/[trpc]/route.ts      # already present
```

### 1.2 Backend procedures already available (consume, don’t reinvent)

#### `mealPlan` (shipped shape)

| Procedure | Kind | Input schema | Return (client-facing) |
|-----------|------|--------------|------------------------|
| `upsert` | mutation | `mealPlanUpsertInputSchema` | `MealPlanDetailDto` |
| `byId` | query | `{ id }` | `MealPlanDetailDto` (includes soft-deleted if RLS-visible) |
| `listRange` | query | `{ start, end }` ISO dates | Array of plan summaries: DTO + `householdIds`, `isShared`, `portionRequirements`, `effectiveProteinOz` — **no `assignments`** |
| `generateShoppingList` | query | `{ mealPlanIds: uuid[] }` | `{ required, optional }` ingredient groups with display units |
| `proteinRollup` | query | `{ start, end }` | `{ mealPlanId, title, startDate, endDate, effectiveProteinOz }[]` |
| `softDelete` | mutation | `{ id }` | `MealPlanDto` |
| `share` | mutation | `{ mealPlanId, householdId }` | `MealPlanDetailDto` |
| `unshare` | mutation | same | `MealPlanDetailDto` (zero-row → NOT_FOUND) |

**`MealPlanDetailDto` fields (mapper):**  
`id, title, description, startDate, endDate, createdByHouseholdId, createdByUserId, createdAt, updatedAt, deletedAt, isDeleted, householdIds, isShared, portionRequirements[], assignments[], effectiveProteinOz`.

**`mealPlanUpsertInput`:**  
`id?`, `title`, `description?`, `startDate`, `endDate`, `householdIds[]` (default `[]`; RPC always forces creating household), `portionRequirements[]` (`portionCategoryId`, `count≥0`, `athleteCount≤count`), `assignments[]` (`id?`, `recipeId`, `assignmentDate`, `mealSlot`, `servings>0`, `notes?`).

Error mapping (router/`throwFromPostgrest`): SQLSTATE `42501`/RLS → **FORBIDDEN**; `23514` (stranded assignments / range) → **BAD_REQUEST** with trigger message — map to inline form errors in editor.

#### Content routers (Wave 1)

| Router | Procedures used by 11–13 |
|--------|---------------------------|
| `recipe` | `list`, `byId`, `create`, `update`, `softDelete`, `restore`, `rate`, `setLeftoverDecayPath` |
| `ingredient` | `list` (safety filter), `byId` (`foodSafetyProfile`) |
| `chefIdea` | `list`, `create`, `update`, `setStatus`, `convertToRecipe` |
| `recipeCombination` | `list`, `byId`, `create`, `update`, `rate`, `softDelete` |
| `category` | `list` (tree for filters) |
| `tag` | `list` (grouped by `tagGroup`) |
| `health` | optional smoke only |

#### Missing read surfaces (UI needs; no dedicated routers)

| Need | RLS allows? | Implication for Wave 2 UI |
|------|-------------|---------------------------|
| List active **households** (sharing checklist) | Yes — `household` SELECT for any `is_family_member()` | No `household.list` tRPC procedure. Options: (A) thin `household.list` authed query, (B) direct Supabase client `.from('household')` in a client hook, (C) coordinator mini-router. Prefer **(A)** for “all server data via tRPC” (Task 11 constraint). |
| List **portion_category** (active + deactivated for historical rows) | Yes — shape C SELECT | Same gap. Editor needs all 9 seeded categories + `is_active` for D11 read-only badge. Prefer thin `portionCategory.list` (or load once in plan editor bootstrap procedure). |
| **family_settings.athlete_multiplier** for client preview | Yes — SELECT | Meal plan server uses it for `effectiveProteinOz`; client live preview must use same value. Load via thin query or embed in a bootstrap. Default seed = **1.5**. |
| **profile for current user** (household id, waiting-invite) | `profile` SELECT family-wide | Need `me` / `profile.current` or browser Supabase + empty-result detection. |

---

## 2. Required `data-testid`s (Tasks 11/12 must expose; Task 13 selects)

Naming convention: kebab-case, stable, no random ids. Dynamic suffixes use entity id or date where needed.

### 2.1 Shell / auth (Task 11 + Task 12 nav)

| testid | Element | Used by |
|--------|---------|---------|
| `nav-calendar` | Nav link Calendar | all E2E |
| `nav-recipes` | Nav link Recipes | leftover, chef-idea, shared-meal |
| `nav-ideas` | Nav link Ideas | capture-chef-idea |
| `nav-shopping` | Nav link Shopping | shopping-list |
| `global-search` | Global search input §9.4 | capture-chef-idea (search path) |
| `login-email` | Login email field | global-setup consumers |
| `login-password` | Password field | same |
| `login-submit` | Sign-in button | same |
| `login-magic-link` | Magic-link CTA | optional |
| `waiting-invite` | Waiting-for-invite screen root | auth edge |
| `sync-status` | Online/sync/offline indicator | shared-meal dual context |

### 2.2 Calendar / plan editor (Task 11)

| testid | Element | Used by |
|--------|---------|---------|
| `calendar-root` | Calendar dashboard root | plan-shared-meal, P1 timing |
| `calendar-view-week` | Week view control / panel | plan-shared-meal |
| `calendar-view-month` | Month view control | optional |
| `calendar-day-{YYYY-MM-DD}` | Day cell (keyboard reachable) | Flow 1 step 1 |
| `calendar-event-{planId}` | Plan event chip on calendar | dual-context assert |
| `calendar-legend-shared` | Shared legend | visual/a11y |
| `calendar-legend-private` | Private legend | visual/a11y |
| `protein-summary-strip` | Weekly protein strip | plan-shared-meal |
| `protein-summary-plan-{planId}` | Per-plan hover/tap breakdown | optional |
| `btn-new-plan` | Header “New plan” | Flow 1 |
| `btn-shopping-list` | Header “Shopping list” | shopping-list handoff |
| `day-detail` | Day detail panel/page | Flow 1 |
| `day-slot-{mealSlot}` | Slot row (breakfast/lunch/dinner/snack…) | Flow 1 |
| `btn-add-to-plan` | “Add to plan” | Flow 1 |
| `plan-editor` | Editor form root | Flow 1 |
| `plan-title` | Title input | Flow 1 |
| `plan-start-date` | Start date | Flow 1 |
| `plan-end-date` | End date | Flow 1 |
| `plan-share-household-{householdId}` | Share checklist checkbox | Flow 1 share B |
| `plan-share-creator-locked` | Creating household row (checked + disabled) | unit + E2E |
| `assignment-row` / `assignment-row-{id\|index}` | Assignment editor row | Flow 1 |
| `assignment-recipe-picker` | Recipe search/picker | Flow 1 + safety note path |
| `assignment-meal-slot` | Meal slot select | Flow 1 |
| `assignment-servings` | Servings input | Flow 1 |
| `portion-grid` | Portion grid root | Flow 1, unit tests |
| `portion-row-{portionCategoryId}` | One category row | Flow 1 |
| `portion-count-{portionCategoryId}` | Count stepper | Flow 1 live total |
| `portion-athlete-{portionCategoryId}` | Athlete stepper | Flow 1 |
| `portion-deactivated-badge` | Deactivated category badge | unit tests |
| `portion-live-total` | Live effective protein total (display) | Flow 1 assert vs portion-calc |
| `portion-breakdown` | Per-category breakdown list | optional assert |
| `plan-save` | Save button | Flow 1 |
| `plan-form-error` | Inline FORBIDDEN/BAD_REQUEST | stranded range etc. |

### 2.3 Content screens (Task 12)

| testid | Element | Used by |
|--------|---------|---------|
| `recipe-browser` | Browser root | leftover, shared-meal search |
| `recipe-search` | tsvector search box | Flow 1 safety recipe; Flow 3 |
| `recipe-filters` | Filter panel | Flow 3 |
| `recipe-card-{recipeId}` | Recipe card | navigation |
| `chefidea-card-{ideaId}` | Distinct ChefIdea card in search | Flow 3 |
| `recipe-load-more` | Cursor pagination | optional |
| `recipe-detail` | Detail root | leftover, safety |
| `recipe-deleted-badge` | Soft-deleted badge | historical |
| `ingredient-row-{ingredientId}` | Ingredient line | safety |
| `food-safety-callout` | Warning callout when `mercury` present | Flow 1 assert |
| `food-safety-fda-category` | fda_category text | Flow 1 |
| `food-safety-frequency` | recommended_frequency text | Flow 1 |
| `instruction-step` | Instruction step | optional |
| `instruction-chip-timer` / `instruction-chip-temp` | Timer/temp chips | optional |
| `make-again-rating` | Rating control | optimistic unit tests |
| `btn-add-recipe-to-plan` | Add to Plan | Flow 1 alternate entry |
| `btn-add-to-combination` | Add to Combination | combinations |
| `leftover-section` | Creative Leftovers expandable | capture-leftover-idea |
| `leftover-entry` / `leftover-entry-{index}` | Decay path entry | Flow 2 |
| `leftover-linked-recipe-{recipeId}` | Link to linked recipe | Flow 2 other persona |
| `leftover-add-form` | Inline add/edit form | Flow 2 |
| `leftover-save` | Save decay path | Flow 2 |
| `btn-capture-idea` | FAB / header capture | capture-chef-idea |
| `chefidea-form` | Capture form root | Flow 3 |
| `chefidea-title` | Title | Flow 3 |
| `chefidea-notes` | Notes | Flow 3 |
| `chefidea-source` | Source | Flow 3 |
| `chefidea-status` | Status control | Flow 3 |
| `chefidea-priority` | Priority | Flow 3 |
| `chefidea-tag-picker` | Tags | Flow 3 |
| `chefidea-category-picker` | Categories | Flow 3 |
| `chefidea-submit` | Save idea | Flow 3 |
| `chefidea-status-chip-{status}` | Filter chip | Flow 3 browse |
| `btn-convert-to-recipe` | Convert | convert flow |
| `combination-form` | Creator root | combinations |
| `combination-recipe-picker` | Recipe pick | combinations |
| `combination-role` | roleInMeal | combinations |
| `combination-order-up` / `combination-order-down` | Order buttons | combinations |
| `shopping-list` | Shopping view root | shopping-list |
| `shopping-plan-picker` | Plan multi-select / range | shopping-list |
| `shopping-generate` | Generate action | shopping-list |
| `shopping-group-required` | Required aisle groups container | shopping-list |
| `shopping-group-optional` | Optional group (visually separated) | shopping-list AC |
| `shopping-ingredient-{ingredientId}` | Ingredient heading | cross-dimension |
| `shopping-line-{ingredientId}-{dimension}` | One dimension line | cross-dimension separate lines |
| `shopping-deleted-badge` | Line from soft-deleted recipe | shopping-list |
| `shopping-check-{ingredientId}-{dimension}` | Check-off (localStorage) | optional |
| `shopping-print` | Print | optional |
| `shopping-copy` | Copy plain text | optional |
| `empty-chefideas` | Empty state copy | §9.6 |
| `empty-shopping` | Empty list ≠ error | §9.6 |

Task 13 brief: list final testids in implementer `## NOTES` so coordinator can reconcile; the table above is the research baseline.

---

## 3. Portion-calc live preview wiring (P3 < 100 ms)

### 3.1 Canonical package API

From `packages/portion-calc/src/index.ts` (client-safe, zero I/O):

| Export | Role in editor |
|--------|----------------|
| `calculateEffectiveProteinOz(requirements, categories, settings)` | Total shown in `portion-live-total` |
| `calculatePerCategoryBreakdown(...)` | Per-row / breakdown UI |
| `hasDeactivatedCategories(...)` | Optional warning strip |
| `roundOz(n)` | **Display only** — never feed back into math |
| Errors | `UnknownPortionCategoryError`, `InvalidPortionRequirementError`, `InvalidFamilySettingsError` |

Formula (DB PRD §4.1 / package header):

```
Σ ( (count − athleteCount) + athleteCount × athleteMultiplier ) × baseProteinOz
```

Deactivated categories (`isActive: false`) **still contribute** if present on the plan (historical). UI: active categories editable steppers; deactivated with existing rows read-only + badge (D11). Rows with `count = 0` are **not stored** on save (RPC deletes them); UI may show zero for empty categories without sending them, or send and let RPC drop.

### 3.2 Recommended data flow (no server round-trip on stepper change)

```
[Bootstrap once on editor mount]
  portionCategory.list → PortionCategoryRef[]  // id, slug, baseProteinOz, isActive
  familySettings (athleteMultiplier)           // seed 1.5
  mealPlan.byId (edit) | defaults (create)

[RHF form state] portionRequirements: { portionCategoryId, count, athleteCount }[]
  onChange any stepper:
    clamp athleteCount ≤ count in UI (also Zod refine)
    derive requirements array from form values
    total = calculateEffectiveProteinOz(reqs, categories, { athleteMultiplier })
    lines = calculatePerCategoryBreakdown(...)
    set local state for portion-live-total / breakdown
    // NO trpc mealPlan.* call; budget P3

[Save]
  mealPlan.upsert(form → mealPlanUpsertInput)
  response.effectiveProteinOz should match last client total
    (same package on server in mealPlan router) — soft assert in E2E
```

### 3.3 Worked seed numbers for E2E / unit assert

| Input | Value |
|-------|-------|
| Adult Male id | `00000000-0000-4000-8000-000000000207` |
| base | 6.0 oz |
| athleteMultiplier | 1.5 |
| count=2, athleteCount=1 | `(1 + 1×1.5) × 6 = 15.0` |

Assert `data-testid="portion-live-total"` displays rounded display (e.g. `15.0` via `roundOz`) matching this fixture.

### 3.4 Package wiring in `apps/web`

- `next.config.ts` already `transpilePackages: ["@menu-boss/schemas", "@menu-boss/portion-calc"]`.
- Server `mealPlan.ts` already imports `calculateEffectiveProteinOz`.
- **Client components** may import the same pure package directly (preferred over duplicating formula). Ensure `web` `package.json` lists `"@menu-boss/portion-calc": "workspace:*"` (present on server path; confirm client dep when scaffolding UI).
- Do **not** call `proteinRollup` or `upsert` for preview.

### 3.5 Calendar summary strip vs editor preview

| Surface | Source | Why |
|---------|--------|-----|
| Editor live total | Client `portion-calc` | P3; interactive |
| Calendar strip | `mealPlan.proteinRollup({ start, end })` | SQL `weekly_protein_rollup`; set-based; not per-keystroke |
| Event chip protein | `listRange[].effectiveProteinOz` (server portion-calc) | Already on list payload |

---

## 4. Realtime security pattern (notify-then-refetch)

### 4.1 Product / DB mandate

- DB PRD v0.4 §7 + Claude security notes: shape-B SELECT joins `meal_plan_household`; Realtime auth must equal RLS.
- Migrations already set **`REPLICA IDENTITY FULL`** on `meal_plan`, `meal_plan_assignment`, `meal_plan_household`, `meal_plan_portion_requirement` (`0002_security.sql`).
- Task 11 decision (do not deviate): clients subscribe to `postgres_changes` on `meal_plan*` tables but treat events **only as invalidation signals**. **Never render event payload fields** (titles, ids in UI from the message, portion counts from `new`/`old`, etc.).

### 4.2 App hook contract: `useRealtimePlanInvalidation(range)`

```
inputs: { start: ISODate, end: ISODate }  // visible calendar window
side effects:
  supabase.channel(...)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'meal_plan' }, handler)
    .on(..., table: 'meal_plan_assignment', ...)
    .on(..., table: 'meal_plan_household', ...)
    .on(..., table: 'meal_plan_portion_requirement', ...)
    .subscribe()
handler:
  // ignore payload content except maybe for logging channel health
  scheduleDebouncedInvalidate()  // 250 ms burst debounce
debounced:
  queryClient.invalidateQueries({ queryKey: [['mealPlan','listRange'], …range] })
  queryClient.invalidateQueries({ queryKey: [['mealPlan','proteinRollup'], …] })
  // optionally byId keys for open editor — still refetch, don’t patch from payload
cleanup: remove channel on unmount / range change
```

**TanStack Query keys:** align with `@trpc/tanstack-react-query` key factory once client is scaffolded so invalidation hits the same keys as `listRange`/`byId`/`proteinRollup` subscriptions.

**Auth client:** browser Supabase with user JWT (same session as tRPC cookies). No service role.

### 4.3 Scenario 11 (Task 13) — pure JS clients, not UI payload trust

File: `apps/web/e2e/realtime-cutoff.spec.ts` (Playwright suite for env reuse).

| Step | Actor | Assertion |
|------|-------|-----------|
| 1 | member_b subscribed on plan shared A→B | Event arrives when member_a edits (positive parity) |
| 2 | member_a/admin **unshares B** | After unshare, member_b’s collector gets **no further events** for subsequent edits (poll ≤ 5 s) |
| 3 | member_b `mealPlan.byId` / listRange | **Zero rows** (belt-and-braces even if event leaked) |
| 4 | member_c control | Never receives events for A’s plan |

If step 2 fails on real stack: **SECURITY finding** (not flake); app notify-then-refetch remains safety net. Document in spec header per brief.

### 4.4 Dual-browser E2E (Flow 1 second context)

- member_a saves shared plan → member_b calendar shows event within **P5 < 2 s** (realtime **or** reload ≤ 2 s allowed by brief).
- Prefer: B has realtime invalidation mounted; assert `calendar-event-{planId}` visible via expect-polling (no `waitForTimeout`).

---

## 5. Seed UUIDs (fixed reference card)

Source: `supabase/seed.sql` TEST FIXTURES + taxonomy blocks.

### 5.1 Households & personas (auth user ids MUST match for E2E)

| Alias | UUID |
|-------|------|
| `household_a` | `00000000-0000-4000-8000-0000000000a0` |
| `household_b` | `00000000-0000-4000-8000-0000000000b0` |
| `household_c` | `00000000-0000-4000-8000-0000000000c0` |
| `member_a` | `00000000-0000-4000-8000-0000000000a1` |
| `admin_a` | `00000000-0000-4000-8000-0000000000a2` |
| `member_b` | `00000000-0000-4000-8000-0000000000b1` |
| `member_c` | `00000000-0000-4000-8000-0000000000c1` |
| anon | no profile row |

**E2E global-setup:** create GoTrue users via admin API with **`id` = these profile UUIDs**, then store Playwright `storageState` per persona. Service role **only** in `apps/web/e2e/global-setup.ts`.

Brief Task 13: create **member_a / admin_a / member_b** (member_c also needed for Scenario 11 control — include in setup).

### 5.2 Portion categories (portion grid)

| Slug | UUID | base_protein_oz |
|------|------|-----------------|
| child | `…000201` | 3.0 |
| adolescent-female-under-15 | `…000202` | 4.0 |
| adolescent-female-over-15 | `…000203` | 5.0 |
| adolescent-male-under-15 | `…000204` | 5.0 |
| adolescent-male-over-15 | `…000205` | 6.0 |
| adult-female | `…000206` | 5.0 |
| **adult-male** | `…000207` | **6.0** |
| senior-female | `…000208` | 4.5 |
| senior-male | `…000209` | 5.0 |

Prefix: `00000000-0000-4000-8000-`.

### 5.3 Family settings

| Alias | UUID | athlete_multiplier |
|-------|------|--------------------|
| family_settings | `00000000-0000-4000-8000-000000000301` | **1.5** |

### 5.4 Categories / tags useful to UI filters

| Kind | Examples (fixed UUIDs in seed) |
|------|--------------------------------|
| Category Protein/Seafood | protein `…401`, seafood `…411`, poultry `…412`, … |
| Tags meals | breakfast `…501` … snack `…504` |
| Tags cuisine / dietary | italian `…512`, gluten-free `…531`, … |

### 5.5 Critical gap: **no seed recipes / ingredients / seafood safety profile**

`seed.sql` stops at households/profiles after taxonomies. There is **no** fixed recipe with mercury-bearing seafood for Flow 1 safety-note assert.

| Consumer | Needs |
|----------|--------|
| `plan-shared-meal.spec.ts` | Recipe searchable + ingredient with `food_safety_profile.mercury` |
| `capture-leftover-idea.spec.ts` | At least one cooked recipe; second linked recipe for decay path |
| `shopping-list.spec.ts` | Multi-plan multi-ingredient (optional + cross-dimension) |
| pgTAP / aggregation tests | Create ephemeral fixtures in-transaction (not reusable by E2E) |

**Recommendation for coordinator:** extend seed (or E2E `global-setup` / `beforeAll` SQL via service role on throwaway stack) with fixed UUIDs, e.g.:

| Proposed alias | Suggested UUID namespace | Fields |
|----------------|------------------------|--------|
| ingredient_tuna | `…000901` style (check collision with test-only inserts) | name, `food_safety_profile: { mercury: { fda_category, recommended_frequency } }` |
| recipe_seafood | fixed | title searchable, links tuna, not deleted |
| recipe_leftover_target | fixed | for linked_recipe_ids |

Flag: `<!-- TODO(coordinator): seed E2E content fixtures (seafood recipe + multi-dimension ingredients) with fixed UUIDs -->`.

---

## 6. CI env vars & Playwright wiring

### 6.1 Existing CI (`.github/workflows/ci.yml`)

Jobs today:

1. **build-test** — typecheck + unit tests (no Supabase).
2. **database-gates** — `supabase start` → `supabase test db` → portion-calc contract test with:
   - `DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres`

Task 13: **extend `database-gates` only** (no new job). After pgTAP (+ keep contract step), add:

1. Install Playwright browsers (**chromium only**).
2. Export app env from `supabase status` (URL + anon key + service role).
3. Build + start Next app.
4. Run E2E with `E2E_SUPABASE_URL` set (and related keys).

### 6.2 Env var matrix

| Variable | Where | Purpose |
|----------|--------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | app runtime / CI | Browser + server Supabase client (already `.env.example`) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | app runtime / CI | Anon key; JWT session on top |
| `E2E_SUPABASE_URL` | Playwright guard | **Skip entire E2E suite unless set**; skip must be visible (not silent pass) |
| `SUPABASE_SERVICE_ROLE_KEY` | `e2e/global-setup.ts` **only** | Create auth users matching seed profile UUIDs |
| `DATABASE_URL` | existing contract / mealPlan integration | Direct Postgres; not for browser E2E |
| `CI` | Playwright config | retries=2, forbidOnly (already) |
| (optional) `PLAYWRIGHT_BASE_URL` | if not default | Default config `http://localhost:3000` |

Local reality (brief): **no Docker** on dev machine → E2E **skipped** without `E2E_SUPABASE_URL`. CI has full stack via `supabase start`.

### 6.3 Playwright config gaps vs brief

Current `apps/web/playwright.config.ts`:

- `testDir: ./e2e`, chromium desktop only.
- Placeholder `example.spec.ts` is `test.skip`.
- **Missing:** `globalSetup`, storageState projects per persona, **iPhone 14** project for flows 1 & 3, env-based skip helper, webServer block for CI.

Recommended projects:

| Project | Device | Specs |
|---------|--------|-------|
| `chromium` | Desktop Chrome | all |
| `mobile-iphone14` | `devices['iPhone 14']` | plan-shared-meal, capture-chef-idea (brief) |
| (integration) realtime-cutoff | no browser UI required | can still live under Playwright for env reuse |

### 6.4 Spec file map (Task 13)

| File | Maps to |
|------|---------|
| `e2e/global-setup.ts` | Auth users + storageState |
| `e2e/plan-shared-meal.spec.ts` | §9.3 Flow 1 + dual context P5 |
| `e2e/capture-leftover-idea.spec.ts` | §9.3 Flow 2 |
| `e2e/capture-chef-idea.spec.ts` | §9.3 Flow 3 |
| `e2e/shopping-list.spec.ts` | Shopping Optional + cross-dimension |
| `e2e/realtime-cutoff.spec.ts` | Scenario 11 |
| P1 cheap assert | calendar interactive < 1.5 s on warm run (`calendar-root`) |

No `page.waitForTimeout` — use `expect.poll` / `toPass`.

---

## 7. Existing `apps/web` structure (baseline for implementers)

```
apps/web/
  src/app/
    api/trpc/[trpc]/route.ts   # JWT via @supabase/ssr cookies → appRouter
    layout.tsx                 # scaffold fonts only (no providers/nav)
    page.tsx                   # Create Next App placeholder
    globals.css
  src/server/
    trpc.ts                    # authedProcedure, adminProcedure, superjson
    dbErrors.ts
    routers/                   # content + mealPlan + _app
  e2e/example.spec.ts          # skipped placeholder
  playwright.config.ts
  package.json                 # Next 16, tRPC 11, RHF, Zod, TanStack Query,
                               # @supabase/ssr; NO react-big-calendar/date-fns yet
```

**Not present (Wave 2 must add):**

- tRPC React client + QueryClientProvider
- Supabase browser client helpers / middleware session refresh
- Auth UI, any feature routes
- shadcn/ui components (copy in; no heavy new deps)
- `react-big-calendar` + `date-fns` (allowed by Task 11; **no moment.js**)
- Vitest component test harness (jsdom/testing-library) if not already configured for components

**Constraint reminders:**

- Extensionless relative imports (Turbopack).
- Optimistic updates **only** for rating-style toggles — **not** plan saves.
- No service-role in app request path (only E2E global-setup).
- Coordinator `0005` auth provisioning: mark `<!-- COORDINATOR: 0005 auth provisioning -->` where profile-on-signup is assumed.

---

## 8. Ambiguities & coordinator TODOs

Numbered for implementer/reviewer tracking.

### A1. `listRange` has no assignments

**Problem:** Calendar brief: “assignments render inside their plan’s day cells”. Shipped `listRange` returns plans + portions + `isShared` but **not** `assignments`.  
**Options:**  
(a) N+1 `byId` per visible plan (simple, chatty);  
(b) extend `listRange` to include assignments in one query (best for P1);  
(c) separate `mealPlan.listAssignmentsInRange`.  
**Recommendation:** **(b)** small Task 10 follow-up or Task 11 backend tweak — keeps calendar one query.  
`<!-- TODO(coordinator): extend listRange with assignments for calendar density -->`

### A2. No household / portionCategory / familySettings / me routers

**Problem:** Sharing checklist + portion grid + athlete multiplier + waiting-invite need reads with no tRPC surface.  
**Recommendation:** thin authed routers or one `bootstrap.editorMeta` query; stay on tRPC (Task 11 “no ad-hoc fetch”).  
`<!-- TODO(coordinator): approve household.list + portionCategory.list + familySettings.get + profile.me -->`

### A3. Recipe detail safety notes require ingredient join

**Problem:** `recipe.byId` returns `ingredients[]` with `ingredientId` only — **no** `foodSafetyProfile` / name.  
**Options:** client N+1 `ingredient.byId`; extend `recipe.byId` select embed; batch `ingredient.list` by ids.  
**Recommendation:** extend `recipe.byId` to attach ingredient masters (name + foodSafetyProfile) for detail UX and E2E.  
`<!-- TODO(coordinator): recipe.byId enrich ingredients with safety profile -->`

### A4. No seed seafood / leftover fixtures for E2E

See §5.5. Flow 1 explicitly asserts safety note on seeded seafood recipe.  
`<!-- TODO(coordinator): seed fixed seafood recipe + mercury ingredient (+ leftover link pair) -->`

### A5. Auth users vs profiles

Profiles exist in seed; **auth.users do not**. E2E setup creates them. App signup forbidden; admin invite + `0005` hook is coordinator-owned. Local manual QA without 0005: either run E2E setup against local stack or insert profiles manually.  
`<!-- COORDINATOR: 0005 auth provisioning -->`

### A6. Soft-deleted plans on calendar

Task 10 notes: `listRange` filters `deleted_at IS NULL`; `byId` can return soft-deleted. Calendar won’t show deleted plans (correct). Direct `/plans/[id]` may still open — badge via `isDeleted`. Confirm product desire.  
`<!-- TODO(coordinator): soft-deleted plan deep-link UX -->`

### A7. Share via upsert `householdIds` vs `share` mutation

Flow 1: “share with Household B → save”. Editor can set `householdIds: [A, B]` on `upsert` (RPC reconciles) **or** save then `share`. Prefer **single upsert** with checklist state to match form model; use `share`/`unshare` for calendar quick actions / Scenario 11 unshare.  
Both are valid; document chosen path in Task 11 NOTES.

### A8. ChefIdea `byId` missing

Router has list/create/update/setStatus/convertToRecipe — **no byId**. Detail route can use list cache or add byId. Minor.  
`<!-- TODO(coordinator): chefIdea.byId if deep links required -->`

### A9. Global search vs per-browser search

§9.4 “Global search always available” vs §9.2 recipe search that interleaves ChefIdeas. Ambiguous whether one omnibox or nav-scoped.  
**Recommendation:** one global search entry that routes to `/recipes?q=` with interleaved ideas (DRY).  
`<!-- TODO(coordinator): confirm global search behavior -->`

### A10. Shopping list date-range input

§9.2 allows plans **or date range**; Task 10 API is **`mealPlanIds` only**. UI date range must resolve to plan ids via `listRange` first.  
No API change required if UI does resolve step.

### A11. Meal slot vocabulary

`meal_slot` is free text (no DB enum). UI should offer stable select: `breakfast | lunch | dinner | snack` (seed tag slugs exist for meals) for testids `day-slot-*` consistency.  
`<!-- TODO(coordinator): confirm meal_slot controlled vocabulary for v1 -->`

### A12. `react-big-calendar` + React 19 / Next 16

Not yet in package.json. Verify compatibility when adding; pure CSS styling preferred over moment locales. Use `date-fns` localizer only.

### A13. Nav ownership race

Task 12 “build the nav shell”; Task 11 “plugs into it”. Implementers should agree file ownership (`(app)/layout.tsx` + `components/AppNav.tsx`) to avoid duplicate providers (Task 12 constraint).

### A14. Performance budgets in E2E

| # | Budget | Where |
|---|--------|--------|
| P1 | Calendar interactive < 1.5 s | plan-shared-meal warm run |
| P2 | Shopping list < 2 s | shopping-list.spec |
| P3 | Portion preview < 100 ms | Vitest unit (not Playwright) |
| P4 | Search < 500 ms | optional if cheap |
| P5 | Realtime < 2 s | dual-context Flow 1 |

Brief: one timed assertion per budgeted flow; no full perf harness.

### A15. Optimistic UI vs plan saves

§9.6 mentions optimistic plan changes; Task 11 constraint forbids optimistic plan saves. **Follow Task 11 brief** (explicit): wait for `upsert` result; optimistic only for `recipe.rate` / combination rate.

---

## 9. Implementer checklist (by task)

### Task 11

- [ ] Auth: `/login`, middleware, session provider, waiting-invite  
- [ ] Providers: tRPC + TanStack Query (single place)  
- [ ] Calendar: react-big-calendar, listRange (+ assignments resolution), proteinRollup strip, shared/private styling  
- [ ] Editor: RHF + `mealPlanUpsertInputSchema`, portion grid + live portion-calc, share checklist  
- [ ] `useRealtimePlanInvalidation` debounce 250 ms; never render payloads  
- [ ] Vitest: portion grid clamp/badge/live total; share creator disabled; hook fake timers  
- [ ] Expose §2.1–2.2 testids  
- [ ] Deps: `react-big-calendar`, `date-fns`, workspace `portion-calc` on client  

### Task 12

- [ ] Nav shell Calendar | Recipes | Ideas | Shopping + global search  
- [ ] Recipe browser/detail (safety callout, leftovers, rating optimistic, soft-delete badge)  
- [ ] ChefIdea capture/browser/convert  
- [ ] Combination creator (up/down order)  
- [ ] Shopping list: generateShoppingList DTO grouping, optional last, cross-dim lines, localStorage checks, print/copy  
- [ ] Empty states §9.6  
- [ ] Component tests per brief  
- [ ] Expose §2.3 testids; reuse Task 11 providers  

### Task 13

- [ ] `global-setup.ts` service-role auth users = seed UUIDs + storageState  
- [ ] Four flow specs + realtime-cutoff + mobile projects  
- [ ] Skip unless `E2E_SUPABASE_URL` (visible skip)  
- [ ] Extend `database-gates` only  
- [ ] NOTES block: final testid list for coordinator  

---

## 10. Sources index (absolute paths)

- `C:\Users\dougr\.grok\worktrees\01gitprojects-menu-boss\subagent-019f662d-7e33-7e82-8265-80a0c0825db1\Product_PRD_v0.2.md`
- `C:\Users\dougr\.grok\worktrees\01gitprojects-menu-boss\subagent-019f662d-7e33-7e82-8265-80a0c0825db1\grok_11_calendar_plan_screens.md`
- `C:\Users\dougr\.grok\worktrees\01gitprojects-menu-boss\subagent-019f662d-7e33-7e82-8265-80a0c0825db1\grok_12_content_screens.md`
- `C:\Users\dougr\.grok\worktrees\01gitprojects-menu-boss\subagent-019f662d-7e33-7e82-8265-80a0c0825db1\grok_13_e2e_realtime.md`
- `C:\Users\dougr\.grok\worktrees\01gitprojects-menu-boss\subagent-019f662d-7e33-7e82-8265-80a0c0825db1\drafts\grok_out_mealplan_router.md`
- `C:\Users\dougr\.grok\worktrees\01gitprojects-menu-boss\subagent-019f662d-7e33-7e82-8265-80a0c0825db1\apps\web\src\server\routers\mealPlan.ts`
- `C:\Users\dougr\.grok\worktrees\01gitprojects-menu-boss\subagent-019f662d-7e33-7e82-8265-80a0c0825db1\packages\portion-calc\src\index.ts`
- `C:\Users\dougr\.grok\worktrees\01gitprojects-menu-boss\subagent-019f662d-7e33-7e82-8265-80a0c0825db1\supabase\seed.sql`
- `C:\Users\dougr\.grok\worktrees\01gitprojects-menu-boss\subagent-019f662d-7e33-7e82-8265-80a0c0825db1\.github\workflows\ci.yml`
- `C:\Users\dougr\.grok\worktrees\01gitprojects-menu-boss\subagent-019f662d-7e33-7e82-8265-80a0c0825db1\supabase\tests\rls\README.md`
)
