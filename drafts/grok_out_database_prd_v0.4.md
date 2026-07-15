## INTEGRATION NOTES

- Header bumped to v0.4 (2026-07-15), status "Revised per design review"; added Changes in v0.4 summarizing D1, D2, D5–D8, D12–D15, D17.
- Critical Note updated: architecture decided; document reflects 2026-07 design review (no longer "revisions expected" for auth/API/hosting).
- §1 Overview: removed JSONB/visibility-control framing; aligned with family-global content (D7) and MealPlan-only sharing (D6); hybrid model retained without protein_portions JSONB.
- §2 Scope: protein_portions JSONB removed from in-scope list; MealPlanPortionRequirement / MealPlanHousehold / Unit noted; out-of-scope backend/API wording aligned with decided Next.js+tRPC stack; full-text search no longer listed as out of scope at high level (indexes specified in §6).
- §3 Assumptions: replaced undecided-architecture hedging with D1 (RLS sole auth + user JWT), D2 (tRPC in Next.js), D3/D14 (portion calc pure TS; DB functions for shopping-list/roll-up only); hybrid model updated for normalized portion/visibility tables; revisions-expected kept only for open items (pantry, AI, multi-macro).
- §4.1 Household: noted is_active deactivation is the only removal path (no hard delete).
- §4.1 Ingredient: family-global (D7); added created_by_user_id; kept is_user_added and food_safety_profile.
- §4.1 Recipe: family-global visibility note (D7); created_by_user_id already present.
- §4.1 Category: removed level and path; hierarchy = parent_id + recursive CTEs; ltree noted as future optimization (D15).
- §4.1 PortionCategory: base_protein_oz is single source of base ounces (D17); deactivate not delete once referenced.
- §4.1 FamilySettings: removed adult_reference_protein_oz (D17); kept athlete_multiplier (default 1.5) and other_global_defaults JSONB; adult base via Adult Male PortionCategory.
- §4.1 MealPlan: start_date/end_date only (D8); removed plan_date, is_shared, visible_to_households, protein_portions; relationships include MealPlanAssignment, MealPlanHousehold, MealPlanPortionRequirement.
- §4.1 MealPlanAssignment: assignment_date must fall within parent plan range; removed optional protein_portions override sentence.
- §4.1 RecipeCombination / ChefIdea: family-global (D7); created_by_user_id added on ChefIdea (was missing).
- §4.1: inserted `<!-- CLAUDE_SECTION: NEW_TABLE_SCHEMAS -->` after MealPlan/MealPlanAssignment for MealPlanHousehold, MealPlanPortionRequirement, Unit (and related constraint detail).
- §4.2: deleted protein_portions example/rationale; replaced with 2–3 sentences on D5 normalization; leftover_decay_path and food_safety_profile examples unchanged.
- §5 Extensibility: portion profiles as rows (no JSONB keys); recursive CTEs for categories; Unit as admin-editable lookup (D12); JSONB retained only for fluid, non-filtered structures.
- §6: rewrote indexing per D13 (query-pattern indexes with serving queries named; generated tsvector only for FTS; no blanket JSONB GIN); soft-delete, check constraints, assignment-date invariant; SHOPPING_LIST_VIEW placeholder for aggregation functions.
- §7 body replaced entirely with `<!-- CLAUDE_SECTION: RLS_POLICIES -->`.
- §8: removed resolved items (JSONB vs normalized portions, visibility storage, RLS pending architecture); kept pantry, AI, multi-macro, food-safety normalization, performance validation; trimmed maturation notes that implied undecided architecture.

---

# Database Product Requirements Document (PRD)
## Recipe & Meal Planning Application

**Document Version:** 0.4  
**Date:** July 15, 2026  
**Status:** Revised per design review  
**Author:** Grok (iterative development with user)  
**Changes in v0.3:** Added `food_safety_profile` (JSONB on Ingredient) supporting FDA ratings (e.g., mercury categories), risk levels, and consumption frequency recommendations. Minor updates to Ingredient description, JSONB examples, Extensibility, and Future Considerations.  
**Changes in v0.4:** Incorporates the 2026-07 design review. Architecture decided: RLS is the sole authorization authority with user-JWT clients (D1); backend is tRPC hosted inside the Next.js app (D2). Data model: `protein_portions` JSONB replaced by `MealPlanPortionRequirement` (D5); `visible_to_households` / stored `is_shared` replaced by `MealPlanHousehold` with derived shared-ness (D6); content entities are family-global with `created_by_user_id` (D7); MealPlan is a date-ranged container with assignments constrained to plan range (D8). Integrity and ops: deterministic `Unit` conversion with dimension + `factor_to_base` (D12); indexes by query pattern only, FTS via generated tsvector, no blanket JSONB GIN (D13); shopping-list and weekly protein roll-up as set-based SQL (D14); Category hierarchy is `parent_id` + recursive CTEs only (D15); `FamilySettings.adult_reference_protein_oz` removed — `PortionCategory.base_protein_oz` is the single source of base ounces (D17).  
**Intended Audience:** LLM assistant that will assist in developing the full Product PRD and related implementation specifications.

> **Critical Note to Reader (LLM):**  
> This document defines only the **database layer**. It is explicitly intended to be incorporated into the comprehensive Product PRD for the web-based application (React/Next.js PWA frontend + tRPC TypeScript backend + Supabase/PostgreSQL).  
> **This revision reflects the 2026-07 design review**, which decided the system architecture, authentication model (RLS as sole authorization authority), and the responsibility split for calculations versus set-based aggregation. Remaining open items (pantry/inventory, AI integration strategy, multi-macro scaling, and related product-roadmap concerns) may still drive limited future revisions to this Database PRD.

---

## 1. Overview and Purpose

This Database PRD specifies the data model required to support a recipe and meal planning application for a single family consisting of three households. The system must handle frequent shared meals across households as well as private household-specific plans, while providing highly extensible classification and nuanced portion scaling focused initially on protein.

The database design prioritizes:
- Queryability for meal planning aggregates (shopping lists, nutrition roll-ups, calendar views).
- Extensibility of categories, tags, and portion profiles without schema migrations.
- Clean support for shared vs. private meal plans via household membership on plans (content is family-global; visibility controls apply only to MealPlans).
- A hybrid relational + JSONB model: core planning and portion structures are normalized; JSONB is reserved for fluid, non-filtered payloads (e.g., leftover paths, food-safety profiles).

## 2. Scope

**In Scope (Database Layer):**
- Core entities, fields, relationships, and constraints.
- Hierarchical taxonomy for nutrition/food categories (`parent_id` + recursive CTEs).
- Flexible tagging system.
- Detailed design for Portion Categories with age, sex, and athlete dimensions (protein-only in v1).
- MealPlan model as a date-ranged container supporting shared and private household plans via `MealPlanHousehold` (shared-ness derived, not stored).
- Normalized portion requirements via `MealPlanPortionRequirement` (replacing prior `protein_portions` JSONB).
- Explicit `Unit` lookup with deterministic within-dimension conversion.
- Extensibility mechanisms and data integrity rules.
- High-level security considerations (RLS as sole authorization authority; policy detail in §7).
- Indexing by documented query patterns and full-text search via generated tsvector columns.

**Out of Scope:**
- Frontend UI/UX, component specifications, or React/Next.js PWA implementation details.
- Full tRPC procedure surface and application business-logic code structure (except where the data model implies invariants enforced at the DB boundary).
- Complete authentication UI flows (identity is Supabase Auth; authorization is entirely RLS — detailed policies belong in §7 / system architecture).
- Non-database concerns such as caching strategy, image storage, offline sync implementation, or deployment.

This document will be merged into the overarching Product PRD.

## 3. Assumptions

The following assumptions reflect the **decided** system architecture from the 2026-07 design review:

- The primary database will be **PostgreSQL** hosted/managed via **Supabase**.
- A **hybrid data model** will be employed: strong relational normalization for core entities (Ingredients, Recipes, Households, MealPlans, PortionCategories, Units, MealPlanHousehold, MealPlanPortionRequirement) combined with strategic **JSONB** columns only where the payload is fluid and is not used as a filter key (e.g., leftover decay paths, food-safety profiles, and open-ended global defaults).
- The application serves **one family** that consists of **three distinct households**. Meal plans may be private to one household or shared with additional households via membership rows; the calendar frontend will clearly flag shared vs. private using derived membership. Recipes, ingredients, chef ideas, and recipe combinations are **family-global** (not household-scoped).
- **Row Level Security (RLS)** is the **sole** authorization authority. Application clients (including the tRPC layer) use the **user's JWT**; the service role is reserved for system jobs only (migrations, audit, seed). Detailed policies are specified in §7.
- The **backend is tRPC hosted inside the Next.js application** (no NestJS; Supabase Edge Functions not used in v1). The frontend and tRPC procedures interact with Postgres via Supabase clients carrying the caller identity.
- **Protein portion calculation** is implemented once as a pure TypeScript function in a shared package; persisted totals are derived/cached and recomputed when settings or requirements change. **Database functions/views are limited** to set-based shopping-list aggregation and weekly protein roll-up (see §6).
- Portion scaling is **protein-only in the initial version**, with a clear extension path for full-recipe or multi-macro scaling later.
- Data volume and concurrency are modest (single family, low number of concurrent users), but the model must efficiently support aggregation queries required for shopping list generation and nutrition summaries across shared and private plans.
- **Revisions remain expected** only for genuinely open product areas — pantry/inventory, AI-assisted features, multi-macro scaling, and related roadmap items — not for core architecture, auth, or the portion/visibility data model.

## 4. Core Entities and Data Model

### 4.1 Primary Entities

**Household**  
Represents one of the three households within the family.  
Key fields: `id` (UUID), `name`, `family_id` (logical grouping), `created_at`, `updated_at`, `is_active`.  
**Removal path:** households are deactivated via `is_active = false`; hard delete is not used (referential integrity and history depend on stable household rows).  
Relationships: Users belong to one Household. MealPlans are associated with one or more Households via `MealPlanHousehold`.

**User / Profile**  
Linked to Supabase Auth user.  
Key fields: `id`, `household_id`, `display_name`, `role` (e.g., admin, member), `created_at`.  
RLS policies will heavily reference this entity.

**Ingredient**  
Master data for food items used in recipes. **Family-global** (visible to all family members; not household-private).  
Key fields: `id`, `name`, `description`, `default_unit_id`, `nutrition_data` (JSONB or normalized), `food_safety_profile` (JSONB — see section 4.2 for structure supporting FDA ratings, mercury risk, frequency recommendations, etc.), `is_user_added`, `created_by_user_id`, `created_at`.  
Relationships: Many-to-many with Categories (nutrition taxonomy) via junction table. Many-to-many with Recipes via `RecipeIngredient`.

**Recipe**  
Core content entity describing how to prepare a dish or component. **Family-global** (visible to all family members; household visibility controls apply only to MealPlans).  
Key fields: `id`, `title`, `description`, `instructions` (structured JSON or rich text), `prep_time_minutes`, `cook_time_minutes`, `total_time_minutes`, `yield_servings`, `source_url` or `source_book`, `created_by_user_id`, `is_template` (for component recipes), `make_again_rating` (SMALLINT 1-5, nullable — chef's overall opinion on the recipe), `created_at`, `updated_at`.  
Relationships: Has many `RecipeIngredient`. Many-to-many with Tags and Categories. Supports `leftover_decay_path` JSONB (see 4.2).

**RecipeIngredient** (Junction)  
Associates an Ingredient with a Recipe.  
Key fields: `id`, `recipe_id`, `ingredient_id`, `quantity`, `unit_id`, `preparation_note`, `sequence_order`, `is_optional`, `created_at`.

**Category** (Self-referential / Hierarchical)  
Supports deep, extensible taxonomies (primarily nutrition/food groups, with potential for dish form or other hierarchies).  
Key fields: `id`, `name`, `slug`, `parent_id` (nullable), `category_type` (e.g., 'nutrition', 'dish_form'), `sort_order`, `description`, `is_active`, `created_at`.  
Hierarchy is expressed solely via `parent_id`; tree walks and descendant queries use **recursive CTEs**. Materialized `level` / `path` columns are not part of the v1 model. If the taxonomy grows very large, Postgres `ltree` may be considered later as a query optimization without changing the logical parent/child model.  
Example hierarchy: Protein > Seafood > Fin Fish > Salmon; or Starch > Grains > Rice.

**Tag**  
Flexible, mostly flat attributes for recipes and ingredients.  
Key fields: `id`, `name`, `slug`, `tag_group` (e.g., 'applicable_meal', 'preparation_method', 'dietary_restriction', 'cuisine', 'difficulty'), `description`, `color` or `icon` (for UI), `is_active`.  
Relationships: Many-to-many with Recipes and Ingredients via junction tables.

**PortionCategory**  
Lookup table defining the age/sex/athlete-based protein portion profiles. Fully editable by family administrators.  
Key fields: `id`, `name` (e.g., "Adolescent Male Over 15"), `slug`, `base_protein_oz`, `description`, `sort_order`, `is_active`, `created_at`, `updated_at`.  
**`base_protein_oz` is the single source of base ounces** for each category (including the Adult Male reference base, default 6.0 oz). There is no separate family-level adult reference field.  
**Lifecycle:** once a PortionCategory is referenced by any plan (including historical), it is **deactivated** (`is_active = false`), never hard-deleted.  
Initial recommended set (editable):
- Child
- Adolescent Female Under 15
- Adolescent Female Over 15
- Adolescent Male Under 15
- Adolescent Male Over 15
- Adult Female
- Adult Male (reference base, default 6.0 oz)
- Senior Female
- Senior Male

**FamilySettings**  
Single-row (or simple key-value) configuration for family-wide defaults.  
Key fields: `id`, `athlete_multiplier` (default 1.5 or family-chosen value), `other_global_defaults` (JSONB for future expansion), `updated_at`.  
The editable adult protein base is maintained on the **Adult Male** `PortionCategory.base_protein_oz` row, not on FamilySettings.

**MealPlan**  
Represents a planned meal or set of meals as a **date-ranged container**.  
Key fields: `id`, `title`, `description`, `start_date`, `end_date`, `created_by_household_id`, `created_by_user_id`, `created_at`, `updated_at`.  
There is no stored `plan_date` alternative, no stored `is_shared` flag, and no `visible_to_households` JSONB: household visibility is membership in `MealPlanHousehold` (shared-ness is derived from membership count > 1). Portion needs are rows in `MealPlanPortionRequirement`, not a JSONB blob.  
Relationships: Has many `MealPlanAssignment`, `MealPlanHousehold`, `MealPlanPortionRequirement`.

**MealPlanAssignment**  
Links a specific Recipe to a slot within a MealPlan.  
Key fields: `id`, `meal_plan_id`, `recipe_id`, `assignment_date`, `meal_slot` (e.g., 'breakfast', 'lunch', 'dinner', 'snack'), `servings`, `notes`, `created_at`.  
**Invariant:** `assignment_date` must fall within the parent MealPlan's `[start_date, end_date]` range. Enforcement detail (trigger and application validation) is specified with the coordinator-authored schemas; this document states the invariant only. Per-assignment portion overrides are out of scope for v1.

<!-- CLAUDE_SECTION: NEW_TABLE_SCHEMAS -->

**RecipeCombination**  
Represents a logical grouping of multiple recipes that are served together as one complete meal (e.g., main + sides + dessert or appetizer). This is the "meals object" for tagging/combining recipes that work well together. **Family-global** (same visibility model as Recipe).  
Key fields: `id`, `name` (e.g., "Greek-Inspired Sunday Dinner"), `notes` (free-text comments on the combination, pairing rationale, timing, etc.), `make_again_rating` (SMALLINT 1-5, nullable — chef's opinion on the overall meal experience), `served_date` or link to MealPlan, `is_template`, `created_by_user_id`, `created_at`, `updated_at`.  
Relationships: Junction table `RecipeCombinationRecipe` (`recipe_combination_id`, `recipe_id`, `role_in_meal` e.g. 'main'/'side'/'dessert', `sequence_order`, `notes`).

**ChefIdea**  
Captures "recipes to pursue" or inspiration items before they become full recipes. Can be tagged using the existing Category and Tag system (e.g., "Pork Shoulder Roast Recipe from Greek Islands — try this" tagged with Protein > Pork, Cuisine: Greek/Mediterranean). **Family-global**.  
Key fields: `id`, `title`, `description` / `notes` (rich text or markdown), `source` (free text, URL, book, or person), `status` (idea / researching / tested / adopted / abandoned), `priority`, `created_by_user_id`, `created_at`, `updated_at`.  
Relationships: Many-to-many with Categories and Tags (via junction tables). Optional link to a `Recipe` if/when the idea is developed into a saved recipe.

**Leftover Decay Path**  
Structured "daughter element decay path" for leftovers from a recipe or ingredient. Stored as JSONB on the `Recipe` table (or optionally on Ingredient for base items). Supports creative repurposing ideas (e.g., pork shoulder leftovers → Cuban sandwiches, Bolognese sauce base, enchiladas, fried rice).  
See example in section 4.2.

### 4.2 Key JSONB Structures

**Normalized portion requirements (replaces prior `protein_portions` JSONB):**  
Plan-level protein needs are stored in `MealPlanPortionRequirement` (see coordinator schemas in §4.1), not as JSONB. Normalization provides foreign-key integrity to `PortionCategory`, an explicit `athlete_count` that can express mixed groups within a category, and straightforward SQL aggregation for roll-ups and shopping-list context. JSONB remains appropriate only where the structure is fluid and is never used as a primary filter or join key.

**leftover_decay_path** (stored as JSONB on `Recipe`; supports structured or free-form repurposing ideas):

```json
[
  {
    "use": "Cuban Sandwiches",
    "notes": "Shredded pork with pickles, mustard, and Swiss on pressed bread. Excellent next-day use.",
    "linked_recipe_ids": []
  },
  {
    "use": "Bolognese Sauce base",
    "notes": "Simmer with tomatoes, soffritto, and red wine. Freezes well.",
    "linked_recipe_ids": []
  },
  {
    "use": "Enchiladas or Tacos",
    "notes": "Season with cumin/chili and use in corn tortillas."
  }
]
```

This field can evolve into a more normalized `RecipeLeftoverTransformation` table in the future if queryability across many recipes becomes important.

**food_safety_profile** (stored as JSONB on `Ingredient`; supports FDA-style ratings, contaminant risks such as mercury, and consumption frequency guidance):

```json
{
  "mercury": {
    "fda_category": "Good Choices",
    "risk_level": "moderate",
    "recommended_frequency": "2-3 servings per week for adults; limit to 1 serving per week for pregnant women and children",
    "notes": "Per current FDA/EPA guidelines. Choose lower-mercury options like salmon, shrimp, or cod when possible.",
    "source": "FDA/EPA 2025 guidelines",
    "last_reviewed": "2026-06"
  },
  "general": {
    "cooking_temperature": "Cook seafood to internal temperature of 145°F (63°C)",
    "storage_notes": "Keep refrigerated and use within 1-2 days of purchase"
  }
}
```

This structure is intentionally flexible so additional contaminants (lead, PFAS, etc.) or population-specific guidance can be added later without schema changes. A lookup table for standardized `FoodSafetyCategory` values can be introduced if stricter normalization is desired.

## 5. Extensibility Strategy

- All user-selectable vocabularies (Categories, Tags, PortionCategories, Units, Meal Slots) are database-driven lookup tables.
- Family administrators can add, edit, deactivate, or reorder entries through the application UI without code changes.
- Hierarchical categories support unlimited depth using `parent_id` + recursive CTEs (ltree is a possible future optimization only).
- New portion profiles are **rows**: add a `PortionCategory` and attach counts via `MealPlanPortionRequirement` — no JSONB key conventions and no schema migrations for new age/sex bands.
- `Unit` is an explicit admin-editable lookup (`dimension` + `factor_to_base`); conversion and summation occur only within a dimension. Cross-dimension pairs are listed separately and never guessed; density-based mass↔volume conversion is deferred.
- JSONB columns are used only for structures expected to evolve and that are not primary filter keys (`leftover_decay_path`, `food_safety_profile`, `other_global_defaults`, optional open-ended metadata).
- `RecipeCombination`, `ChefIdea`, and `leftover_decay_path` remain extensible via existing Category/Tag relationships and JSONB, allowing the family to capture meal combinations, inspiration, and creative leftover uses without schema changes.
- `food_safety_profile` on Ingredient uses JSONB to support evolving FDA/EPA-style guidance, multiple contaminants, and population-specific recommendations (e.g., pregnant women, children, seniors) while keeping the core model simple.

## 6. Data Integrity, Constraints, and Indexing

- Foreign key constraints on all relationships (with appropriate `ON DELETE` behavior — e.g., RESTRICT on referenced vocabularies and households that must not hard-delete while in use).
- Unique constraints on natural keys where relevant (e.g., ingredient name within context; unit name).
- Check constraints on numeric fields (`quantity > 0`, `counts >= 0`, `times >= 0`, `factor_to_base > 0`, and portion `athlete_count <= count` where defined).
- **Assignment-date invariant:** `MealPlanAssignment.assignment_date` must lie within the parent MealPlan's `[start_date, end_date]`; shrinking a plan's date range must not strand assignments. (Enforcement layers are defined with the coordinator-authored schemas.)
- Soft-delete pattern (`deleted_at` timestamp) on most user-facing content entities to preserve historical meal plans and recipes.
- **Indexing by query pattern only** (every index documents the query it serves). No blanket GIN on all JSONB columns; JSONB remains unindexed until a concrete filter/aggregation query requires it.

  Recommended indexes (illustrative; exact names may match migration conventions):
  - B-tree / FK indexes on junction foreign keys (e.g., `meal_plan_household(household_id)` — serves RLS EXISTS subqueries and "plans visible to my household" calendar queries; `meal_plan_portion_requirement(portion_category_id)` — serves portion roll-ups and referential checks).
  - Date columns used in range and calendar queries (e.g., `meal_plan(start_date, end_date)`, `meal_plan_assignment(assignment_date)`, `meal_plan_assignment(meal_plan_id, assignment_date)` — serves plan-window and day-grid fetches).
  - Lookup uniqueness and filter aids where proven (e.g., unique on `unit.name`, `category.slug` / `tag.slug` within type as applicable).
  - Full-text search via **generated tsvector columns** (not trigger-maintained) on `Recipe.title`, `Recipe.description`, and ingredient names, with matching GIN indexes on those generated columns — serves recipe/ingredient search.

- Database functions for common **set-based** aggregates are limited to shopping-list generation and weekly protein roll-up (portion formula otherwise lives in the shared TypeScript package):

<!-- CLAUDE_SECTION: SHOPPING_LIST_VIEW -->

## 7. Security and Access Control

<!-- CLAUDE_SECTION: RLS_POLICIES -->

## 8. Open Items and Future Considerations

- Exact implementation and responsibility for **full-meal / multi-macro scaling** (beyond protein-only) — to be defined when that capability is prioritized in the product roadmap. Automatic protein-driven ingredient rescale is explicitly deferred until recipes can identify protein ingredient lines.
- Integration strategy with potential AI-assisted features (recipe generation, intelligent meal suggestions, substitution recommendations) — the data model should continue to expose clean, queryable structures for such systems.
- Performance validation of aggregation queries (shopping lists, weekly nutrition summaries) once realistic data volumes and query patterns are known.
- Potential addition of `PantryStock` / inventory tracking for advanced meal planning and waste reduction features.
- Maturation of `RecipeCombination`, `ChefIdea`, and `leftover_decay_path` as real usage patterns are observed (richer linking such as ChefIdea → eventual Recipe, or decay paths linked to specific ingredients).
- Evolution of `food_safety_profile` on Ingredient — current JSONB approach supports FDA mercury categories and frequency recommendations. Future work may include a dedicated `FoodSafetyAttribute` lookup/junction system for broader contaminants and automated guidance based on user profile (age, pregnancy status, etc.).
- Density-based mass↔volume unit conversion (deferred; v1 never guesses across dimensions).

---

**End of Database PRD v0.4**

This document is ready for incorporation into the full Product PRD. Coordinator-authored sections replace the marked placeholders before final merge.
