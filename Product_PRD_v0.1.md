# Product Requirements Document (PRD)
## Recipe & Meal Planning Web Application

**Document Version:** 0.1 (Initial Draft — Sections Started)  
**Date:** July 14, 2026  
**Status:** Draft for Review & Iteration  
**Author:** Grok (based on iterative user requirements)  
**Intended Audience:** LLM assistant assisting with development of the full Product PRD, architecture, and implementation specifications.

> **Important Note:**  
> This is the **full Product PRD**. It incorporates the separate **Database PRD v0.3** (see Section 7 and Appendix A).  
> The Database PRD focuses exclusively on the data layer and is designed to be merged into this document. Revisions across both documents are expected as architecture, API design, and detailed feature prioritization are refined.

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
- PWA capabilities for installable, offline-capable access on phones/tablets.

### 3.2 Out of Scope (v1)
- Full multi-macro or detailed nutritional analysis.
- Advanced AI recipe generation or meal suggestion engine (foundational data model supports it; implementation is future).
- Pantry inventory tracking with expiry alerts (concept captured in Database PRD; implementation deferred).
- Complex user roles/permissions beyond household-level isolation + family admin.
- Integration with external services (fitness trackers, smart kitchen devices, etc.).
- Comprehensive reporting or analytics dashboards.

### 3.3 Phased Approach
- **Phase 1 (Core Foundation):** Recipes, Ingredients, Categories/Tags, Portion scaling, Food safety, Basic MealPlan + Calendar, RecipeCombination, ChefIdea, Leftover decay paths.
- **Phase 2:** Enhanced shopping lists, nutrition aggregation, PWA offline improvements, admin tools for family settings.
- **Phase 3+:** AI-assisted features, fuller scaling (non-protein), pantry integration, richer reporting.

## 4. Assumptions and Constraints

- **Technology Stack (Confirmed):**  
  React PWA frontend + Node/TypeScript backend + Supabase (PostgreSQL) database.  
  The separate **Database PRD v0.3** is incorporated by reference (see Section 7).

- **User Context:** One family with three distinct households that share meals several times per week but also maintain individual plans. The calendar frontend will clearly distinguish shared vs. private plans.

- **Data Model:** Hybrid relational + JSONB approach as defined in the incorporated Database PRD v0.3. Key flexible structures include `protein_portions`, `leftover_decay_path`, `food_safety_profile`, and others.

- **Authentication & Access:** Supabase Auth + Row Level Security (RLS) will handle household isolation and controlled sharing of meal plans. Detailed RLS policies and auth flows will be defined in subsequent architecture work.

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
The system follows a **hybrid Supabase-centric architecture** with a thin Node/TypeScript backend layer. This approach leverages Supabase’s strengths (managed Postgres, Auth, Realtime, RLS, Storage, Edge Functions) while providing a dedicated backend for complex business logic, consistency, and future AI orchestration.

**Guiding Principles:**
- Keep the architecture simple given the small user base (one family).
- Maximize use of Supabase managed services to reduce operational overhead.
- Use the backend primarily for logic that requires central control, security, or complex aggregation.
- Design for easy future evolution into AI-assisted features.

### 6.2 Frontend Layer (React PWA)
- **Framework**: Next.js (App Router) with React 19+ and TypeScript (strict mode).
- **State Management**: TanStack Query (React Query) for server state + Zustand or Jotai for lightweight client state.
- **UI Components**: shadcn/ui + Tailwind CSS for rapid, consistent, accessible components. Radix UI primitives where needed.
- **Calendar**: FullCalendar or react-big-calendar (with custom styling) for the shared/private meal planning view.
- **Forms**: React Hook Form + Zod for validation (especially important for portion inputs and food safety data).
- **PWA Features**:
  - Service Worker via `next-pwa` or Workbox for offline caching of recipes, ChefIdeas, and upcoming meal plans.
  - Background sync for edits made while offline.
  - Installable on mobile and desktop.
- **Key Responsibilities**:
  - User interface and interactions.
  - Direct Supabase client calls for realtime subscriptions and simple CRUD where appropriate.
  - Optimistic UI updates for responsive feel.

### 6.3 Backend Layer (Node/TypeScript)
- **Recommended Framework**: NestJS (for structure and scalability) or tRPC (for end-to-end type safety with minimal boilerplate). tRPC is often preferred for smaller teams and strong TypeScript alignment.
- **Primary Responsibilities**:
  - Complex business logic (portion calculations, shopping list aggregation with unit conversion, consistency validation).
  - Admin operations (family settings, bulk category/tag management, food safety profile curation).
  - Orchestration layer for future AI/LLM multi-agent features.
  - Any operations that should not be exposed directly via RLS or Edge Functions for security or complexity reasons.
- **Alternative / Hybrid Option**: Use Supabase Edge Functions (Deno) for lighter server-side logic (e.g., simple calculations or webhooks) while keeping heavier logic in the Node backend. This reduces cold-start latency for simple operations.

### 6.4 Database & Data Layer (Supabase / PostgreSQL)
- **Core Database**: Supabase-hosted PostgreSQL with the model defined in the incorporated **Database PRD v0.3**.
- **Key Supabase Features Used**:
  - **Row Level Security (RLS)**: Primary mechanism for household isolation + controlled sharing of MealPlans.
  - **Realtime**: Used for live calendar updates when shared plans are modified.
  - **Auth**: Supabase Auth (email + password or magic links) with custom claims or metadata for household membership and admin roles.
  - **Storage**: For recipe images and potentially generated shopping list PDFs.
  - **Edge Functions**: Optional for lightweight, globally distributed logic.
- **JSONB Strategy**: Heavily used for flexible structures (`protein_portions`, `food_safety_profile`, `leftover_decay_path`). GIN indexes will be applied for query performance.

### 6.5 Communication & Data Flow Patterns

**Pattern 1: Direct Supabase from Frontend (preferred for simple operations)**
- React PWA → Supabase client (with RLS) for:
  - Reading recipes, ChefIdeas, categories.
  - Realtime calendar subscriptions.
  - Simple create/update of private data.

**Pattern 2: Via Backend (for complex or privileged operations)**
- React PWA → Node/TS Backend API (tRPC or REST) → Supabase (service role or user context)
  - Creating/updating shared MealPlans with portion recalculation.
  - Generating shopping lists.
  - Admin actions (updating FamilySettings or food safety profiles).
  - Future AI feature calls.

**Example Data Flow – Creating a Shared Meal Plan with Portions**
1. User in Household A creates a new MealPlan and marks it shared with Household B.
2. Frontend calls backend endpoint.
3. Backend validates visibility rules, calculates effective protein needs using `protein_portions` JSONB + PortionCategory multipliers.
4. Backend writes the MealPlan and related assignments via Supabase (service role).
5. Supabase Realtime broadcasts the change to all authorized clients (Households A and B).
6. Frontend receives realtime update and refreshes calendar + portion summary.

### 6.6 Security Architecture
- **Authentication**: Supabase Auth with household membership stored in a `profiles` or `household_members` table.
- **Authorization**: Enforced primarily through **Row Level Security (RLS)** policies in PostgreSQL. Backend can use service role keys only for privileged operations.
- **Data Isolation**: Strong guarantee that one household cannot see another household’s private plans or data.
- **Auditability**: Soft deletes + recommended trigger-based logging on sensitive tables (MealPlan, Recipe, FamilySettings).

### 6.7 Technology Recommendations & Rationale

| Layer          | Recommended Technology          | Rationale |
|----------------|----------------------------------|---------|
| Frontend       | Next.js + TypeScript + Tailwind + shadcn/ui | Excellent DX, PWA support, great ecosystem |
| State          | TanStack Query + Zustand        | Excellent caching, optimistic updates, minimal boilerplate |
| Backend        | tRPC (preferred) or NestJS      | End-to-end type safety with Supabase client |
| Database       | Supabase (PostgreSQL)           | Managed Postgres + Auth + Realtime + RLS out of the box |
| Realtime       | Supabase Realtime               | Native, reliable, low latency |
| Forms          | React Hook Form + Zod           | Best-in-class validation and UX |
| Calendar       | FullCalendar or react-big-calendar | Mature, customizable, supports multiple views |
| Offline        | Workbox / next-pwa              | Reliable service worker + background sync |

### 6.8 Offline & PWA Strategy
- Core read data (recipes, ChefIdeas, categories, upcoming plans) cached for offline use.
- Edits made offline queued and synced when connectivity returns.
- Portion calculations and safety notes should remain available offline for recently viewed plans.
- Calendar view should gracefully degrade when offline.

### 6.9 Future Extensibility Points
- **AI / LLM Integration**: The backend is positioned as the natural orchestration layer for multi-agent systems (recipe suggestions, substitution recommendations, intelligent meal planning, ChefIdea enhancement).
- **Edge Functions**: Can absorb more logic over time to reduce backend load.
- **Additional Supabase Features**: Database Webhooks, Storage transformations, or Auth hooks as needs grow.

This architecture balances simplicity, developer experience, and future growth while staying well-aligned with the small but feature-rich scope of the family application.

## 7. Data Model Reference

The complete data model is defined in the incorporated **Database PRD v0.3** (file: `Recipe_Meal_Planning_Database_PRD_v0.3.md`).

Key entities include:
- Household, User/Profile
- Ingredient (with `food_safety_profile` JSONB)
- Recipe (with `make_again_rating`, `leftover_decay_path` JSONB)
- Category (hierarchical), Tag
- PortionCategory + FamilySettings (for editable multipliers and base oz)
- MealPlan + MealPlanAssignment (with `protein_portions` JSONB)
- RecipeCombination + junction (meals grouping with notes + rating)
- ChefIdea (tagged inspiration items)

All extensible vocabularies are database-driven. JSONB is used strategically for flexible, evolving structures.

## 8. Detailed Functional Requirements

### 8.1 Recipe & Ingredient Management
- Users can create, view, edit, and delete recipes and ingredients (with soft-delete for historical integrity).
- Recipes support rich instructions (structured steps with optional timers, temperatures, techniques), yield/servings, prep/cook/total time, source attribution, and images.
- Ingredients support master data with default units, nutritional data (optional), and `food_safety_profile` (JSONB).
- Hierarchical categories (nutrition taxonomy) and flexible tags (meal type, cuisine, preparation method, dietary, difficulty, etc.) can be assigned to both recipes and ingredients. Categories support unlimited depth via parent-child relationships.
- Food safety information (FDA categories, risk levels such as mercury, recommended frequency, population-specific notes) is displayed prominently when viewing or selecting ingredients/recipes that have safety profiles.
- Family administrators can curate and update food safety profiles and global category/tag lists without code changes.
- Search and basic filtering work across recipe title, description, ingredients, categories, and tags.

**Acceptance Criteria (examples):**
- A user can add a new seafood ingredient and attach an FDA-aligned mercury profile with recommended serving frequency in under 2 minutes.
- Changing a recipe’s category or tags immediately affects search and filtering results.
- Soft-deleted recipes remain visible in historical meal plans but are hidden from active browsing.

### 8.2 Portion Scaling & Food Safety
- FamilySettings allow editing of the adult base protein amount (default 6 oz) and athlete multiplier (default 1.5×). These are family-wide and versioned/auditable.
- When creating or editing a MealPlan or MealPlanAssignment, users can specify counts for each PortionCategory (adult_male, adult_female, adolescent_male/female under/over 15, child, senior) plus an athlete flag per group.
- The system automatically calculates effective total protein needs for the plan using the stored multipliers and base values.
- Food safety notes (especially mercury risk and frequency guidance for seafood) are surfaced contextually when recipes containing flagged ingredients are added to plans or viewed.
- Calculations respect household visibility (shared plans aggregate across participating households; private plans use only that household’s counts).

**Acceptance Criteria (examples):**
- Changing the number of adolescent athletes in a shared plan immediately updates the displayed total protein requirement.
- When a recipe containing shrimp is added to a plan, relevant FDA “Good Choices” guidance and serving frequency notes appear without extra clicks.
- Family admins can adjust the athlete multiplier and see the change reflected in all subsequent calculations.

### 8.3 Meal Planning & Calendar
- Users can create MealPlans that are either private to their household or shared with one or more other households in the family.
- A calendar view displays plans with clear visual distinction between shared family plans and private household plans.
- Recipes can be assigned to specific dates and meal slots (breakfast, lunch, dinner, snack, etc.).
- MealPlan visibility and editing permissions are enforced via RLS (household isolation + explicit sharing).
- Realtime updates occur when any authorized user modifies a shared plan.

**Acceptance Criteria (examples):**
- A user in Household A can create a plan visible to Households A and B; Household C cannot see or edit it unless explicitly added.
- Editing a shared plan triggers realtime calendar refresh for all participating households.
- Private plans are never visible outside their owning household.

### 8.4 RecipeCombination (Complete Meals)
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
- Users can generate shopping lists from one or more selected MealPlans (respecting shared vs. private visibility).
- Lists aggregate ingredients across assigned recipes, applying the calculated portion multipliers from the plan.
- Unit conversion and deduplication are handled intelligently.
- Lists can be exported or shared (print, copy, future integration).

**Acceptance Criteria (examples):**
- Generating a list for a shared weekend plan correctly sums quantities across all participating households’ portions.
- Duplicate ingredients from multiple recipes are consolidated with correct total quantities.

### 8.8 Search, Filtering & Discovery
- Global search works across recipes, ChefIdeas, combinations, and ingredients.
- Filters include categories (hierarchical), tags, portion suitability, food safety flags, make-again rating, and time commitment.
- Results respect household visibility (users primarily see content relevant to their household + shared family content).

**Acceptance Criteria (examples):**
- A user can filter for “high-protein, quick weeknight dinners suitable for adolescents” and see relevant recipes + any matching ChefIdeas.
- Food safety warnings appear inline in search results when relevant ingredients are present.

---

**Note:** These functional requirements are intentionally detailed enough for implementation planning while remaining at a product level. UI/UX specifics and exact API shapes will be defined in subsequent sections.

## 9. UI/UX & Interaction Requirements

### 9.1 Design Philosophy
The interface should feel **simple, calm, and family-oriented** — low cognitive load, high clarity, and respectful of the fact that users may be cooking while using the app. It prioritizes quick access to the most common actions (view this week’s plan, add a recipe to a plan, see safety notes, capture an idea) while making advanced features (portion customization, ChefIdeas, decay paths) discoverable but not intrusive.

Key principles:
- Mobile-first (PWA experience should feel native on phones/tablets).
- Realtime feedback for shared plans.
- Contextual surfacing of important information (portion totals, food safety warnings, leftover suggestions).
- Optimistic UI updates with clear error handling and sync status.
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
- When editing a plan or assignment, a clear interface for entering or adjusting counts per PortionCategory (adult_male, adult_female, adolescent splits, child, senior) with athlete toggles.
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
- Quantities already adjusted for the calculated portions.
- Ability to check off items and optionally sync status back to the plan.

### 9.3 Key User Flows

**Flow: Plan a Shared Meal**
1. User opens Calendar → taps a day → “Add to Plan”.
2. Searches or browses recipes (safety notes visible).
3. Selects recipe → enters or adjusts portion counts for the relevant age/sex/athlete groups.
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
- Optimistic updates for ratings, notes, and plan changes.
- Thoughtful empty states that guide users toward first actions (e.g., “Capture your first ChefIdea”).

This UI/UX section focuses on the experience needed to make the powerful data model (portions, safety, combinations, ideas, decay paths) feel natural and useful in daily family life. Detailed wireframes and component specifications can be created in the next phase.

## 10. API & Backend Contracts (High-Level)

### 10.1 Recommended API Style
We recommend using **tRPC** for the backend API layer. This provides end-to-end TypeScript type safety between the React frontend and Node/TypeScript backend, which is especially valuable when working with complex JSONB structures (`protein_portions`, `food_safety_profile`, `leftover_decay_path`).

Alternative: REST or GraphQL if preferred for broader team familiarity, but tRPC is strongly favored for this project’s size and TypeScript-heavy stack.

### 10.2 High-Level Router / Domain Structure (tRPC)
Suggested top-level routers:

- `recipe` – CRUD + search/filter for recipes
- `ingredient` – CRUD + food safety profile management
- `mealPlan` – Create, update, share, portion calculations
- `shoppingList` – Generation and management
- `chefIdea` – Capture, update, convert to recipe, search
- `recipeCombination` – Create, manage groupings and ratings
- `category` / `tag` – Admin management of extensible vocabularies
- `familySettings` – Update portion defaults, safety guidance, etc.
- `user` / `household` – Profile and household membership (mostly handled via Supabase Auth + RLS)

### 10.3 Key Procedure Examples

**mealPlan.createOrUpdate**
- Input: MealPlan data + array of assignments + `protein_portions` JSONB object + visibility settings (`is_shared`, `visible_to_households`)
- Backend logic: Validate household permissions, recalculate effective protein needs, persist via Supabase
- Output: Updated MealPlan with calculated totals + realtime trigger

**mealPlan.generateShoppingList**
- Input: Array of `mealPlanId`s or date range + household context
- Backend logic: Aggregate ingredients across plans, apply portion multipliers, deduplicate, convert units
- Output: Structured shopping list (grouped by category where possible)

**recipe.addOrUpdateFoodSafetyProfile**
- Input: `ingredientId` + `food_safety_profile` JSONB (mercury, general guidance, etc.)
- Backend logic: Validate admin role, persist, audit log
- Output: Updated ingredient with safety profile

**chefIdea.create**
- Input: Title, notes, source, tags/categories, status, priority
- Output: New ChefIdea record (fully taggable using existing system)

**recipeCombination.create**
- Input: Name, notes, array of `{recipeId, role, sequence}`, `make_again_rating`
- Output: New combination + junction records

### 10.4 Responsibility Split

| Operation Type                        | Handled By                  | Reason |
|---------------------------------------|-----------------------------|--------|
| Simple CRUD + Realtime reads          | Direct Supabase client (React) | Speed, simplicity, RLS enforcement |
| Portion calculations & aggregations   | Backend (tRPC)              | Centralized logic, easier testing |
| Shopping list generation              | Backend (tRPC)              | Complex aggregation + unit conversion |
| Admin actions (settings, safety data) | Backend (tRPC)              | Role enforcement + auditability |
| Realtime calendar updates             | Supabase Realtime           | Native low-latency broadcasting |
| Future AI orchestration               | Backend (tRPC)              | Central coordination point for agents |

### 10.5 Authentication & Context
- All backend procedures receive the authenticated user context (via Supabase session).
- RLS policies handle most data isolation; backend uses service role only when necessary (e.g., cross-household aggregations for shared plans).
- Input validation (Zod) is strongly recommended on all procedures, especially those accepting JSONB fields.

### 10.6 Future Considerations
- As AI features are added, new routers/procedures (e.g., `ai.suggestRecipes`, `ai.enhanceChefIdea`) can be added under the same backend layer.
- Edge Functions may absorb some lighter procedures over time for reduced latency.

This high-level contract structure keeps the API clean, type-safe, and aligned with the data model defined in the Database PRD. Detailed input/output schemas can be defined during implementation planning.

## 11. Roadmap & Phasing

### 11.1 Guiding Principles for Phasing
- Deliver a usable core experience as quickly as possible (MVP that the family can actually use for weekly planning).
- Prioritize features that provide immediate daily value (portion scaling, shared calendar, food safety surfacing, basic shopping lists).
- Build extensibility foundations early (categories, tags, JSONB structures) so later features can leverage them without rework.
- Defer complex or lower-frequency features (advanced AI, full pantry tracking, detailed nutrition) to later phases.

### 11.2 Phase 1 – Foundation (MVP)

**Goal:** A working system the family can use for recipe management, portion-aware meal planning across households, and basic shopping list generation.

**Key Features:**
- Recipe & Ingredient CRUD with hierarchical categories and flexible tagging
- Food safety profiles on ingredients (FDA-style mercury guidance + frequency recommendations) with contextual display
- Editable FamilySettings for portion defaults (adult base protein + athlete multiplier)
- MealPlan creation with `protein_portions` JSONB support and automatic calculation
- Shared vs. private MealPlans with RLS enforcement and realtime calendar updates
- Basic RecipeCombination support (grouping recipes into complete meals with notes and 1-5 rating)
- ChefIdea capture with full tagging support
- Leftover decay path recording on recipes
- Simple shopping list generation from one or more MealPlans
- PWA foundation (installable, basic offline caching of recipes and plans)
- Core search and filtering

**Success Criteria:**
- Family can plan a full week (shared + private) and generate a shopping list.
- Portion calculations work correctly for mixed adult/child/athlete households.
- Food safety notes appear when relevant ingredients are used.
- Realtime updates work reliably for shared plans.

**Estimated Effort:** Highest priority — aim for a functional alpha within 4–8 weeks depending on team size.

### 11.3 Phase 2 – Polish & Core Value Expansion

**Goal:** Improve daily usability, reduce friction, and expand the “chef tools” that make the system feel like a true family knowledge base.

**Key Features:**
- Enhanced shopping list experience (better grouping, check-off, export, optional persistence)
- Improved RecipeCombination workflow and template reuse
- Stronger surfacing of leftover decay paths and ChefIdeas in relevant contexts
- Better mobile/PWA experience (improved offline support, background sync, performance)
- Admin tools for easier management of categories, PortionCategories, and food safety data
- Basic nutrition roll-ups beyond just protein (optional)
- Make-again ratings influencing discovery (“Family Favorites” views)
- Refined calendar UX and filtering

**Success Criteria:**
- Family actively uses ChefIdeas and leftover decay paths as part of their normal workflow.
- Shopping list generation becomes a regular, trusted part of meal planning.
- The app feels fast and reliable on mobile.

### 11.4 Phase 3+ – Advanced Capabilities & AI

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

**Success Criteria:**
- AI features provide genuine time savings without feeling gimmicky.
- The system measurably helps reduce food waste and decision fatigue.

### 11.5 Dependencies & Sequencing Notes
- Phase 1 depends on a solid Database schema (per Database PRD v0.3) and working RLS + Realtime setup.
- Food safety profiles and portion calculation logic should be built early — they influence many later features.
- RecipeCombination and ChefIdea features have relatively low dependencies and can be added in parallel with core meal planning.
- AI features (Phase 3) should only begin once the core data model and user workflows are stable and well-understood.

### 11.6 Overall Philosophy
This roadmap is intentionally front-loaded with high-value, frequently used features while keeping the system extensible. The family should feel the benefit of the app early (better portion accuracy, easier shared planning, safety awareness, and knowledge capture) rather than waiting for a “perfect” v1.

The phased approach also allows for learning and adjustment based on real family usage before investing heavily in more advanced capabilities.

- **Usability & Extensibility:** Family admins must be able to add/edit categories, portion profiles, and safety guidance without code changes.
- **Performance:** Fast aggregation for shopping lists and weekly views even with hundreds of recipes.
- **Security & Privacy:** Strong household isolation via RLS; only explicitly shared plans visible across households. Family-level admin controls.
- **Reliability:** Soft deletes and auditability for historical meal plans and recipes.
- **PWA / Offline:** Core recipes, upcoming plans, and portion guidance should be usable offline with background sync for edits.
- **Maintainability:** Clean separation of concerns between frontend, backend, and database. Type safety (TypeScript) throughout.

## 10. Risks, Open Questions & Next Steps

**Key Risks:**
- Over-engineering for a small family user base (mitigated by focused scope and extensibility).
- Complexity of accurate multi-household portion aggregation and visibility (addressed in data model).
- Keeping food safety guidance current (family admin curation + source attribution in JSONB).

**Open Questions (to be addressed in next iterations):**
- Exact split of logic between React frontend, Node backend, and Supabase Edge Functions.
- Detailed RLS policy design and auth flows.
- Prioritization and detailed specs for shopping list generation and nutrition roll-ups.
- UI/UX patterns for surfacing food safety notes and leftover decay paths without clutter.
- Roadmap timing for AI-assisted features.

**Immediate Next Steps:**
- Expand High-Level Architecture into detailed component and data flow diagrams.
- Define detailed API contracts / endpoint specifications.
- Flesh out UI/UX requirements and wireframes for key screens (calendar, recipe editor, portion calculator, ChefIdea capture).
- Prioritize v1 feature list and create user story map.

---

**Appendix A: Incorporated Database PRD**  
See `Recipe_Meal_Planning_Database_PRD_v0.3.md` in the artifacts folder for the complete data model, entities, JSONB structures, relationships, extensibility rules, and security considerations.

---

**End of Product PRD v0.1 (Sections Started)**

This document is a living artifact. Feedback and iterative expansion of specific sections are welcome. Please indicate which sections you would like to develop next (e.g., detailed Functional Requirements, Architecture deep-dive, UI/UX guidelines, API outlines, or Roadmap).