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
**Invariant:** `assignment_date` must fall within the parent MealPlan's `[start_date, end_date]` range. Enforcement is specified with the coordinator-authored schemas. Per-assignment portion overrides are out of scope for v1.

### MealPlanHousehold (junction — replaces `visible_to_households` JSONB)

```sql
CREATE TABLE meal_plan_household (
  meal_plan_id      uuid NOT NULL REFERENCES meal_plan(id) ON DELETE CASCADE,
  household_id      uuid NOT NULL REFERENCES household(id) ON DELETE RESTRICT,
  added_by_user_id  uuid REFERENCES profile(id),
  created_at        timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (meal_plan_id, household_id)
);
CREATE INDEX idx_mph_household ON meal_plan_household (household_id);
-- Serves: RLS EXISTS subqueries and "plans visible to my household" calendar queries.
```

**Invariants:**
1. The creating household always has a membership row; `mealPlan.createOrUpdate` (the single plan-creation code path) inserts it in the same transaction as the plan. Creator access does **not** depend on this row — the `meal_plan` SELECT policy also admits the creating household directly (see §7), which resolves the first-row bootstrap and means a membership-less plan degrades to creator-only visibility rather than leaking or deadlocking.
2. `is_shared` on MealPlan is **dropped** as a stored column. "Shared" is derived: membership count > 1. One source of truth; the UI computes the badge from membership.
3. The creating household's row cannot be removed: the DELETE policy on this table excludes rows where `household_id` equals the parent plan's `created_by_household_id`.
4. `ON DELETE RESTRICT` on `household_id`: households are deactivated via `is_active`, never hard-deleted.

### MealPlanPortionRequirement (normalized — replaces `protein_portions` JSONB)

```sql
CREATE TABLE meal_plan_portion_requirement (
  meal_plan_id         uuid NOT NULL REFERENCES meal_plan(id) ON DELETE CASCADE,
  portion_category_id  uuid NOT NULL REFERENCES portion_category(id) ON DELETE RESTRICT,
  count                smallint NOT NULL CHECK (count >= 0),
  athlete_count        smallint NOT NULL DEFAULT 0 CHECK (athlete_count >= 0),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (meal_plan_id, portion_category_id),
  CONSTRAINT athlete_within_count CHECK (athlete_count <= count)
);
-- Serves: portion totals per plan; weekly protein roll-ups; shopping-list scaling context.
```

**Semantics:**
- `count` = total people in this portion category eating from this plan; `athlete_count` = how many of those `count` people get the athlete multiplier. A household with 2 adult males, 1 of whom is an athlete, is `(count=2, athlete_count=1)` — expressible here, inexpressible in the old boolean-per-group JSONB.
- Rows with `count = 0` are not stored (delete on save); absence of a row means zero.
- `ON DELETE RESTRICT` on `portion_category_id`: categories referenced by any plan (including historical) cannot be deleted — deactivate via `PortionCategory.is_active` instead. Deactivated categories remain readable in existing plans but are not offered for new entries (edge-case AC, decision 11).

**Canonical portion formula** (the single business rule; implemented once as a pure TypeScript function in the shared package per decision 3, and mirrored *only* inside the sanctioned weekly protein roll-up function of decision 14, pinned by a contract test):

```
effective_protein_oz(plan) =
  Σ over requirement rows r:
    ( (r.count − r.athlete_count)
      + r.athlete_count × family_settings.athlete_multiplier )
    × portion_category.base_protein_oz
```

**DRY consequence — FamilySettings change:** `PortionCategory.base_protein_oz` is the *only* source of per-category base ounces. `FamilySettings.adult_reference_protein_oz` is **removed** from the model — it duplicated the Adult Male row's `base_protein_oz` and created a second source of truth. FamilySettings retains `athlete_multiplier` (family-wide) and `other_global_defaults` JSONB. The "editable adult base 6 oz" requirement is satisfied by editing the Adult Male PortionCategory row (admin UI already planned for PortionCategory curation).

### Unit (lookup — previously referenced but undefined)

```sql
CREATE TABLE unit (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text NOT NULL UNIQUE,        -- 'gram', 'cup', 'each'
  abbreviation    text NOT NULL,               -- 'g', 'cup', 'ea'
  dimension       text NOT NULL CHECK (dimension IN ('mass', 'volume', 'count')),
  factor_to_base  numeric NOT NULL CHECK (factor_to_base > 0),
  is_active       boolean NOT NULL DEFAULT true,
  sort_order      integer,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
-- Base units per dimension: mass → gram (factor 1), volume → milliliter (factor 1), count → each (factor 1).
-- Examples: oz = ('mass', 28.3495), lb = ('mass', 453.592), cup = ('volume', 236.588), tbsp = ('volume', 14.7868).
```

**Conversion rule (decision 12A):** quantities convert and sum **only within one dimension** via `quantity × factor_to_base`. Cross-dimension pairs (e.g., grams of flour + cups of flour) are **never converted by guessing** — the shopping list renders them as separate lines under the same ingredient. Density-based mass↔volume conversion is explicitly deferred (Phase 3 candidate).

### Additional integrity constraints

- **Ingredient name uniqueness (backs the duplicate-prevention AC in Product PRD §8.1):** `CREATE UNIQUE INDEX uq_ingredient_name ON ingredient (lower(name)) WHERE deleted_at IS NULL;` — case-insensitive, scoped to non-deleted rows so a soft-deleted ingredient's name can be reused. The "merge suggestion" UX is application logic; the index is the enforcement backstop.
- **Attribution immutability:** on all content entities (`recipe`, `ingredient`, `chef_idea`, `recipe_combination`), a `BEFORE UPDATE` trigger rejects changes to `created_by_user_id` and `created_at`. Any family member may edit content (explicit family-trust decision, see §7 shape A1), but authorship cannot be rewritten.

### Assignment-date range constraint (decision 8A — implementation note)

A plain `CHECK` cannot reference the parent table, so `assignment_date BETWEEN plan.start_date AND plan.end_date` is enforced by **two layers, both required**:
1. **Database (authoritative):** a `BEFORE INSERT OR UPDATE` trigger on `meal_plan_assignment` that raises an exception when `assignment_date` falls outside the parent plan's `[start_date, end_date]`; a companion trigger on `meal_plan` rejects shrinking a plan's range while assignments would fall outside it.
2. **Application (UX):** Zod validation in the tRPC procedure so users get a friendly error before the trigger ever fires.

Both triggers get explicit unit coverage in the integration test suite (attempt out-of-range insert; attempt range shrink with stranded assignments).

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
- JSONB columns are used only for structures expected to evolve and that are not primary filter keys (`leftover_decay_path`, `food_safety_profile`, `other_global_defaults`).
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

**Contract — `generate_shopping_list(p_meal_plan_ids uuid[])`** (SQL function, `LANGUAGE sql STABLE`, **SECURITY INVOKER** so RLS filters the caller's visible plans automatically; plan IDs the caller cannot see contribute zero rows rather than erroring).

**Shape (single set-based query, no per-recipe round trips):**
```
meal_plan (filtered to p_meal_plan_ids, RLS-visible)
  JOIN meal_plan_assignment      ON plan
  JOIN recipe                    ON assignment    -- soft-deleted recipes INCLUDED (see note)
  JOIN recipe_ingredient         ON recipe
  JOIN unit                      ON recipe_ingredient.unit_id
  JOIN ingredient                ON recipe_ingredient.ingredient_id
  LEFT JOIN ingredient_category  ON ingredient (top-level category for grouping)
GROUP BY ingredient_id, unit.dimension, recipe_ingredient.is_optional
```

**Returns:**
| column | meaning |
|---|---|
| `ingredient_id`, `ingredient_name` | identity |
| `dimension` | mass / volume / count — one output row per (ingredient × dimension) |
| `total_quantity_base` | Σ `quantity × factor_to_base × scale_factor` |
| `is_optional` | optional ingredients aggregate separately and render in an "Optional" group (decision 11) |
| `category_name` | top-level ingredient category for store-aisle grouping |
| `source_recipe_ids` | array — lets the UI answer "why is this on my list?" |
| `includes_deleted_recipe` | true when any contributing recipe is soft-deleted, so the UI can badge the line |

Display-unit selection (rendering `total_quantity_base` as "1.5 lb" instead of "680 g") is a **backend formatting concern**: the tRPC wrapper picks the largest active unit of the row's dimension that yields a quantity ≥ 1. The SQL function returns base quantities only.

**Scaling rule (explicit v1 simplification):** `scale_factor = meal_plan_assignment.servings / recipe.yield_servings`. The protein requirement (portion formula above) **informs the user's choice of `servings`** — it is displayed alongside the assignment editor — but does **not** silently rescale individual ingredients, because mapping "oz of protein needed" to "which ingredient line is the protein" is not decidable from the v1 data model. Automatic protein-driven scaling is a Phase 3 item and requires tagging the protein ingredient(s) per recipe.

**Soft-delete rule:** RLS does **not** filter `deleted_at` (authorization and lifecycle are separate concerns — see §7); browse/search queries apply `deleted_at IS NULL` themselves. This function therefore correctly includes soft-deleted recipes so historical and current plans keep aggregating, flagged via `includes_deleted_recipe`.

**Weekly protein roll-up** is a sibling function over `meal_plan` × `meal_plan_portion_requirement` × `portion_category` × `family_settings` implementing the canonical portion formula — the only sanctioned SQL copy of it, pinned to the TypeScript implementation by a contract test that runs both against identical fixtures. (The shopping list's `scale_factor` is servings-based and deliberately *not* part of that contract.)

## 7. Security and Access Control

**Authority model (decision 1A):** RLS is the **sole** authorization authority. Every tRPC procedure creates a Supabase client with the **caller's JWT**; there is no service-role write path for user-facing operations. The service role key exists only for system jobs (migrations, audit backfills, seed data) and is never reachable from request handling. Consequence: any authorization bug is an RLS bug, findable in exactly one place and covered by the test matrix.

**Tenancy assumption (explicit):** this deployment serves exactly one family (per §1); policies scope by "has a profile row," not by `family_id`. `Household.family_id` is retained as informational grouping only. **Precondition for any future multi-family use:** every policy below must gain `family_id` scoping first — this is a stated migration gate, not an oversight.

**Blanket rule:** `ALTER TABLE … ENABLE ROW LEVEL SECURITY` on **every table in the schema, no exceptions** — including `profile`, audit tables, and lookups. The CI coverage check (see test matrix) asserts both that RLS is enabled on all tables *and* that each table has matrix coverage; a table with RLS disabled fails CI. `anon` has no policies anywhere: unauthenticated access is denied by default on every table, and Storage buckets (recipe images) are authenticated-only.

**Helper functions:** `current_household_id()` (`SELECT household_id FROM profile WHERE id = auth.uid()`) and `is_family_admin()` (over `profile.role`), both `SECURITY DEFINER STABLE` so policies stay one-line and are planned once per statement. Because these helpers read `profile`, the integrity of `profile.role` and `profile.household_id` is the root of the entire model — hence shape D below.

**Shape D — identity tables (`profile`):** the privilege-escalation surface; deliberately the most restrictive.
- `SELECT`: any authenticated family member (profiles are visible family-wide — needed for attribution display and plan sharing UI).
- `INSERT`: no user policy. Profiles are provisioned by a `SECURITY DEFINER` on-signup trigger (Supabase auth hook); household assignment happens via admin invite flow.
- `UPDATE`: users may update their own row (`id = auth.uid()`), **but** a `BEFORE UPDATE` trigger rejects any change to `role` or `household_id` unless `is_family_admin()`. Cosmetic fields (`display_name`) are self-service; privilege and membership fields are admin-only. (RLS cannot express column-level rules; the trigger closes that gap and is itself matrix-tested.)
- `DELETE`: nobody (deactivation flag if ever needed).

**Shape A1 — family-global content entities (decision 7A):** `recipe`, `ingredient`, `chef_idea`, `recipe_combination`.
- `SELECT`: any authenticated family member. **No `deleted_at` filtering in policies** — lifecycle filtering is a query concern (browse/search apply `deleted_at IS NULL`; historical plan views and `generate_shopping_list` intentionally read soft-deleted rows). Policies express authorization only.
- `INSERT`: any authenticated family member, `WITH CHECK (created_by_user_id = auth.uid())`.
- `UPDATE`: any authenticated family member (explicit family-trust decision: anyone may edit shared family content); `created_by_user_id` is frozen by the attribution-immutability trigger (§4.1).
- `DELETE`: nobody — soft delete only (`UPDATE … SET deleted_at`); hard delete reserved for admins doing data-hygiene corrections.

**Shape A2 — content junctions:** `recipe_ingredient`, `recipe_combination_recipe`, all tag/category junction tables. Same as A1 but **without** the attribution `WITH CHECK` — these tables have composite keys and no `created_by_user_id` column, so an attribution predicate would reference a nonexistent column. Read/write for any authenticated family member; rows live and die with their parent entities (`ON DELETE CASCADE`).

**Shape B — household-visibility tables:** `meal_plan`, `meal_plan_assignment`, `meal_plan_portion_requirement`, `meal_plan_household`.
- `SELECT` on `meal_plan`:
  `created_by_household_id = current_household_id() OR EXISTS (SELECT 1 FROM meal_plan_household mph WHERE mph.meal_plan_id = meal_plan.id AND mph.household_id = current_household_id()) OR is_family_admin()`.
  The first disjunct resolves the creation bootstrap (the creator sees the plan before any membership row exists) and makes a membership-less plan degrade to creator-only visibility.
- `SELECT` on child tables: same predicate applied through the parent `meal_plan_id`.
- `INSERT` on `meal_plan`: `WITH CHECK (created_by_household_id = current_household_id())`.
- `INSERT` on `meal_plan_assignment` and `meal_plan_portion_requirement` (explicitly defined — absence would deny all inserts): `WITH CHECK` that the parent plan's `created_by_household_id = current_household_id() OR is_family_admin()`. Membership alone does **not** grant insert — shared households are read-only in v1.
- `UPDATE` / soft-delete on `meal_plan` and children: creating household's members or `is_family_admin()`. Members of merely-shared households read but do not edit (v1 rule; per-plan edit grants are a future enhancement).
- `INSERT` on `meal_plan_household` (sharing): creating household or family admin, verified via a predicate on the parent plan's `created_by_household_id` (readable by the creator per the SELECT disjunct above — no circularity).
- `DELETE` on `meal_plan_household` (unsharing): creating household or family admin, `USING` clause additionally excludes the row whose `household_id` equals the parent plan's `created_by_household_id` — the creating household's membership is irremovable at the policy level.

**Shape C — admin vocabularies:** `category`, `tag`, `portion_category`, `unit`, `family_settings`, `household`.
- `SELECT`: any authenticated family member.
- `INSERT` / `UPDATE` / deactivation: `is_family_admin()` only.

**Audit tables:** RLS enabled; **no user-facing read or write policies except `SELECT` for `is_family_admin()`**. Rows are written exclusively by `SECURITY DEFINER` trigger functions on `meal_plan`, `recipe`, `family_settings`, `portion_category` (who, when, before/after) — users cannot skip or read around them. Audit rows contain private-plan before/after images, which is precisely why non-admin read must be denied.

**Realtime:** Supabase Realtime authorization must equal RLS. Because shape B's SELECT policies join to another table (`meal_plan_household`), two hardening requirements apply: (1) `REPLICA IDENTITY FULL` on all `meal_plan*` tables so policy evaluation sees full row images; (2) an integration test verifying the cross-table policy is actually enforced on the Realtime path — including the **unshare cutoff** (a household stops receiving events immediately after its membership row is deleted). If platform limitations prevent reliable enforcement of the joined policy on Realtime, fall back to notify-then-refetch (events carry only ids; clients refetch through ordinary RLS-filtered queries) rather than trusting channel filters.

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

This document is ready for incorporation into the full Product PRD. Feedback, clarifications, and revisions based on the finalized system architecture are expected and welcomed.
