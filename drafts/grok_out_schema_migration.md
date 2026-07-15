## NOTES

Conservative choices where PRD §4.1 / §6 is silent or only partial:

1. **No FK to `auth.users`:** `profile.id` is a plain UUID PK (no `REFERENCES auth.users`). Empty Postgres 15 must apply cleanly without the Supabase `auth` schema; app/auth hooks own id equality with Auth users (0002 territory).
2. **`profile.updated_at`:** PRD lists only `created_at`; added `updated_at` for consistency with the global touch-trigger pattern.
3. **`meal_plan.deleted_at`:** Soft-delete on Shape B is implied by §7; added `deleted_at` on `meal_plan` (not only A1 content tables). Assignments / portion rows remain hard children (CASCADE).
4. **`recipe.instructions`:** Stored as `jsonb` (structured steps) rather than free text.
5. **Source fields:** Both `source_url` and `source_book` on `recipe` (PRD says "or"); both nullable.
6. **`recipe_combination`:** Both `served_date` and optional `meal_plan_id` (PRD says "or"); both nullable.
7. **`chef_idea`:** Single free-text `notes` (covers "description / notes"); optional `linked_recipe_id` for adoption path; `status` CHECK enum; `priority` nullable integer.
8. **Junction PKs:** Composite natural keys for tag/category junctions and `recipe_combination_recipe` (no surrogate id). `recipe_ingredient` keeps surrogate `id` per PRD key fields.
9. **Slug uniqueness:** `category.slug` UNIQUE; `tag` UNIQUE on `(tag_group, slug)` so groups can reuse short slugs.
10. **`portion_category.slug` UNIQUE** for stable seed/admin keys.
11. **`household.family_id`:** `text` informational grouping (single-family deploy); not used by RLS.
12. **`profile.role`:** CHECK `IN ('admin','member')` only.
13. **Time / servings CHECKs:** `prep/cook/total_time_minutes >= 0`; `yield_servings > 0`; assignment `servings > 0`; `meal_plan` `end_date >= start_date`.
14. **Content FK deletes:** Content-parent side of junctions CASCADE; vocabulary (category/tag), household, unit, portion_category RESTRICT; `created_by_user_id` → `profile` ON DELETE RESTRICT; coordinator `added_by_user_id` on mph left without ON DELETE (default NO ACTION).
15. **Assignment-date range triggers excluded** (coordinator 0002). **Attribution immutability excluded** (0002).
16. **`pg_trgm` not installed** — FTS uses generated `tsvector` + GIN only; pgcrypto alone for `gen_random_uuid()`.
17. **Seed production guard:** Test households/profiles wrapped in `-- >>> BEGIN TEST FIXTURES` / `-- <<< END TEST FIXTURES` markers (strip or skip in production seed runs).
18. **Seed UUIDs:** Fixed nil-style UUIDs `00000000-0000-4000-8000-…` for deterministic pgTAP matrix references.
19. **Family settings singleton:** No DB singleton constraint; seed inserts one fixed-id row. Enforce single-row in app/admin UI.
20. **Unit seed names:** Full names (`gram`, `ounce`, …) with abbreviations matching PRD examples; factors per PRD comments and standard SI culinary conversion.

### FILE: supabase/migrations/0001_schema.sql
```sql
-- MenuBoss 0001_schema.sql
-- Tables, constraints, indexes, generic updated_at trigger only.
-- EXCLUDES: RLS, security/audit triggers, aggregation functions (0002 / 0003).

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------------
-- Generic updated_at touch (allowed in 0001)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

-- ===========================================================================
-- Lookup / config
-- ===========================================================================

-- Unit (coordinator DDL — VERBATIM)
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

CREATE TRIGGER trg_unit_updated_at
  BEFORE UPDATE ON unit
  FOR EACH ROW EXECUTE PROCEDURE set_updated_at();

CREATE TABLE portion_category (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name             text NOT NULL,
  slug             text NOT NULL UNIQUE,
  base_protein_oz  numeric NOT NULL CHECK (base_protein_oz > 0),
  description      text,
  sort_order       integer NOT NULL DEFAULT 0,
  is_active        boolean NOT NULL DEFAULT true,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_portion_category_updated_at
  BEFORE UPDATE ON portion_category
  FOR EACH ROW EXECUTE PROCEDURE set_updated_at();

CREATE TABLE family_settings (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_multiplier    numeric NOT NULL DEFAULT 1.5 CHECK (athlete_multiplier > 0),
  other_global_defaults jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_family_settings_updated_at
  BEFORE UPDATE ON family_settings
  FOR EACH ROW EXECUTE PROCEDURE set_updated_at();

-- ===========================================================================
-- Identity / household
-- ===========================================================================

CREATE TABLE household (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,
  family_id  text NOT NULL DEFAULT 'default',
  is_active  boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_household_updated_at
  BEFORE UPDATE ON household
  FOR EACH ROW EXECUTE PROCEDURE set_updated_at();

CREATE TABLE profile (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id  uuid NOT NULL REFERENCES household(id) ON DELETE RESTRICT,
  display_name  text NOT NULL,
  role          text NOT NULL DEFAULT 'member'
                  CHECK (role IN ('admin', 'member')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_profile_household_id
  ON profile (household_id);
COMMENT ON INDEX idx_profile_household_id IS
  'Serves: household membership lookups; current_household_id() / admin scans by household.';

CREATE TRIGGER trg_profile_updated_at
  BEFORE UPDATE ON profile
  FOR EACH ROW EXECUTE PROCEDURE set_updated_at();

-- ===========================================================================
-- Taxonomy
-- ===========================================================================

CREATE TABLE category (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,
  slug          text NOT NULL UNIQUE,
  parent_id     uuid REFERENCES category(id) ON DELETE RESTRICT,
  category_type text NOT NULL DEFAULT 'nutrition',
  sort_order    integer NOT NULL DEFAULT 0,
  description   text,
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_category_parent_id
  ON category (parent_id);
COMMENT ON INDEX idx_category_parent_id IS
  'Serves: recursive CTE child walks and taxonomy tree loads by parent.';

CREATE TRIGGER trg_category_updated_at
  BEFORE UPDATE ON category
  FOR EACH ROW EXECUTE PROCEDURE set_updated_at();

CREATE TABLE tag (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  slug        text NOT NULL,
  tag_group   text NOT NULL,
  description text,
  color       text,
  icon        text,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tag_group, slug)
);

CREATE INDEX idx_tag_tag_group
  ON tag (tag_group);
COMMENT ON INDEX idx_tag_tag_group IS
  'Serves: filter tags by group (cuisine, dietary_restriction, etc.) in admin and pickers.';

CREATE TRIGGER trg_tag_updated_at
  BEFORE UPDATE ON tag
  FOR EACH ROW EXECUTE PROCEDURE set_updated_at();

-- ===========================================================================
-- Content: ingredient, recipe
-- ===========================================================================

CREATE TABLE ingredient (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                text NOT NULL,
  description         text,
  default_unit_id     uuid REFERENCES unit(id) ON DELETE RESTRICT,
  nutrition_data      jsonb NOT NULL DEFAULT '{}'::jsonb,
  food_safety_profile jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_user_added       boolean NOT NULL DEFAULT false,
  created_by_user_id  uuid REFERENCES profile(id) ON DELETE RESTRICT,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  deleted_at          timestamptz,
  search_vector       tsvector GENERATED ALWAYS AS (
                        to_tsvector('english', coalesce(name, ''))
                      ) STORED
);

CREATE UNIQUE INDEX uq_ingredient_name
  ON ingredient (lower(name))
  WHERE deleted_at IS NULL;
COMMENT ON INDEX uq_ingredient_name IS
  'Serves: case-insensitive duplicate-prevention for live ingredients (soft-deleted names reusable).';

CREATE INDEX idx_ingredient_search_vector
  ON ingredient USING gin (search_vector);
COMMENT ON INDEX idx_ingredient_search_vector IS
  'Serves: full-text search on ingredient name.';

CREATE INDEX idx_ingredient_default_unit_id
  ON ingredient (default_unit_id);
COMMENT ON INDEX idx_ingredient_default_unit_id IS
  'Serves: FK support / unit usage checks when deactivating units.';

CREATE INDEX idx_ingredient_created_by_user_id
  ON ingredient (created_by_user_id);
COMMENT ON INDEX idx_ingredient_created_by_user_id IS
  'Serves: attribution filters and creator listings.';

CREATE TRIGGER trg_ingredient_updated_at
  BEFORE UPDATE ON ingredient
  FOR EACH ROW EXECUTE PROCEDURE set_updated_at();

CREATE TABLE recipe (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title               text NOT NULL,
  description         text,
  instructions        jsonb NOT NULL DEFAULT '[]'::jsonb,
  prep_time_minutes   integer CHECK (prep_time_minutes IS NULL OR prep_time_minutes >= 0),
  cook_time_minutes   integer CHECK (cook_time_minutes IS NULL OR cook_time_minutes >= 0),
  total_time_minutes  integer CHECK (total_time_minutes IS NULL OR total_time_minutes >= 0),
  yield_servings      numeric NOT NULL DEFAULT 1 CHECK (yield_servings > 0),
  source_url          text,
  source_book         text,
  created_by_user_id  uuid REFERENCES profile(id) ON DELETE RESTRICT,
  is_template         boolean NOT NULL DEFAULT false,
  make_again_rating   smallint CHECK (make_again_rating IS NULL OR make_again_rating BETWEEN 1 AND 5),
  leftover_decay_path jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  deleted_at          timestamptz,
  search_vector       tsvector GENERATED ALWAYS AS (
                        setweight(to_tsvector('english', coalesce(title, '')), 'A')
                        || setweight(to_tsvector('english', coalesce(description, '')), 'B')
                      ) STORED
);

CREATE INDEX idx_recipe_search_vector
  ON recipe USING gin (search_vector);
COMMENT ON INDEX idx_recipe_search_vector IS
  'Serves: full-text search on recipe title and description.';

CREATE INDEX idx_recipe_created_by_user_id
  ON recipe (created_by_user_id);
COMMENT ON INDEX idx_recipe_created_by_user_id IS
  'Serves: attribution filters and creator listings.';

CREATE TRIGGER trg_recipe_updated_at
  BEFORE UPDATE ON recipe
  FOR EACH ROW EXECUTE PROCEDURE set_updated_at();

CREATE TABLE recipe_ingredient (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id         uuid NOT NULL REFERENCES recipe(id) ON DELETE CASCADE,
  ingredient_id     uuid NOT NULL REFERENCES ingredient(id) ON DELETE RESTRICT,
  quantity          numeric NOT NULL CHECK (quantity > 0),
  unit_id           uuid NOT NULL REFERENCES unit(id) ON DELETE RESTRICT,
  preparation_note  text,
  sequence_order    integer NOT NULL DEFAULT 0,
  is_optional       boolean NOT NULL DEFAULT false,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_recipe_ingredient_recipe_id
  ON recipe_ingredient (recipe_id);
COMMENT ON INDEX idx_recipe_ingredient_recipe_id IS
  'Serves: load ingredient lines for a recipe; shopping-list join from recipe.';

CREATE INDEX idx_recipe_ingredient_ingredient_id
  ON recipe_ingredient (ingredient_id);
COMMENT ON INDEX idx_recipe_ingredient_ingredient_id IS
  'Serves: reverse lookup — recipes using an ingredient; FK support.';

CREATE INDEX idx_recipe_ingredient_unit_id
  ON recipe_ingredient (unit_id);
COMMENT ON INDEX idx_recipe_ingredient_unit_id IS
  'Serves: FK support / unit usage when deactivating units.';

-- ===========================================================================
-- Content junctions (category / tag)
-- ===========================================================================

CREATE TABLE recipe_category (
  recipe_id    uuid NOT NULL REFERENCES recipe(id) ON DELETE CASCADE,
  category_id  uuid NOT NULL REFERENCES category(id) ON DELETE RESTRICT,
  created_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (recipe_id, category_id)
);

CREATE INDEX idx_recipe_category_category_id
  ON recipe_category (category_id);
COMMENT ON INDEX idx_recipe_category_category_id IS
  'Serves: list recipes in a category; FK support.';

CREATE TABLE recipe_tag (
  recipe_id   uuid NOT NULL REFERENCES recipe(id) ON DELETE CASCADE,
  tag_id      uuid NOT NULL REFERENCES tag(id) ON DELETE RESTRICT,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (recipe_id, tag_id)
);

CREATE INDEX idx_recipe_tag_tag_id
  ON recipe_tag (tag_id);
COMMENT ON INDEX idx_recipe_tag_tag_id IS
  'Serves: list recipes with a tag; FK support.';

CREATE TABLE ingredient_category (
  ingredient_id  uuid NOT NULL REFERENCES ingredient(id) ON DELETE CASCADE,
  category_id    uuid NOT NULL REFERENCES category(id) ON DELETE RESTRICT,
  created_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (ingredient_id, category_id)
);

CREATE INDEX idx_ingredient_category_category_id
  ON ingredient_category (category_id);
COMMENT ON INDEX idx_ingredient_category_category_id IS
  'Serves: shopping-list top-level category grouping; list ingredients by category.';

CREATE TABLE ingredient_tag (
  ingredient_id  uuid NOT NULL REFERENCES ingredient(id) ON DELETE CASCADE,
  tag_id         uuid NOT NULL REFERENCES tag(id) ON DELETE RESTRICT,
  created_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (ingredient_id, tag_id)
);

CREATE INDEX idx_ingredient_tag_tag_id
  ON ingredient_tag (tag_id);
COMMENT ON INDEX idx_ingredient_tag_tag_id IS
  'Serves: list ingredients with a tag; FK support.';

-- ===========================================================================
-- Recipe combinations
-- ===========================================================================

CREATE TABLE recipe_combination (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                text NOT NULL,
  notes               text,
  make_again_rating   smallint CHECK (make_again_rating IS NULL OR make_again_rating BETWEEN 1 AND 5),
  served_date         date,
  meal_plan_id        uuid, -- FK added after meal_plan exists
  is_template         boolean NOT NULL DEFAULT false,
  created_by_user_id  uuid REFERENCES profile(id) ON DELETE RESTRICT,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  deleted_at          timestamptz
);

CREATE INDEX idx_recipe_combination_created_by_user_id
  ON recipe_combination (created_by_user_id);
COMMENT ON INDEX idx_recipe_combination_created_by_user_id IS
  'Serves: attribution filters and creator listings.';

CREATE TRIGGER trg_recipe_combination_updated_at
  BEFORE UPDATE ON recipe_combination
  FOR EACH ROW EXECUTE PROCEDURE set_updated_at();

CREATE TABLE recipe_combination_recipe (
  recipe_combination_id  uuid NOT NULL REFERENCES recipe_combination(id) ON DELETE CASCADE,
  recipe_id              uuid NOT NULL REFERENCES recipe(id) ON DELETE RESTRICT,
  role_in_meal           text,
  sequence_order         integer NOT NULL DEFAULT 0,
  notes                  text,
  created_at             timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (recipe_combination_id, recipe_id)
);

CREATE INDEX idx_recipe_combination_recipe_recipe_id
  ON recipe_combination_recipe (recipe_id);
COMMENT ON INDEX idx_recipe_combination_recipe_recipe_id IS
  'Serves: reverse lookup — combinations containing a recipe; FK support.';

-- ===========================================================================
-- Chef ideas
-- ===========================================================================

CREATE TABLE chef_idea (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title               text NOT NULL,
  notes               text,
  source              text,
  status              text NOT NULL DEFAULT 'idea'
                        CHECK (status IN ('idea', 'researching', 'tested', 'adopted', 'abandoned')),
  priority            integer,
  linked_recipe_id    uuid REFERENCES recipe(id) ON DELETE SET NULL,
  created_by_user_id  uuid REFERENCES profile(id) ON DELETE RESTRICT,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  deleted_at          timestamptz
);

CREATE INDEX idx_chef_idea_created_by_user_id
  ON chef_idea (created_by_user_id);
COMMENT ON INDEX idx_chef_idea_created_by_user_id IS
  'Serves: attribution filters and creator listings.';

CREATE INDEX idx_chef_idea_linked_recipe_id
  ON chef_idea (linked_recipe_id);
COMMENT ON INDEX idx_chef_idea_linked_recipe_id IS
  'Serves: find ideas adopted into a recipe; FK support.';

CREATE INDEX idx_chef_idea_status
  ON chef_idea (status)
  WHERE deleted_at IS NULL;
COMMENT ON INDEX idx_chef_idea_status IS
  'Serves: filter active chef ideas by workflow status.';

CREATE TRIGGER trg_chef_idea_updated_at
  BEFORE UPDATE ON chef_idea
  FOR EACH ROW EXECUTE PROCEDURE set_updated_at();

CREATE TABLE chef_idea_category (
  chef_idea_id  uuid NOT NULL REFERENCES chef_idea(id) ON DELETE CASCADE,
  category_id   uuid NOT NULL REFERENCES category(id) ON DELETE RESTRICT,
  created_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (chef_idea_id, category_id)
);

CREATE INDEX idx_chef_idea_category_category_id
  ON chef_idea_category (category_id);
COMMENT ON INDEX idx_chef_idea_category_category_id IS
  'Serves: list chef ideas in a category; FK support.';

CREATE TABLE chef_idea_tag (
  chef_idea_id  uuid NOT NULL REFERENCES chef_idea(id) ON DELETE CASCADE,
  tag_id        uuid NOT NULL REFERENCES tag(id) ON DELETE RESTRICT,
  created_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (chef_idea_id, tag_id)
);

CREATE INDEX idx_chef_idea_tag_tag_id
  ON chef_idea_tag (tag_id);
COMMENT ON INDEX idx_chef_idea_tag_tag_id IS
  'Serves: list chef ideas with a tag; FK support.';

-- ===========================================================================
-- Meal plans
-- ===========================================================================

CREATE TABLE meal_plan (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title                    text NOT NULL,
  description              text,
  start_date               date NOT NULL,
  end_date                 date NOT NULL,
  created_by_household_id  uuid NOT NULL REFERENCES household(id) ON DELETE RESTRICT,
  created_by_user_id       uuid NOT NULL REFERENCES profile(id) ON DELETE RESTRICT,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),
  deleted_at               timestamptz,
  CONSTRAINT meal_plan_date_range CHECK (end_date >= start_date)
);

CREATE INDEX idx_meal_plan_start_end
  ON meal_plan (start_date, end_date);
COMMENT ON INDEX idx_meal_plan_start_end IS
  'Serves: plan-window and calendar range queries.';

CREATE INDEX idx_meal_plan_created_by_household_id
  ON meal_plan (created_by_household_id);
COMMENT ON INDEX idx_meal_plan_created_by_household_id IS
  'Serves: RLS creator-household disjunct; list plans owned by a household.';

CREATE INDEX idx_meal_plan_created_by_user_id
  ON meal_plan (created_by_user_id);
COMMENT ON INDEX idx_meal_plan_created_by_user_id IS
  'Serves: attribution filters and creator listings.';

CREATE TRIGGER trg_meal_plan_updated_at
  BEFORE UPDATE ON meal_plan
  FOR EACH ROW EXECUTE PROCEDURE set_updated_at();

-- Deferred FK from recipe_combination.meal_plan_id
ALTER TABLE recipe_combination
  ADD CONSTRAINT recipe_combination_meal_plan_id_fkey
  FOREIGN KEY (meal_plan_id) REFERENCES meal_plan(id) ON DELETE SET NULL;

CREATE INDEX idx_recipe_combination_meal_plan_id
  ON recipe_combination (meal_plan_id);
COMMENT ON INDEX idx_recipe_combination_meal_plan_id IS
  'Serves: combinations linked to a plan; FK support.';

CREATE TABLE meal_plan_assignment (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meal_plan_id     uuid NOT NULL REFERENCES meal_plan(id) ON DELETE CASCADE,
  recipe_id        uuid NOT NULL REFERENCES recipe(id) ON DELETE RESTRICT,
  assignment_date  date NOT NULL,
  meal_slot        text NOT NULL,
  servings         numeric NOT NULL DEFAULT 1 CHECK (servings > 0),
  notes            text,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_meal_plan_assignment_assignment_date
  ON meal_plan_assignment (assignment_date);
COMMENT ON INDEX idx_meal_plan_assignment_assignment_date IS
  'Serves: day-grid and date-filtered assignment fetches.';

CREATE INDEX idx_meal_plan_assignment_plan_date
  ON meal_plan_assignment (meal_plan_id, assignment_date);
COMMENT ON INDEX idx_meal_plan_assignment_plan_date IS
  'Serves: plan-window day-grid fetches for a single plan.';

CREATE INDEX idx_meal_plan_assignment_recipe_id
  ON meal_plan_assignment (recipe_id);
COMMENT ON INDEX idx_meal_plan_assignment_recipe_id IS
  'Serves: reverse lookup — plans using a recipe; shopping-list recipe join support.';

-- MealPlanHousehold (coordinator DDL — VERBATIM)
CREATE TABLE meal_plan_household (
  meal_plan_id      uuid NOT NULL REFERENCES meal_plan(id) ON DELETE CASCADE,
  household_id      uuid NOT NULL REFERENCES household(id) ON DELETE RESTRICT,
  added_by_user_id  uuid REFERENCES profile(id),
  created_at        timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (meal_plan_id, household_id)
);
CREATE INDEX idx_mph_household ON meal_plan_household (household_id);
-- Serves: RLS EXISTS subqueries and "plans visible to my household" calendar queries.

COMMENT ON INDEX idx_mph_household IS
  'Serves: RLS EXISTS subqueries and "plans visible to my household" calendar queries.';

-- MealPlanPortionRequirement (coordinator DDL — VERBATIM)
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

CREATE INDEX idx_mppr_portion_category_id
  ON meal_plan_portion_requirement (portion_category_id);
COMMENT ON INDEX idx_mppr_portion_category_id IS
  'Serves: portion roll-ups and referential checks when deactivating portion categories.';

CREATE TRIGGER trg_meal_plan_portion_requirement_updated_at
  BEFORE UPDATE ON meal_plan_portion_requirement
  FOR EACH ROW EXECUTE PROCEDURE set_updated_at();
```

### FILE: supabase/seed.sql
```sql
-- MenuBoss seed.sql
-- Deterministic, idempotent (fixed UUIDs + ON CONFLICT DO NOTHING).
-- Production: load units / portion_category / family_settings / category / tag only.
-- Strip or skip the TEST FIXTURES section in production environments.

-- ===========================================================================
-- Units (mass base = gram; volume base = milliliter; count base = each)
-- ===========================================================================

INSERT INTO unit (id, name, abbreviation, dimension, factor_to_base, sort_order) VALUES
  ('00000000-0000-4000-8000-000000000101', 'gram',        'g',     'mass',   1,        10),
  ('00000000-0000-4000-8000-000000000102', 'kilogram',    'kg',    'mass',   1000,     20),
  ('00000000-0000-4000-8000-000000000103', 'ounce',       'oz',    'mass',   28.3495,  30),
  ('00000000-0000-4000-8000-000000000104', 'pound',       'lb',    'mass',   453.592,  40),
  ('00000000-0000-4000-8000-000000000111', 'milliliter',  'ml',    'volume', 1,        50),
  ('00000000-0000-4000-8000-000000000112', 'liter',       'l',     'volume', 1000,     60),
  ('00000000-0000-4000-8000-000000000113', 'teaspoon',    'tsp',   'volume', 4.92892,  70),
  ('00000000-0000-4000-8000-000000000114', 'tablespoon',  'tbsp',  'volume', 14.7868,  80),
  ('00000000-0000-4000-8000-000000000115', 'cup',         'cup',   'volume', 236.588,  90),
  ('00000000-0000-4000-8000-000000000116', 'fluid_ounce', 'fl_oz', 'volume', 29.5735, 100),
  ('00000000-0000-4000-8000-000000000121', 'each',        'ea',    'count',  1,       110),
  ('00000000-0000-4000-8000-000000000122', 'dozen',       'doz',   'count',  12,      120),
  ('00000000-0000-4000-8000-000000000123', 'clove',       'clove', 'count',  1,       130),
  ('00000000-0000-4000-8000-000000000124', 'head',        'head',  'count',  1,       140)
ON CONFLICT (name) DO NOTHING;

-- ===========================================================================
-- Portion categories (9) — Adult Male reference base 6.0 oz
-- ===========================================================================

INSERT INTO portion_category (id, name, slug, base_protein_oz, description, sort_order) VALUES
  ('00000000-0000-4000-8000-000000000201', 'Child',                      'child',                        3.0,  'Young children', 10),
  ('00000000-0000-4000-8000-000000000202', 'Adolescent Female Under 15',  'adolescent-female-under-15',   4.0,  NULL, 20),
  ('00000000-0000-4000-8000-000000000203', 'Adolescent Female Over 15',   'adolescent-female-over-15',    5.0,  NULL, 30),
  ('00000000-0000-4000-8000-000000000204', 'Adolescent Male Under 15',    'adolescent-male-under-15',     5.0,  NULL, 40),
  ('00000000-0000-4000-8000-000000000205', 'Adolescent Male Over 15',     'adolescent-male-over-15',      6.0,  NULL, 50),
  ('00000000-0000-4000-8000-000000000206', 'Adult Female',                'adult-female',                 5.0,  NULL, 60),
  ('00000000-0000-4000-8000-000000000207', 'Adult Male',                  'adult-male',                   6.0,  'Reference base portion (default 6.0 oz)', 70),
  ('00000000-0000-4000-8000-000000000208', 'Senior Female',               'senior-female',                4.5,  NULL, 80),
  ('00000000-0000-4000-8000-000000000209', 'Senior Male',                 'senior-male',                  5.0,  NULL, 90)
ON CONFLICT (slug) DO NOTHING;

-- ===========================================================================
-- Family settings (single row)
-- ===========================================================================

INSERT INTO family_settings (id, athlete_multiplier, other_global_defaults) VALUES
  ('00000000-0000-4000-8000-000000000301', 1.5, '{}'::jsonb)
ON CONFLICT (id) DO NOTHING;

-- ===========================================================================
-- Category taxonomy starter (nutrition)
-- Protein > Seafood / Poultry / Pork / Beef
-- Starch > Grains / Potatoes
-- Vegetable; Fruit; Dairy
-- ===========================================================================

INSERT INTO category (id, name, slug, parent_id, category_type, sort_order, description) VALUES
  ('00000000-0000-4000-8000-000000000401', 'Protein',   'protein',   NULL, 'nutrition', 10, 'Top-level protein foods'),
  ('00000000-0000-4000-8000-000000000402', 'Starch',    'starch',    NULL, 'nutrition', 20, 'Starches and carbs'),
  ('00000000-0000-4000-8000-000000000403', 'Vegetable', 'vegetable', NULL, 'nutrition', 30, NULL),
  ('00000000-0000-4000-8000-000000000404', 'Fruit',     'fruit',     NULL, 'nutrition', 40, NULL),
  ('00000000-0000-4000-8000-000000000405', 'Dairy',     'dairy',     NULL, 'nutrition', 50, NULL)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO category (id, name, slug, parent_id, category_type, sort_order, description) VALUES
  ('00000000-0000-4000-8000-000000000411', 'Seafood',  'seafood',  '00000000-0000-4000-8000-000000000401', 'nutrition', 11, NULL),
  ('00000000-0000-4000-8000-000000000412', 'Poultry',  'poultry',  '00000000-0000-4000-8000-000000000401', 'nutrition', 12, NULL),
  ('00000000-0000-4000-8000-000000000413', 'Pork',     'pork',     '00000000-0000-4000-8000-000000000401', 'nutrition', 13, NULL),
  ('00000000-0000-4000-8000-000000000414', 'Beef',     'beef',     '00000000-0000-4000-8000-000000000401', 'nutrition', 14, NULL),
  ('00000000-0000-4000-8000-000000000421', 'Grains',   'grains',   '00000000-0000-4000-8000-000000000402', 'nutrition', 21, NULL),
  ('00000000-0000-4000-8000-000000000422', 'Potatoes', 'potatoes', '00000000-0000-4000-8000-000000000402', 'nutrition', 22, NULL)
ON CONFLICT (slug) DO NOTHING;

-- ===========================================================================
-- Tags by tag_group
-- ===========================================================================

INSERT INTO tag (id, name, slug, tag_group, description) VALUES
  -- applicable_meal
  ('00000000-0000-4000-8000-000000000501', 'Breakfast',  'breakfast',  'applicable_meal', NULL),
  ('00000000-0000-4000-8000-000000000502', 'Lunch',      'lunch',      'applicable_meal', NULL),
  ('00000000-0000-4000-8000-000000000503', 'Dinner',     'dinner',     'applicable_meal', NULL),
  ('00000000-0000-4000-8000-000000000504', 'Snack',      'snack',      'applicable_meal', NULL),
  -- cuisine
  ('00000000-0000-4000-8000-000000000511', 'American',       'american',       'cuisine', NULL),
  ('00000000-0000-4000-8000-000000000512', 'Italian',        'italian',        'cuisine', NULL),
  ('00000000-0000-4000-8000-000000000513', 'Mexican',        'mexican',        'cuisine', NULL),
  ('00000000-0000-4000-8000-000000000514', 'Greek',          'greek',          'cuisine', NULL),
  ('00000000-0000-4000-8000-000000000515', 'Mediterranean',  'mediterranean',  'cuisine', NULL),
  ('00000000-0000-4000-8000-000000000516', 'Asian',          'asian',          'cuisine', NULL),
  -- preparation_method
  ('00000000-0000-4000-8000-000000000521', 'Grill',     'grill',     'preparation_method', NULL),
  ('00000000-0000-4000-8000-000000000522', 'Roast',     'roast',     'preparation_method', NULL),
  ('00000000-0000-4000-8000-000000000523', 'Sauté',     'saute',     'preparation_method', NULL),
  ('00000000-0000-4000-8000-000000000524', 'Slow Cook', 'slow-cook', 'preparation_method', NULL),
  ('00000000-0000-4000-8000-000000000525', 'Bake',      'bake',      'preparation_method', NULL),
  -- dietary_restriction
  ('00000000-0000-4000-8000-000000000531', 'Gluten-Free', 'gluten-free', 'dietary_restriction', NULL),
  ('00000000-0000-4000-8000-000000000532', 'Dairy-Free',  'dairy-free',  'dietary_restriction', NULL),
  ('00000000-0000-4000-8000-000000000533', 'Nut-Free',    'nut-free',    'dietary_restriction', NULL),
  ('00000000-0000-4000-8000-000000000534', 'Vegetarian',  'vegetarian',  'dietary_restriction', NULL),
  ('00000000-0000-4000-8000-000000000535', 'Vegan',       'vegan',       'dietary_restriction', NULL),
  -- difficulty
  ('00000000-0000-4000-8000-000000000541', 'Easy',     'easy',     'difficulty', NULL),
  ('00000000-0000-4000-8000-000000000542', 'Medium',   'medium',   'difficulty', NULL),
  ('00000000-0000-4000-8000-000000000543', 'Advanced', 'advanced', 'difficulty', NULL)
ON CONFLICT (tag_group, slug) DO NOTHING;

-- ===========================================================================
-- >>> BEGIN TEST FIXTURES (exclude in production)
-- RLS matrix personas: member_a, member_b, member_c, admin_a (anon = no profile row)
-- Households A / B / C
-- ===========================================================================

INSERT INTO household (id, name, family_id, is_active) VALUES
  ('00000000-0000-4000-8000-0000000000a0', 'Household A', 'menuboss-family', true),
  ('00000000-0000-4000-8000-0000000000b0', 'Household B', 'menuboss-family', true),
  ('00000000-0000-4000-8000-0000000000c0', 'Household C', 'menuboss-family', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO profile (id, household_id, display_name, role) VALUES
  -- member_a: regular member of Household A
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000a0', 'Member A', 'member'),
  -- admin_a: family admin in Household A
  ('00000000-0000-4000-8000-0000000000a2', '00000000-0000-4000-8000-0000000000a0', 'Admin A',  'admin'),
  -- member_b: Household B
  ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000b0', 'Member B', 'member'),
  -- member_c: Household C (never shared)
  ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000c0', 'Member C', 'member')
ON CONFLICT (id) DO NOTHING;

-- Fixed UUID reference card for pgTAP / RLS matrix:
--   household_a = 00000000-0000-4000-8000-0000000000a0
--   household_b = 00000000-0000-4000-8000-0000000000b0
--   household_c = 00000000-0000-4000-8000-0000000000c0
--   member_a    = 00000000-0000-4000-8000-0000000000a1
--   admin_a     = 00000000-0000-4000-8000-0000000000a2
--   member_b    = 00000000-0000-4000-8000-0000000000b1
--   member_c    = 00000000-0000-4000-8000-0000000000c1
--   anon        = (no profile row)

-- ===========================================================================
-- <<< END TEST FIXTURES
-- ===========================================================================
```
