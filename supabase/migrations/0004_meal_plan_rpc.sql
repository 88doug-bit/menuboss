-- MenuBoss 0004_meal_plan_rpc.sql
-- Atomic meal-plan write path (D1 / D6 / D8).
-- SECURITY INVOKER: RLS on meal_plan + children is the sole authorization authority.
-- Does NOT duplicate helpers or policies from 0002.

CREATE OR REPLACE FUNCTION meal_plan_create_or_update(p_payload jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_id              uuid;
  v_title           text;
  v_description     text;
  v_start           date;
  v_end             date;
  v_uid             uuid := auth.uid();
  v_hh              uuid := current_household_id();
  v_creating_hh     uuid;
  v_household_ids   uuid[];
  v_assignments     jsonb;
  v_rowcount        integer;
BEGIN
  IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' THEN
    RAISE EXCEPTION 'p_payload must be a JSON object'
      USING ERRCODE = '22023';
  END IF;

  v_title       := nullif(trim(p_payload->>'title'), '');
  v_description := p_payload->>'description';
  v_start       := (p_payload->>'startDate')::date;
  v_end         := (p_payload->>'endDate')::date;

  IF v_title IS NULL THEN
    RAISE EXCEPTION 'title is required'
      USING ERRCODE = '23502';
  END IF;
  IF v_start IS NULL OR v_end IS NULL THEN
    RAISE EXCEPTION 'startDate and endDate are required'
      USING ERRCODE = '23502';
  END IF;

  -- ------------------------------------------------------------------
  -- meal_plan header
  -- ------------------------------------------------------------------
  IF p_payload ? 'id' AND nullif(p_payload->>'id', '') IS NOT NULL THEN
    v_id := (p_payload->>'id')::uuid;

    UPDATE meal_plan
    SET
      title       = v_title,
      description = v_description,
      start_date  = v_start,
      end_date    = v_end
    WHERE id = v_id
      AND deleted_at IS NULL;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
      -- RLS blocked the row or plan is missing / soft-deleted — fail closed.
      RAISE EXCEPTION 'not permitted to update meal plan %', v_id
        USING ERRCODE = '42501';
    END IF;

    SELECT created_by_household_id INTO v_creating_hh
    FROM meal_plan
    WHERE id = v_id;
  ELSE
    IF v_uid IS NULL OR v_hh IS NULL THEN
      RAISE EXCEPTION 'authenticated household context required to create a meal plan'
        USING ERRCODE = '42501';
    END IF;

    INSERT INTO meal_plan (
      title,
      description,
      start_date,
      end_date,
      created_by_household_id,
      created_by_user_id
    ) VALUES (
      v_title,
      v_description,
      v_start,
      v_end,
      v_hh,
      v_uid
    )
    RETURNING id, created_by_household_id
    INTO v_id, v_creating_hh;
  END IF;

  -- ------------------------------------------------------------------
  -- meal_plan_household reconciliation
  -- Creating household is ALWAYS retained (mph_delete policy also enforces).
  -- ------------------------------------------------------------------
  SELECT COALESCE(array_agg(DISTINCT x.hid), ARRAY[]::uuid[])
  INTO v_household_ids
  FROM (
    SELECT (elem)::uuid AS hid
    FROM jsonb_array_elements_text(
      COALESCE(p_payload->'householdIds', '[]'::jsonb)
    ) AS elem
  ) x
  WHERE x.hid IS NOT NULL;

  -- Force creating household into the membership set.
  IF NOT (v_creating_hh = ANY (v_household_ids)) THEN
    v_household_ids := array_append(v_household_ids, v_creating_hh);
  END IF;

  DELETE FROM meal_plan_household mph
  WHERE mph.meal_plan_id = v_id
    AND mph.household_id IS DISTINCT FROM v_creating_hh
    AND NOT (mph.household_id = ANY (v_household_ids));

  INSERT INTO meal_plan_household (meal_plan_id, household_id, added_by_user_id)
  SELECT v_id, hid, v_uid
  FROM unnest(v_household_ids) AS hid
  ON CONFLICT (meal_plan_id, household_id) DO NOTHING;

  -- ------------------------------------------------------------------
  -- meal_plan_portion_requirement reconciliation
  -- Rows with count = 0 are never stored (DB PRD §4.1).
  -- ------------------------------------------------------------------
  DELETE FROM meal_plan_portion_requirement mppr
  WHERE mppr.meal_plan_id = v_id
    AND NOT EXISTS (
      SELECT 1
      FROM jsonb_array_elements(
        COALESCE(p_payload->'portionRequirements', '[]'::jsonb)
      ) AS pr
      WHERE (pr->>'portionCategoryId')::uuid = mppr.portion_category_id
        AND (pr->>'count')::smallint > 0
    );

  INSERT INTO meal_plan_portion_requirement (
    meal_plan_id, portion_category_id, count, athlete_count
  )
  SELECT
    v_id,
    (pr->>'portionCategoryId')::uuid,
    (pr->>'count')::smallint,
    COALESCE((pr->>'athleteCount')::smallint, 0)
  FROM jsonb_array_elements(
    COALESCE(p_payload->'portionRequirements', '[]'::jsonb)
  ) AS pr
  WHERE (pr->>'count')::smallint > 0
  ON CONFLICT (meal_plan_id, portion_category_id) DO UPDATE
  SET
    count         = EXCLUDED.count,
    athlete_count = EXCLUDED.athlete_count,
    updated_at    = now();

  -- ------------------------------------------------------------------
  -- meal_plan_assignment reconciliation (set-based)
  -- Normalize once so generated ids are stable for DELETE + UPSERT.
  -- ------------------------------------------------------------------
  SELECT COALESCE(
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', COALESCE(nullif(a->>'id', '')::uuid, gen_random_uuid()),
          'recipeId', (a->>'recipeId')::uuid,
          'assignmentDate', (a->>'assignmentDate')::date,
          'mealSlot', nullif(trim(a->>'mealSlot'), ''),
          'servings', COALESCE((a->>'servings')::numeric, 1),
          'notes', a->>'notes'
        )
      )
      FROM jsonb_array_elements(
        COALESCE(p_payload->'assignments', '[]'::jsonb)
      ) AS a
    ),
    '[]'::jsonb
  )
  INTO v_assignments;

  DELETE FROM meal_plan_assignment mpa
  WHERE mpa.meal_plan_id = v_id
    AND NOT EXISTS (
      SELECT 1
      FROM jsonb_array_elements(v_assignments) AS a
      WHERE (a->>'id')::uuid = mpa.id
    );

  INSERT INTO meal_plan_assignment (
    id, meal_plan_id, recipe_id, assignment_date, meal_slot, servings, notes
  )
  SELECT
    (a->>'id')::uuid,
    v_id,
    (a->>'recipeId')::uuid,
    (a->>'assignmentDate')::date,
    a->>'mealSlot',
    (a->>'servings')::numeric,
    a->>'notes'
  FROM jsonb_array_elements(v_assignments) AS a
  ON CONFLICT (id) DO UPDATE
  SET
    recipe_id        = EXCLUDED.recipe_id,
    assignment_date  = EXCLUDED.assignment_date,
    meal_slot        = EXCLUDED.meal_slot,
    servings         = EXCLUDED.servings,
    notes            = EXCLUDED.notes
  WHERE meal_plan_assignment.meal_plan_id = v_id;

  RETURN v_id;
END;
$$;

COMMENT ON FUNCTION meal_plan_create_or_update(jsonb) IS
  'Atomic meal plan upsert (SECURITY INVOKER). Reconciles household membership, '
  'portion requirements (drops count=0), and assignments. Authorship from '
  'current_household_id()/auth.uid() only — never from payload.';

REVOKE ALL ON FUNCTION meal_plan_create_or_update(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION meal_plan_create_or_update(jsonb) TO authenticated;
