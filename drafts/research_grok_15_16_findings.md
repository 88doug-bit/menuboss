# Research Brief — Tasks 15–16 (Admin screens / PWA + search + perf budgets)

**Agent:** Researcher  
**Branch (intended):** `research/grok-15-16`  
**Date:** 2026-07-15  
**Audience:** Implementer / Tester / Reviewer for `grok_15_admin_screens.md`, `grok_16_pwa_search_perf.md`  
**Scope:** Investigation only. **Do not** treat this as admin router source, PWA SW code, or Playwright harness. **Do not invent** SQL/migrations (Task 15 forbids them; emit `<!-- TODO(coordinator): … -->` instead).

**Primary inputs (read fully):**

| File | Role |
|------|------|
| `grok_15_admin_screens.md` | Admin UI + the one Wave-3-allowed new tRPC router |
| `grok_16_pwa_search_perf.md` | D4 offline, global search, §12 P1–P5 E2E wiring |
| `supabase/migrations/0005_auth_provisioning.sql` | Invite table, dual-direction provisioning, audit trigger |
| `supabase/migrations/0002_security.sql` | `audit_log`, Shape C vocabularies, `is_family_admin`, grants |
| `supabase/migrations/0001_schema.sql` | `family_settings`, `portion_category`, `unit`, `household`, `profile` |
| `supabase/tests/rls/provisioning.test.sql` | Invite RLS + Direction A/B acceptance tests |
| `Product_PRD_v0.2.md` §3.1, §6.8, §8.1–§8.2, §8.8, §12 P1–P5, §13.2 | Product contracts |
| `Recipe_Meal_Planning_Database_PRD_v0.4.md` §4.1, §7 | PortionCategory / FamilySettings / Shape C+D / audit |
| `packages/portion-calc/src/index.ts` (+ tests) | Live example math for admin settings UI |
| `apps/web/src/server/trpc.ts` | Existing `adminProcedure` (display gate) |
| `apps/web/src/server/routers/family.ts` | Read-only me / households / portionCategories / settings |
| `apps/web/src/server/routers/category.ts`, `tag.ts` | **Already** have admin mutations — reuse for Categories & Tags UI |
| `apps/web/package.json` | Next **16.2.10** — serwist compatibility risk |
| `apps/web/e2e/plan-shared-meal.spec.ts` | Existing soft P1/P5 timing pattern to harden in Task 16 |
| `PHASE1_PLAN.md` Wave 3 | Tasks 14–16 scope + gate |

**Out of scope (do not implement here):** recipe/ingredient editors (Task 14), service-role clients, RLS/migration edits, offline write queues, conflict-resolution design.

---

## 1. Invite semantics (migration 0005) — authoritative

### 1.1 Model summary

Identity is **invite-only**. Ordering of signup vs invite never matters because both directions call the same core:

```
admin INSERT household_invite(email → household + role)
        │
        ├─ Direction A (invite after signup): AFTER INSERT trigger
        │    handle_new_invite → if auth.users row matches email
        │    → provision_profile_from_invite(user_id, email)
        │
        └─ Direction B (signup after invite): AFTER INSERT on auth.users
             handle_new_auth_user → provision_profile_from_invite(NEW.id, email)
```

No self-registration creates a `profile`. A valid Supabase session **without** a `profile` row is the “waiting for family invite” state (RLS returns empty; UI already exists at `WaitingForInvite` / `/waiting`).

### 1.2 `household_invite` columns (0005)

| Column | Type | Notes |
|--------|------|--------|
| `id` | uuid PK | default `gen_random_uuid()` |
| `email` | text NOT NULL | matched with `lower(trim(...))` |
| `household_id` | uuid NOT NULL FK → `household` RESTRICT | target household |
| `role` | text NOT NULL DEFAULT `'member'` | CHECK `IN ('admin', 'member')` |
| `invited_by` | uuid NULL FK → `profile` | optional admin attribution |
| `accepted_at` | timestamptz NULL | NULL = pending; set by provisioning core |
| `created_at` | timestamptz NOT NULL | default `now()` |

### 1.3 Uniqueness & lifecycle

- **One pending invite per email** (case-insensitive, whitespace-tolerant):

  ```sql
  CREATE UNIQUE INDEX uq_household_invite_email
    ON household_invite (lower(trim(email)))
    WHERE accepted_at IS NULL;
  ```

- Accepted invites remain as **history** (no unique constraint once `accepted_at` is set).
- **Revoke (Task 15)** = **DELETE of a pending invite only** (`accepted_at IS NULL`). Accepted rows are read-only history — do not offer revoke; reject in procedure if caller tries.
- DB policy is `FOR ALL` for family admins (`is_family_admin()`), so raw SQL *could* delete accepted history. Application + tests must enforce “pending only” (brief: “revoke accepted rejected (or filtered)”).
- Duplicate pending create → Postgres `23505` → map via `throwFromPostgrest` to **CONFLICT**.

### 1.4 Provisioning core behavior (`provision_profile_from_invite`)

1. Find **pending** invite: `lower(trim(email))` match, `accepted_at IS NULL`, `LIMIT 1`.
2. If none → return `false` (user waits; no profile).
3. `INSERT INTO profile (id, household_id, display_name, role)`:
   - `id = p_user_id` (equals `auth.users.id` by construction)
   - `display_name = split_part(email, '@', 1)`
   - `role` from invite
   - `ON CONFLICT (id) DO NOTHING` (already provisioned → invite still closes)
4. `UPDATE household_invite SET accepted_at = now()` for that invite id.
5. Function is **SECURITY DEFINER**, **REVOKED from PUBLIC** — not user-callable (matrix: 42501 if attempted).

**Local gate:** `handle_new_invite` only looks up `auth.users` when `to_regclass('auth.users')` exists; signup trigger is skipped when auth schema is absent (local no-auth gate).

### 1.5 RLS & audit on invites

| Surface | Policy / trigger |
|---------|------------------|
| SELECT/INSERT/UPDATE/DELETE | `household_invite_admin_all` — `is_family_admin()` only |
| Member / anon SELECT | Zero rows (proven: provisioning.test P6) |
| Audit | `trg_audit_household_invite` → `write_audit_log()` on INSERT/UPDATE/DELETE |

### 1.6 UI copy (required by brief)

Show 0005 dual-direction behavior explicitly:

> "They'll get access when they sign up — or immediately if they already have an account."

Email handling: **trim + lowercase** client-side *and* Zod transform (matches unique index semantics).

### 1.7 Integration-test vectors (align with 0005 / provisioning.test)

| Case | Expect |
|------|--------|
| Admin create invite | Row present; `accepted_at` null if no auth user |
| Admin create when auth user already exists | Profile provisioned + invite accepted (Direction A) |
| Member create invite | FORBIDDEN / 42501 |
| Duplicate pending email (case variants) | CONFLICT 23505 |
| Revoke pending | DELETE succeeds; row gone |
| Revoke accepted | Rejected or filtered (app contract) |
| Member list invites | Empty / FORBIDDEN |

Personas/seed: use fixed UUIDs from `supabase/seed.sql` (admin_a `…0a2`, households `…0a0` / `…0b0` / `…0c0`).

---

## 2. Admin procedure list (Task 15)

### 2.1 Constraints

- **Only Wave 3 task allowed to add a new domain router** for admin (`admin`).
- Every procedure = `adminProcedure` (already in `apps/web/src/server/trpc.ts`: authed + `is_family_admin` RPC). **Display/UX gate only** — RLS remains sole write authority.
- Thin Supabase pass-throughs; surface `42501` / RLS as **FORBIDDEN** (`throwFromPostgrest`).
- **No service-role. No migration/RLS changes.** Missing DB capability → `<!-- TODO(coordinator): … -->` and stop.
- Zod: new file `packages/schemas/src/admin.ts` (+ re-export from `packages/schemas/src/index.ts`).

### 2.2 Recommended procedure map

Nested router under `admin` (brief style: `invites.list`, etc.). Implementer may flatten names as long as tests/docs stay consistent.

| Group | Procedure | Kind | Table / source | Input notes | Status vs today |
|-------|-----------|------|----------------|-------------|-----------------|
| **invites** | `list` | query | `household_invite` | optional filter: pending \| accepted \| all | **NEW** |
| | `create` | mutation | INSERT invite | `email` (trim+lower+email), `householdId`, `role` enum; set `invited_by = ctx.userId` | **NEW** |
| | `revoke` | mutation | DELETE where `id` AND `accepted_at IS NULL` | Reject if accepted / not found | **NEW** |
| **members** | `list` *(optional small addition)* | query | `profile` (+ join household) | group by household for UI | Brief allows this **or** reuse reads; profile SELECT is family-member visible |
| **households** | `list` | query | `household` | include inactive (unlike `family.households` which filters `is_active`) | **NEW** write path; read exists on family |
| | `create` | mutation | INSERT | `name` | **NEW** |
| | `rename` | mutation | UPDATE `name` | `id`, `name` | **NEW** |
| | `setActive` | mutation | UPDATE `is_active` | `id`, `isActive` — **no hard DELETE** (Shape C has no DELETE policy) | **NEW** |
| **portionCategories** | `list` | query | `portion_category` | order by `sort_order`; include inactive for admin | overlaps `family.portionCategories` — admin list may be identical |
| | `create` | mutation | INSERT | name, slug?, baseProteinOz **> 0**, sortOrder, description? | **NEW** |
| | `update` | mutation | UPDATE | base oz, name, description | **NEW** |
| | `setActive` | mutation | `is_active` | deactivate never delete (no DELETE policy / no UI delete) | **NEW** |
| | `reorder` | mutation | batch `sort_order` | same pattern as `category.reorder` | **NEW** |
| **units** | `list` | query | `unit` | group by `dimension` in UI | **NEW** (no unit router today) |
| | `create` | mutation | INSERT | name, abbreviation, dimension ∈ mass\|volume\|count, factorToBase **> 0** | **NEW** |
| | `update` | mutation | UPDATE | warn: factors conversion-critical | **NEW** |
| | `setActive` | mutation | `is_active` | no hard delete | **NEW** |
| **familySettings** | `get` | query | `family_settings` | singleton-by-convention: first row (seed id `…0301`); same as `family.settings` | **NEW** admin mirror or could call family — prefer admin.get for consistency |
| | `update` | mutation | UPDATE `athlete_multiplier` | positive finite; optional `otherGlobalDefaults` if exposed | **NEW** |
| **audit** | `list` | query | `audit_log` | paged; filter `table_name`, `record_id`; order `created_at` desc | **NEW** |

### 2.3 Do **not** re-implement under `admin` (DRY)

These already ship with `adminProcedure` mutations:

| Router | Procedures |
|--------|------------|
| `category` | `list` (authed), `create`, `update`, `deactivate`, `reorder` |
| `tag` | `list` (authed), `create`, `update`, `deactivate`, `reorder` |
| `ingredient.setFoodSafetyProfile` | admin-gated (Task 14 UI) |

**Admin UI “Categories & Tags”** should call **existing** `category.*` / `tag.*` procedures. Reparenting is deferred (brief); note in UI. Tag table has **no `sort_order`** column (0001) — existing tag reorder is non-persisting (see tag router NOTES pattern).

### 2.4 Zod shapes (`packages/schemas/src/admin.ts`) — guidance

```
email: z.string().trim().transform(s => s.toLowerCase()).pipe(z.string().email())
// or: z.string().trim().toLowerCase().email() if zod version supports chain

role: z.enum(['admin', 'member'])
athleteMultiplier: z.number().finite().positive()
baseProteinOz: z.number().finite().positive()   // rejects ≤ 0
factorToBase: z.number().finite().positive()
dimension: z.enum(['mass', 'volume', 'count'])
```

Pagination for audit: reuse `paginationSchema` from `common.ts` + optional `tableName`, `recordId`.

### 2.5 Route / nav (UI)

- Route group: `/admin` inside authed `(app)` tree.
- Nav entry **visible only** when `family.me` → `profile.role === 'admin'`.
- Direct URL for non-admins still safe: RLS empty/denied + `adminProcedure` FORBIDDEN → friendly **“admins only”** empty state (component test required).
- Current `AppNav` has Calendar | Recipes | Ideas | Shopping only — add Admin as secondary (desktop rail / overflow) so mobile bottom bar stays primary workflows.

### 2.6 Audit log schema (0002) — for viewer

```sql
audit_log (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  table_name  text NOT NULL,
  record_id   uuid,                    -- COALESCE(NEW.id, OLD.id)
  action      text CHECK IN ('INSERT','UPDATE','DELETE'),
  actor_id    uuid,                    -- auth.uid() at trigger time
  before_data jsonb,                   -- UPDATE/DELETE
  after_data  jsonb,                   -- INSERT/UPDATE
  created_at  timestamptz NOT NULL DEFAULT now()
)
```

Index: `(table_name, record_id)` for admin history lookups.

**Triggers that write audit today:**

| Table | Migration |
|-------|-----------|
| `meal_plan` | 0002 |
| `recipe` | 0002 |
| `family_settings` | 0002 |
| `portion_category` | 0002 |
| `household_invite` | 0005 |

**Not audited (v1):** `unit`, `category`, `tag`, `household`, `profile`, content junctions, meal_plan children. Viewer still filters by `table_name`; empty result for unaudited tables is expected.

**RLS:** SELECT only for `is_family_admin()`; no user INSERT/UPDATE/DELETE policies (writes only via SECURITY DEFINER `write_audit_log`).

### 2.7 Family settings & portion categories (DB PRD §4.1 / D17)

`family_settings` columns (0001):

| Column | Constraint |
|--------|------------|
| `athlete_multiplier` | numeric NOT NULL DEFAULT 1.5, CHECK **> 0** |
| `other_global_defaults` | jsonb NOT NULL DEFAULT `{}` |
| **No** `adult_reference_protein_oz` | removed (D17) |

Adult Male reference **6.0 oz** lives only on `portion_category` seed row:

- id `00000000-0000-4000-8000-000000000207`
- slug `adult-male`, name `Adult Male`, `base_protein_oz = 6.0`

Admin UI hint (D17 / brief): editing Adult Male base is the family reference — **not** a FamilySettings field.

Shape C policies (category, tag, portion_category, unit, family_settings, household): family-member SELECT; admin-only INSERT/UPDATE; **no DELETE** → deactivate via `is_active` only.

### 2.8 Tests required by brief

**Component (Vitest + Testing Library):**

1. Invite dialog validation — email trim/lowercase.
2. Portion-category editor rejects `baseProteinOz ≤ 0`.
3. Non-admin mocked role → “admins only” state.

**Integration (env-guarded pg client, Wave 2 pattern):**

1. `admin.invites.create` → row present.
2. Revoke pending works.
3. Revoke accepted rejected/filtered (0005 semantics).

---

## 3. Portion-calc example math (admin Family Settings live example)

### 3.1 Canonical formula (D3)

```
effective_protein_oz =
  Σ  ((count − athlete_count) + athlete_count × athlete_multiplier)
     × portion_category.base_protein_oz
```

Package API (do **not** inline math in UI):

- `calculateEffectiveProteinOz(requirements, categories, settings)`
- `calculatePerCategoryBreakdown(...)` — preferred for per-line example
- `roundOz(n)` — display only (1 decimal)

### 3.2 Brief’s live example string

> “An athlete adult male counts as **9.0 oz** at **1.5×**”

Worked math (1 athlete adult male, Adult Male base 6.0):

| Symbol | Value |
|--------|-------|
| count | 1 |
| athleteCount | 1 |
| athleteMultiplier | 1.5 |
| baseProteinOz | 6.0 |

```
weightedPeople = (1 − 1) + 1 × 1.5 = 1.5
effectiveOz    = 1.5 × 6.0 = 9.0
```

**Implementation pattern for stepper:**

```ts
const lines = calculatePerCategoryBreakdown(
  [{ portionCategoryId: adultMaleId, count: 1, athleteCount: 1 }],
  [{ id: adultMaleId, slug: "adult-male", baseProteinOz: currentBase, isActive: true }],
  { athleteMultiplier: draftMultiplier },
);
const display = roundOz(lines[0]!.effectiveOz); // 9.0 at defaults
// Copy: `An athlete adult male counts as ${display} oz at ${draftMultiplier}×`
```

When admin changes multiplier **or** Adult Male base, recompute from the same helpers so the string never drifts from plan-editor math.

### 3.3 Related PRD / seed fixtures (for tests & copy)

| Scenario | Inputs | Result |
|----------|--------|--------|
| PRD §8.2 AC | Adult Male count=2, athlete=1, base=6, mult=1.5 | **15.0** oz |
| All-athlete | count=3, athlete=3, base=6, mult=1.5 | **27.0** oz |
| Zero | no rows / count=0 | **0** oz |
| Mixed plan (unit test) | AM 2/1 + AF 2/0 base5 + Child 1/0 base3 | **28.0** oz |
| Admin live example | AM 1/1, base 6, mult 1.5 | **9.0** oz |

Seed family_settings: id `…0301`, multiplier **1.5**.

### 3.4 Offline note (Task 16)

Portion preview remains available offline because portion-calc is pure client TS (D3). Admin **settings save** still requires online (mutation disabled offline).

---

## 4. PWA scope — Decision D4 (Task 16)

### 4.1 Hard boundary (non-negotiable)

| In Phase 1 (v1) | Out of Phase 1 |
|-----------------|----------------|
| Installable PWA (`manifest.webmanifest`, standalone) | Offline **writes** |
| Read-only offline cache of allowlisted data | Write queues / mutation replay |
| Clear offline UX for blocked writes | Background sync registration |
| Reconnect → invalidate queries (fresh RLS data) | Conflict resolution |
| Online optimistic updates | Claiming success for offline saves |

Reviewers will **grep** for background-sync / mutation-queue code — **none may exist**.

### 4.2 Product §6.8 cache surface (what to cache)

**Cached for offline read:**

- Recipes (recently viewed / planned) + ingredients/safety notes needed to render them
- ChefIdeas
- Categories/tags needed to render those entities
- Upcoming MealPlans already RLS-visible (portion guidance summaries)
- Food-safety notes for cached ingredients
- App shell + static assets

**Not cached / not replayed:**

- POST / tRPC **mutations**
- Shopping-list generation as a “save” while offline (requires connectivity per §6.8)
- Admin mutations

### 4.3 Caching strategy choice (brief allows one; justify in NOTES)

| Layer | Strategy | Recommendation |
|-------|----------|----------------|
| App shell + static | stale-while-revalidate | Service worker (`@serwist/next` preferred) |
| tRPC **queries** (recipes, chefIdeas, categories/tags, upcoming plans + portion breakdown, ingredient safety) | network-first with cache fallback | Prefer **TanStack Query persister** (`@tanstack/react-query-persist-client` + localStorage/IDB) — simpler than SW-level tRPC caching; still satisfies D4 if mutations never persist for replay |
| Mutations | never cache / never queue | Disable controls when `navigator.onLine === false` (and SW offline event) |

**Serwist vs hand-rolled:** app is **Next 16.2.10**. Brief: try `@serwist/next`; if App Router conflict, fall back to `public/sw.js` + manual registration and document in NOTES. PRD still says “Workbox / next-pwa” historically — Task 16 updates the implementation path.

### 4.4 Offline UX checklist

1. **Global offline banner** (explicit, never silent).
2. **Calendar degradation (§6.8):** cached range renders with stale indicator; other ranges → offline empty-state.
3. **All save / mutate buttons disabled** + tooltip: “You're offline — changes can't be saved yet.”
4. **Portion live preview still works** (pure package).
5. **Reconnect:** invalidate all queries so RLS-filtered server data replaces cache.
6. Empty / loading / error / offline states remain actionable (§12 Usability).

### 4.5 Global search (§8.8 + Task 16 §2)

| Requirement | Implementation hook |
|-------------|---------------------|
| One input → recipes + chefIdeas + combinations + ingredients in parallel | Existing `*.list` with `q` on all four schemas |
| Grouped results + type badges | Client-side merge of four query results |
| Keyboard nav + recent searches (localStorage) | UI-only |
| D7 family-global | Content lists already family-scoped via RLS; **no plan data** in global search |
| Soft-deleted excluded | Existing list filters (browse path) |
| Desktop header / mobile search sheet | Layout work in shell |

List inputs already define optional `q` (trim, min 1):

- `recipeListInputSchema`
- chefIdea list schema
- `ingredient` list schema
- `recipeCombination` list schema

### 4.6 Phase 1 success criteria touchpoints (§13.2)

- PWA foundation: installable + read-only offline cache (D4).
- Core search and filtering.
- Performance budgets met (table below).

---

## 5. Performance budget IDs (§12 / D16)

### 5.1 Canonical table (Product PRD v0.2 §12)

| ID | Scenario | Budget | Conditions | Verification method |
|----|----------|--------|------------|---------------------|
| **P1** | Calendar week view interactive | **< 1.5 s** | Mid-range phone; cold PWA launch with **warm application cache** (SW shell + recent plan data) | Playwright: nav start → calendar interactive |
| **P2** | Shopping-list generation | **< 2 s** | 7-day multi-household plan set; response ready for UI | Playwright E2E (or integration timing of SQL + tRPC if E2E flaky) |
| **P3** | Portion live-preview recompute | **< 100 ms** | Single count/athlete change; pure client recompute | **Vitest** micro-benchmark (not Playwright) |
| **P4** | Search results | **< 500 ms** | Typical family corpus; first page of matches | Playwright: settled query → results populated |
| **P5** | Realtime propagation of shared-plan edits | **< 2 s** e2e | Two concurrent sessions, online | Playwright two contexts: save A → visible on B |

### 5.2 Task 16 wiring requirements

| Artifact | Role |
|----------|------|
| `apps/web/e2e/budgets.ts` | **Single source** of numeric limits + budget ids; every assertion message cites §12 id |
| `apps/web/e2e/perf-budgets.spec.ts` | P1, P2, P4, P5 Playwright |
| Vitest (portion-calc and/or PortionGrid) | P3: loose assert **50 recomputes < 100 ms** total (or per-call average — document choice) |
| CI | Run after Wave 2 E2E in database-gates job (NOTES) |

**Threshold policy (brief):**

- Log **raw timing always**.
- Soft-fail / warning at budget (optional log); **hard-fail at 2× budget**.
- Implement the **2× hard threshold** in code.

### 5.3 Existing partial coverage (extend, don’t fork numbers)

`apps/web/e2e/plan-shared-meal.spec.ts` already soft-asserts:

- P1 warm calendar interactive < 1.5 s
- P5 member_b visibility ≤ 2 s

Task 16 should **centralize** constants in `budgets.ts` and expand dedicated `perf-budgets.spec.ts` rather than scattering magic numbers.

### 5.4 Tension to resolve in NOTES (do not invent product change)

| Source | P1 wording |
|--------|------------|
| PRD §12 | Cold PWA launch + warm **application** cache |
| Task 16 brief | Warm run, `performance.now` bracketed navigation |

**Recommendation:** measure warm navigation for CI stability; optionally add a separate cold-launch case later. Document which condition the CI gate enforces so §13.2 “budgets met” is unambiguous.

### 5.5 Suggested `budgets.ts` shape (illustrative — implementer owns file)

```ts
/** §12 Performance budgets (Product PRD v0.2). Times in milliseconds. */
export const PERF_BUDGETS = {
  P1_CALENDAR_INTERACTIVE_MS: 1_500,
  P2_SHOPPING_LIST_MS: 2_000,
  P3_PORTION_PREVIEW_MS: 100,
  P4_SEARCH_RESULTS_MS: 500,
  P5_REALTIME_PROPAGATION_MS: 2_000,
} as const;

export function hardLimit(budgetMs: number): number {
  return budgetMs * 2;
}
```

---

## 6. Gaps, ambiguities, and coordinator TODOs

### 6.1 Gaps that block or skew implementation

| # | Gap | Impact | Suggested handling |
|---|-----|--------|--------------------|
| G1 | **No `unit` router** today; Task 15 must add admin units CRUD | Admin Units table depends on new procedures | Implement under `admin.units.*` as briefed |
| G2 | **`family.*` is read-only** for settings/portion categories/households | Writes must go through `admin.*` | Do not “upgrade” family router mutably (keeps member clients thin) |
| G3 | **Categories/Tags admin mutations already exist** on `category`/`tag` routers | Risk of DRY violation if re-added under `admin` | **Reuse** existing procedures in admin UI |
| G4 | **Tag has no `sort_order` column** | Reorder UI cannot persist | Keep existing non-persist behavior; optional TODO(coordinator) for column |
| G5 | **Category reparenting deferred** | Tree editor: add child / rename / reorder / deactivate only | Note in UI; no `parent_id` change API in this task |
| G6 | **`family_settings` is not DB-enforced singleton** | Multiple rows possible if admin creates twice | UI: get first row by seed id / `limit 1`; **no create** procedure — only update existing seed row. If zero rows: TODO(coordinator) or insert-once with clear NOTES |
| G7 | **Revoke accepted not blocked at RLS** | Admin DELETE policy allows any row | Application filter + integration test; optional coordinator CHECK/policy later |
| G8 | **Audit coverage incomplete** vs “audit-friendly admin” NFR | unit/category/tag/household edits won’t appear in audit viewer | Viewer shows what triggers emit; TODO(coordinator) if product wants broader audit |
| G9 | **`admin.members` unspecified shape** | Members-per-household UI needs profiles | Small `admin.members.list` **or** `from('profile').select` inside invites page via authed read — prefer explicit admin procedure for symmetry |
| G10 | **Household DELETE impossible by design** | setActive only | Align UI copy (“deactivate household”) |
| G11 | **Next 16 + @serwist/next unknown** | May need hand-rolled SW | Spike early; document fallback in NOTES |
| G12 | **P1 cold vs warm measurement mismatch** | CI vs PRD wording | Document chosen condition in NOTES (see §5.4) |
| G13 | **Search `q` quality** | FTS vs `ilike` depends on existing list implementations | Global search inherits whatever list does; do not invent a new search RPC in Task 16 |
| G14 | **No offline indicator infra yet** | Task 16 must add banner + disabled save affordances across shells | Shared hook (e.g. `useOnlineStatus`) to avoid per-page drift |
| G15 | **Perf suite flakiness** | Hard-fail at 2× still can flake on shared CI | Keep 2× hard fail; log timings; seed multi-plan fixture for P2 must exist or be created in e2e helpers |
| G16 | **Invite email delivery** | 0005 does not send email | UI is record-keeping + provisioning only; no mailer in Phase 1 |
| G17 | **Profile create still has `profile_insert_admin` policy** | Direct profile INSERT by admin still allowed by RLS | Prefer invite path only in UI so Direction A/B stay consistent; do not build “create user” form |

### 6.2 Explicit non-goals (do not expand scope)

- Offline editing / background sync / conflict UX (Phase 2 after design).
- Service-role invite provisioning from the app.
- New SQL for invites/audit (already in 0005/0002).
- Plan data inside global search.
- Food-safety profile editor (Task 14) — only admin gate already exists on `ingredient.setFoodSafetyProfile`.

### 6.3 Suggested coordinator TODOs (emit only if implementer hits a wall)

```
<!-- TODO(coordinator): block DELETE on household_invite where accepted_at IS NOT NULL -->
<!-- TODO(coordinator): audit triggers for unit / category / tag / household if admin viewer should show them -->
<!-- TODO(coordinator): enforce single family_settings row (unique partial index or singleton id) -->
<!-- TODO(coordinator): tag.sort_order column if admin reorder must persist -->
```

### 6.4 Dependency graph (Wave 3)

```
Task 14 (editors + safety admin UI)
        │
        ▼
Task 15 (admin router + admin screens) ── uses family.me role, portion-calc, 0005 invites
        │
        ▼
Task 16 (PWA D4 + global search + perf budgets) ── uses list(q), calendar, shopping, realtime e2e
        │
        ▼
Phase 1 gate: §13.2 success criteria (incl. P1–P5 + RLS matrix + contract tests)
```

### 6.5 Files implementers will likely create/touch (checklist, not a mandate)

**Task 15**

- `packages/schemas/src/admin.ts` + `index.ts` export
- `apps/web/src/server/routers/admin.ts` (+ register in `_app.ts`)
- `apps/web/src/app/(app)/admin/**` pages/sections
- Admin components: invites, portion categories, units, family settings, audit, reuse category/tag editors
- Nav: admin entry when role=admin
- Component tests + env-guarded invite integration test

**Task 16**

- Serwist config or `public/sw.js` + registration
- `manifest.webmanifest` + icons under `public/`
- Query persister wiring in providers
- Offline banner + save-disable plumbing
- Global search UI in shell
- `e2e/budgets.ts`, `e2e/perf-budgets.spec.ts`, P3 vitest bench
- CI NOTES for database-gates ordering

---

## 7. Quick reference — role gates

| Capability | UI gate | tRPC gate | RLS authority |
|------------|---------|-----------|---------------|
| View admin nav | `family.me.role === 'admin'` | n/a | n/a |
| Admin procedures | hide controls | `adminProcedure` → FORBIDDEN | `is_family_admin()` policies |
| Invites | admin UI | adminProcedure | `household_invite_admin_all` |
| Audit read | admin UI | adminProcedure | `audit_log_select_admin` |
| Vocabulary writes | admin UI | adminProcedure (or existing category/tag) | Shape C insert/update admin |
| Waiting for invite | session, no profile | family.me → null | no profile → empty member checks |

---

## 8. Sources index (absolute paths)

- `C:\Users\dougr\.grok\worktrees\01gitprojects-menu-boss\subagent-019f6691-763e-7f10-9523-bb38b493665e\grok_15_admin_screens.md`
- `C:\Users\dougr\.grok\worktrees\01gitprojects-menu-boss\subagent-019f6691-763e-7f10-9523-bb38b493665e\grok_16_pwa_search_perf.md`
- `C:\Users\dougr\.grok\worktrees\01gitprojects-menu-boss\subagent-019f6691-763e-7f10-9523-bb38b493665e\supabase\migrations\0005_auth_provisioning.sql`
- `C:\Users\dougr\.grok\worktrees\01gitprojects-menu-boss\subagent-019f6691-763e-7f10-9523-bb38b493665e\supabase\migrations\0002_security.sql`
- `C:\Users\dougr\.grok\worktrees\01gitprojects-menu-boss\subagent-019f6691-763e-7f10-9523-bb38b493665e\supabase\migrations\0001_schema.sql`
- `C:\Users\dougr\.grok\worktrees\01gitprojects-menu-boss\subagent-019f6691-763e-7f10-9523-bb38b493665e\Product_PRD_v0.2.md`
- `C:\Users\dougr\.grok\worktrees\01gitprojects-menu-boss\subagent-019f6691-763e-7f10-9523-bb38b493665e\packages\portion-calc\src\index.ts`
- `C:\Users\dougr\.grok\worktrees\01gitprojects-menu-boss\subagent-019f6691-763e-7f10-9523-bb38b493665e\apps\web\src\server\routers\family.ts`
- `C:\Users\dougr\.grok\worktrees\01gitprojects-menu-boss\subagent-019f6691-763e-7f10-9523-bb38b493665e\apps\web\src\server\trpc.ts`
