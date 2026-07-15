## NOTES

1. **Atomic write path:** `meal_plan_create_or_update(jsonb)` is `SECURITY INVOKER` + `SET search_path = public`. Authorship (`created_by_household_id` / `created_by_user_id`) is taken only from `current_household_id()` / `auth.uid()` — never from payload. RLS remains the sole authorization authority (D1).
2. **Child reconciliation:** households, portion requirements, and assignments are set-based. Creating household membership is always forced into the set and excluded from destructive delete (matches `mph_delete` policy intent). Portion rows with `count = 0` are deleted/not stored (DB PRD §4.1).
3. **SQLSTATE mapping:** router uses shared `throwFromPostgrest` — `42501` / RLS → FORBIDDEN, `23514` → BAD_REQUEST (trigger messages preserved). Out-of-range assignment is trigger-authoritative (`guard_assignment_in_plan_range`).
4. **effectiveProteinOz:** computed only via `@menu-boss/portion-calc` `calculateEffectiveProteinOz` on byId/listRange/upsert response — no SQL formula reimplementation. `proteinRollup` wraps `weekly_protein_rollup` for the set-based aggregate surface.
5. **Display units:** `formatDisplayQuantity` picks the largest active unit in the same dimension with `qty_base / factor_to_base ≥ 1` (e.g. 680 g → 1.5 lb). Cross-dimension lines group under one ingredient heading; optional lines are a separate group.
6. **share / unshare:** single-row `meal_plan_household` insert/delete under caller JWT — no RPC (brief). Creator membership delete is blocked by RLS; zero-row unshare surfaces NOT_FOUND.
7. **softDelete:** sets `deleted_at` only (no hard delete policy on meal_plan).
8. **pgTAP:** shim-compatible assertions only; pgtap load DO-block matches `aggregation.test.sql`. Creator reconciliation cases + ONE smoke RLS denial (`member_b` on A's plan → 42501).
9. **Integration tests:** env-guarded with `describe.skipIf(!process.env.DATABASE_URL)` + per-test BEGIN/ROLLBACK like portion-calc contract tests. Pure display-unit assertion always runs.
10. **Did not touch** 0001 / 0002 / 0003 or any RLS policies/helpers.
11. **Extensionless imports** throughout (Turbopack).
12. **web package:** added workspace dep `@menu-boss/portion-calc` and devDeps `pg` / `@types/pg` for integration tests.

<!-- TODO(coordinator): Confirm whether soft-deleted plans should appear on byId (historical badge) vs listRange (currently filters deleted_at IS NULL only on listRange). Current: byId returns any RLS-visible plan including soft-deleted. -->

<!-- TODO(coordinator): Confirm shoppingList empty mealPlanIds behavior — implemented as empty array → empty list (RPC returns 0 rows), no BAD_REQUEST. -->

### FILE: supabase/migrations/0004_meal_plan_rpc.sql
```sql
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
      -- RLS blocked the row or plan is missing / soft-deleted â€” fail closed.
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
  -- Rows with count = 0 are never stored (DB PRD Â§4.1).
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
  'current_household_id()/auth.uid() only â€” never from payload.';

REVOKE ALL ON FUNCTION meal_plan_create_or_update(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION meal_plan_create_or_update(jsonb) TO authenticated;
```

### FILE: supabase/tests/functions/meal_plan_rpc.test.sql
```sql
-- MenuBoss pgTAP tests for meal_plan_create_or_update (0004).
-- Creator-persona reconciliation + ONE smoke RLS denial (member_b on A's plan).
-- Shim-compatible: plan / is / ok / lives_ok / throws_ok / results_eq / finish only.
-- Run against migrated DB (0001â€“0004 + seed) as superuser (local gate or supabase test db).

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
      RAISE NOTICE 'pgtap extension unavailable â€” assuming shim-provided assertions';
    END;
  END;
END $$;

SELECT plan(12);

-- ===========================================================================
-- Fixed fixture IDs (â€¦000a9x range â€” avoids seed / aggregation / RLS collisions)
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
-- 3. Out-of-range assignment â†’ 23514 (trigger authority)
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
```

### FILE: packages/schemas/src/mealPlan.ts
```typescript
import { z } from "zod";
import { idInputSchema, nonEmptyTrimmed, uuidSchema } from "./common";

/** ISO date string (YYYY-MM-DD) or full ISO datetime â€” Postgres `::date` accepts both. */
const isoDateSchema = z
  .string()
  .min(1, "date is required")
  .refine((s) => !Number.isNaN(Date.parse(s)), {
    message: "must be a valid ISO date string",
  });

export const mealPlanPortionRequirementInputSchema = z
  .object({
    portionCategoryId: uuidSchema,
    count: z.number().int().min(0, "count must be â‰¥ 0"),
    athleteCount: z.number().int().min(0, "athleteCount must be â‰¥ 0").default(0),
  })
  .refine((r) => r.athleteCount <= r.count, {
    message: "athleteCount must be â‰¤ count",
    path: ["athleteCount"],
  });

export const mealPlanAssignmentInputSchema = z.object({
  id: uuidSchema.optional(),
  recipeId: uuidSchema,
  assignmentDate: isoDateSchema,
  mealSlot: nonEmptyTrimmed,
  servings: z.number().positive("servings must be > 0").default(1),
  notes: z.string().optional(),
});

/**
 * Payload for meal_plan_create_or_update RPC / mealPlan.upsert.
 * DB triggers remain the authority for assignment-in-range and athleteâ‰¤count;
 * Zod provides friendly client errors.
 */
export const mealPlanUpsertInputSchema = z
  .object({
    id: uuidSchema.optional(),
    title: nonEmptyTrimmed,
    description: z.string().optional(),
    startDate: isoDateSchema,
    endDate: isoDateSchema,
    householdIds: z.array(uuidSchema).default([]),
    portionRequirements: z
      .array(mealPlanPortionRequirementInputSchema)
      .default([]),
    assignments: z.array(mealPlanAssignmentInputSchema).default([]),
  })
  .refine(
    (p) => {
      const start = Date.parse(p.startDate);
      const end = Date.parse(p.endDate);
      return end >= start;
    },
    { message: "endDate must be â‰¥ startDate", path: ["endDate"] },
  )
  .refine(
    (p) => {
      const start = Date.parse(p.startDate);
      const end = Date.parse(p.endDate);
      return p.assignments.every((a) => {
        const d = Date.parse(a.assignmentDate);
        return d >= start && d <= end;
      });
    },
    {
      message: "each assignmentDate must fall within [startDate, endDate]",
      path: ["assignments"],
    },
  );

export const shoppingListQuerySchema = z.object({
  mealPlanIds: z.array(uuidSchema).default([]),
});

export const proteinRollupQuerySchema = z.object({
  start: isoDateSchema,
  end: isoDateSchema,
});

export const mealPlanListRangeInputSchema = z
  .object({
    start: isoDateSchema,
    end: isoDateSchema,
  })
  .refine((p) => Date.parse(p.end) >= Date.parse(p.start), {
    message: "end must be â‰¥ start",
    path: ["end"],
  });

export const mealPlanShareInputSchema = z.object({
  mealPlanId: uuidSchema,
  householdId: uuidSchema,
});

export const mealPlanUnshareInputSchema = mealPlanShareInputSchema;

export const mealPlanByIdInputSchema = idInputSchema;
export const mealPlanSoftDeleteInputSchema = idInputSchema;

export type MealPlanPortionRequirementInput = z.infer<
  typeof mealPlanPortionRequirementInputSchema
>;
export type MealPlanAssignmentInput = z.infer<
  typeof mealPlanAssignmentInputSchema
>;
export type MealPlanUpsertInput = z.infer<typeof mealPlanUpsertInputSchema>;
export type ShoppingListQuery = z.infer<typeof shoppingListQuerySchema>;
export type ProteinRollupQuery = z.infer<typeof proteinRollupQuerySchema>;
export type MealPlanListRangeInput = z.infer<typeof mealPlanListRangeInputSchema>;
export type MealPlanShareInput = z.infer<typeof mealPlanShareInputSchema>;
```

### FILE: packages/schemas/src/index.ts
```typescript
export * from "./common";
export * from "./recipe";
export * from "./ingredient";
export * from "./category";
export * from "./tag";
export * from "./chefIdea";
export * from "./recipeCombination";
export * from "./mealPlan";
```

### FILE: apps/web/src/server/routers/mealPlanMapper.ts
```typescript
/**
 * Explicit snake_case (DB) â†” camelCase (TS) mapping for meal-plan domain.
 * Display-unit selection for shopping list (largest unit with qty â‰¥ 1).
 * No ORM. Dumb field renames + pure formatting only.
 */

export type MealPlanRow = {
  id: string;
  title: string;
  description: string | null;
  start_date: string;
  end_date: string;
  created_by_household_id: string;
  created_by_user_id: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type MealPlanAssignmentRow = {
  id: string;
  meal_plan_id: string;
  recipe_id: string;
  assignment_date: string;
  meal_slot: string;
  servings: number;
  notes: string | null;
  created_at: string;
};

export type MealPlanHouseholdRow = {
  meal_plan_id: string;
  household_id: string;
  added_by_user_id: string | null;
  created_at: string;
};

export type MealPlanPortionRequirementRow = {
  meal_plan_id: string;
  portion_category_id: string;
  count: number;
  athlete_count: number;
  updated_at: string;
};

export type UnitRow = {
  id: string;
  name: string;
  abbreviation: string;
  dimension: string;
  factor_to_base: number;
  is_active: boolean;
  sort_order: number | null;
};

export type MealPlanDto = {
  id: string;
  title: string;
  description: string | null;
  startDate: string;
  endDate: string;
  createdByHouseholdId: string;
  createdByUserId: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  isDeleted: boolean;
};

export type MealPlanAssignmentDto = {
  id: string;
  mealPlanId: string;
  recipeId: string;
  assignmentDate: string;
  mealSlot: string;
  servings: number;
  notes: string | null;
  createdAt: string;
};

export type MealPlanPortionRequirementDto = {
  mealPlanId: string;
  portionCategoryId: string;
  count: number;
  athleteCount: number;
  updatedAt: string;
};

export type MealPlanDetailDto = MealPlanDto & {
  householdIds: string[];
  isShared: boolean;
  portionRequirements: MealPlanPortionRequirementDto[];
  assignments: MealPlanAssignmentDto[];
  /** Full-precision effective oz from @menu-boss/portion-calc (not SQL). */
  effectiveProteinOz: number;
};

export type ShoppingListLineDto = {
  ingredientId: string;
  ingredientName: string;
  dimension: string;
  totalQuantityBase: number | null;
  displayQuantity: number | null;
  displayUnitAbbreviation: string | null;
  displayUnitName: string | null;
  isOptional: boolean;
  categoryName: string | null;
  sourceRecipeIds: string[];
  includesDeletedRecipe: boolean;
};

export type ShoppingListIngredientGroupDto = {
  ingredientId: string;
  ingredientName: string;
  categoryName: string | null;
  isOptional: boolean;
  lines: ShoppingListLineDto[];
};

export type ShoppingListDto = {
  required: ShoppingListIngredientGroupDto[];
  optional: ShoppingListIngredientGroupDto[];
};

export function mapMealPlanRow(row: MealPlanRow): MealPlanDto {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    startDate: row.start_date,
    endDate: row.end_date,
    createdByHouseholdId: row.created_by_household_id,
    createdByUserId: row.created_by_user_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
    isDeleted: row.deleted_at != null,
  };
}

export function mapAssignmentRow(
  row: MealPlanAssignmentRow,
): MealPlanAssignmentDto {
  return {
    id: row.id,
    mealPlanId: row.meal_plan_id,
    recipeId: row.recipe_id,
    assignmentDate: row.assignment_date,
    mealSlot: row.meal_slot,
    servings: Number(row.servings),
    notes: row.notes,
    createdAt: row.created_at,
  };
}

export function mapPortionRequirementRow(
  row: MealPlanPortionRequirementRow,
): MealPlanPortionRequirementDto {
  return {
    mealPlanId: row.meal_plan_id,
    portionCategoryId: row.portion_category_id,
    count: Number(row.count),
    athleteCount: Number(row.athlete_count),
    updatedAt: row.updated_at,
  };
}

/**
 * Display unit: among active units of the same dimension, pick the **largest**
 * unit (max factor_to_base) such that quantity_base / factor â‰¥ 1.
 * If none qualify, fall back to the base unit (smallest factor_to_base).
 *
 * Example: 680 g â†’ 680/453.592 â‰ˆ 1.5 lb.
 */
export function formatDisplayQuantity(
  totalQuantityBase: number | null,
  dimension: string,
  units: readonly UnitRow[],
): {
  displayQuantity: number | null;
  displayUnitAbbreviation: string | null;
  displayUnitName: string | null;
} {
  if (totalQuantityBase == null || !Number.isFinite(totalQuantityBase)) {
    return {
      displayQuantity: null,
      displayUnitAbbreviation: null,
      displayUnitName: null,
    };
  }

  const dimUnits = units.filter(
    (u) => u.dimension === dimension && u.is_active !== false,
  );
  if (dimUnits.length === 0) {
    return {
      displayQuantity: totalQuantityBase,
      displayUnitAbbreviation: null,
      displayUnitName: null,
    };
  }

  let best: UnitRow | null = null;
  for (const u of dimUnits) {
    const factor = Number(u.factor_to_base);
    if (!(factor > 0)) continue;
    const qty = totalQuantityBase / factor;
    if (qty >= 1) {
      if (!best || factor > Number(best.factor_to_base)) {
        best = u;
      }
    }
  }

  if (!best) {
    best = dimUnits.reduce((a, b) =>
      Number(a.factor_to_base) <= Number(b.factor_to_base) ? a : b,
    );
  }

  const raw = totalQuantityBase / Number(best.factor_to_base);
  // Two-decimal display round (680 g â†’ 1.5 lb).
  const displayQuantity = Math.round(raw * 100) / 100;

  return {
    displayQuantity,
    displayUnitAbbreviation: best.abbreviation,
    displayUnitName: best.name,
  };
}

type RawShoppingRow = {
  ingredient_id: string;
  ingredient_name: string;
  dimension: string;
  total_quantity_base: number | null;
  is_optional: boolean;
  category_name: string | null;
  source_recipe_ids: string[] | null;
  includes_deleted_recipe: boolean;
};

/**
 * Group RPC rows: cross-dimension lines under one ingredient heading;
 * Optional group separated from required.
 */
export function buildShoppingListDto(
  rows: RawShoppingRow[],
  units: readonly UnitRow[],
): ShoppingListDto {
  type AccKey = string;
  const groupMap = new Map<
    AccKey,
    ShoppingListIngredientGroupDto
  >();

  for (const row of rows) {
    const key = `${row.ingredient_id}::${row.is_optional ? "opt" : "req"}`;
    const display = formatDisplayQuantity(
      row.total_quantity_base == null
        ? null
        : Number(row.total_quantity_base),
      row.dimension,
      units,
    );
    const line: ShoppingListLineDto = {
      ingredientId: row.ingredient_id,
      ingredientName: row.ingredient_name,
      dimension: row.dimension,
      totalQuantityBase:
        row.total_quantity_base == null
          ? null
          : Number(row.total_quantity_base),
      displayQuantity: display.displayQuantity,
      displayUnitAbbreviation: display.displayUnitAbbreviation,
      displayUnitName: display.displayUnitName,
      isOptional: row.is_optional,
      categoryName: row.category_name,
      sourceRecipeIds: row.source_recipe_ids ?? [],
      includesDeletedRecipe: row.includes_deleted_recipe,
    };

    let group = groupMap.get(key);
    if (!group) {
      group = {
        ingredientId: row.ingredient_id,
        ingredientName: row.ingredient_name,
        categoryName: row.category_name,
        isOptional: row.is_optional,
        lines: [],
      };
      groupMap.set(key, group);
    }
    group.lines.push(line);
  }

  const required: ShoppingListIngredientGroupDto[] = [];
  const optional: ShoppingListIngredientGroupDto[] = [];
  for (const g of groupMap.values()) {
    if (g.isOptional) optional.push(g);
    else required.push(g);
  }

  // Stable order: category, ingredient name
  const sortGroups = (a: ShoppingListIngredientGroupDto, b: ShoppingListIngredientGroupDto) => {
    const ca = a.categoryName ?? "";
    const cb = b.categoryName ?? "";
    if (ca !== cb) return ca.localeCompare(cb);
    return a.ingredientName.localeCompare(b.ingredientName);
  };
  required.sort(sortGroups);
  optional.sort(sortGroups);

  return { required, optional };
}
```

### FILE: apps/web/src/server/routers/mealPlan.ts
```typescript
/**
 * mealPlan router â€” household-visibility domain (D6 / D8).
 * Writes go through meal_plan_create_or_update RPC (atomic multi-table).
 * Auth: JWT supabase client; RLS owns authorization. No service role.
 */
import { calculateEffectiveProteinOz } from "@menu-boss/portion-calc";
import {
  mealPlanByIdInputSchema,
  mealPlanListRangeInputSchema,
  mealPlanShareInputSchema,
  mealPlanSoftDeleteInputSchema,
  mealPlanUnshareInputSchema,
  mealPlanUpsertInputSchema,
  proteinRollupQuerySchema,
  shoppingListQuerySchema,
} from "@menu-boss/schemas";
import { assertFound, throwFromPostgrest } from "../dbErrors";
import {
  authedProcedure,
  createTRPCRouter,
  type AppSupabaseClient,
} from "../trpc";
import {
  buildShoppingListDto,
  mapAssignmentRow,
  mapMealPlanRow,
  mapPortionRequirementRow,
  type MealPlanAssignmentRow,
  type MealPlanDetailDto,
  type MealPlanPortionRequirementRow,
  type MealPlanRow,
  type UnitRow,
} from "./mealPlanMapper";

type PortionCategoryRow = {
  id: string;
  slug: string;
  base_protein_oz: number;
  is_active: boolean;
};

async function loadFamilySettings(
  supabase: AppSupabaseClient,
): Promise<{ athleteMultiplier: number }> {
  const { data, error } = await supabase
    .from("family_settings")
    .select("athlete_multiplier")
    .order("id", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throwFromPostgrest(error);
  return {
    athleteMultiplier: Number(data?.athlete_multiplier ?? 1.5),
  };
}

async function loadPortionCategories(
  supabase: AppSupabaseClient,
  ids: string[],
): Promise<PortionCategoryRow[]> {
  if (ids.length === 0) return [];
  const { data, error } = await supabase
    .from("portion_category")
    .select("id, slug, base_protein_oz, is_active")
    .in("id", ids);
  if (error) throwFromPostgrest(error);
  return (data ?? []) as PortionCategoryRow[];
}

function computeEffectiveProteinOz(
  requirements: MealPlanPortionRequirementRow[],
  categories: PortionCategoryRow[],
  athleteMultiplier: number,
): number {
  if (requirements.length === 0) return 0;
  return calculateEffectiveProteinOz(
    requirements.map((r) => ({
      portionCategoryId: r.portion_category_id,
      count: Number(r.count),
      athleteCount: Number(r.athlete_count),
    })),
    categories.map((c) => ({
      id: c.id,
      slug: c.slug,
      baseProteinOz: Number(c.base_protein_oz),
      isActive: c.is_active,
    })),
    { athleteMultiplier },
  );
}

async function loadPlanDetail(
  supabase: AppSupabaseClient,
  planId: string,
): Promise<MealPlanDetailDto> {
  const { data: plan, error } = await supabase
    .from("meal_plan")
    .select("*")
    .eq("id", planId)
    .maybeSingle();
  if (error) throwFromPostgrest(error);
  assertFound(plan, "Meal plan not found");

  const { data: households, error: hhErr } = await supabase
    .from("meal_plan_household")
    .select("household_id")
    .eq("meal_plan_id", planId);
  if (hhErr) throwFromPostgrest(hhErr);

  const { data: portions, error: prErr } = await supabase
    .from("meal_plan_portion_requirement")
    .select("*")
    .eq("meal_plan_id", planId);
  if (prErr) throwFromPostgrest(prErr);

  const { data: assignments, error: asErr } = await supabase
    .from("meal_plan_assignment")
    .select("*")
    .eq("meal_plan_id", planId)
    .order("assignment_date", { ascending: true });
  if (asErr) throwFromPostgrest(asErr);

  const portionRows = (portions ?? []) as MealPlanPortionRequirementRow[];
  const categoryIds = portionRows.map((p) => p.portion_category_id);
  const [categories, settings] = await Promise.all([
    loadPortionCategories(supabase, categoryIds),
    loadFamilySettings(supabase),
  ]);

  const householdIds = (households ?? []).map(
    (h) => h.household_id as string,
  );

  return {
    ...mapMealPlanRow(plan as MealPlanRow),
    householdIds,
    isShared: householdIds.length > 1,
    portionRequirements: portionRows.map(mapPortionRequirementRow),
    assignments: ((assignments ?? []) as MealPlanAssignmentRow[]).map(
      mapAssignmentRow,
    ),
    effectiveProteinOz: computeEffectiveProteinOz(
      portionRows,
      categories,
      settings.athleteMultiplier,
    ),
  };
}

export const mealPlanRouter = createTRPCRouter({
  /**
   * Atomic create/update via meal_plan_create_or_update RPC.
   * Maps SQLSTATE 42501 â†’ FORBIDDEN, 23514 â†’ BAD_REQUEST.
   */
  upsert: authedProcedure
    .input(mealPlanUpsertInputSchema)
    .mutation(async ({ ctx, input }) => {
      const payload = {
        ...(input.id ? { id: input.id } : {}),
        title: input.title,
        description: input.description ?? null,
        startDate: input.startDate.slice(0, 10),
        endDate: input.endDate.slice(0, 10),
        householdIds: input.householdIds,
        portionRequirements: input.portionRequirements.map((r) => ({
          portionCategoryId: r.portionCategoryId,
          count: r.count,
          athleteCount: r.athleteCount,
        })),
        assignments: input.assignments.map((a) => ({
          ...(a.id ? { id: a.id } : {}),
          recipeId: a.recipeId,
          assignmentDate: a.assignmentDate.slice(0, 10),
          mealSlot: a.mealSlot,
          servings: a.servings,
          notes: a.notes ?? null,
        })),
      };

      const { data: planId, error } = await ctx.supabase.rpc(
        "meal_plan_create_or_update",
        { p_payload: payload },
      );
      if (error) throwFromPostgrest(error);
      assertFound(planId, "Meal plan upsert returned no id");

      return loadPlanDetail(ctx.supabase, planId as string);
    }),

  byId: authedProcedure
    .input(mealPlanByIdInputSchema)
    .query(async ({ ctx, input }) => {
      return loadPlanDetail(ctx.supabase, input.id);
    }),

  /**
   * Plans overlapping [start, end] with deleted_at IS NULL.
   * isShared derived from membership count > 1; effectiveProteinOz via portion-calc.
   */
  listRange: authedProcedure
    .input(mealPlanListRangeInputSchema)
    .query(async ({ ctx, input }) => {
      const start = input.start.slice(0, 10);
      const end = input.end.slice(0, 10);

      const { data, error } = await ctx.supabase
        .from("meal_plan")
        .select("*")
        .is("deleted_at", null)
        .lte("start_date", end)
        .gte("end_date", start)
        .order("start_date", { ascending: true });
      if (error) throwFromPostgrest(error);

      const plans = (data ?? []) as MealPlanRow[];
      if (plans.length === 0) return [];

      const planIds = plans.map((p) => p.id);

      const { data: memberships, error: mErr } = await ctx.supabase
        .from("meal_plan_household")
        .select("meal_plan_id, household_id")
        .in("meal_plan_id", planIds);
      if (mErr) throwFromPostgrest(mErr);

      const { data: portions, error: pErr } = await ctx.supabase
        .from("meal_plan_portion_requirement")
        .select("*")
        .in("meal_plan_id", planIds);
      if (pErr) throwFromPostgrest(pErr);

      const portionRows = (portions ?? []) as MealPlanPortionRequirementRow[];
      const categoryIds = [
        ...new Set(portionRows.map((p) => p.portion_category_id)),
      ];
      const [categories, settings] = await Promise.all([
        loadPortionCategories(ctx.supabase, categoryIds),
        loadFamilySettings(ctx.supabase),
      ]);

      const hhByPlan = new Map<string, string[]>();
      for (const m of memberships ?? []) {
        const pid = m.meal_plan_id as string;
        const list = hhByPlan.get(pid) ?? [];
        list.push(m.household_id as string);
        hhByPlan.set(pid, list);
      }

      const portionsByPlan = new Map<string, MealPlanPortionRequirementRow[]>();
      for (const pr of portionRows) {
        const list = portionsByPlan.get(pr.meal_plan_id) ?? [];
        list.push(pr);
        portionsByPlan.set(pr.meal_plan_id, list);
      }

      return plans.map((plan) => {
        const householdIds = hhByPlan.get(plan.id) ?? [];
        const prs = portionsByPlan.get(plan.id) ?? [];
        return {
          ...mapMealPlanRow(plan),
          householdIds,
          isShared: householdIds.length > 1,
          portionRequirements: prs.map(mapPortionRequirementRow),
          effectiveProteinOz: computeEffectiveProteinOz(
            prs,
            categories,
            settings.athleteMultiplier,
          ),
        };
      });
    }),

  /**
   * Wrapper over generate_shopping_list + display-unit formatting.
   * Largest unit â‰¥ 1 in dimension; cross-dimension under one ingredient heading;
   * Optional group separated.
   */
  generateShoppingList: authedProcedure
    .input(shoppingListQuerySchema)
    .query(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase.rpc("generate_shopping_list", {
        p_meal_plan_ids: input.mealPlanIds,
      });
      if (error) throwFromPostgrest(error);

      const { data: units, error: uErr } = await ctx.supabase
        .from("unit")
        .select("id, name, abbreviation, dimension, factor_to_base, is_active, sort_order")
        .eq("is_active", true);
      if (uErr) throwFromPostgrest(uErr);

      return buildShoppingListDto(
        (data ?? []) as Array<{
          ingredient_id: string;
          ingredient_name: string;
          dimension: string;
          total_quantity_base: number | null;
          is_optional: boolean;
          category_name: string | null;
          source_recipe_ids: string[] | null;
          includes_deleted_recipe: boolean;
        }>,
        (units ?? []) as UnitRow[],
      );
    }),

  proteinRollup: authedProcedure
    .input(proteinRollupQuerySchema)
    .query(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase.rpc("weekly_protein_rollup", {
        p_start: input.start.slice(0, 10),
        p_end: input.end.slice(0, 10),
      });
      if (error) throwFromPostgrest(error);

      return ((data ?? []) as Array<{
        meal_plan_id: string;
        title: string;
        start_date: string;
        end_date: string;
        effective_protein_oz: number;
      }>).map((r) => ({
        mealPlanId: r.meal_plan_id,
        title: r.title,
        startDate: r.start_date,
        endDate: r.end_date,
        effectiveProteinOz: Number(r.effective_protein_oz),
      }));
    }),

  softDelete: authedProcedure
    .input(mealPlanSoftDeleteInputSchema)
    .mutation(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from("meal_plan")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", input.id)
        .is("deleted_at", null)
        .select("*")
        .maybeSingle();
      if (error) throwFromPostgrest(error);
      assertFound(data, "Meal plan not found or already deleted");
      return mapMealPlanRow(data as MealPlanRow);
    }),

  /** Single-row share â€” insert meal_plan_household (no RPC needed). */
  share: authedProcedure
    .input(mealPlanShareInputSchema)
    .mutation(async ({ ctx, input }) => {
      const { error } = await ctx.supabase.from("meal_plan_household").insert({
        meal_plan_id: input.mealPlanId,
        household_id: input.householdId,
        added_by_user_id: ctx.userId,
      });
      if (error) throwFromPostgrest(error);
      return loadPlanDetail(ctx.supabase, input.mealPlanId);
    }),

  /** Single-row unshare â€” delete meal_plan_household (creator row blocked by RLS). */
  unshare: authedProcedure
    .input(mealPlanUnshareInputSchema)
    .mutation(async ({ ctx, input }) => {
      const { error, count } = await ctx.supabase
        .from("meal_plan_household")
        .delete({ count: "exact" })
        .eq("meal_plan_id", input.mealPlanId)
        .eq("household_id", input.householdId);
      if (error) throwFromPostgrest(error);
      if (count === 0) {
        // Could be creator-row protection or missing membership â€” fail closed.
        assertFound(null, "Membership not found or cannot be removed");
      }
      return loadPlanDetail(ctx.supabase, input.mealPlanId);
    }),
});
```

### FILE: apps/web/src/server/routers/_app.ts
```typescript
/**
 * Root app router â€” Wave 1 content domain + Wave 2 mealPlan.
 */
import { createTRPCRouter } from "../trpc";
import { categoryRouter } from "./category";
import { chefIdeaRouter } from "./chefIdea";
import { healthRouter } from "./health";
import { ingredientRouter } from "./ingredient";
import { mealPlanRouter } from "./mealPlan";
import { recipeRouter } from "./recipe";
import { recipeCombinationRouter } from "./recipeCombination";
import { tagRouter } from "./tag";

export const appRouter = createTRPCRouter({
  health: healthRouter,
  recipe: recipeRouter,
  ingredient: ingredientRouter,
  category: categoryRouter,
  tag: tagRouter,
  chefIdea: chefIdeaRouter,
  recipeCombination: recipeCombinationRouter,
  mealPlan: mealPlanRouter,
});

export type AppRouter = typeof appRouter;
```

### FILE: apps/web/src/server/routers/__tests__/mealPlan.integration.test.ts
```typescript
/**
 * meal_plan_create_or_update + display-unit integration tests.
 *
 * Env-guarded exactly like packages/portion-calc contract.integration.test.ts:
 * `describe.skipIf(!process.env.DATABASE_URL)`, pg client, per-test BEGIN/ROLLBACK.
 *
 * Requires a migrated DB (0001â€“0004 + seed). Without DATABASE_URL the suite is SKIPPED.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { formatDisplayQuantity, type UnitRow } from "../mealPlanMapper";

const databaseUrl = process.env.DATABASE_URL;

const MEMBER_A = "00000000-0000-4000-8000-0000000000a1";
const HOUSEHOLD_A = "00000000-0000-4000-8000-0000000000a0";
const HOUSEHOLD_B = "00000000-0000-4000-8000-0000000000b0";
const ADULT_MALE = "00000000-0000-4000-8000-000000000207";
const ADULT_FEMALE = "00000000-0000-4000-8000-000000000206";

const MASS_UNITS: UnitRow[] = [
  {
    id: "00000000-0000-4000-8000-000000000101",
    name: "gram",
    abbreviation: "g",
    dimension: "mass",
    factor_to_base: 1,
    is_active: true,
    sort_order: 10,
  },
  {
    id: "00000000-0000-4000-8000-000000000103",
    name: "ounce",
    abbreviation: "oz",
    dimension: "mass",
    factor_to_base: 28.3495,
    is_active: true,
    sort_order: 30,
  },
  {
    id: "00000000-0000-4000-8000-000000000104",
    name: "pound",
    abbreviation: "lb",
    dimension: "mass",
    factor_to_base: 453.592,
    is_active: true,
    sort_order: 40,
  },
];

/** Pure display-unit formatting â€” always runs (no DB). */
describe("shopping list display units", () => {
  it('formats 680 g as 1.5 lb (largest unit â‰¥ 1)', () => {
    const result = formatDisplayQuantity(680, "mass", MASS_UNITS);
    expect(result.displayUnitAbbreviation).toBe("lb");
    expect(result.displayQuantity).toBeCloseTo(1.5, 5);
  });
});

describe.skipIf(!databaseUrl)("mealPlan RPC integration", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let client: any;

  beforeAll(async () => {
    const { Client } = await import("pg");
    client = new Client({ connectionString: databaseUrl });
    await client.connect();
  });

  afterAll(async () => {
    await client?.end();
  });

  async function asMemberA() {
    await client.query(
      `SELECT set_config(
         'request.jwt.claims',
         $1,
         true
       )`,
      [`{"sub":"${MEMBER_A}","role":"authenticated"}`],
    );
  }

  async function ensureFixtures(recipeId: string) {
    await client.query(
      `INSERT INTO household (id, name, family_id)
       VALUES ($1, 'Household A', 'menuboss-family'),
              ($2, 'Household B', 'menuboss-family')
       ON CONFLICT (id) DO NOTHING`,
      [HOUSEHOLD_A, HOUSEHOLD_B],
    );
    await client.query(
      `INSERT INTO profile (id, household_id, display_name, role)
       VALUES ($1, $2, 'Member A', 'member')
       ON CONFLICT (id) DO NOTHING`,
      [MEMBER_A, HOUSEHOLD_A],
    );
    await client.query(
      `INSERT INTO portion_category (id, name, slug, base_protein_oz, sort_order)
       VALUES
         ($1, 'Adult Male', 'adult-male', 6.0, 70),
         ($2, 'Adult Female', 'adult-female', 5.0, 60)
       ON CONFLICT (slug) DO NOTHING`,
      [ADULT_MALE, ADULT_FEMALE],
    );
    await client.query(
      `INSERT INTO recipe (id, title, yield_servings, created_by_user_id)
       VALUES ($1, 'Integration Recipe', 4, $2)
       ON CONFLICT (id) DO NOTHING`,
      [recipeId, MEMBER_A],
    );
  }

  it("upsert creates meal_plan + household + portion + assignment rows", async () => {
    await client.query("BEGIN");
    try {
      const recipeId = randomUUID();
      const assignmentId = randomUUID();
      await ensureFixtures(recipeId);
      await asMemberA();

      const { rows } = await client.query(
        `SELECT meal_plan_create_or_update($1::jsonb) AS id`,
        [
          JSON.stringify({
            title: "Integration Create",
            startDate: "2099-06-01",
            endDate: "2099-06-07",
            householdIds: [HOUSEHOLD_A, HOUSEHOLD_B],
            portionRequirements: [
              {
                portionCategoryId: ADULT_MALE,
                count: 2,
                athleteCount: 1,
              },
            ],
            assignments: [
              {
                id: assignmentId,
                recipeId,
                assignmentDate: "2099-06-02",
                mealSlot: "dinner",
                servings: 6,
              },
            ],
          }),
        ],
      );
      const planId = rows[0].id as string;
      expect(planId).toBeTruthy();

      const plan = await client.query(
        `SELECT title, created_by_household_id, created_by_user_id
         FROM meal_plan WHERE id = $1`,
        [planId],
      );
      expect(plan.rows[0].title).toBe("Integration Create");
      expect(plan.rows[0].created_by_household_id).toBe(HOUSEHOLD_A);
      expect(plan.rows[0].created_by_user_id).toBe(MEMBER_A);

      const mph = await client.query(
        `SELECT household_id FROM meal_plan_household
         WHERE meal_plan_id = $1 ORDER BY household_id`,
        [planId],
      );
      expect(mph.rows.map((r: { household_id: string }) => r.household_id)).toEqual(
        [HOUSEHOLD_A, HOUSEHOLD_B].sort(),
      );

      const pr = await client.query(
        `SELECT count, athlete_count FROM meal_plan_portion_requirement
         WHERE meal_plan_id = $1`,
        [planId],
      );
      expect(pr.rows).toHaveLength(1);
      expect(Number(pr.rows[0].count)).toBe(2);
      expect(Number(pr.rows[0].athlete_count)).toBe(1);

      const asg = await client.query(
        `SELECT id, meal_slot, servings FROM meal_plan_assignment
         WHERE meal_plan_id = $1`,
        [planId],
      );
      expect(asg.rows).toHaveLength(1);
      expect(asg.rows[0].id).toBe(assignmentId);
      expect(asg.rows[0].meal_slot).toBe("dinner");
      expect(Number(asg.rows[0].servings)).toBe(6);
    } finally {
      await client.query("ROLLBACK");
    }
  });

  it("reconciliation deletes removed assignments", async () => {
    await client.query("BEGIN");
    try {
      const recipeId = randomUUID();
      const keepId = randomUUID();
      const dropId = randomUUID();
      await ensureFixtures(recipeId);
      await asMemberA();

      const { rows: created } = await client.query(
        `SELECT meal_plan_create_or_update($1::jsonb) AS id`,
        [
          JSON.stringify({
            title: "Recon Plan",
            startDate: "2099-06-01",
            endDate: "2099-06-07",
            householdIds: [HOUSEHOLD_A],
            portionRequirements: [],
            assignments: [
              {
                id: keepId,
                recipeId,
                assignmentDate: "2099-06-01",
                mealSlot: "lunch",
                servings: 2,
              },
              {
                id: dropId,
                recipeId,
                assignmentDate: "2099-06-02",
                mealSlot: "dinner",
                servings: 2,
              },
            ],
          }),
        ],
      );
      const planId = created[0].id as string;

      await client.query(`SELECT meal_plan_create_or_update($1::jsonb)`, [
        JSON.stringify({
          id: planId,
          title: "Recon Plan",
          startDate: "2099-06-01",
          endDate: "2099-06-07",
          householdIds: [HOUSEHOLD_A],
          portionRequirements: [],
          assignments: [
            {
              id: keepId,
              recipeId,
              assignmentDate: "2099-06-01",
              mealSlot: "lunch",
              servings: 3,
            },
          ],
        }),
      ]);

      const asg = await client.query(
        `SELECT id, servings FROM meal_plan_assignment
         WHERE meal_plan_id = $1`,
        [planId],
      );
      expect(asg.rows).toHaveLength(1);
      expect(asg.rows[0].id).toBe(keepId);
      expect(Number(asg.rows[0].servings)).toBe(3);
    } finally {
      await client.query("ROLLBACK");
    }
  });

  it("zero-count portion rows are not stored", async () => {
    await client.query("BEGIN");
    try {
      const recipeId = randomUUID();
      await ensureFixtures(recipeId);
      await asMemberA();

      const { rows } = await client.query(
        `SELECT meal_plan_create_or_update($1::jsonb) AS id`,
        [
          JSON.stringify({
            title: "Zero Count Plan",
            startDate: "2099-06-01",
            endDate: "2099-06-07",
            householdIds: [HOUSEHOLD_A],
            portionRequirements: [
              {
                portionCategoryId: ADULT_MALE,
                count: 0,
                athleteCount: 0,
              },
              {
                portionCategoryId: ADULT_FEMALE,
                count: 1,
                athleteCount: 0,
              },
            ],
            assignments: [],
          }),
        ],
      );
      const planId = rows[0].id as string;

      const pr = await client.query(
        `SELECT portion_category_id, count
         FROM meal_plan_portion_requirement
         WHERE meal_plan_id = $1`,
        [planId],
      );
      expect(pr.rows).toHaveLength(1);
      expect(pr.rows[0].portion_category_id).toBe(ADULT_FEMALE);
      expect(Number(pr.rows[0].count)).toBe(1);
    } finally {
      await client.query("ROLLBACK");
    }
  });

  it("out-of-range assignment surfaces 23514", async () => {
    await client.query("BEGIN");
    try {
      const recipeId = randomUUID();
      await ensureFixtures(recipeId);
      await asMemberA();

      let code: string | undefined;
      try {
        await client.query(`SELECT meal_plan_create_or_update($1::jsonb)`, [
          JSON.stringify({
            title: "OOR Plan",
            startDate: "2099-06-01",
            endDate: "2099-06-07",
            householdIds: [HOUSEHOLD_A],
            portionRequirements: [],
            assignments: [
              {
                recipeId,
                assignmentDate: "2099-07-15",
                mealSlot: "dinner",
                servings: 1,
              },
            ],
          }),
        ]);
      } catch (e: unknown) {
        code = (e as { code?: string }).code;
      }
      expect(code).toBe("23514");
    } finally {
      await client.query("ROLLBACK");
    }
  });

  it("creating-household membership survives reconciliation", async () => {
    await client.query("BEGIN");
    try {
      const recipeId = randomUUID();
      await ensureFixtures(recipeId);
      await asMemberA();

      const { rows } = await client.query(
        `SELECT meal_plan_create_or_update($1::jsonb) AS id`,
        [
          JSON.stringify({
            title: "Creator Survive",
            startDate: "2099-06-01",
            endDate: "2099-06-07",
            householdIds: [HOUSEHOLD_A, HOUSEHOLD_B],
            portionRequirements: [],
            assignments: [],
          }),
        ],
      );
      const planId = rows[0].id as string;

      // Omit creating household from householdIds â€” must still remain.
      await client.query(`SELECT meal_plan_create_or_update($1::jsonb)`, [
        JSON.stringify({
          id: planId,
          title: "Creator Survive",
          startDate: "2099-06-01",
          endDate: "2099-06-07",
          householdIds: [HOUSEHOLD_B],
          portionRequirements: [],
          assignments: [],
        }),
      ]);

      const mph = await client.query(
        `SELECT household_id FROM meal_plan_household
         WHERE meal_plan_id = $1 ORDER BY household_id`,
        [planId],
      );
      const ids = mph.rows.map((r: { household_id: string }) => r.household_id);
      expect(ids).toContain(HOUSEHOLD_A);
      expect(ids).toContain(HOUSEHOLD_B);
    } finally {
      await client.query("ROLLBACK");
    }
  });
});
```

### FILE: packages/schemas/package.json
```json
{
  "name": "@menu-boss/schemas",
  "version": "0.1.0",
  "description": "Shared Zod schemas for MenuBoss tRPC procedures and forms.",
  "type": "module",
  "main": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts",
    "./common": "./src/common.ts",
    "./recipe": "./src/recipe.ts",
    "./ingredient": "./src/ingredient.ts",
    "./category": "./src/category.ts",
    "./tag": "./src/tag.ts",
    "./chefIdea": "./src/chefIdea.ts",
    "./recipeCombination": "./src/recipeCombination.ts",
    "./mealPlan": "./src/mealPlan.ts"
  },
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "files": [
    "src"
  ],
  "keywords": [
    "menu-boss",
    "zod",
    "schemas"
  ],
  "license": "UNLICENSED",
  "private": true,
  "dependencies": {
    "zod": "^3.24.1"
  },
  "devDependencies": {
    "@types/node": "^22.10.7",
    "typescript": "^5.7.3",
    "vitest": "^3.0.5"
  },
  "engines": {
    "node": ">=20"
  }
}
```

### FILE: apps/web/package.json
```json
{
  "name": "web",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:e2e": "playwright test"
  },
  "dependencies": {
    "@hookform/resolvers": "^5.4.0",
    "@menu-boss/portion-calc": "workspace:*",
    "@menu-boss/schemas": "workspace:*",
    "@supabase/ssr": "^0.12.1",
    "@supabase/supabase-js": "^2.110.4",
    "@tanstack/react-query": "^5.101.2",
    "@trpc/client": "^11.18.0",
    "@trpc/server": "^11.18.0",
    "@trpc/tanstack-react-query": "^11.18.0",
    "next": "16.2.10",
    "react": "19.2.4",
    "react-dom": "19.2.4",
    "react-hook-form": "^7.81.0",
    "superjson": "^2.2.6",
    "zod": "^3.25.76"
  },
  "devDependencies": {
    "@playwright/test": "^1.61.1",
    "@tailwindcss/postcss": "^4",
    "@types/node": "^20",
    "@types/pg": "^8.20.0",
    "@types/react": "^19",
    "@types/react-dom": "^19",
    "eslint": "^9",
    "eslint-config-next": "16.2.10",
    "pg": "^8.22.0",
    "tailwindcss": "^4",
    "typescript": "^5",
    "vitest": "^3.2.7"
  }
}
```

