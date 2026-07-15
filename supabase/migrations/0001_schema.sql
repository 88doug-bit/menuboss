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
