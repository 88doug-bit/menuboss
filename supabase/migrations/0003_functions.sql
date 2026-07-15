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
      -- Lifecycle filter (query concern, not RLS): soft-deleted PLANS are excluded;
      -- soft-deleted RECIPES are intentionally included (includes_deleted_recipe flags them).
      AND mp.deleted_at IS NULL
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
    -- Lifecycle filter (query concern, not RLS): deleted plans do not count toward totals.
    AND mp.deleted_at IS NULL
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
