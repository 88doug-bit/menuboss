# Database Product Requirements Document (PRD)
## Recipe & Meal Planning Application

**Document Version:** 0.3 (Final Refinement)  
**Date:** July 14, 2026  
**Status:** Draft for Review  
**Author:** Grok (iterative development with user)  
**Changes in v0.3:** Added `food_safety_profile` (JSONB on Ingredient) supporting FDA ratings (e.g., mercury categories), risk levels, and consumption frequency recommendations. Minor updates to Ingredient description, JSONB examples, Extensibility, and Future Considerations.  
**Intended Audience:** LLM assistant that will assist in developing the full Product PRD and related implementation specifications.

> **Critical Note to Reader (LLM):**  
> This document defines only the **database layer**. It is explicitly intended to be incorporated into the comprehensive Product PRD for the web-based application (React PWA frontend + Node/TypeScript backend + Supabase/PostgreSQL).  
> **Revisions to this Database PRD are expected** once the final system architecture, authentication model, API contracts, responsibility split between frontend/backend, and hosting details are defined. Some design decisions (particularly around JSONB shapes, exact RLS policies, and relationship cardinalities) may need adjustment based on that broader architecture.

---

## 1. Overview and Purpose

This Database PRD specifies the data model required to support a recipe and meal planning application for a single family consisting of three households. The system must handle frequent shared meals across households as well as private household-specific plans, while providing highly extensible classification and nuanced portion scaling focused initially on protein.

The database design prioritizes:
- Queryability for meal planning aggregates (shopping lists, nutrition roll-ups, calendar views).
- Extensibility of categories, tags, and portion profiles without schema migrations.
- Clean support for shared vs. private meal plans via household visibility controls.
- A hybrid relational + JSONB model that balances structure with flexibility.

## 2. Scope

**In Scope (Database Layer):**
- Core entities, fields, relationships, and constraints.
- Hierarchical taxonomy for nutrition/food categories.
- Flexible tagging system.
- Detailed design for Portion Categories with age, sex, and athlete dimensions (protein-only in v1).
- MealPlan model supporting shared and private household plans.
- Use of JSONB for flexible structures (especially `protein_portions`).
- Extensibility mechanisms and data integrity rules.
- High-level security considerations (RLS implications).

**Out of Scope:**
- Frontend UI/UX, component specifications, or React PWA implementation details.
- Backend API design, business logic implementation, or Node/TypeScript code structure.
- Complete authentication flows and finalized RLS policy definitions (these belong in the system architecture).
- Non-database concerns such as caching strategy, full-text search implementation details, image storage, or deployment.

This document will be merged into the overarching Product PRD.

## 3. Assumptions

The following assumptions reflect the current understanding of the system architecture. These are subject to revision:

- The primary database will be **PostgreSQL** hosted/managed via **Supabase**.
- A **hybrid data model** will be employed: strong relational normalization for core entities (Ingredients, Recipes, Households, MealPlans, PortionCategories) combined with strategic **JSONB** columns for flexible, evolving structures (e.g., `protein_portions`, per-plan metadata, and future full-meal scaling fields).
- The application serves **one family** that consists of **three distinct households**. Meal plans can be designated as shared (visible and usable by multiple households) or private to a single household. The calendar frontend will clearly flag this distinction.
- **Row Level Security (RLS)** policies in Supabase/Postgres will be the primary mechanism for enforcing household-level data isolation while enabling controlled sharing of meal plans.
- The **React PWA frontend** and **Node/TypeScript backend** will interact with the database using the Supabase JavaScript client library and/or custom API endpoints provided by the backend. Some calculations (e.g., effective protein needs) may be performed server-side or via database functions/views for consistency and security.
- Portion scaling is **protein-only in the initial version**, with a clear extension path for full-recipe or multi-macro scaling later.
- The full system architecture — including detailed authentication model, exact API surface, responsibility split between frontend and backend (or Edge Functions), and any additional Supabase feature usage — **has not yet been finalized**. Therefore, certain implementation details in this PRD (particularly JSONB shapes, RLS policy outlines, and some relationship cardinalities) may require revision once the Product Architecture and full PRD are complete.
- Data volume and concurrency are modest (single family, low number of concurrent users), but the model must efficiently support aggregation queries required for shopping list generation and nutrition summaries across shared and private plans.

## 4. Core Entities and Data Model

### 4.1 Primary Entities

**Household**  
Represents one of the three households within the family.  
Key fields: `id` (UUID), `name`, `family_id` (logical grouping), `created_at`, `updated_at`, `is_active`.  
Relationships: Users belong to one Household. MealPlans can be visible to one or more Households.

**User / Profile**  
Linked to Supabase Auth user.  
Key fields: `id`, `household_id`, `display_name`, `role` (e.g., admin, member), `created_at`.  
RLS policies will heavily reference this entity.

**Ingredient**  
Master data for food items used in recipes.  
Key fields: `id`, `name`, `description`, `default_unit_id`, `nutrition_data` (JSONB or normalized), `food_safety_profile` (JSONB — see section 4.2 for structure supporting FDA ratings, mercury risk, frequency recommendations, etc.), `is_user_added`, `created_at`.  
Relationships: Many-to-many with Categories (nutrition taxonomy) via junction table. Many-to-many with Recipes via `RecipeIngredient`.

**Recipe**  
Core content entity describing how to prepare a dish or component.  
Key fields: `id`, `title`, `description`, `instructions` (structured JSON or rich text), `prep_time_minutes`, `cook_time_minutes`, `total_time_minutes`, `yield_servings`, `source_url` or `source_book`, `created_by_user_id`, `is_template` (for component recipes), `make_again_rating` (SMALLINT 1-5, nullable — chef's overall opinion on the recipe), `created_at`, `updated_at`.  
Relationships: Has many `RecipeIngredient`. Many-to-many with Tags and Categories. Supports `leftover_decay_path` JSONB (see 4.2).

**RecipeIngredient** (Junction)  
Associates an Ingredient with a Recipe.  
Key fields: `id`, `recipe_id`, `ingredient_id`, `quantity`, `unit_id`, `preparation_note`, `sequence_order`, `is_optional`, `created_at`.

**Category** (Self-referential / Hierarchical)  
Supports deep, extensible taxonomies (primarily nutrition/food groups, with potential for dish form or other hierarchies).  
Key fields: `id`, `name`, `slug`, `parent_id` (nullable), `category_type` (e.g., 'nutrition', 'dish_form'), `level`, `path` (materialized or via ltree extension), `sort_order`, `description`, `is_active`, `created_at`.  
Example hierarchy: Protein > Seafood > Fin Fish > Salmon; or Starch > Grains > Rice.

**Tag**  
Flexible, mostly flat attributes for recipes and ingredients.  
Key fields: `id`, `name`, `slug`, `tag_group` (e.g., 'applicable_meal', 'preparation_method', 'dietary_restriction', 'cuisine', 'difficulty'), `description`, `color` or `icon` (for UI), `is_active`.  
Relationships: Many-to-many with Recipes and Ingredients via junction tables.

**PortionCategory**  
Lookup table defining the age/sex/athlete-based protein portion profiles. Fully editable by family administrators.  
Key fields: `id`, `name` (e.g., "Adolescent Male Over 15"), `slug`, `base_protein_oz`, `description`, `sort_order`, `is_active`, `created_at`, `updated_at`.  
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
Key fields: `id`, `adult_reference_protein_oz` (default 6.0), `athlete_multiplier` (default 1.5 or family-chosen value), `other_global_defaults` (JSONB for future expansion), `updated_at`.

**MealPlan**  
Represents a planned meal or set of meals (supports both single-date and multi-day plans).  
Key fields: `id`, `title`, `description`, `plan_date` or `start_date`/`end_date`, `is_shared` (boolean), `visible_to_households` (JSONB array of household IDs or junction table), `created_by_household_id`, `created_by_user_id`, `created_at`, `updated_at`.  
**`protein_portions` JSONB column** — see section 4.2.  
Relationships: Has many `MealPlanAssignment`.

**MealPlanAssignment**  
Links a specific Recipe to a slot within a MealPlan.  
Key fields: `id`, `meal_plan_id`, `recipe_id`, `assignment_date`, `meal_slot` (e.g., 'breakfast', 'lunch', 'dinner', 'snack'), `servings`, `notes`, `created_at`.  
May optionally override or reference plan-level `protein_portions` for fine-grained control.

**RecipeCombination** (New in v0.2)  
Represents a logical grouping of multiple recipes that are served together as one complete meal (e.g., main + sides + dessert or appetizer). This is the "meals object" for tagging/combining recipes that work well together.  
Key fields: `id`, `name` (e.g., "Greek-Inspired Sunday Dinner"), `notes` (free-text comments on the combination, pairing rationale, timing, etc.), `make_again_rating` (SMALLINT 1-5, nullable — chef's opinion on the overall meal experience), `served_date` or link to MealPlan, `is_template`, `created_by_user_id`, `created_at`, `updated_at`.  
Relationships: Junction table `RecipeCombinationRecipe` (`recipe_combination_id`, `recipe_id`, `role_in_meal` e.g. 'main'/'side'/'dessert', `sequence_order`, `notes`).

**ChefIdea** (New in v0.2)  
Captures "recipes to pursue" or inspiration items before they become full recipes. Can be tagged using the existing Category and Tag system (e.g., "Pork Shoulder Roast Recipe from Greek Islands — try this" tagged with Protein > Pork, Cuisine: Greek/Mediterranean).  
Key fields: `id`, `title`, `description` / `notes` (rich text or markdown), `source` (free text, URL, book, or person), `status` (idea / researching / tested / adopted / abandoned), `priority`, `created_at`, `updated_at`.  
Relationships: Many-to-many with Categories and Tags (via junction tables). Optional link to a `Recipe` if/when the idea is developed into a saved recipe.

**Leftover Decay Path** (New in v0.2)  
Structured "daughter element decay path" for leftovers from a recipe or ingredient. Stored as JSONB on the `Recipe` table (or optionally on Ingredient for base items). Supports creative repurposing ideas (e.g., pork shoulder leftovers → Cuban sandwiches, Bolognese sauce base, enchiladas, fried rice).  
See example in section 4.2.

### 4.2 Key JSONB Structures

**protein_portions** (stored on `MealPlan` and optionally overridable on `MealPlanAssignment`):

```json
{
  "adult_male": {
    "count": 2,
    "athlete": false
  },
  "adult_female": {
    "count": 1,
    "athlete": true
  },
  "adolescent_male_over_15": {
    "count": 1,
    "athlete": true
  },
  "adolescent_female_over_15": {
    "count": 0,
    "athlete": false
  },
  "child": {
    "count": 2,
    "athlete": false
  },
  "senior_male": {
    "count": 0,
    "athlete": false
  }
}
```

This structure directly supports the required nuance (sex, adolescent age split, athlete status) while remaining fully extensible. New categories can be added by extending the `PortionCategory` lookup and using new keys in the JSONB.

Alternative (more normalized) approach for future consideration: Replace or supplement the JSONB with a `MealPlanPortionRequirement` junction table (`meal_plan_id`, `portion_category_id`, `count`, `is_athlete`).

**Rationale for JSONB preference (v1):** Maximum flexibility with zero schema changes when adding new portion profiles or later expanding to full-meal scaling fields (e.g., adding `"full_meal_multiplier"` or per-macro objects).

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
- Hierarchical categories support unlimited depth using `parent_id` + recursive CTEs (or Postgres `ltree` extension for path queries).
- JSONB columns are used precisely for structures expected to evolve (`protein_portions`, future full-meal scaling, per-plan metadata).
- New dimensions (e.g., additional age bands, custom athlete levels, or per-ingredient portion overrides) can be introduced by extending the relevant lookup tables and JSONB shapes.
- `RecipeCombination`, `ChefIdea`, and `leftover_decay_path` are designed to be extensible via existing Category/Tag relationships and JSONB, allowing the family to capture meal combinations, inspiration, and creative leftover uses without schema changes.
- `food_safety_profile` on Ingredient uses JSONB to support evolving FDA/EPA-style guidance, multiple contaminants, and population-specific recommendations (e.g., pregnant women, children, seniors) while keeping the core model simple.

## 6. Data Integrity, Constraints, and Indexing

- Foreign key constraints on all relationships (with appropriate `ON DELETE` behavior).
- Unique constraints on natural keys where relevant (e.g., ingredient name within context).
- Check constraints on numeric fields (`quantity > 0`, `counts >= 0`, `times >= 0`).
- GIN indexes on all JSONB columns (`protein_portions`, `visible_to_households`, etc.) to support efficient filtering and aggregation.
- Full-text search indexes (via generated tsvector columns or triggers) on `Recipe.title`, `Recipe.description`, and ingredient names.
- Soft-delete pattern (`deleted_at` timestamp) on most user-facing entities to preserve historical meal plans and recipes.
- Database functions or views recommended for common calculations (effective protein needs per plan, aggregated shopping lists).

## 7. Security and Access Control

- **Row Level Security (RLS)** policies (to be detailed in the system architecture phase) will enforce:
  - A user can only read/write data belonging to their own household unless the data is explicitly shared via `MealPlan.is_shared` / `visible_to_households`.
  - Shared meal plans are visible to all listed households but editing rights may be restricted to the creating household or family admins.
- Integration with Supabase Auth for user identity and session management.
- Family-level administrator role(s) for managing global `FamilySettings`, `PortionCategory`, and core taxonomy entries.
- Audit logging (via triggers or Supabase features) on sensitive changes to recipes, meal plans, and settings is recommended.

## 8. Open Items and Future Considerations

- Exact implementation and responsibility for **full-meal scaling** (beyond protein-only) — to be defined when that capability is prioritized in the product roadmap.
- Final decision between JSONB (`protein_portions`) vs. a normalized `MealPlanPortionRequirement` junction table (JSONB currently favored for v1 flexibility; normalized option remains viable).
- Detailed RLS policy definitions and complete authentication/authorization model (pending final system architecture).
- Integration strategy with potential AI-assisted features (recipe generation, intelligent meal suggestions, substitution recommendations) — the data model should expose clean, queryable structures for such systems.
- Performance validation of aggregation queries (shopping lists, weekly nutrition summaries) once realistic data volumes and query patterns are known.
- Potential addition of `PantryStock` / inventory tracking for advanced meal planning and waste reduction features.
- Maturation of the new v0.2 entities: `RecipeCombination` (grouping recipes into complete meals with notes + 1-5 make-again rating), `ChefIdea` (tagged inspiration / recipes-to-pursue list), and `leftover_decay_path` (structured "daughter element" repurposing ideas). These may evolve from their current JSONB/junction implementations to more normalized structures or gain richer linking (e.g., ChefIdea → eventual Recipe, decay paths linked to specific ingredients) as real usage patterns are observed.
- Evolution of `food_safety_profile` on Ingredient — current JSONB approach supports FDA mercury categories and frequency recommendations. Future work may include a dedicated `FoodSafetyAttribute` lookup/junction system for broader contaminants and automated guidance based on user profile (age, pregnancy status, etc.).

---

**End of Database PRD v0.3**

This document is ready for incorporation into the full Product PRD. Feedback, clarifications, and revisions based on the finalized system architecture are expected and welcomed.