# Product Requirements Document (PRD)
## Recipe & Meal Planning Web Application

**Document Version:** 0.2  
**Date:** July 15, 2026  
**Status:** Draft — design review revisions integrated  
**Author:** Grok + Claude (design review revisions)  
**Intended Audience:** LLM assistant assisting with development of the full Product PRD, architecture, and implementation specifications.

**Changes in v0.2 (2026-07 design review):**  
- Auth: RLS sole authority; user-JWT clients only on request paths (D1).  
- Stack: tRPC hosted in Next.js; no NestJS; no v1 Edge Functions (D2).  
- Domain: shared pure portion-calc package (D3); v1 offline = read-only cache (D4).  
- Schema: normalized MealPlanPortionRequirement (D5) and MealPlanHousehold (D6); family-global content (D7); plan date ranges (D8).  
- Quality: Testing Strategy + CI gates (D9); RLS matrix Phase 1 blocker (D10); edge cases as FR acceptance criteria (D11).  
- Ops rules: deterministic Unit conversion (D12); query-pattern indexes (D13); shopping list SQL function (D14); category CTEs (D15).  
- NFR: concrete performance budgets (D16); PortionCategory base ounces single source (D17).  
- Structure: Testing Strategy §11, NFR §12, Roadmap §13, Risks §14; Database PRD reference → v0.4.  

> **Important Note:**  
> This is the **full Product PRD**. It incorporates the separate **Database PRD v0.4** (see Section 7 and Appendix A).  
> The Database PRD focuses exclusively on the data layer and is designed to be merged into this document. The 2026-07 design review decided the system architecture, authentication model, and API approach; those decisions are reflected here and in Database PRD v0.4. Further changes are tracked via the changelog above.

---

## 1. Overview and Purpose

This Product PRD defines the requirements for a web-based recipe and meal planning application designed for a single extended family consisting of three households. The application supports both frequent shared family meals and private household-specific planning, while providing powerful but easy-to-use tools for recipe management, nuanced portion scaling, food safety awareness, creative leftover use, and inspiration capture.

Project name is: MenuBoss

**Core Purpose:**
- Help the family plan, prepare, and enjoy meals together or individually with minimal friction.
- Reduce decision fatigue around “what’s for dinner?” while supporting dietary nuance, food safety, and waste reduction through smart leftover tracking.
- Provide a living system that grows with the family’s cooking style, preferences, and evolving needs (extensible categories, portion profiles, safety guidance, and chef tools).

The application is intentionally scoped for a small, trusted user group (one family) rather than a general public platform. This allows for deeper personalization, simpler sharing models, and higher trust in data like portion multipliers and food safety notes.

## 2. Goals and Success Metrics

**Primary Goals:**
- Enable reliable weekly meal planning across shared and private contexts for three households.
- Make portion scaling accurate and effortless, especially for mixed-age/athlete families (protein-focused initially, with clear path to full-recipe scaling).
- Improve food safety awareness and decision-making (particularly around seafood and contaminants) without adding cognitive load.
- Capture and surface family cooking knowledge (combinations that work, leftover transformations, ideas worth pursuing).
- Reduce food waste through better leftover visibility and “decay path” suggestions.

**Success Metrics (to be refined):**
- High adoption of the shared calendar and meal planning features within the first 4–6 weeks.
- Consistent use of portion calculation when creating or adjusting meal plans.
- Positive family feedback on the usefulness of food safety guidance and leftover suggestions.
- Growth in saved recipes and ChefIdea entries over time.
- Measurable reduction in reported food waste or “forgotten leftovers” (qualitative + any simple tracking).

**Non-Goals (for v1 and near-term):**
- Public recipe sharing or social features.
- Commercial grocery integration or automatic ordering.
- Advanced nutritional tracking beyond basic roll-ups (detailed macro/micro tracking is future).
- Mobile native apps (PWA is the target for cross-device access).
- Multi-family or enterprise use.

## 3. Scope

### 3.1 In Scope (MVP / v1 Focus)
- Recipe and ingredient management with extensible hierarchical categories and flexible tagging.
- Nuanced protein portion scaling (age, sex, athlete status) with editable family defaults.
- Food safety profile on ingredients (FDA-style ratings, mercury risk, frequency recommendations) with JSONB flexibility for future contaminants.
- Meal planning with support for shared family plans and private household plans, visible via calendar.
- RecipeCombination feature for grouping recipes into complete meals with notes and make-again ratings.
- ChefIdea capture for recipes/inspiration to pursue, fully integrated with existing tagging system.
- Leftover decay path tracking on recipes for creative repurposing suggestions.
- Basic shopping list generation derived from meal plans + portion calculations.
- Simple nutrition roll-ups (protein focus initially).
- PWA capabilities for installable, offline-capable (read-only in v1) access on phones/tablets.

### 3.2 Out of Scope (v1)
- Full multi-macro or detailed nutritional analysis.
- Advanced AI recipe generation or meal suggestion engine (foundational data model supports it; implementation is future).
- Pantry inventory tracking with expiry alerts (concept captured in Database PRD; implementation deferred).
- Complex user roles/permissions beyond household-level isolation + family admin.
- Integration with external services (fitness trackers, smart kitchen devices, etc.).
- Comprehensive reporting or analytics dashboards.

### 3.3 Phased Approach

See **§13 Roadmap & Phasing** for the full phased plan. In summary: Phase 1 delivers the core foundation (recipes, ingredients, categories/tags, portion scaling, food safety, MealPlan + calendar, RecipeCombination, ChefIdea, leftover decay paths, basic shopping lists) with a **read-only offline cache**; Phase 2 adds polish, richer shopping lists, and **offline editing** (only after an explicit conflict-resolution design); Phase 3+ pursues AI-assisted features, multi-macro nutrition, pantry tracking, density-based unit conversion, and protein-driven recipe scaling.

## 4. Assumptions and Constraints

- **Technology Stack (Confirmed):**  
  React PWA built with **Next.js, hosting tRPC procedures in the same app** + Supabase (PostgreSQL).  
  The separate **Database PRD v0.4** is incorporated by reference (see Section 7).

- **User Context:** One family with three distinct households that share meals several times per week but also maintain individual plans. The calendar frontend will clearly distinguish shared vs. private plans (shared-ness is **derived** from plan household membership count > 1, not a stored flag).

- **Data Model:** Hybrid relational + JSONB approach as defined in the incorporated Database PRD v0.4. Core planning and portion structures are normalized (`MealPlanPortionRequirement`, `MealPlanHousehold`, `Unit`, etc.). **JSONB is limited** to fluid, non-filter structures: `food_safety_profile`, `leftover_decay_path`, `nutrition_data`, and `FamilySettings.other_global_defaults`. There is no `protein_portions` JSONB and no stored visibility JSONB on MealPlan.

- **Authentication & Access:** Supabase Auth provides identity. **Row Level Security (RLS) is the sole authorization authority.** Every backend procedure uses a Supabase client carrying the **caller’s JWT**; there is no service-role path in request handling (service role is reserved for migrations and audit jobs only). The backend does not re-validate visibility — RLS does. Detailed policies are specified in **Database PRD v0.4 §7**.

- **Content vs. plan visibility:** Recipes, Ingredients, ChefIdeas, and RecipeCombinations are **family-global**. Only MealPlans have household visibility semantics (via `MealPlanHousehold` membership).

- **Scale:** Small, trusted user base (one family). Performance and concurrency requirements are modest but the system must support clean aggregation queries for shopping lists and nutrition summaries.

- **Extensibility Priority:** The family expects to grow the system themselves (new categories, portion profiles, safety guidance, ChefIdeas) without developer intervention for most changes.

- **Future AI Integration:** The data model and architecture should be designed to support future multi-agent or LLM-assisted features (recipe suggestions, substitution recommendations, meal plan generation) without major rework.

## 5. User Personas and Key Use Cases

**Primary Personas (to be expanded):**
- **Family Meal Planner** (often one or two adults per household): Creates weekly plans, adjusts portions, generates shopping lists, manages shared vs. private visibility.
- **Home Cook / Chef:** Adds and refines recipes, captures ChefIdeas, documents successful combinations and leftover transformations, applies food safety knowledge.
- **Household Member (various ages/athletes):** Views plans, sees relevant portion guidance and safety notes, provides feedback via make-again ratings.

**Key Use Cases (examples):**
- Plan a shared Sunday dinner across two households, automatically calculating total protein needs with mixed adult/child/athlete counts and surfacing any relevant food safety notes for chosen seafood.
- Capture a promising recipe idea from a cookbook or restaurant (“Greek Islands pork shoulder”) and tag it so it appears in relevant category searches later.
- After making a large pork roast, record creative leftover uses (Cuban sandwiches, Bolognese) so the family can easily find them next time.
- Combine a main, two sides, and dessert into a “RecipeCombination” with notes on timing and a 1-5 make-again rating for the overall meal.
- Quickly see FDA-aligned mercury guidance and recommended serving frequency when browsing or selecting seafood recipes.

## 6. Architecture Deep-Dive

### 6.1 Overall Architecture Approach
The system follows a **single-deployable, Supabase-backed architecture**: a Next.js React PWA that also hosts the **tRPC** server layer (route handlers in the same app), with Supabase providing managed Postgres, Auth, Realtime, RLS, and Storage.

**Guiding Principles:**
- Keep the architecture simple given the small user base (one family) — **one deployable** (Next.js) rather than a separate API service.
- Maximize use of Supabase managed services to reduce operational overhead.
- Use the server layer for orchestration, input validation, shared calculation logic, and set-based DB function invocation — **not** as a second authorization layer.
- **RLS is the sole authorization authority**; application code always acts under the caller’s JWT.
- Design for easy future evolution into AI-assisted features without changing the core trust model.

### 6.2 Frontend Layer (React PWA)
- **Framework**: Next.js (App Router) with React 19+ and TypeScript (strict mode).
- **State Management**: TanStack Query (React Query) for server state + Zustand or Jotai for lightweight client state.
- **UI Components**: shadcn/ui + Tailwind CSS for rapid, consistent, accessible components. Radix UI primitives where needed.
- **Calendar**: FullCalendar or react-big-calendar (with custom styling) for the shared/private meal planning view.
- **Forms**: React Hook Form + Zod for validation (especially important for portion inputs and food safety data).
- **PWA Features**:
  - Service Worker via `next-pwa` or Workbox for **read-only offline caching** of recipes, ChefIdeas, upcoming meal plans, portion guidance, and safety notes.
  - Installable on mobile and desktop.
  - **v1 does not include offline writes, background sync of edits, or conflict resolution** (Phase 2; contingent on an explicit conflict-resolution design).
- **Key Responsibilities**:
  - User interface and interactions.
  - Direct Supabase client calls for realtime subscriptions and simple reads/writes where RLS is sufficient.
  - Calls to tRPC procedures for validated orchestration (meal plan create/update, shopping list generation, admin operations).
  - **Optimistic UI updates for online use only** (not a substitute for offline write queues).
  - Live portion preview via the shared `portion-calc` package (same pure function used on the server).

### 6.3 Server Layer (tRPC in Next.js)
- **Hosting**: **tRPC procedures run inside the Next.js app** (route handlers). There is no standalone NestJS (or other) API service in v1. Supabase Edge Functions are **not used in v1 paths**.
- **Primary Responsibilities**:
  - **Input validation** with Zod on all procedure inputs.
  - **Orchestration of the shared `portion-calc` package** (one pure TypeScript function imported by UI live preview, tRPC procedures, and offline cache consumers). Persisted portion totals are **cached derived values**, recomputed when FamilySettings or PortionCategory data change.
  - **Calling `generate_shopping_list`** (set-based SQL function, `SECURITY INVOKER` so RLS filters results) and formatting results, including the deterministic unit-conversion separate-lines fallback (see §10.3 / Database PRD v0.4).
  - Admin operations (family settings, bulk category/tag management, food safety profile curation).
  - Future orchestration layer for AI/LLM multi-agent features.
- **Authorization model**: Procedures execute with a Supabase client bound to the **caller’s JWT**. Authorization of reads and writes belongs entirely to **RLS**. The server layer does not re-implement visibility checks and does not use the service role for request handling.

### 6.4 Database & Data Layer (Supabase / PostgreSQL)
- **Core Database**: Supabase-hosted PostgreSQL with the model defined in the incorporated **Database PRD v0.4**.
- **Key Supabase Features Used**:
  - **Row Level Security (RLS)**: Sole authorization authority for household isolation and controlled sharing of MealPlans (membership via `MealPlanHousehold`).
  - **Realtime**: Used for live calendar updates when shared plans are modified; broadcast reaches only clients authorized by RLS.
  - **Auth**: Supabase Auth (email + password or magic links) with profile metadata for household membership and admin roles.
  - **Storage**: For recipe images and potentially generated shopping list PDFs.
- **JSONB Strategy**: Used only for fluid, non-filtered structures (`food_safety_profile`, `leftover_decay_path`, `nutrition_data`, `FamilySettings.other_global_defaults`). Plan portion needs and visibility are **normalized** (`MealPlanPortionRequirement`, `MealPlanHousehold`) — not JSONB.
- **Indexing**: By documented query pattern (Database PRD v0.4 §6). No blanket GIN on all JSONB columns.

### 6.5 Communication & Data Flow Patterns

**Pattern 1: Direct Supabase from Frontend (preferred for simple operations)**
- React PWA → Supabase client (with user JWT + RLS) for:
  - Reading recipes, ChefIdeas, categories, and other family-global content.
  - Realtime calendar subscriptions.
  - Simple create/update of data the user’s policies already allow.

**Pattern 2: Via tRPC procedures in the Next.js app (user-context Supabase client)**
- React PWA → tRPC (Next.js route handlers) → Supabase client **with the caller’s JWT** (never service role in this path) for:
  - Creating/updating MealPlans with portion recalculation and household membership rows.
  - Generating shopping lists (wrapper over `generate_shopping_list`).
  - Admin actions (updating FamilySettings or food safety profiles).
  - Future AI feature calls.

**Example Data Flow – Creating a Shared Meal Plan with Portions**
1. User in Household A creates a new MealPlan with `startDate` / `endDate`, assignment slots (`assignmentDate` within that range), portion requirement rows, and `householdIds` including Household A and Household B.
2. Frontend calls `mealPlan.createOrUpdate` via tRPC.
3. Backend validates **input shape** with Zod (plan fields, assignments array, `portionRequirements: Array<{ portionCategoryId, count, athleteCount }>`, `householdIds: string[]`). It does **not** re-validate visibility rules beyond what the schema requires.
4. Backend computes portion totals with the **shared pure `portion-calc` function** (same code path as the UI live preview).
5. Backend writes the MealPlan, `MealPlanAssignment` rows, `MealPlanHousehold` membership rows, and `MealPlanPortionRequirement` rows **under the user’s JWT** — **RLS authorizes the write**. Shared-ness is derived (membership count > 1); there is no stored `is_shared` field and no `protein_portions` JSONB.
6. Supabase Realtime broadcasts the change to authorized subscribers (households with membership on the plan).
7. Frontend receives the realtime update and refreshes calendar + portion summary.

### 6.6 Security Architecture
- **Authentication**: Supabase Auth with household membership stored in the `profile` table (see Database PRD v0.4 §4.1).
- **Authorization**: **RLS is the sole authority.** Every request-path client — browser Supabase client and tRPC-created Supabase client — carries the **caller’s JWT**. The **service role is never used in request handling** (reserved for migrations, seed, and audit jobs only).
- **Data Isolation**: Strong guarantee that one household cannot see another household’s private plans. Content entities (recipes, ingredients, chef ideas, combinations) are family-global; plan visibility is membership-based.
- **Auditability**: Soft deletes + trigger-based logging on sensitive tables (MealPlan, Recipe, FamilySettings, PortionCategory — per Database PRD v0.4 §7).
- **Policy detail and test matrix**: See **Database PRD v0.4 §7** and the **§11 Testing Strategy** section (RLS policy shapes and automated RLS matrix).

### 6.7 Technology Recommendations & Rationale

| Layer          | Recommended Technology                          | Rationale |
|----------------|--------------------------------------------------|---------|
| Frontend       | Next.js + TypeScript + Tailwind + shadcn/ui     | Excellent DX, PWA support, great ecosystem; hosts tRPC in the same deployable |
| State          | TanStack Query + Zustand                        | Excellent caching, optimistic updates (online), minimal boilerplate |
| Backend        | **tRPC in Next.js (single deployable)**         | End-to-end type safety; no separate NestJS service; procedures run under user JWT |
| Database       | Supabase (PostgreSQL)                           | Managed Postgres + Auth + Realtime + RLS out of the box |
| Portion calc   | Shared package (`packages/portion-calc`)        | One pure function for UI, tRPC, and offline consumers |
| Realtime       | Supabase Realtime                               | Native, reliable, low latency; RLS-scoped |
| Forms          | React Hook Form + Zod                           | Best-in-class validation and UX; Zod shared with tRPC inputs |
| Calendar       | FullCalendar or react-big-calendar              | Mature, customizable, supports multiple views |
| Offline        | **Workbox / next-pwa — read-only cache v1**     | Installable + offline reads; offline writes deferred to Phase 2 |

### 6.8 Offline & PWA Strategy
v1 offline support is **read-only**.

**What is cached (illustrative; exact cache keys are an implementation detail):**
- Recipes (and related ingredients / safety notes needed for recently viewed or planned meals).
- Upcoming meal plans visible to the user’s household(s), including portion guidance summaries already computed.
- ChefIdeas and other high-value read surfaces needed when connectivity is poor.
- Safety notes and portion guidance for plans the user has recently opened.

**Cache invalidation on reconnect:**
- On reconnect, TanStack Query / service-worker caches are invalidated or revalidated against the server so the calendar and recipe views converge to the latest RLS-visible data.
- No offline write queue is drained in v1 because offline writes are not supported.

**Calendar graceful degradation:**
- When offline, the calendar presents the last successfully cached upcoming plans and marks the view as offline / potentially stale.
- Create, edit, share, and shopping-list generation actions require connectivity and surface a clear offline message rather than queuing silently.

**Phase 2 note:** Offline **editing**, background sync, and conflict resolution are **explicitly out of v1**. They are Phase 2 features contingent on a designed conflict-resolution model (last-write-wins is insufficient for shared meal plans). Optimistic updates remain available for **online** interactions only.

### 6.9 Future Extensibility Points
- **AI / LLM Integration**: The tRPC layer inside Next.js is the natural orchestration point for multi-agent systems (recipe suggestions, substitution recommendations, intelligent meal planning, ChefIdea enhancement), still executing under user JWT / RLS for any data access.
- **Edge Functions**: Not used in v1. May be considered later as a possible future venue for lightweight, globally distributed logic if latency or isolation needs justify a second compute surface — without changing the RLS-as-sole-authority model.
- **Additional Supabase Features**: Database Webhooks, Storage transformations, or Auth hooks as needs grow.

## 7. Data Model Reference

The complete data model is defined in the incorporated **Database PRD v0.4** (file: `Recipe_Meal_Planning_Database_PRD_v0.4.md`).

Key entities include:
- Household, User/Profile
- Ingredient (family-global; with `food_safety_profile` JSONB and `created_by_user_id`)
- Recipe (family-global; with `make_again_rating`, `leftover_decay_path` JSONB, and `created_by_user_id`)
- Category (hierarchical via `parent_id` + recursive CTEs), Tag
- PortionCategory (with `base_protein_oz` as the single source of per-category base ounces, including the Adult Male reference default) + FamilySettings (`athlete_multiplier` + `other_global_defaults` only — no separate adult base oz field)
- Unit (lookup with `dimension` + `factor_to_base` for deterministic within-dimension conversion)
- MealPlan (date-ranged container with `start_date` / `end_date`) + MealPlanAssignment (with in-range `assignment_date`)
- MealPlanHousehold (household membership on plans; shared-ness derived from membership count > 1)
- MealPlanPortionRequirement (normalized `count` + `athlete_count` per PortionCategory)
- RecipeCombination + junction (family-global; meals grouping with notes + rating, `created_by_user_id`)
- ChefIdea (family-global; tagged inspiration items, `created_by_user_id`)

All extensible vocabularies are database-driven. JSONB is reserved for fluid, non-filtered structures (`food_safety_profile`, `leftover_decay_path`, `nutrition_data`, `FamilySettings.other_global_defaults`); core planning, portion, and visibility structures are normalized.

## 8. Detailed Functional Requirements

### 8.1 Recipe & Ingredient Management
- Users can create, view, edit, and soft-delete recipes and ingredients. Hard delete is never offered in the UI; soft-delete preserves historical integrity for meal plans and shopping lists.
- **Recipes and ingredients are family-global (D7):** every authenticated family member can browse and use them. Visibility filtering does **not** apply to recipe or ingredient content. Each record stores `created_by_user_id` attribution for provenance; attribution does not restrict read access.
- Recipes support rich instructions (structured steps with optional timers, temperatures, techniques), yield/servings, prep/cook/total time, source attribution, and images.
- Ingredients support master data with default units, optional nutritional data, and `food_safety_profile` (JSONB).
- Hierarchical categories (nutrition taxonomy) and flexible tags (meal type, cuisine, preparation method, dietary, difficulty, etc.) can be assigned to both recipes and ingredients. Categories support unlimited depth via parent-child relationships.
- Food safety information (FDA categories, risk levels such as mercury, recommended frequency, population-specific notes) is displayed prominently when viewing or selecting ingredients/recipes that have safety profiles.
- Family administrators can curate and update food safety profiles and global category/tag lists without code changes.
- Search and basic filtering work across recipe title, description, ingredients, categories, and tags. Soft-deleted recipes and ingredients are excluded from browse/search result sets.
- Soft-deleted recipes remain visible wherever they are already assigned—both historical and active/future meal plans—and are **badged as deleted** in those contexts so planners know the source recipe was removed from the catalog. Soft-deleted recipes do not appear in recipe browsers or global search.
- Un-deleting a soft-deleted recipe restores it to browse/search and clears the deleted badge on plan surfaces that still reference it.
- Soft-deleting an ingredient that is still referenced by one or more recipes is allowed. Affected recipes are **badged** (e.g., “references deleted ingredient”) so cooks can replace or restore the ingredient; the soft-deleted ingredient is hidden from normal ingredient pickers/search.
- Ingredient names must be unique within the family catalog **case-insensitively** at creation time. An attempt to create a duplicate name is rejected with a clear message and a **merge suggestion** pointing at the existing ingredient (users may open/edit the existing record instead of creating a parallel one).

**Acceptance Criteria (examples):**
- A user can add a new seafood ingredient and attach an FDA-aligned mercury profile with recommended serving frequency in under 2 minutes.
- Changing a recipe’s category or tags immediately affects search and filtering results for all family members (family-global catalog).
- Any family member can open a recipe created by another household’s cook; the recipe detail shows creator attribution and is not filtered by household.
- Soft-deleted recipes are hidden from active browsing and global search.
- Soft-deleted recipes remain visible (with a clear “deleted” badge) on historical meal plans **and** on active/future plans that still assign them.
- Un-deleting a soft-deleted recipe restores it to browse/search and removes the deleted badge from plan views that reference it.
- Soft-deleting an ingredient still used by recipes succeeds; each affected recipe shows a badge or warning that it references a deleted ingredient; hard delete of ingredients is not available in the UI.
- Creating an ingredient named “Olive Oil” when “olive oil” already exists is rejected with a clear duplicate-name message and a merge/open suggestion for the existing record.
- Creating an ingredient with a distinct name (no case-insensitive match) succeeds and appears in family-wide search.

### 8.2 Portion Scaling & Food Safety
- Portion needs for a MealPlan are stored as **`MealPlanPortionRequirement` rows** (D5): each row is `(portionCategoryId, count, athleteCount)`. The legacy boolean “athlete flag per group” and `protein_portions` JSONB are removed. `athleteCount` is the number of people within `count` who receive the athlete multiplier; the constraint **`athleteCount ≤ count`** is enforced (application validation + database check).
- Family administrators edit **per-category base protein ounces** on `PortionCategory` rows. The **Adult Male** category row is the 6 oz family reference default; other categories carry their own `base_protein_oz` values. There is no separate FamilySettings “adult base oz” field—base ounces live only on PortionCategory (single source of truth).
- Family administrators edit the family-wide **athlete multiplier** on `FamilySettings` (default 1.5×).
- When creating or editing a MealPlan, users enter **`count` and `athleteCount` per PortionCategory** (e.g., adult male/female, adolescent bands, child, senior). Rows with `count = 0` are not kept; absence of a row means zero people in that category.
- **Displayed total protein requirement is always derived (D3):** a single pure TypeScript function in a shared package (`packages/portion-calc` or equivalent) computes:

  ```
  effective_protein_oz(plan) =
    Σ over requirement rows r:
      ( (r.count − r.athlete_count)
        + r.athlete_count × family_settings.athlete_multiplier )
      × portion_category.base_protein_oz
  ```

  The UI live preview, server procedures, and offline-capable read paths all use this same function. Totals are recomputed whenever FamilySettings or PortionCategory base values change. **No stored/stale total is ever shown as authoritative.**
- Live preview of the calculated total updates as the user changes counts (target: **<100 ms** feedback for count edits; see §12 performance budgets).
- Food safety notes (especially mercury risk and frequency guidance for seafood) are surfaced contextually when recipes containing flagged ingredients are added to plans or viewed.
- Portion **counts** are plan-scoped (entered for that MealPlan). Shared plans do not auto-merge counts from other households; the creating household (or editor) sets the requirement rows for the plan. Calculated protein totals inform the planner’s **servings** choices on assignments; they do not silently rewrite ingredient lines (see §8.7).

**Acceptance Criteria (examples):**
- Entering `count = 2`, `athleteCount = 1` for Adult Male with base 6 oz and athlete multiplier 1.5× yields displayed total contribution `(1 + 1×1.5) × 6 = 15` oz from that category (plus any other categories).
- Submitting or saving a requirement with `athleteCount > count` is rejected with a clear, user-visible message (e.g., athlete count cannot exceed people in that category); the invalid row is not persisted.
- A plan where every portion category has `count = 0` (or no requirement rows) displays **0 oz** required and does not error.
- Generating a shopping list for a zero-count plan produces an **empty list without error** (see also §8.7).
- Deactivating a PortionCategory: existing plans that already have requirement rows for that category still **display and calculate** using its stored base ounces; the deactivated category is **not offered** when adding or editing requirement rows on new or updated plans.
- Changing FamilySettings `athlete_multiplier` or any PortionCategory `base_protein_oz` mid-week immediately changes the **displayed** protein totals on **all** plans that use those values—no plan shows a previously cached/stale total as the live requirement.
- After a settings/base change, reopening any plan editor or calendar protein summary shows totals that match a fresh call to the shared pure calculation function (acceptance: no UI surface presents a stored total that disagrees with the pure function over current settings + requirement rows).
- Changing counts in the plan editor updates the live protein preview in under 100 ms under normal local conditions (see §12 performance budgets).
- When a recipe containing shrimp is added to a plan, relevant FDA “Good Choices” guidance and serving frequency notes appear without extra clicks.
- Family admins can adjust the athlete multiplier and Adult Male (or any category) base ounces and see the change reflected in subsequent calculations and displays across the family.

### 8.3 Meal Planning & Calendar
- Users create MealPlans as **date-ranged containers** with required **`start_date` and `end_date` (D8)**. Recipes are assigned via MealPlanAssignment rows that carry an **`assignment_date`** and meal slot (breakfast, lunch, dinner, snack, etc.).
- **Invariant:** every `assignment_date` must fall within the parent plan’s inclusive `[start_date, end_date]` range. Attempts to create or move an assignment outside that range are **rejected with a clear error**. Shrinking a plan’s date range so that existing assignments would fall outside is **rejected** until those assignments are moved or removed.
- **Sharing model (D6):** visibility is controlled only by **`MealPlanHousehold` membership rows**. At create time the user selects which households can see the plan; the creating household is always a member and **cannot be removed**. There is no stored `is_shared` flag: the **“shared” badge is derived** from membership count > 1.
- Content entities (recipes, ingredients, combinations, ideas) are not plan-visibility-scoped; only MealPlans (and their assignments, portion requirements, and membership) are.
- A calendar view displays plans with clear visual distinction between **shared** plans (membership count > 1) and **private** plans (creating household only).
- **Permissions (v1):** members of the **creating household** (and family admins) can edit the plan. Members of a **shared but non-creating** household can **view** the plan and its assignments on the calendar but **cannot edit** in v1.
- Realtime updates occur when any authorized change affects a plan visible to a household (including share/unshare membership changes). Supabase Realtime respects RLS so clients only receive plans they may select.

**Acceptance Criteria (examples):**
- A user in Household A can create a plan with `start_date`/`end_date` spanning a weekend and membership rows for Households A and B; Household C cannot see or edit it unless explicitly added as a member.
- The calendar shows a “shared” badge (or equivalent visual) only when more than one household is a member; a single-household plan appears private with no shared badge.
- Assigning a recipe to a date inside the plan range succeeds; assigning to a date **outside** `[start_date, end_date]` is rejected with a clear, user-visible error and no row is saved.
- Attempting to shrink a plan’s `end_date` (or widen-in-reverse) so an existing assignment would fall outside the new range is **rejected** until that assignment is moved or removed; after moving/removing stranded assignments, the range update succeeds.
- Unsharing Household B (removing its membership row) removes Household B’s visibility **immediately**; Household B’s calendar updates in realtime and no longer shows the plan. The creating household’s membership cannot be removed (attempt is rejected with a clear error).
- A member of a shared non-creating household can open and view the plan and its assignments but cannot save edits to the plan, assignments, portion requirements, or membership list in v1.
- Editing a shared plan (by the creating household) triggers realtime calendar refresh for all currently member households.
- Private plans (creating household only) are never visible outside that household.

### 8.4 RecipeCombination (Complete Meals)
- RecipeCombinations are **family-global (D7):** any authenticated family member can view and use them; household visibility filtering applies only to MealPlans.
- Users can group multiple recipes into a named “RecipeCombination” representing a complete meal (e.g., “Greek Sunday Roast Dinner”).
- Each combination supports free-text notes (timing, pairing rationale, serving suggestions) and a 1-5 make-again rating for the overall meal experience.
- Junction records allow specifying the role of each recipe in the combination (main, side, dessert, appetizer, etc.) and sequence order.
- Combinations can be saved as templates and reused or linked to specific MealPlanAssignments.
- Make-again ratings on combinations are separate from individual recipe ratings and help surface family favorites.

**Acceptance Criteria (examples):**
- A user can combine a pork roast recipe + two sides + dessert into one named combination with notes and a 4/5 rating in a single flow.
- Saved combinations appear as reusable options when building future meal plans.
- The make-again rating on a combination influences discovery or “family favorites” views (future enhancement).

### 8.5 ChefIdea & Inspiration Capture
- ChefIdeas are **family-global (D7):** visible to and usable by all family members; household visibility controls apply only to MealPlans.
- Users can create ChefIdea records for recipes or techniques they want to pursue later (“Pork Shoulder Roast from Greek Islands — try this”).
- ChefIdeas support rich notes, source attribution, status (idea / researching / tested / adopted), and priority.
- ChefIdeas are fully taggable using the same Category and Tag system as recipes (nutrition categories, cuisine, etc.), enabling discovery through existing filters.
- A ChefIdea can be converted/linked to a full Recipe record once developed.
- Family members can browse and search ChefIdeas alongside recipes.

**Acceptance Criteria (examples):**
- A user captures an idea from a restaurant or book and tags it with “Protein > Pork” and “Cuisine: Greek/Mediterranean” so it appears in relevant searches.
- Status changes on a ChefIdea are visible in family views and can trigger notifications (future).
- Converting a ChefIdea to a Recipe preserves the original notes and tags.

### 8.6 Leftover Management (Decay Paths)
- On any Recipe, users can record a structured `leftover_decay_path` (JSONB) describing creative repurposing options for leftovers.
- Each entry in the decay path includes a suggested use, notes, and optional links to other recipes or ChefIdeas.
- Decay paths are surfaced when viewing a recipe that has been used in recent meal plans or when browsing leftovers-related content.
- The system supports both free-form text and structured suggestions to balance flexibility with future queryability.

**Acceptance Criteria (examples):**
- After cooking a large pork shoulder, the cook adds “Cuban Sandwiches”, “Bolognese base”, and “Enchiladas” as decay path options with notes.
- When viewing the original pork recipe later, the family can easily see and navigate to the suggested leftover uses.
- Decay path entries can link to existing recipes or ChefIdeas for one-click navigation.

### 8.7 Shopping List Generation (Derived)
- Users generate shopping lists from one or more selected MealPlans. Generation is backed by a **single set-based SQL function** (`generate_shopping_list`, D14) that joins plans → assignments → recipes → recipe ingredients → units. The function runs as **SECURITY INVOKER** so **RLS automatically limits** which plans contribute; plan IDs the caller cannot see contribute **zero rows** rather than erroring.
- **Quantity scaling (v1):** each ingredient line is scaled by  
  `scale_factor = assignment.servings / recipe.yield_servings`.  
  The plan’s calculated protein requirement **informs the user’s servings choice** (protein total is displayed in the assignment/plan editor). It does **not** silently rescale individual ingredient lines in v1—mapping “oz of protein needed” onto specific recipe lines is not decidable without protein-line tagging (Phase 3 candidate).
- **Unit conversion is deterministic (D12):** quantities convert and sum **only within the same dimension** (mass, volume, or count) using `Unit.factor_to_base` (`quantity × factor_to_base`, then optional display-unit formatting). **Cross-dimension pairs are never merged by guessing** (no density-based mass↔volume conversion in v1). When the same ingredient appears in different dimensions, the list shows **separate lines under one ingredient heading**.
- **`is_optional` ingredients aggregate separately** into an **Optional** group (or equivalent section). Optional quantities never add into the main (required) quantity for that ingredient.
- Soft-deleted recipes that remain assigned on included plans **still contribute** to the list; UI surfaces may badge those lines as coming from a deleted recipe.
- Lists can be exported or shared (print, copy; future grocery integration out of scope for v1).
- Empty plans (no assignments, or all zero contribution) produce an **empty shopping list without error**.

**Acceptance Criteria (examples):**
- Generating a list for one or more RLS-visible plans returns a single aggregated result set; invisible plan IDs in the request do not leak ingredients and do not cause a hard failure.
- Two recipes on selected plans that both use 200 g flour produce one main-line flour total of 400 g (same dimension, converted via `factor_to_base` as needed), not two unmerged rows.
- **Cross-dimension example:** if one recipe lists flour as **500 g** (mass) and another as **2 cups** (volume), the shopping list shows flour once as a heading with **two separate lines**—“500 g” and “2 cups”—and does not invent a single combined quantity.
- An optional garnish (e.g., `is_optional = true` parsley) appears only under the **Optional** group and **never inflates** the main/required quantity for parsley (or any other ingredient).
- Ingredient lines scale with `assignment.servings / recipe.yield_servings` (e.g., a 4-serving recipe assigned at 8 servings doubles each non-optional line for that assignment).
- Changing only the displayed protein total (portion requirement rows) without changing assignment `servings` does **not** change shopping-list quantities in v1.
- Soft-deleted recipes still on included plans contribute their ingredients; the list or line is badged so the user can see the source recipe is deleted.
- Selecting plans with no assignments (or no contributing ingredients) yields an **empty list** and **no error**.
- Multi-plan generation across households: when the caller can see both a private plan and a shared plan, ingredients from both are deduplicated per the same-dimension rules above; a second household that can see only the shared plan does not receive private-plan lines (RLS).
- Export/print of a generated list includes both main and Optional sections when optional items are present.

### 8.8 Search, Filtering & Discovery
- Global search works across **recipes, ChefIdeas, combinations, and ingredients**—the **family-global catalog (D7)**. All authenticated family members search the whole family’s content; household membership does **not** hide recipes, ideas, combinations, or ingredients from search results.
- Soft-deleted catalog items are excluded from search and browse (see §8.1); they may still appear in plan-derived contexts with deleted badges.
- Filters include categories (hierarchical), tags, portion suitability, food safety flags, make-again rating, and time commitment.
- **Meal plans and plan-derived surfaces remain visibility-filtered:** calendar search/filter, “plans this week,” and shopping-list plan pickers only include MealPlans the caller’s household can see via `MealPlanHousehold` membership (RLS). Search of the content catalog must not be described or implemented as “household-visible content only.”
- Creator attribution may be shown on results but is not used as a visibility gate.

**Acceptance Criteria (examples):**
- A user can filter for “high-protein, quick weeknight dinners suitable for adolescents” and see relevant recipes **and** any matching ChefIdeas from the entire family catalog, including items created by other households.
- Food safety warnings appear inline in search results when relevant ingredients are present.
- A recipe created by Household B appears in Household A’s recipe search without any share action (family-global content).
- Soft-deleted recipes do not appear in global search or the recipe browser.
- Filtering or searching the calendar / meal-plan list never shows another household’s private plan; shared plans the user’s household is a member of do appear.
- Plan pickers used for shopping-list generation only list RLS-visible plans, even though recipe search remains family-global.

---

**Note:** These functional requirements are intentionally detailed enough for implementation planning while remaining at a product level. UI/UX specifics and exact API shapes will be defined in subsequent sections.

## 9. UI/UX & Interaction Requirements

### 9.1 Design Philosophy
The interface should feel **simple, calm, and family-oriented** — low cognitive load, high clarity, and respectful of the fact that users may be cooking while using the app. It prioritizes quick access to the most common actions (view this week’s plan, add a recipe to a plan, see safety notes, capture an idea) while making advanced features (portion customization, ChefIdeas, decay paths) discoverable but not intrusive.

Key principles:
- Mobile-first (PWA experience should feel native on phones/tablets).
- Realtime feedback for shared plans.
- Contextual surfacing of important information (portion totals, food safety warnings, leftover suggestions).
- Optimistic UI updates (online) with clear error handling and sync status.
- Accessibility-first (WCAG 2.2 AA minimum).

### 9.2 Key Screens & Views

**Calendar / Meal Planning Dashboard (Primary Screen)**
- Main view showing a weekly or monthly calendar.
- Clear visual distinction between **Shared Family Plans** (highlighted, e.g., with a family icon or different color) and **Private Household Plans**.
- Quick actions: “Add recipe to plan”, “Create new plan”, “Generate shopping list”.
- Summary strip showing total protein needs for the week (or selected days) with breakdown by household when relevant.
- Ability to tap into a day to see detailed meal slots and assigned recipes/combinations.

**Recipe Browser & Detail**
- Grid or list view with filters (categories, tags, time, make-again rating, food safety flags).
- Search bar that also surfaces matching ChefIdeas.
- Recipe detail view shows:
  - Ingredients with food safety notes surfaced inline (especially for seafood).
  - Portion guidance when opened from within a meal plan context.
  - Leftover decay path section (if populated), displayed as an expandable “Creative Leftovers” area with links.
  - Make-again rating (1-5) with ability to rate.
  - “Add to Plan” and “Add to Combination” actions.

**MealPlan Editor / Portion Calculator**
- When editing a plan or assignment, a clear interface for entering or adjusting **a count and an athlete count per PortionCategory** (adult_male, adult_female, adolescent splits, child, senior).
- Live preview of calculated total protein requirement as counts change.
- Option to mark the plan as shared with specific households.
- Contextual food safety warnings when ingredients with profiles are included.

**RecipeCombination Creator**
- Flow to group multiple recipes into a named complete meal.
- Ability to assign roles (main, side, etc.) and order.
- Notes field for timing/pairing comments.
- 1-5 make-again rating for the overall meal.
- Option to save as template or link directly to a MealPlanAssignment.

**ChefIdea Capture & Browser**
- Simple “+ Capture Idea” floating action or prominent button.
- Form with title, notes, source, tags (using existing category/tag system), status, and priority.
- Browser view that can be filtered the same way as recipes.
- Clear path to convert a ChefIdea into a full Recipe.

**Shopping List View**
- Generated from selected plans or date range.
- Grouped by ingredient category where possible.
- Quantities scaled by servings/yield (the calculated protein requirement is shown to guide the servings choice).
- Ability to check off items and optionally sync status back to the plan.

### 9.3 Key User Flows

**Flow: Plan a Shared Meal**
1. User opens Calendar → taps a day → “Add to Plan”.
2. Searches or browses recipes (safety notes visible).
3. Selects recipe → enters or adjusts counts and athlete counts per PortionCategory (age/sex group).
4. Sees live total protein calculation.
5. Marks plan as shared with specific households.
6. Saves → other households see realtime update on their calendars.

**Flow: Capture & Use a Leftover Idea**
1. After cooking, user opens the recipe used.
2. Scrolls to “Creative Leftovers” section → adds new decay path entries (use + notes).
3. Later, another family member views the same recipe and sees the suggested repurposing options with links.

**Flow: Capture a ChefIdea**
1. User sees or hears about a promising recipe/idea.
2. Taps “Capture Idea” → fills quick form with tags.
3. Later searches or browses by tag/category and finds it alongside finished recipes.

### 9.4 Information Architecture & Navigation
- Persistent bottom or side navigation: **Calendar | Recipes | Ideas | Shopping**.
- Global search always available.
- Contextual actions (e.g., “Add to Plan”) appear when relevant.
- Breadcrumbs or clear back navigation, especially important on mobile.

### 9.5 Surfacing of Key Information
- **Portion summaries**: Always visible when inside a plan context; prominent but not overwhelming.
- **Food safety notes**: Inline in ingredient lists and recipe detail; warning-style treatment for higher-risk items.
- **Leftover decay paths**: Expandable section on recipe detail; also surfaced in search results when relevant.
- **Make-again ratings**: Visible on recipe and combination cards; influences sorting or “Favorites” views.
- **Shared vs Private**: Strong visual language throughout the calendar and plan views.

### 9.6 Accessibility, Performance & Polish
- All interactive elements keyboard accessible.
- Clear loading, error, and sync states (especially important for realtime shared plans).
- Optimistic updates (online) for ratings, notes, and plan changes.
- Thoughtful empty states that guide users toward first actions (e.g., “Capture your first ChefIdea”).

This UI/UX section focuses on the experience needed to make the powerful data model (portions, safety, combinations, ideas, decay paths) feel natural and useful in daily family life. Detailed wireframes and component specifications can be created in the next phase.

## 10. API & Backend Contracts (High-Level)

### 10.1 API Style
The backend API layer is **tRPC hosted inside the Next.js application** (route handlers in the same deployable). This provides end-to-end TypeScript type safety between the React frontend and server procedures, which is especially valuable for structured inputs (`portionRequirements`, `householdIds`, `food_safety_profile`, `leftover_decay_path`) and for sharing Zod schemas across the boundary.

There is no separate NestJS (or other) API service in v1. Supabase Edge Functions are not part of v1 request paths.

### 10.2 High-Level Router / Domain Structure (tRPC)
Suggested top-level routers (all procedures live in the Next.js app):

- `recipe` – CRUD + search/filter for recipes
- `ingredient` – CRUD + food safety profile management
- `mealPlan` – Create, update, household membership, portion calculations
- `shoppingList` – Generation and management
- `chefIdea` – Capture, update, convert to recipe, search
- `recipeCombination` – Create, manage groupings and ratings
- `category` / `tag` – Admin management of extensible vocabularies
- `familySettings` – Update portion defaults, safety guidance, etc.
- `user` / `household` – Profile and household membership (mostly handled via Supabase Auth + RLS)

### 10.3 Key Procedure Examples

**mealPlan.createOrUpdate**
- **Input:**
  - Plan fields: `title`, `description`, `startDate`, `endDate`, …
  - `assignments`: array of `{ recipeId, assignmentDate, mealSlot, servings, notes, … }` where each `assignmentDate` must fall within `[startDate, endDate]`
  - `portionRequirements`: `Array<{ portionCategoryId: string; count: number; athleteCount: number }>` (normalized rows — **not** `protein_portions` JSONB)
  - `householdIds`: `string[]` (membership for `MealPlanHousehold`; **not** `is_shared` / `visible_to_households` inputs — shared-ness is derived as membership count > 1)
- **Backend logic:**
  1. Zod-validate input shape.
  2. Compute portion totals with the shared pure `portion-calc` function.
  3. Persist MealPlan + assignments + `MealPlanHousehold` + `MealPlanPortionRequirement` rows via Supabase client under the **user’s JWT** (RLS authorizes the write; backend does not re-validate visibility).
- **Output:** Updated MealPlan with calculated totals (and related rows as needed) + realtime trigger for authorized subscribers.

**mealPlan.generateShoppingList**
- **Input:** Array of `mealPlanId`s or a date range + household context as needed for the procedure contract.
- **Backend logic:** Thin wrapper over the set-based SQL function `generate_shopping_list` (`SECURITY INVOKER` so RLS filters rows). Backend formats results and applies **deterministic unit conversion** within a dimension (`factor_to_base`); **cross-dimension pairs are listed on separate lines and never guessed** (D12 fallback).
- **Output:** Structured shopping list (grouped by category where possible; same-dimension quantities merged; cross-dimension lines kept separate).

**recipe.addOrUpdateFoodSafetyProfile**
- **Input:** `ingredientId` + `food_safety_profile` JSONB (mercury, general guidance, etc.)
- **Backend logic:** Zod-validate payload; persist under user JWT (admin capability enforced by RLS / role claims as specified in DB PRD v0.4 §7); audit log via triggers where configured.
- **Output:** Updated ingredient with safety profile

**chefIdea.create**
- **Input:** Title, notes, source, tags/categories, status, priority
- **Output:** New ChefIdea record (family-global; fully taggable using existing system)

**recipeCombination.create**
- **Input:** Name, notes, array of `{ recipeId, role, sequence }`, `make_again_rating`
- **Output:** New combination + junction records (family-global)

### 10.4 Responsibility Split

| Operation Type                        | Handled By                                      | Reason |
|---------------------------------------|--------------------------------------------------|--------|
| Simple CRUD + Realtime reads          | Direct Supabase client (React)                   | Speed, simplicity; RLS enforces access |
| RLS enforcement (all data access)     | **RLS (sole authority)**                         | Single source of truth for authorization; no service-role request path |
| Portion calculations                  | Shared `portion-calc` package (UI + tRPC)        | One pure function; persisted totals are cached derived values |
| Shopping list generation              | **SQL function `generate_shopping_list` + tRPC formatting** | Set-based aggregation under `SECURITY INVOKER`; D12 formatting in tRPC |
| Admin actions (settings, safety data) | tRPC in Next.js (user JWT)                       | Zod validation + auditability; RLS still authorizes |
| Realtime calendar updates             | Supabase Realtime                                | Native low-latency broadcasting to authorized clients |
| Future AI orchestration               | tRPC in Next.js                                  | Central coordination point for agents under the same trust model |

### 10.5 Authentication & Context
- All tRPC procedures receive the authenticated user’s Supabase session and construct a Supabase client with that **user JWT**.
- **No service-role usage in request handling.** Service role is limited to migrations, seed, and non-request-path audit jobs.
- The backend does not re-implement household visibility rules for MealPlans; membership writes and reads succeed or fail according to **RLS**.
- **Zod validation on all procedure inputs**, especially structured arrays (`portionRequirements`, `householdIds`, assignments) and JSONB fields that remain (`food_safety_profile`, `leftover_decay_path`).

### 10.6 Future Considerations
- As AI features are added, new routers/procedures (e.g., `ai.suggestRecipes`, `ai.enhanceChefIdea`) can be added under the same tRPC layer in Next.js, still using caller JWT for any database access.
- Supabase Edge Functions are not used in v1; they remain a possible future venue for isolated lightweight jobs if product needs justify them — without introducing a service-role request path for user data.

This high-level contract structure keeps the API clean, type-safe, and aligned with the data model defined in Database PRD v0.4. Detailed input/output schemas can be defined during implementation planning. See **§11 Testing Strategy** for procedure-level and RLS matrix coverage expectations.

## 11. Testing Strategy

MenuBoss treats automated testing as a first-class product requirement, not an afterthought. The family depends on correct portion math, trustworthy household isolation, and reliable shared planning; regressions in those areas are product failures. The project therefore errs toward **too many tests rather than too few**. Every functional-requirement acceptance criterion maps to **at least one automated test** at the appropriate layer of the pyramid. A feature is not “done” until its acceptance criteria are covered by automated tests and those tests pass in CI.

Coverage is layered deliberately. Pure calculation and schema validation live at the unit layer so they run in milliseconds and pin correctness without a database. Multi-tenant authorization, set-based aggregation, and procedure contracts live at the integration layer against a real local Supabase instance so RLS and SQL behavior are never mocked away. End-to-end flows exercise the PWA the family actually uses, including mobile viewports and multi-browser shared-plan scenarios. Edge cases specified as acceptance criteria in Functional Requirements are not re-listed here; this strategy defines **how** each class of edge case receives coverage (unit, integration, E2E, or failure-mode suite).

Tools and targets are named product-level commitments: **Vitest** for unit and integration suites, **local Supabase via CLI** for integration fidelity, and **Playwright** for E2E over the documented §9.3 user flows and related critical paths. The goal is confidence that Phase 1 MVP features remain correct as the schema, RLS policies, and UI evolve—not ceremony for its own sake.

### Test Pyramid & Tooling

#### Unit (Vitest)

Unit tests cover pure, deterministic logic with no network or database dependency. Primary targets:

- **Portion calculation package (D3):** The flagship unit-test surface. Cover all PortionCategory combinations × athlete counts × FamilySettings changes (base protein ounces via PortionCategory, athlete multiplier). Explicit cases for zero-count categories, deactivated PortionCategories still readable on historical plans but excluded from new entry surfaces, and boundary athlete counts (`athlete_count` within `count`). Live recalculation behavior is asserted at the pure-function boundary so UI and procedures share one trusted implementation.
- **Unit conversion (D12):** Table-driven / property-style tests over the `Unit` lookup model. Within-dimension sums convert via `factor_to_base`; cross-dimension conversion falls back to the documented deterministic policy (no silent unit mash-ups); unknown or unsupported units fail closed with a clear error rather than inventing a conversion.
- **Zod schemas:** Valid, invalid, and boundary inputs for tRPC procedure inputs and shared domain shapes (counts ≥ 0, date ranges, soft enums, optional JSONB payloads such as `food_safety_profile` and `leftover_decay_path` structure at the validation boundary).
- **Pure UI logic:** Selection helpers, derived “shared” badge from household membership count, filter/query composition for search where it is pure, and other presentation logic free of I/O.

#### Integration (Vitest + local Supabase via CLI)

Integration tests run against a **local Supabase** instance started via the Supabase CLI so PostgreSQL, RLS, triggers, and SQL functions behave as in production. Primary targets:

- **Every tRPC procedure:** Happy path plus failure paths—invalid input (schema rejection), RLS-denied access (wrong household / unshared plan), and not-found. Procedures are exercised with real JWTs representing family users across households so authorization is never stubbed.
- **Database triggers and invariants:** Assignment-date constrained to parent MealPlan date range; audit / soft-delete behavior that keeps historical plans coherent; other documented check constraints that protect planning integrity.
- **`generate_shopping_list` SQL function (D14):** Multi-plan and multi-household fixtures that assert ingredient aggregation, servings/yield-scaled quantities (not protein-line rescale), deduplication, and visibility respect (shared vs private plans). This is the primary set-based integration target for shopping and related roll-ups.
- **TS ↔ SQL contract test:** Shared fixtures pin the shared TypeScript portion-calc function (D3) to the SQL weekly protein roll-up (D14) and **require identical numeric outputs**. This pin prevents silent drift between the client/server portion calculation and the database roll-up. The shopping list’s servings/yield scaling is deliberately **not** part of this contract — it has separate integration fixtures (see the `generate_shopping_list` target above). The contract test is a non-skippable CI gate (see CI Gates).

#### E2E (Playwright)

End-to-end tests drive the React PWA through the product’s critical journeys. Coverage includes:

- **§9.3 Flow — Plan a Shared Meal:** Calendar → add to plan → search/browse with safety notes visible → adjust portion counts → live protein total → share with specific households → save → second household observes the update.
- **§9.3 Flow — Capture & Use a Leftover Idea:** Open recipe after cooking → add leftover decay path entries → another family member views suggested repurposing options and links.
- **§9.3 Flow — Capture a ChefIdea:** Capture Idea form with tags → later search/browse finds the idea alongside recipes.
- **Shopping-list generation:** From one or more MealPlans with servings/yield-scaled, consolidated quantities.
- **Calendar realtime propagation:** Two browser contexts (two households/users) verifying that a shared-plan edit appears for authorized participants and does not leak to non-members.
- **Mobile-viewport runs:** Playwright projects at phone/tablet sizes; MenuBoss is mobile-first PWA, so critical flows must pass on mobile viewports, not desktop alone.

#### RLS Test Matrix

Row Level Security is the sole authorization authority. The RLS test matrix is a **CI-blocking Phase 1 acceptance criterion**. Matrix content is coordinator-authored and must not be duplicated here.

### RLS Verification Matrix (CI-blocking, Phase 1 acceptance criterion)

SQL-level tests (pgTAP or `supabase_test_helpers`) executed against a migrated local Supabase instance in CI. Tests authenticate as **five fixed personas** created by seed fixtures:

| Persona | Definition |
|---|---|
| `member_a` | Regular member of Household A (plan-creating household) |
| `member_b` | Member of Household B (shared into some plans) |
| `member_c` | Member of Household C (never shared) |
| `admin_a` | Family admin (Household A) |
| `anon` | Unauthenticated client |

**Required coverage — every table × every persona × {SELECT, INSERT, UPDATE, DELETE}**, with the expected outcome (`allowed`, `denied`, `filtered-to-empty`) asserted explicitly. Minimum scenario set beyond the grid:

1. Private plan (Household A only): `member_b`/`member_c` SELECT returns zero rows; UPDATE affects zero rows; child tables (`assignment`, `portion_requirement`, `meal_plan_household`) equally invisible.
2. Shared plan (A + B): `member_b` reads plan + children; `member_b` UPDATE affects zero rows and `member_b` INSERT of assignments/portion rows is denied (read-only share); `member_c` sees nothing.
3. Sharing mutation: `member_b` cannot INSERT/DELETE `meal_plan_household` rows on A's plan; `admin_a` can; DELETE of the creating household's own membership row is denied for **everyone**, including `admin_a`.
4. Bootstrap & orphan guard: `member_a` creates a plan and can SELECT it before any membership row exists (creator disjunct); the same plan is invisible to `member_b`/`member_c`/`anon` — membership-less plans fail closed to creator-only.
5. **Privilege escalation (profile):** `member_a` UPDATE of own `profile.display_name` succeeds; UPDATE of own `role` or `household_id` is rejected; `member_a` cannot UPDATE another member's profile; `admin_a` can change `role`/`household_id`.
6. Content attribution: `member_a` INSERT of a recipe with `created_by_user_id` ≠ own id is rejected by `WITH CHECK`; UPDATE attempting to change `created_by_user_id` is rejected by the immutability trigger.
7. Vocabulary protection: `member_a` UPDATE on `portion_category`/`family_settings`/`unit` denied; `admin_a` allowed.
8. Hard-delete denial: `member_a` `DELETE FROM recipe` affects zero rows even for rows they created.
9. **Audit isolation:** `member_a`/`member_b` SELECT on audit tables returns zero rows / denied; `admin_a` can read; direct INSERT into audit tables denied for all personas.
10. `anon`: every table, every operation → denied/empty.
11. Realtime parity: subscription as `member_c` receives no events for A's private plan; **unshare cutoff** — after B's membership row is deleted, `member_b` receives no further events for that plan (or, under the notify-then-refetch fallback, refetch returns zero rows).

**Process rule:** any migration that touches a policy, a policy-referenced function (`current_household_id`, `is_family_admin`), a security trigger (profile-field guard, attribution immutability, audit writers), or adds a table MUST extend the matrix in the same PR. CI fails if (a) any table has RLS disabled, or (b) any RLS-enabled table lacks matrix coverage — both checks enforced by a coverage-manifest test over `pg_tables`/`pg_policies`.

### Failure-Mode Coverage

Beyond happy-path and standard AC mapping, the following operational failure modes have explicit automated coverage expectations:

| Failure mode | Expectation | Primary layer |
| --- | --- | --- |
| **Offline cache serving stale reads** | v1 offline is **read-only**: cached recipes, upcoming plans, and portion guidance remain readable; write attempts are blocked or deferred with clear UX. Tests assert stale-but-safe reads and no silent offline writes. | E2E (+ unit for cache policy helpers where pure) |
| **Realtime disconnect / reconnect** | Shared calendar recovers after connection loss: missed updates reconcile; UI sync state is honest during disconnect. | E2E (two contexts) + integration where channel/subscription helpers are testable |
| **Concurrent edits to a shared plan (online)** | Last-write and conflict behavior is defined and tested so two authorized users editing the same plan do not corrupt assignments or portion requirements (see §12 Reliability: v1 last-write acceptable with clear sync UX). | Integration + E2E |
| **Soft-deleted entities in historical views** | Soft-deleted recipes/ingredients remain visible in historical meal plans and shopping lineage where product rules require it, but are hidden from active browse/search. | Integration + E2E |

Additional edge-case classes (zero portions, deactivated categories, empty membership invariants, invalid date ranges, etc.) are specified as acceptance criteria under Functional Requirements and are covered at the unit or integration layer according to whether the behavior is pure calculation or DB/RLS-enforced.

### CI Gates

All automated suites **block merge** to the main integration branch:

1. **Unit (Vitest)** — must be green.
2. **Integration (Vitest + local Supabase)** — must be green, including procedure failure paths and SQL function fixtures.
3. **E2E (Playwright)** — must be green for required §9.3 flows, shopping-list generation, realtime dual-context scenarios, and mobile-viewport projects in the required set.
4. **RLS test matrix** — **non-skippable**. Failures block merge; the matrix is not an optional “nightly only” suite.
5. **TS ↔ SQL contract test** — **non-skippable**. Portion-calc function and SQL weekly protein roll-up outputs must match on shared fixtures (shopping-list scaling is covered separately by its own integration fixtures).

**Migration policy:** Any migration that adds tables or RLS policies **must extend the RLS test matrix in the same PR**. PRs that introduce new protected entities or policies without corresponding matrix cases fail review and CI policy checks. Similarly, changes to portion calculation or the SQL weekly protein roll-up require updating shared contract fixtures when behavior intentionally changes (documented fixture updates, not silent skew); shopping-list SQL changes update their own integration fixtures.

### Per-Phase Expectations

**Phase 1 (MVP / Foundation):** Full pyramid for all Phase 1 MVP features (recipes & ingredients, categories/tags, portion scaling, food safety surfacing, MealPlan + calendar, shared/private via household membership, RecipeCombination, ChefIdea, leftover decay paths, basic shopping list generation, PWA foundation, core search/filter).

**Phase 1 success criteria (testing):**
- RLS test matrix **green** (CI-blocking).
- TS ↔ SQL contract test **green** (CI-blocking).
- §9.3 E2E flows **green** (plan shared meal; leftover idea; ChefIdea), plus shopping-list generation and dual-context calendar realtime.
- Unit coverage green for portion-calc (D3) and unit conversion (D12); integration green for `generate_shopping_list` and tRPC procedure happy/failure paths for shipped procedures.
- Offline: read-only cache behavior covered for core recipe and plan reads.

**Phase 2:** Add coverage for offline-write sync (when writes leave read-only offline), conflict scenarios under improved offline/background sync, enhanced shopping-list persistence/check-off flows, and expanded admin tooling paths. Existing Phase 1 gates remain mandatory; new suites extend, not replace, them.

**Phase 3+:** Extend the pyramid for each new capability (AI-assisted flows, multi-macro nutrition, pantry) with the same AC-to-test mapping rule; no feature ships without automated coverage at the appropriate layer.

## 12. Non-Functional Requirements

These requirements promote the former end-of-roadmap quality bullets into testable product constraints. Performance budgets (D16) are E2E-testable acceptance criteria for Phase 1 unless a row explicitly names another verification method.

### Usability & Extensibility

- Family admins must be able to add, edit, deactivate, and reorder categories, portion profiles (`PortionCategory`), units, tags, and food-safety guidance **without code changes or migrations** for routine vocabulary growth.
- Primary weekly workflows (view calendar week, adjust portion counts, generate shopping list, capture a ChefIdea) must be completable on a phone without desktop-only affordances.
- Empty, loading, error, and offline states must be explicit and actionable (never silent failure).
- Extensibility for future AI/orchestration must not require reworking the core MealPlan, portion, or visibility model (hooks via tRPC routers and stable SQL aggregation contracts).

### Performance

All budgets below replace vague “fast” / “feels fast” language. Phase 1 success requires these budgets to be met under the stated conditions. Verification methods are named per row.

| # | Scenario | Budget | Conditions | Verification |
|---|----------|--------|------------|--------------|
| P1 | Calendar week view interactive | **< 1.5 s** | Mid-range phone; cold PWA launch with warm application cache (service-worker-cached shell + recently used plan data) | Playwright E2E: time from navigation start to calendar interactive (controls usable, week grid rendered) |
| P2 | Shopping-list generation | **< 2 s** | 7-day multi-household plan set (shared + private plans in range); response ready for UI render | Playwright E2E (or integration timing of `generate_shopping_list` + tRPC format path if E2E harness is flaky): request → structured list displayed |
| P3 | Portion live-preview recompute | **< 100 ms** | Changing a single portion count or athlete count; pure client recompute via shared portion-calc package | Unit/micro-benchmark (Vitest) of the pure TypeScript function over representative fixtures; UI must not debounce beyond this for simple count edits |
| P4 | Search results | **< 500 ms** | Typical family corpus (hundreds of recipes + ChefIdeas); typed query returns first page of matches | Playwright E2E: keystroke-settled query → results list populated |
| P5 | Realtime propagation of shared-plan edits | **< 2 s** end-to-end | Two concurrent sessions (editor + observer in another household with membership); online | Playwright E2E with two browser contexts: save on A → visible update on B within budget |

Notes:
- Budgets are product acceptance criteria, not aspirational SLOs. Regressions that breach a budget fail CI the same way as functional regressions.
- Aggregation work for shopping lists and weekly protein roll-ups is performed by set-based SQL (`generate_shopping_list` and related functions per Database PRD v0.4 / D14); the application layer must not re-implement row-by-row aggregation that would make P2 unachievable.
- Portion live preview (P3) uses the shared pure TypeScript package (D3) so UI and server stay aligned without a network round-trip for every keystroke.

### Security & Privacy

- **RLS is the sole authorization authority** for data access. Every request-path Supabase client carries the caller’s JWT; there is no service-role path in interactive request handling (service role is limited to migrations and non-request audit jobs). Details: Database PRD v0.4 §7.
- Household isolation is absolute for private plans: a household must never read another household’s private MealPlans or memberships they are not party to. Shared plans are visible only to households with explicit `MealPlanHousehold` membership.
- The **RLS test matrix is a CI-blocking gate** (D10). Phase 1 is not complete until the matrix is green in continuous integration. Matrix placement and cases live in the **§11 Testing Strategy** section (and coordinator-authored RLS matrix content).
- Family-level admin controls (settings, safety curation, vocabulary) are role-gated and audit-friendly (soft deletes + recommended triggers on sensitive tables).

### Reliability

- Soft deletes (or equivalent non-destructive deactivation) for recipes, plans, and reference data so historical meal plans remain interpretable.
- Assignment dates must remain within the parent MealPlan’s `[start_date, end_date]` range (DB trigger is authoritative; application validation is UX-only).
- Shared-plan concurrent edits (online) must not corrupt membership or portion-requirement rows; last-write semantics for a given row are acceptable in v1 if the UI surfaces save/sync status clearly.
- Offline behavior must degrade gracefully: never claim a write succeeded when the client is offline in v1 (see PWA / Offline).

### PWA / Offline

Per **D4**, v1 offline is **read-only cache**:

- **Cached for offline read:** recipes (recently viewed / starred / planned), ChefIdeas, categories/tags needed to render those entities, upcoming MealPlans the user can already see online, portion guidance, and food-safety notes for cached ingredients.
- **Not in v1:** offline writes, write queues, background sync of edits, or conflict resolution. Those move to Phase 2 and require an explicit conflict-resolution design first (merge strategy + user-visible conflict UX).
- Calendar and plan views **degrade gracefully** when offline (show last cached data with a clear offline indicator; disable mutating controls).
- Online optimistic updates remain allowed and expected; they are not a substitute for offline write support.
- App must be **installable** (PWA) on phone and desktop; installability is independent of offline write capability.

### Maintainability

- Single deployable application: **Next.js hosts the React PWA and tRPC procedures** (D2). No standalone NestJS service and no v1 Supabase Edge Functions workstream.
- Clean separation: UI and tRPC orchestration in the app; pure domain math in shared packages (e.g., portion-calc); set-based aggregation in PostgreSQL functions; authorization in RLS.
- End-to-end TypeScript type safety (tRPC + Zod) for procedure boundaries; SQL contracts covered by integration and TS↔SQL portion contract tests (see §11 Testing Strategy).
- Schema and policy changes ship with tests in the same change set (migrations that add tables/policies extend the RLS matrix in the same PR).

## 13. Roadmap & Phasing

### 13.1 Guiding Principles for Phasing

- Deliver a usable core experience as quickly as possible (MVP that the family can actually use for weekly planning).
- Prioritize features that provide immediate daily value (portion scaling, shared calendar, food safety surfacing, basic shopping lists).
- Build extensibility foundations early (categories, tags, normalized portion/visibility tables, constrained JSONB) so later features can leverage them without rework.
- Treat **testing and performance budgets as Phase 1 deliverables**, not follow-on polish (D9/D10/D16).
- Defer complex or lower-frequency features (advanced AI, full pantry tracking, detailed multi-macro nutrition, offline writes) to later phases.
- Prefer one clear implementation path: **tRPC inside Next.js**, RLS as sole auth authority, shopping-list aggregation in SQL — no parallel “maybe NestJS / maybe Edge Functions” backend tracks in Phase 1 (D2).

### 13.2 Phase 1 – Foundation (MVP)

**Goal:** A working system the family can use for recipe management, portion-aware meal planning across households, and basic shopping list generation — with security, tests, and performance budgets proven in CI.

**Key Features:**
- Recipe & Ingredient CRUD with hierarchical categories and flexible tagging (family-global content).
- Food safety profiles on ingredients (FDA-style mercury guidance + frequency recommendations) with contextual display.
- Editable portion defaults via **PortionCategory** base ounces and **FamilySettings.athlete_multiplier** (admin-curated rows; no duplicate adult-base field).
- MealPlan as a date-ranged container with **normalized `MealPlanPortionRequirement` rows** (`portion_category_id`, `count`, `athlete_count`) and automatic totals via the shared portion-calc package (no `protein_portions` JSONB).
- Shared vs. private MealPlans via **`MealPlanHousehold` membership** (shared-ness derived from membership count > 1), RLS enforcement, and realtime calendar updates.
- Basic RecipeCombination support (grouping recipes into complete meals with notes and 1–5 rating).
- ChefIdea capture with full tagging support.
- Leftover decay path recording on recipes.
- Shopping list generation from one or more MealPlans via the **`generate_shopping_list` SQL function** (D14); tRPC formats results and applies within-dimension unit conversion / cross-dimension separate lines (D12).
- **PWA foundation:** installable app + **read-only offline cache** of recipes, upcoming plans, portion guidance, and safety notes (D4). Offline writes and background sync are **out of scope for Phase 1**.
- Core search and filtering.
- Testing infrastructure and CI gates per §11 Testing Strategy (unit / integration / E2E / RLS matrix).

**Success Criteria:**
- Family can plan a full week (shared + private) and generate a shopping list.
- Portion calculations work correctly for mixed adult/child/athlete households (including athlete_count within count).
- Food safety notes appear when relevant ingredients are used.
- Realtime updates work reliably for shared plans (within performance budget P5).
- **RLS test matrix green in CI** (D10).
- **TS↔SQL portion contract test green** (shared pure function and SQL roll-up agree on fixtures).
- **§9.3 E2E flows green** (plan a shared meal; capture & use a leftover idea; capture a ChefIdea), plus shopping-list and dual-context realtime coverage as defined in §11 Testing Strategy (D9).
- **Performance budgets met** (§12 NFR Performance table, D16): calendar week < 1.5 s, shopping list < 2 s, portion live-preview < 100 ms, search < 500 ms, realtime propagation < 2 s.

**Estimated Effort:** Highest priority — aim for a functional alpha within 4–8 weeks depending on team size. No separate backend service workstream: API surface is tRPC route handlers in the Next.js app (D2).

### 13.3 Phase 2 – Polish & Core Value Expansion

**Goal:** Improve daily usability, reduce friction, and expand the “chef tools” that make the system feel like a true family knowledge base. Introduce offline editing only after conflict behavior is designed.

**Key Features:**
- Enhanced shopping list experience (better grouping, check-off, export, optional persistence).
- Improved RecipeCombination workflow and template reuse.
- Stronger surfacing of leftover decay paths and ChefIdeas in relevant contexts.
- **Offline editing + background sync**, **preceded by** an explicit **conflict-resolution design** (documented decision: merge strategy, last-write vs. field-merge rules, and user-visible conflict UX). Until that design is approved, offline remains read-only.
- Better mobile/PWA experience (cache invalidation polish, install/update UX, meeting and holding performance budgets under wider data volumes).
- Admin tools for easier management of categories, PortionCategories, Units, and food safety data.
- Basic nutrition roll-ups beyond just protein (optional).
- Make-again ratings influencing discovery (“Family Favorites” views).
- Refined calendar UX and filtering.

**Success Criteria:**
- Family actively uses ChefIdeas and leftover decay paths as part of their normal workflow.
- Shopping list generation becomes a regular, trusted part of meal planning.
- Mobile experience meets the §12 NFR **performance budget table** under representative family data (not subjective “feels fast”).
- If offline editing ships in this phase: conflict-resolution design is documented, implemented, and covered by automated tests (including multi-tab / reconnect scenarios).

### 13.4 Phase 3+ – Advanced Capabilities & AI

**Goal:** Add intelligence and deeper automation while leveraging the strong data foundation built in Phases 1–2.

**Potential Features:**
- AI-assisted features:
  - Recipe suggestions based on available ingredients, preferences, or past ratings
  - Intelligent substitution recommendations
  - Auto-generation or enhancement of meal plans
  - Summarization or improvement of ChefIdeas
- Full multi-macro / detailed nutritional tracking and goals
- Pantry / inventory tracking with expiry and waste reduction suggestions
- More advanced reporting (weekly nutrition summaries, waste reduction metrics)
- Richer integration between RecipeCombinations, decay paths, and meal planning
- Potential external integrations (grocery delivery, smart kitchen devices)
- **Density-based cross-dimension unit conversion** (mass ↔ volume via density tables) — Phase 3 candidate only; v1/v2 keep strict within-dimension conversion with separate lines for cross-dimension pairs (D12).
- **Protein-driven automatic recipe scaling** (scale full ingredient lists from protein targets) — requires reliable tagging/identification of protein ingredients; explicit Phase 3+ candidate, not implied by v1 portion math.

**Success Criteria:**
- AI features provide genuine time savings without feeling gimmicky.
- The system measurably helps reduce food waste and decision fatigue.
- Any cross-dimension conversion or auto-scaling ships with clear provenance (density sources, which ingredients are “protein drivers”) and automated tests.

### 13.5 Dependencies & Sequencing Notes

- Phase 1 depends on a solid database schema per **Database PRD v0.4** (`Recipe_Meal_Planning_Database_PRD_v0.4.md`), including normalized `MealPlanPortionRequirement` / `MealPlanHousehold` / `Unit`, and working RLS + Realtime.
- The **RLS test matrix is a Phase 1 gate**, not an afterthought: schema/policy work is incomplete until the matrix is green in CI (D10).
- Food safety profiles and portion calculation (shared TypeScript package + SQL roll-up contract) should be built early — they influence shopping lists, calendar summaries, and many later features.
- Shopping-list correctness depends on the D14 SQL function and D12 unit rules; UI-only aggregation is not an acceptable Phase 1 path.
- RecipeCombination and ChefIdea features have relatively low dependencies and can be added in parallel with core meal planning once auth/RLS and basic recipe CRUD exist.
- Offline writes (Phase 2) depend on completing the conflict-resolution design task before implementation.
- AI features (Phase 3) should only begin once the core data model and user workflows are stable and well-understood.
- There is **no separate NestJS or Edge Functions delivery track** in Phase 1–2; optional Edge Functions remain a future hosting note only (architecture D2).

### 13.6 Overall Philosophy

This roadmap is intentionally front-loaded with high-value, frequently used features while keeping the system extensible and **provably correct** (tests + budgets). The family should feel the benefit of the app early — better portion accuracy, easier shared planning, safety awareness, and knowledge capture — rather than waiting for a “perfect” v1 that includes offline editing or AI.

The phased approach also allows for learning and adjustment based on real family usage before investing heavily in offline conflict systems, density conversion, automatic full-recipe scaling, or advanced AI capabilities.

## 14. Risks, Open Questions & Next Steps

**Key Risks:**
- Over-engineering for a small family user base. The 2026-07 design review pared v1 scope to mitigate this: offline writes / background sync deferred to Phase 2 (D4); portion and visibility models **normalized** (D5/D6) rather than flexible JSONB; a single Next.js + tRPC deployable (D2). Mitigation remains focused scope + extensibility, now with explicit deferrals.
- Complexity of accurate multi-household portion aggregation and visibility — addressed by `MealPlanPortionRequirement` + `MealPlanHousehold` + the RLS test matrix gate.
- Keeping food safety guidance current — family admin curation + source attribution in JSONB.

**Open Questions (to be addressed in next iterations):**
- Prioritization and detailed specs for **nutrition roll-ups** beyond protein (the shopping-list side is decided — see §8.7 and Database PRD v0.4 §6).
- UI/UX patterns for surfacing food safety notes and leftover decay paths without clutter.
- Roadmap timing for AI-assisted features (Phase 3+ candidates only).

**Immediate Next Steps:**
- Review and ratify Product PRD v0.2 (design-review decisions D1–D17 integrated).
- Implement Phase 1 against Database PRD v0.4 with the RLS matrix and performance budgets as CI gates.
- Produce wireframes for key screens (calendar, plan editor / portion counts, shopping list, ChefIdea capture) using the normalized portion/visibility UX (household multi-select; portion requirement rows).
- Schedule the Phase 2 **conflict-resolution design** spike before any offline-write implementation.

---

**Appendix A: Incorporated Database PRD**  
See `Recipe_Meal_Planning_Database_PRD_v0.4.md` in the repository root for the complete data model, entities, JSONB structures, relationships, extensibility rules, and security considerations.

---

**End of Product PRD v0.2**

This document is a living artifact; further changes are tracked via the changelog.
