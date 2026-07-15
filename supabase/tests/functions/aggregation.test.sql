-- MenuBoss pgTAP smoke tests for 0003 aggregation functions.
-- Covers arithmetic / grouping only; RLS matrix is coordinator-owned.
-- Run against a migrated DB (0001 schema + seed + 0003 functions) as superuser.
-- Example: supabase test db  (or psql -f after extensions + schema)

BEGIN;

-- pgTAP: real extension on the Supabase stack; on the local portable-Postgres
-- gate the shim (supabase/tests/local/01_pgtap_shim.sql) already provides the
-- assertion functions, so a missing extension is not an error.
DO $$
BEGIN
  BEGIN
    CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
  EXCEPTION WHEN OTHERS THEN
    BEGIN
      CREATE EXTENSION IF NOT EXISTS pgtap;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'pgtap extension unavailable — assuming shim-provided assertions';
    END;
  END;
END $$;

SELECT plan(14);

-- ===========================================================================
-- Fixed fixture IDs (…0009xx range — avoids seed / persona collisions)
-- ===========================================================================
-- units (seed): gram …0101, ounce …0103, cup …0115, each …0121
-- portion_category (seed): adult_male …0207 base 6.0, adult_female …0206 base 5.0
-- family_settings (seed): …0301 athlete_multiplier 1.5
-- category (seed): Protein …0401, Poultry …0412 (child of Protein), Starch …0402

-- households / profiles: use seed personas if present; else insert local fixtures
INSERT INTO household (id, name, family_id)
VALUES ('00000000-0000-4000-8000-0000000000a0', 'Household A', 'menuboss-family')
ON CONFLICT (id) DO NOTHING;

INSERT INTO profile (id, household_id, display_name, role)
VALUES (
  '00000000-0000-4000-8000-0000000000a1',
  '00000000-0000-4000-8000-0000000000a0',
  'Member A',
  'member'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO family_settings (id, athlete_multiplier)
VALUES ('00000000-0000-4000-8000-000000000301', 1.5)
ON CONFLICT (id) DO NOTHING;

INSERT INTO portion_category (id, name, slug, base_protein_oz, sort_order)
VALUES
  ('00000000-0000-4000-8000-000000000207', 'Adult Male', 'adult-male', 6.0, 70),
  ('00000000-0000-4000-8000-000000000206', 'Adult Female', 'adult-female', 5.0, 60)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO unit (id, name, abbreviation, dimension, factor_to_base, sort_order)
VALUES
  ('00000000-0000-4000-8000-000000000101', 'gram', 'g', 'mass', 1, 10),
  ('00000000-0000-4000-8000-000000000103', 'ounce', 'oz', 'mass', 28.3495, 30),
  ('00000000-0000-4000-8000-000000000115', 'cup', 'cup', 'volume', 236.588, 90),
  ('00000000-0000-4000-8000-000000000121', 'each', 'ea', 'count', 1, 110)
ON CONFLICT (name) DO NOTHING;

INSERT INTO category (id, name, slug, parent_id, category_type, sort_order)
VALUES
  ('00000000-0000-4000-8000-000000000401', 'Protein', 'protein', NULL, 'nutrition', 10),
  ('00000000-0000-4000-8000-000000000402', 'Starch', 'starch', NULL, 'nutrition', 20),
  ('00000000-0000-4000-8000-000000000412', 'Poultry', 'poultry',
    '00000000-0000-4000-8000-000000000401', 'nutrition', 12)
ON CONFLICT (slug) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Ingredients
-- ---------------------------------------------------------------------------
INSERT INTO ingredient (id, name) VALUES
  ('00000000-0000-4000-8000-000000000901', 'Chicken Breast'),
  ('00000000-0000-4000-8000-000000000902', 'Flour'),
  ('00000000-0000-4000-8000-000000000903', 'Optional Garnish');

-- Chicken under Poultry → root Protein; Flour under Starch
INSERT INTO ingredient_category (ingredient_id, category_id) VALUES
  ('00000000-0000-4000-8000-000000000901', '00000000-0000-4000-8000-000000000412'),
  ('00000000-0000-4000-8000-000000000902', '00000000-0000-4000-8000-000000000402');

-- ---------------------------------------------------------------------------
-- Recipes
-- R1 live: chicken 200g + flour 1 cup (required) + garnish 1 ea optional
-- R2 live: chicken 100g (dedup mass with R1) + flour 2 cups volume (same dim)
-- R3 soft-deleted: chicken 50g
-- R4 yield_servings 0 (constraint dropped temporarily) — chicken 10g
-- R5 flour by mass (cross-dimension vs volume flour)
-- ---------------------------------------------------------------------------
INSERT INTO recipe (id, title, yield_servings, deleted_at) VALUES
  ('00000000-0000-4000-8000-000000000911', 'Recipe Live A', 4, NULL),
  ('00000000-0000-4000-8000-000000000912', 'Recipe Live B', 2, NULL),
  ('00000000-0000-4000-8000-000000000913', 'Recipe Deleted', 1, now()),
  ('00000000-0000-4000-8000-000000000914', 'Recipe Zero Yield', 1, NULL),
  ('00000000-0000-4000-8000-000000000915', 'Recipe Flour Mass', 1, NULL);

-- Temporarily allow yield_servings = 0 for R4
ALTER TABLE recipe DROP CONSTRAINT IF EXISTS recipe_yield_servings_check;
UPDATE recipe
SET yield_servings = 0
WHERE id = '00000000-0000-4000-8000-000000000914';
ALTER TABLE recipe
  ADD CONSTRAINT recipe_yield_servings_check CHECK (yield_servings > 0) NOT VALID;
-- Leave NOT VALID so existing zero-yield row remains; new inserts still checked if revalidated later.

INSERT INTO recipe_ingredient (
  id, recipe_id, ingredient_id, quantity, unit_id, is_optional, sequence_order
) VALUES
  -- R1
  ('00000000-0000-4000-8000-000000000921',
   '00000000-0000-4000-8000-000000000911',
   '00000000-0000-4000-8000-000000000901',
   200, '00000000-0000-4000-8000-000000000101', false, 1),
  ('00000000-0000-4000-8000-000000000922',
   '00000000-0000-4000-8000-000000000911',
   '00000000-0000-4000-8000-000000000902',
   1, '00000000-0000-4000-8000-000000000115', false, 2),
  ('00000000-0000-4000-8000-000000000923',
   '00000000-0000-4000-8000-000000000911',
   '00000000-0000-4000-8000-000000000903',
   1, '00000000-0000-4000-8000-000000000121', true, 3),
  -- R2: chicken mass + flour volume
  ('00000000-0000-4000-8000-000000000924',
   '00000000-0000-4000-8000-000000000912',
   '00000000-0000-4000-8000-000000000901',
   100, '00000000-0000-4000-8000-000000000101', false, 1),
  ('00000000-0000-4000-8000-000000000925',
   '00000000-0000-4000-8000-000000000912',
   '00000000-0000-4000-8000-000000000902',
   2, '00000000-0000-4000-8000-000000000115', false, 2),
  -- R3 deleted
  ('00000000-0000-4000-8000-000000000926',
   '00000000-0000-4000-8000-000000000913',
   '00000000-0000-4000-8000-000000000901',
   50, '00000000-0000-4000-8000-000000000101', false, 1),
  -- R4 zero yield
  ('00000000-0000-4000-8000-000000000927',
   '00000000-0000-4000-8000-000000000914',
   '00000000-0000-4000-8000-000000000901',
   10, '00000000-0000-4000-8000-000000000101', false, 1),
  -- R5 flour mass (cross-dimension)
  ('00000000-0000-4000-8000-000000000928',
   '00000000-0000-4000-8000-000000000915',
   '00000000-0000-4000-8000-000000000902',
   100, '00000000-0000-4000-8000-000000000101', false, 1);

-- ---------------------------------------------------------------------------
-- Meal plans
-- Plan A: multi-recipe + optional + cross-dim + deleted recipe
-- Plan B: zero-yield recipe only
-- Plan C + D: protein roll-up two-plan fixture
-- ---------------------------------------------------------------------------
INSERT INTO meal_plan (
  id, title, start_date, end_date,
  created_by_household_id, created_by_user_id
) VALUES
  ('00000000-0000-4000-8000-000000000931', 'Shop Plan A',
   '2026-07-01', '2026-07-07',
   '00000000-0000-4000-8000-0000000000a0',
   '00000000-0000-4000-8000-0000000000a1'),
  ('00000000-0000-4000-8000-000000000932', 'Shop Plan Zero Yield',
   '2026-07-01', '2026-07-07',
   '00000000-0000-4000-8000-0000000000a0',
   '00000000-0000-4000-8000-0000000000a1'),
  ('00000000-0000-4000-8000-000000000933', 'Protein Plan 1',
   '2026-07-06', '2026-07-12',
   '00000000-0000-4000-8000-0000000000a0',
   '00000000-0000-4000-8000-0000000000a1'),
  ('00000000-0000-4000-8000-000000000934', 'Protein Plan 2',
   '2026-07-10', '2026-07-16',
   '00000000-0000-4000-8000-0000000000a0',
   '00000000-0000-4000-8000-0000000000a1');

INSERT INTO meal_plan_assignment (
  id, meal_plan_id, recipe_id, assignment_date, meal_slot, servings
) VALUES
  -- Plan A: R1 servings=8, yield=4 → scale 2
  ('00000000-0000-4000-8000-000000000941',
   '00000000-0000-4000-8000-000000000931',
   '00000000-0000-4000-8000-000000000911',
   '2026-07-01', 'dinner', 8),
  -- Plan A: R2 servings=2, yield=2 → scale 1
  ('00000000-0000-4000-8000-000000000942',
   '00000000-0000-4000-8000-000000000931',
   '00000000-0000-4000-8000-000000000912',
   '2026-07-02', 'dinner', 2),
  -- Plan A: R3 deleted servings=1, yield=1 → scale 1
  ('00000000-0000-4000-8000-000000000943',
   '00000000-0000-4000-8000-000000000931',
   '00000000-0000-4000-8000-000000000913',
   '2026-07-03', 'dinner', 1),
  -- Plan A: R5 flour mass scale 1
  ('00000000-0000-4000-8000-000000000944',
   '00000000-0000-4000-8000-000000000931',
   '00000000-0000-4000-8000-000000000915',
   '2026-07-04', 'dinner', 1),
  -- Plan B: R4 zero yield servings=4 → scale NULL
  ('00000000-0000-4000-8000-000000000945',
   '00000000-0000-4000-8000-000000000932',
   '00000000-0000-4000-8000-000000000914',
   '2026-07-01', 'dinner', 4);

-- Protein requirements
-- Plan 1: adult_male count=2 athlete=1 → ((2-1)+1*1.5)*6 = 15
INSERT INTO meal_plan_portion_requirement (
  meal_plan_id, portion_category_id, count, athlete_count
) VALUES
  ('00000000-0000-4000-8000-000000000933',
   '00000000-0000-4000-8000-000000000207', 2, 1),
  -- Plan 2: adult_female count=2 athlete=0 → 2*5 = 10
  --        + adult_male count=1 athlete=0 → 1*6 = 6  → total 16
  ('00000000-0000-4000-8000-000000000934',
   '00000000-0000-4000-8000-000000000206', 2, 0),
  ('00000000-0000-4000-8000-000000000934',
   '00000000-0000-4000-8000-000000000207', 1, 0);

-- Hand-computed shopping totals for Plan A:
-- Chicken mass required:
--   R1: 200 * 1 * 2 = 400
--   R2: 100 * 1 * 1 = 100
--   R3:  50 * 1 * 1 =  50
--   sum = 550 g; includes_deleted = true; sources R1,R2,R3
-- Flour volume required:
--   R1: 1 * 236.588 * 2 = 473.176
--   R2: 2 * 236.588 * 1 = 473.176
--   sum = 946.352 ml
-- Flour mass required:
--   R5: 100 * 1 * 1 = 100 g  (separate row from volume)
-- Optional garnish count:
--   R1: 1 * 1 * 2 = 2 ea; is_optional true

-- ===========================================================================
-- 1. Empty plan array → zero rows
-- ===========================================================================
SELECT is(
  (SELECT count(*)::integer FROM generate_shopping_list(ARRAY[]::uuid[])),
  0,
  'empty plan array returns zero rows'
);

-- ===========================================================================
-- 2. Multi-recipe dedup within mass (chicken)
-- ===========================================================================
SELECT is(
  (
    SELECT total_quantity_base
    FROM generate_shopping_list(ARRAY['00000000-0000-4000-8000-000000000931'::uuid])
    WHERE ingredient_id = '00000000-0000-4000-8000-000000000901'
      AND dimension = 'mass'
      AND is_optional = false
  ),
  550::numeric,
  'multi-recipe chicken mass sums to 550 base grams'
);

-- ===========================================================================
-- 3. Soft-deleted recipe contributes + flag
-- ===========================================================================
SELECT ok(
  (
    SELECT includes_deleted_recipe
    FROM generate_shopping_list(ARRAY['00000000-0000-4000-8000-000000000931'::uuid])
    WHERE ingredient_id = '00000000-0000-4000-8000-000000000901'
      AND dimension = 'mass'
      AND is_optional = false
  ),
  'includes_deleted_recipe is true when soft-deleted recipe contributes'
);

SELECT ok(
  (
    SELECT source_recipe_ids @> ARRAY[
      '00000000-0000-4000-8000-000000000911'::uuid,
      '00000000-0000-4000-8000-000000000912'::uuid,
      '00000000-0000-4000-8000-000000000913'::uuid
    ]
    FROM generate_shopping_list(ARRAY['00000000-0000-4000-8000-000000000931'::uuid])
    WHERE ingredient_id = '00000000-0000-4000-8000-000000000901'
      AND dimension = 'mass'
      AND is_optional = false
  ),
  'source_recipe_ids includes live and soft-deleted recipes'
);

-- ===========================================================================
-- 4. Cross-dimension flour → two rows
-- ===========================================================================
SELECT is(
  (
    SELECT count(*)::integer
    FROM generate_shopping_list(ARRAY['00000000-0000-4000-8000-000000000931'::uuid])
    WHERE ingredient_id = '00000000-0000-4000-8000-000000000902'
      AND is_optional = false
  ),
  2,
  'same ingredient different dimensions yields two rows'
);

SELECT is(
  (
    SELECT total_quantity_base
    FROM generate_shopping_list(ARRAY['00000000-0000-4000-8000-000000000931'::uuid])
    WHERE ingredient_id = '00000000-0000-4000-8000-000000000902'
      AND dimension = 'volume'
      AND is_optional = false
  ),
  946.352::numeric,
  'flour volume total is 946.352 ml base'
);

SELECT is(
  (
    SELECT total_quantity_base
    FROM generate_shopping_list(ARRAY['00000000-0000-4000-8000-000000000931'::uuid])
    WHERE ingredient_id = '00000000-0000-4000-8000-000000000902'
      AND dimension = 'mass'
      AND is_optional = false
  ),
  100::numeric,
  'flour mass total is 100 g base (not merged with volume)'
);

-- ===========================================================================
-- 5. Optional ingredient isolated
-- ===========================================================================
SELECT is(
  (
    SELECT count(*)::integer
    FROM generate_shopping_list(ARRAY['00000000-0000-4000-8000-000000000931'::uuid])
    WHERE ingredient_id = '00000000-0000-4000-8000-000000000903'
  ),
  1,
  'optional garnish is its own group'
);

SELECT is(
  (
    -- trim_scale: text rendering of numerics is scale-sensitive (2.00... != 2)
    SELECT row(is_optional, trim_scale(total_quantity_base), dimension)::text
    FROM generate_shopping_list(ARRAY['00000000-0000-4000-8000-000000000931'::uuid])
    WHERE ingredient_id = '00000000-0000-4000-8000-000000000903'
  ),
  row(true, 2::numeric, 'count')::text,
  'optional garnish: is_optional true, total 2 each'
);

-- ===========================================================================
-- 6. Top-level category via recursive CTE (Poultry → Protein)
-- ===========================================================================
SELECT is(
  (
    SELECT category_name
    FROM generate_shopping_list(ARRAY['00000000-0000-4000-8000-000000000931'::uuid])
    WHERE ingredient_id = '00000000-0000-4000-8000-000000000901'
      AND dimension = 'mass'
      AND is_optional = false
  ),
  'Protein',
  'chicken top-level category is Protein (root of Poultry)'
);

-- ===========================================================================
-- 7. yield_servings 0 → total_quantity_base NULL (row still present)
-- ===========================================================================
SELECT is(
  (
    SELECT total_quantity_base IS NULL
    FROM generate_shopping_list(ARRAY['00000000-0000-4000-8000-000000000932'::uuid])
    WHERE ingredient_id = '00000000-0000-4000-8000-000000000901'
  ),
  true,
  'yield_servings 0 surfaces total_quantity_base NULL (not dropped)'
);

-- ===========================================================================
-- 8. weekly_protein_rollup two-plan hand-computed
-- Window 2026-07-01 .. 2026-07-31 overlaps Plan1 (15) + Plan2 (16) = 31
-- Plan1: ((2-1)+1*1.5)*6 = 15
-- Plan2: 2*5 + 1*6 = 16
-- ===========================================================================
SELECT results_eq(
  $$
    SELECT meal_plan_id, effective_protein_oz
    FROM weekly_protein_rollup(DATE '2026-07-01', DATE '2026-07-31')
    WHERE meal_plan_id IN (
      '00000000-0000-4000-8000-000000000933',
      '00000000-0000-4000-8000-000000000934'
    )
    ORDER BY meal_plan_id
  $$,
  $$
    VALUES
      ('00000000-0000-4000-8000-000000000933'::uuid, 15::numeric),
      ('00000000-0000-4000-8000-000000000934'::uuid, 16::numeric)
  $$,
  'weekly_protein_rollup matches hand-computed 15 and 16 for two-plan fixture'
);

-- Direct total over window: shop plans have no requirements (0 each) + 15 + 16
-- Shop Plan A/B also overlap the window → 0 + 0 + 15 + 16 = 31
SELECT is(
  (
    SELECT sum(effective_protein_oz)
    FROM weekly_protein_rollup(DATE '2026-07-01', DATE '2026-07-31')
    WHERE meal_plan_id IN (
      '00000000-0000-4000-8000-000000000931',
      '00000000-0000-4000-8000-000000000932',
      '00000000-0000-4000-8000-000000000933',
      '00000000-0000-4000-8000-000000000934'
    )
  ),
  31::numeric,
  'sum of four fixture plans effective protein = 31'
);

-- Companion total equals sum of per-plan rollup over the same window
SELECT is(
  weekly_protein_total(DATE '2026-07-06', DATE '2026-07-12'),
  (
    SELECT sum(effective_protein_oz)
    FROM weekly_protein_rollup(DATE '2026-07-06', DATE '2026-07-12')
  ),
  'weekly_protein_total matches sum(weekly_protein_rollup) for same window'
);

SELECT * FROM finish();

ROLLBACK;
