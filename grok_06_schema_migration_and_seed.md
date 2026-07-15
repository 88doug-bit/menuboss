# Brief for Grok — Task 06: Schema migration `0001_schema.sql` + seed data

**Context:** Phase 1 implementation of MenuBoss. You are generating the foundational Postgres (Supabase) migration and seed data from the ratified Database PRD.

**Attachment required:** `Recipe_Meal_Planning_Database_PRD_v0.4.md` (the schema source of truth — follow §4.1, §4.2, §6 exactly, including the coordinator-authored DDL blocks for `meal_plan_household`, `meal_plan_portion_requirement`, and `unit`, which you must reproduce verbatim).

**Output:** one markdown file, saved by the user as `drafts/grok_out_schema_migration.md`, containing repo files as `### FILE: <repo-relative-path>` headers each followed by one fenced code block (leading `## NOTES` block allowed; no other prose).

## Files to produce

### FILE: supabase/migrations/0001_schema.sql
- ALL tables from DB PRD v0.4 §4.1: `household`, `profile`, `ingredient`, `recipe`, `recipe_ingredient`, `category`, `tag`, junction tables (recipe/ingredient × category/tag, `recipe_combination_recipe`, chef_idea × category/tag), `portion_category`, `family_settings`, `meal_plan`, `meal_plan_assignment`, `meal_plan_household`, `meal_plan_portion_requirement`, `recipe_combination`, `chef_idea`, `unit`.
- snake_case; UUID PKs (`gen_random_uuid()`); `created_at`/`updated_at timestamptz NOT NULL DEFAULT now()`; soft-delete `deleted_at timestamptz` on user-facing content entities per §6.
- All FK constraints with the `ON DELETE` behaviors stated in the PRD (`RESTRICT` on `portion_category`/`household` references, `CASCADE` on children of meal_plan and content junctions).
- All CHECK constraints from the PRD (`quantity > 0`, `count >= 0`, `athlete_count <= count`, `make_again_rating BETWEEN 1 AND 5`, `unit.dimension IN ('mass','volume','count')`, `factor_to_base > 0`, times `>= 0`).
- Indexes per §6 (index-by-query-pattern): FK indexes on all junctions, `meal_plan (start_date, end_date)`, `meal_plan_assignment (assignment_date)`, `idx_mph_household`, generated tsvector columns + GIN on `recipe (title, description)` and `ingredient (name)`, and `CREATE UNIQUE INDEX uq_ingredient_name ON ingredient (lower(name)) WHERE deleted_at IS NULL;`. Comment each index with the query it serves.
- **EXCLUDE:** RLS enables/policies, security triggers, audit tables, helper functions, and the aggregation functions — those live in `0002_security.sql` (coordinator) and `0003_functions.sql` (Task 09). Plain `CREATE TABLE`/`CREATE INDEX` only, plus a generic `updated_at` touch trigger is allowed.
- Category has NO `level`/`path` columns (parent_id + recursive CTEs). FamilySettings has NO `adult_reference_protein_oz`.

### FILE: supabase/seed.sql
- `unit` rows: g (base, mass), kg, oz, lb; ml (base, volume), l, tsp, tbsp, cup, fl_oz; each (base, count), dozen, clove, head — with correct `factor_to_base` values.
- `portion_category` rows: the nine from PRD §4.1 with sensible `base_protein_oz` (Adult Male 6.0 reference; scale others reasonably, e.g. Child 3.0, Adolescent Male Over 15 6.0, Senior 4.5–5.0) and `sort_order`.
- `family_settings` single row: `athlete_multiplier` 1.5, empty `other_global_defaults`.
- Starter `category` taxonomy (Protein > Seafood/Poultry/Pork/Beef; Starch > Grains/Potatoes; Vegetable; Fruit; Dairy) and starter `tag` rows per `tag_group` (applicable_meal, cuisine, preparation_method, dietary_restriction, difficulty).
- Test fixtures (guarded so they can be excluded in production): 3 households (A, B, C), and 5 personas matching the RLS matrix (member_a, member_b, member_c, admin_a — profiles referencing deterministic UUIDs; anon needs no row). Use fixed UUIDs (e.g., '00000000-0000-0000-0000-0000000000a1') so pgTAP tests can reference them.

## Constraints
- Must apply cleanly on empty Postgres 15 with `pgcrypto`/`pg_trgm` available; add required `CREATE EXTENSION IF NOT EXISTS` lines.
- Deterministic and idempotent seed (use fixed UUIDs + `ON CONFLICT DO NOTHING`).
- Where the PRD is silent on a column detail, choose the conservative option and flag it in `## NOTES`.
