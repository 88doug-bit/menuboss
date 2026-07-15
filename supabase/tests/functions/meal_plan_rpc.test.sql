-- MenuBoss pgTAP tests for meal_plan_create_or_update (0004).
-- Creator-persona reconciliation + ONE smoke RLS denial (member_b on A's plan).
-- Shim-compatible: plan / is / ok / lives_ok / throws_ok / results_eq / finish only.
-- Run against migrated DB (0001–0004 + seed) as superuser (local gate or supabase test db).

BEGIN;

-- pgTAP: real extension on Supabase stack; local portable-Postgres gate uses shim.
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

SELECT plan(13);

-- ===========================================================================
-- Fixed fixture IDs (…000a9x range — avoids seed / aggregation / RLS collisions)
-- ===========================================================================

INSERT INTO household (id, name, family_id)
VALUES
  ('00000000-0000-4000-8000-0000000000a0', 'Household A', 'menuboss-family'),
  ('00000000-0000-4000-8000-0000000000b0', 'Household B', 'menuboss-family')
ON CONFLICT (id) DO NOTHING;

INSERT INTO profile (id, household_id, display_name, role)
VALUES
  (
    '00000000-0000-4000-8000-0000000000a1',
    '00000000-0000-4000-8000-0000000000a0',
    'Member A',
    'member'
  ),
  (
    '00000000-0000-4000-8000-0000000000b1',
    '00000000-0000-4000-8000-0000000000b0',
    'Member B',
    'member'
  )
ON CONFLICT (id) DO NOTHING;

INSERT INTO portion_category (id, name, slug, base_protein_oz, sort_order)
VALUES
  ('00000000-0000-4000-8000-000000000207', 'Adult Male', 'adult-male', 6.0, 70),
  ('00000000-0000-4000-8000-000000000206', 'Adult Female', 'adult-female', 5.0, 60)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO recipe (id, title, yield_servings, created_by_user_id)
VALUES
  (
    '00000000-0000-4000-8000-000000000a91',
    'RPC Fixture Recipe',
    4,
    '00000000-0000-4000-8000-0000000000a1'
  )
ON CONFLICT (id) DO NOTHING;

-- Helper: act as member_a (creator household)
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}',
  true
);
SET LOCAL ROLE authenticated;

-- ===========================================================================
-- 1. Create: plan + creating household membership + portions + assignment
-- ===========================================================================
SELECT lives_ok(
  $$
    SELECT meal_plan_create_or_update(jsonb_build_object(
      'title', 'RPC Plan Create',
      'description', 'create smoke',
      'startDate', '2099-03-01',
      'endDate', '2099-03-07',
      'householdIds', jsonb_build_array(
        '00000000-0000-4000-8000-0000000000a0'
      ),
      'portionRequirements', jsonb_build_array(
        jsonb_build_object(
          'portionCategoryId', '00000000-0000-4000-8000-000000000207',
          'count', 2,
          'athleteCount', 1
        ),
        jsonb_build_object(
          'portionCategoryId', '00000000-0000-4000-8000-000000000206',
          'count', 0,
          'athleteCount', 0
        )
      ),
      'assignments', jsonb_build_array(
        jsonb_build_object(
          'id', '00000000-0000-4000-8000-000000000a92',
          'recipeId', '00000000-0000-4000-8000-000000000a91',
          'assignmentDate', '2099-03-02',
          'mealSlot', 'dinner',
          'servings', 6,
          'notes', 'first'
        )
      )
    ))
  $$,
  'creator can create plan via RPC'
);

-- Pin the created plan id by title (unique enough in fixture window)
SELECT is(
  (
    SELECT count(*)::integer
    FROM meal_plan
    WHERE title = 'RPC Plan Create'
      AND start_date = DATE '2099-03-01'
  ),
  1,
  'create inserts one meal_plan row'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM meal_plan_household mph
    JOIN meal_plan mp ON mp.id = mph.meal_plan_id
    WHERE mp.title = 'RPC Plan Create'
      AND mph.household_id = '00000000-0000-4000-8000-0000000000a0'
  ),
  1,
  'creating household membership row exists after create'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM meal_plan_portion_requirement mppr
    JOIN meal_plan mp ON mp.id = mppr.meal_plan_id
    WHERE mp.title = 'RPC Plan Create'
  ),
  1,
  'zero-count portion rows are not stored; only count>0 remains'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM meal_plan_assignment mpa
    JOIN meal_plan mp ON mp.id = mpa.meal_plan_id
    WHERE mp.title = 'RPC Plan Create'
  ),
  1,
  'create inserts assignment row'
);

SELECT is(
  (
    SELECT created_by_household_id = '00000000-0000-4000-8000-0000000000a0'
       AND created_by_user_id = '00000000-0000-4000-8000-0000000000a1'
    FROM meal_plan
    WHERE title = 'RPC Plan Create'
  ),
  true,
  'authorship from current_household_id()/auth.uid() only'
);

-- ===========================================================================
-- 2. Update: reconcile assignments (remove one, keep membership creator)
-- ===========================================================================
SELECT lives_ok(
  $$
    SELECT meal_plan_create_or_update(jsonb_build_object(
      'id', (SELECT id FROM meal_plan WHERE title = 'RPC Plan Create' LIMIT 1),
      'title', 'RPC Plan Updated',
      'startDate', '2099-03-01',
      'endDate', '2099-03-07',
      'householdIds', jsonb_build_array(
        '00000000-0000-4000-8000-0000000000b0'
      ),
      'portionRequirements', jsonb_build_array(
        jsonb_build_object(
          'portionCategoryId', '00000000-0000-4000-8000-000000000207',
          'count', 3,
          'athleteCount', 0
        )
      ),
      'assignments', jsonb_build_array(
        jsonb_build_object(
          'id', '00000000-0000-4000-8000-000000000a93',
          'recipeId', '00000000-0000-4000-8000-000000000a91',
          'assignmentDate', '2099-03-03',
          'mealSlot', 'lunch',
          'servings', 2
        )
      )
    ))
  $$,
  'creator can update plan via RPC (reconcile children)'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM meal_plan_assignment mpa
    JOIN meal_plan mp ON mp.id = mpa.meal_plan_id
    WHERE mp.title = 'RPC Plan Updated'
      AND mpa.id = '00000000-0000-4000-8000-000000000a92'
  ),
  0,
  'reconciliation deletes assignments removed from payload'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM meal_plan_assignment mpa
    JOIN meal_plan mp ON mp.id = mpa.meal_plan_id
    WHERE mp.title = 'RPC Plan Updated'
      AND mpa.id = '00000000-0000-4000-8000-000000000a93'
  ),
  1,
  'reconciliation upserts new assignment from payload'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM meal_plan_household mph
    JOIN meal_plan mp ON mp.id = mph.meal_plan_id
    WHERE mp.title = 'RPC Plan Updated'
      AND mph.household_id = '00000000-0000-4000-8000-0000000000a0'
  ),
  1,
  'creating household membership survives reconciliation even if omitted from householdIds'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM meal_plan_household mph
    JOIN meal_plan mp ON mp.id = mph.meal_plan_id
    WHERE mp.title = 'RPC Plan Updated'
      AND mph.household_id = '00000000-0000-4000-8000-0000000000b0'
  ),
  1,
  'shared household from householdIds is inserted'
);

-- ===========================================================================
-- 3. Out-of-range assignment → 23514 (trigger authority)
-- ===========================================================================
SELECT throws_ok(
  $$
    SELECT meal_plan_create_or_update(jsonb_build_object(
      'id', (SELECT id FROM meal_plan WHERE title = 'RPC Plan Updated' LIMIT 1),
      'title', 'RPC Plan Updated',
      'startDate', '2099-03-01',
      'endDate', '2099-03-07',
      'householdIds', jsonb_build_array('00000000-0000-4000-8000-0000000000a0'),
      'portionRequirements', '[]'::jsonb,
      'assignments', jsonb_build_array(
        jsonb_build_object(
          'recipeId', '00000000-0000-4000-8000-000000000a91',
          'assignmentDate', '2099-04-01',
          'mealSlot', 'dinner',
          'servings', 1
        )
      )
    ))
  $$,
  '23514',
  NULL,
  'assignment_date outside plan range surfaces 23514'
);

RESET ROLE;

-- ===========================================================================
-- 4. ONE smoke RLS denial: member_b cannot update A's plan via RPC
-- ===========================================================================
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000000b1","role":"authenticated"}',
  true
);
SET LOCAL ROLE authenticated;

SELECT throws_ok(
  $$
    SELECT meal_plan_create_or_update(jsonb_build_object(
      'id', (SELECT id FROM meal_plan WHERE title = 'RPC Plan Updated' LIMIT 1),
      'title', 'Hacked by B',
      'startDate', '2099-03-01',
      'endDate', '2099-03-07',
      'householdIds', jsonb_build_array('00000000-0000-4000-8000-0000000000b0'),
      'portionRequirements', '[]'::jsonb,
      'assignments', '[]'::jsonb
    ))
  $$,
  '42501',
  NULL,
  'member_b calling RPC on A plan is denied (smoke RLS)'
);

RESET ROLE;

SELECT * FROM finish();

ROLLBACK;
