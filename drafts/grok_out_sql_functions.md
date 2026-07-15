## NOTES

1. **`generate_shopping_list` — pure `LANGUAGE sql STABLE SECURITY INVOKER`.** No SECURITY DEFINER. RLS on `meal_plan` (and downstream tables once 0002 lands) filters visibility; invisible plan ids simply contribute zero rows.
2. **Scale factor / divide-by-zero:** `scale_factor = servings::numeric / NULLIF(recipe.yield_servings, 0)`. Schema CHECK normally enforces `yield_servings > 0`; NULLIF is defensive. When scale_factor is NULL for **any** contributing line in a group, `total_quantity_base` is NULL for that group (not dropped; not partially summed with SQL SUM ignoring NULLs).
3. **Primary category:** `ingredient_category` has no `is_primary` flag. Primary = one row per ingredient chosen by `ORDER BY category.sort_order, category.name, category.id` (`DISTINCT ON`). Root name via recursive CTE walking `parent_id` until `parent_id IS NULL`. No category → `category_name` NULL.
4. **Soft-deleted recipes:** Included (no `recipe.deleted_at IS NULL` filter). `includes_deleted_recipe = bool_or(r.deleted_at IS NOT NULL)`. Soft-deleted **ingredients** still join (authorization ≠ lifecycle).
5. **Grouping:** `(ingredient_id, unit.dimension, is_optional)` — optional lines never merge with required lines of the same ingredient/dimension (D11 / PRD).
6. **Ordering:** `ORDER BY category_name NULLS LAST, ingredient_name, dimension, is_optional` (brief’s three keys plus `is_optional` for full determinism).
7. **No display-unit selection; no cross-dimension conversion** (D12) — base quantities only; separate rows per dimension.
8. **`weekly_protein_rollup` + companion `weekly_protein_total`:** Chose a companion scalar total function rather than a grand-total sentinel row so result columns stay typed (`meal_plan_id` never NULL) and consumers sum cleanly. Formula is the **only** SQL copy of §4.1:
   ```
   Σ ((count − athlete_count) + athlete_count × athlete_multiplier) × base_protein_oz
   ```
   Full `numeric` precision; no `round()`. Deactivated `portion_category` rows still contribute (historical plans / D11). Plans with no requirement rows return `0`.
9. **Date overlap:** `mp.start_date <= p_end AND mp.end_date >= p_start`. Soft-deleted meal plans are **not** filtered here (brief: RLS-visible rows only; lifecycle filter is caller’s concern). Document if coordinator prefers `deleted_at IS NULL` later.
10. **`family_settings`:** Scalar subquery `ORDER BY id LIMIT 1` for deterministic single multiplier (seed is one row; no DB singleton constraint). Empty `family_settings` → no rollup rows (CROSS-equivalent fail-closed).
11. **pgTAP tests** assume schema from 0001 (+ functions from 0003) applied as superuser; RLS is not under test here. Yield-0 case temporarily drops `recipe_yield_servings_check` then restores it. Fixed UUID prefix `00000000-0000-4000-8000-0000000009xx` avoids collisions with seed `…0001xx`–`…0005xx` / persona `…0000ax` ranges.
12. **PL/pgSQL:** not used; pure SQL only.

### FILE: supabase/migrations/0003_functions.sql
```sql
-- MenuBoss 0003_functions.sql
-- Sanctioned set-based aggregation only (decision D14).
-- SECURITY INVOKER everywhere — never bypass RLS.
-- Portion formula appears ONLY in weekly_protein_rollup / weekly_protein_total
-- and is pinned to @menu-boss/portion-calc by a coordinator contract test.

-- ---------------------------------------------------------------------------
-- generate_shopping_list
-- PRD §6 contract: plans → assignments → recipe (incl. soft-deleted)
--   → recipe_ingredient → unit → ingredient → top-level category
-- scale_factor = servings / yield_servings (servings-based; not protein-driven)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION generate_shopping_list(p_meal_plan_ids uuid[])
RETURNS TABLE (
  ingredient_id           uuid,
  ingredient_name         text,
  dimension               text,
  total_quantity_base     numeric,
  is_optional             boolean,
  category_name           text,
  source_recipe_ids       uuid[],
  includes_deleted_recipe boolean
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH primary_category AS (
    -- No is_primary column: deterministic pick per ingredient.
    SELECT DISTINCT ON (ic.ingredient_id)
      ic.ingredient_id,
      ic.category_id
    FROM ingredient_category ic
    JOIN category c ON c.id = ic.category_id
    ORDER BY ic.ingredient_id, c.sort_order, c.name, c.id
  ),
  category_roots AS (
    -- Root ancestor of each primary leaf (parent_id model, D15).
    WITH RECURSIVE walk AS (
      SELECT
        pc.ingredient_id,
        c.id,
        c.name,
        c.parent_id
      FROM primary_category pc
      JOIN category c ON c.id = pc.category_id

      UNION ALL

      SELECT
        w.ingredient_id,
        p.id,
        p.name,
        p.parent_id
      FROM walk w
      JOIN category p ON p.id = w.parent_id
    )
    SELECT DISTINCT ON (ingredient_id)
      ingredient_id,
      name AS root_name
    FROM walk
    WHERE parent_id IS NULL
    ORDER BY ingredient_id, name
  ),
  line_items AS (
    SELECT
      i.id AS ingredient_id,
      i.name AS ingredient_name,
      u.dimension,
      ri.is_optional,
      ri.quantity,
      u.factor_to_base,
      (mpa.servings::numeric / NULLIF(r.yield_servings, 0)) AS scale_factor,
      r.id AS recipe_id,
      (r.deleted_at IS NOT NULL) AS recipe_is_deleted,
      cr.root_name AS category_name
    FROM meal_plan mp
    JOIN meal_plan_assignment mpa
      ON mpa.meal_plan_id = mp.id
    JOIN recipe r
      ON r.id = mpa.recipe_id
    JOIN recipe_ingredient ri
      ON ri.recipe_id = r.id
    JOIN unit u
      ON u.id = ri.unit_id
    JOIN ingredient i
      ON i.id = ri.ingredient_id
    LEFT JOIN category_roots cr
      ON cr.ingredient_id = i.id
    WHERE mp.id = ANY (p_meal_plan_ids)
  )
  SELECT
    li.ingredient_id,
    li.ingredient_name,
    li.dimension,
    CASE
      WHEN bool_or(li.scale_factor IS NULL) THEN NULL
      ELSE sum(li.quantity * li.factor_to_base * li.scale_factor)
    END AS total_quantity_base,
    li.is_optional,
    max(li.category_name) AS category_name,
    array_agg(DISTINCT li.recipe_id ORDER BY li.recipe_id) AS source_recipe_ids,
    bool_or(li.recipe_is_deleted) AS includes_deleted_recipe
  FROM line_items li
  GROUP BY
    li.ingredient_id,
    li.ingredient_name,
    li.dimension,
    li.is_optional
  ORDER BY
    max(li.category_name) NULLS LAST,
    li.ingredient_name,
    li.dimension,
    li.is_optional;
$$;

COMMENT ON FUNCTION generate_shopping_list(uuid[]) IS
  'D14 shopping-list aggregation (SECURITY INVOKER). Groups by (ingredient_id, dimension, is_optional); '
  'scale_factor = assignment.servings / recipe.yield_servings; soft-deleted recipes included.';

-- ---------------------------------------------------------------------------
-- weekly_protein_rollup — only sanctioned SQL copy of PRD §4.1 portion formula
-- effective_protein_oz(plan) =
--   Σ ((count − athlete_count) + athlete_count × athlete_multiplier)
--     × portion_category.base_protein_oz
-- Full numeric precision; no rounding inside the function.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION weekly_protein_rollup(p_start date, p_end date)
RETURNS TABLE (
  meal_plan_id          uuid,
  title                 text,
  start_date            date,
  end_date              date,
  effective_protein_oz  numeric
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    mp.id AS meal_plan_id,
    mp.title,
    mp.start_date,
    mp.end_date,
    COALESCE(
      sum(
        (
          (mppr.count - mppr.athlete_count)
          + mppr.athlete_count * fs.athlete_multiplier
        ) * pc.base_protein_oz
      ),
      0
    ) AS effective_protein_oz
  FROM meal_plan mp
  CROSS JOIN LATERAL (
    SELECT fs0.athlete_multiplier
    FROM family_settings fs0
    ORDER BY fs0.id
    LIMIT 1
  ) fs
  LEFT JOIN meal_plan_portion_requirement mppr
    ON mppr.meal_plan_id = mp.id
  LEFT JOIN portion_category pc
    ON pc.id = mppr.portion_category_id
  WHERE mp.start_date <= p_end
    AND mp.end_date   >= p_start
  GROUP BY
    mp.id,
    mp.title,
    mp.start_date,
    mp.end_date
  ORDER BY
    mp.start_date,
    mp.title,
    mp.id;
$$;

COMMENT ON FUNCTION weekly_protein_rollup(date, date) IS
  'D14 weekly protein roll-up (SECURITY INVOKER). Canonical §4.1 formula; full precision; '
  'plans overlapping [p_start, p_end] only. Companion total: weekly_protein_total.';

-- Companion scalar total (preferred over a sentinel grand-total row).
CREATE OR REPLACE FUNCTION weekly_protein_total(p_start date, p_end date)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT COALESCE(sum(w.effective_protein_oz), 0)
  FROM weekly_protein_rollup(p_start, p_end) AS w;
$$;

COMMENT ON FUNCTION weekly_protein_total(date, date) IS
  'Sum of weekly_protein_rollup.effective_protein_oz over the same window; 0 if no plans.';
```

### FILE: supabase/tests/functions/aggregation.test.sql
```sql
-- MenuBoss pgTAP smoke tests for 0003 aggregation functions.
-- Covers arithmetic / grouping only; RLS matrix is coordinator-owned.
-- Run against a migrated DB (0001 schema + seed + 0003 functions) as superuser.
-- Example: supabase test db  (or psql -f after extensions + schema)

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
-- Fallback when pgtap is on public (local non-Supabase):
-- CREATE EXTENSION IF NOT EXISTS pgtap;

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
    SELECT row(is_optional, total_quantity_base, dimension)::text
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
```
