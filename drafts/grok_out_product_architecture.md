## INTEGRATION NOTES

- §4 stack line: React PWA with Next.js hosting tRPC in the same app + Supabase; Database PRD reference bumped to v0.4 (D2).
- §4 auth: RLS is sole authorization authority; policies live in DB PRD v0.4 §7 (D1).
- §4 data model: hybrid relational + JSONB with narrowed JSONB scope; `protein_portions` / visibility JSONB removed in favor of normalized tables (D5/D6).
- §6.1: single deployable (Next.js + tRPC), RLS-as-sole-authority guiding principles (D1/D2).
- §6.2: PWA offline is read-only cache only; background sync for offline edits removed; optimistic updates remain online-only (D4).
- §6.3: retitled "Server Layer (tRPC in Next.js)"; NestJS and Edge Functions hybrid option removed; shared `portion-calc` package + `generate_shopping_list` + caller JWT (D2/D3/D14/D1).
- §6.4: Database PRD v0.4; JSONB strategy narrowed; indexing by query pattern; Edge Functions not a v1 feature.
- §6.5 Pattern 2: tRPC in Next.js with user-context Supabase client; example flow uses MealPlanHousehold + MealPlanPortionRequirement under user JWT (D5/D6/D1).
- §6.6: RLS sole authority; service role never in request paths; audit via triggers; pointer to DB PRD v0.4 §7 / RLS test matrix (D1).
- §6.7 table: Backend = tRPC in Next.js; Offline = Workbox/next-pwa read-only cache v1.
- §6.8: full rewrite for read-only offline strategy; offline editing deferred to Phase 2 (D4).
- §6.9: AI orchestration retained; Edge Functions mentioned only as possible future venue (not v1).
- §10.1: tRPC confirmed (hosted in Next.js app), not "recommended vs alternatives" (D2).
- §10.3: `mealPlan.createOrUpdate` uses `startDate`/`endDate`, `portionRequirements[]`, `householdIds[]`; no `protein_portions` / `is_shared` inputs (D5/D6/D8); shopping list thin wrapper over SQL (D14/D12).
- §10.4–10.5: responsibility and auth context updated for RLS sole authority and no service-role request handling (D1/D14).

---

=== REPLACEMENT: §4 ===

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

---

=== REPLACEMENT: §6 ===

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
- **Authentication**: Supabase Auth with household membership stored in a `profiles` (or equivalent) table.
- **Authorization**: **RLS is the sole authority.** Every request-path client — browser Supabase client and tRPC-created Supabase client — carries the **caller’s JWT**. The **service role is never used in request handling** (reserved for migrations, seed, and audit jobs only).
- **Data Isolation**: Strong guarantee that one household cannot see another household’s private plans. Content entities (recipes, ingredients, chef ideas, combinations) are family-global; plan visibility is membership-based.
- **Auditability**: Soft deletes + recommended trigger-based logging on sensitive tables (MealPlan, Recipe, FamilySettings).
- **Policy detail and test matrix**: See **Database PRD v0.4 §7** and the Testing Strategy section (RLS policy shapes and automated RLS matrix).

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
- **Edge Functions**: Not used in v1. May be considered later as a possible venue for lightweight, globally distributed logic if latency or isolation needs justify a second compute surface — without changing the RLS-as-sole-authority model.
- **Additional Supabase Features**: Database Webhooks, Storage transformations, or Auth hooks as needs grow.

---

=== REPLACEMENT: §10 API ===

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
- **No service-role usage in request handling.** Service role is limited to migrations, seed, and offline audit jobs.
- The backend does not re-implement household visibility rules for MealPlans; membership writes and reads succeed or fail according to **RLS**.
- **Zod validation on all procedure inputs**, especially structured arrays (`portionRequirements`, `householdIds`, assignments) and JSONB fields that remain (`food_safety_profile`, `leftover_decay_path`).

### 10.6 Future Considerations
- As AI features are added, new routers/procedures (e.g., `ai.suggestRecipes`, `ai.enhanceChefIdea`) can be added under the same tRPC layer in Next.js, still using caller JWT for any database access.
- Supabase Edge Functions are not used in v1; they remain a possible future venue for isolated lightweight jobs if product needs justify them — without introducing a service-role request path for user data.

This high-level contract structure keeps the API clean, type-safe, and aligned with the data model defined in Database PRD v0.4. Detailed input/output schemas can be defined during implementation planning. See Testing Strategy section for procedure-level and RLS matrix coverage expectations.
