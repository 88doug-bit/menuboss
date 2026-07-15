-- MenuBoss FULL RLS GRID (coordinator-authored) — Product PRD v0.2 §11:
-- "every table × every persona × {SELECT, INSERT, UPDATE, DELETE}".
-- The scenario matrix (matrix.test.sql) covers nuanced flows; this file is the
-- exhaustive mechanical sweep. Every public table MUST have a manifest row —
-- the completeness assertion fails when a migration adds a table without one.
--
-- Verdicts: rows / empty (SELECT) · allowed / zero / denied (writes).
-- Probes run as the REAL persona and inside an always-aborted subtransaction,
-- so no probe ever persists a change.

BEGIN;

-- ===========================================================================
-- Fixtures (superuser): one addressable row per table + the plan pair
-- (P1 private A, P2 shared A+B). 9011/9012 are UNREFERENCED rows for the
-- admin hard-delete probes (9001/9002 carry RESTRICT references).
-- ===========================================================================
INSERT INTO recipe (id, title, created_by_user_id, yield_servings) VALUES
  ('00000000-0000-4000-8000-000000009001', 'Grid Recipe', '00000000-0000-4000-8000-0000000000a1', 4),
  ('00000000-0000-4000-8000-000000009011', 'Grid Recipe deletable', '00000000-0000-4000-8000-0000000000a1', 1);
INSERT INTO ingredient (id, name, created_by_user_id) VALUES
  ('00000000-0000-4000-8000-000000009002', 'Grid Ingredient zz-unique', '00000000-0000-4000-8000-0000000000a1'),
  ('00000000-0000-4000-8000-000000009012', 'Grid Ingredient deletable zz', '00000000-0000-4000-8000-0000000000a1');
INSERT INTO chef_idea (id, title, created_by_user_id) VALUES
  ('00000000-0000-4000-8000-000000009003', 'Grid Idea', '00000000-0000-4000-8000-0000000000a1');
INSERT INTO recipe_combination (id, name, created_by_user_id) VALUES
  ('00000000-0000-4000-8000-000000009004', 'Grid Combo', '00000000-0000-4000-8000-0000000000a1');
INSERT INTO recipe_ingredient (id, recipe_id, ingredient_id, quantity, unit_id) VALUES
  ('00000000-0000-4000-8000-000000009005', '00000000-0000-4000-8000-000000009001',
   '00000000-0000-4000-8000-000000009002', 1, '00000000-0000-4000-8000-000000000101');
INSERT INTO recipe_category (recipe_id, category_id) VALUES
  ('00000000-0000-4000-8000-000000009001', '00000000-0000-4000-8000-000000000401');
INSERT INTO recipe_tag (recipe_id, tag_id) VALUES
  ('00000000-0000-4000-8000-000000009001', '00000000-0000-4000-8000-000000000503');
INSERT INTO ingredient_category (ingredient_id, category_id) VALUES
  ('00000000-0000-4000-8000-000000009002', '00000000-0000-4000-8000-000000000401');
INSERT INTO ingredient_tag (ingredient_id, tag_id) VALUES
  ('00000000-0000-4000-8000-000000009002', '00000000-0000-4000-8000-000000000503');
INSERT INTO recipe_combination_recipe (recipe_combination_id, recipe_id, role_in_meal) VALUES
  ('00000000-0000-4000-8000-000000009004', '00000000-0000-4000-8000-000000009001', 'main');
INSERT INTO chef_idea_category (chef_idea_id, category_id) VALUES
  ('00000000-0000-4000-8000-000000009003', '00000000-0000-4000-8000-000000000401');
INSERT INTO chef_idea_tag (chef_idea_id, tag_id) VALUES
  ('00000000-0000-4000-8000-000000009003', '00000000-0000-4000-8000-000000000503');

-- Plans: P1 private to A, P2 shared A+B (grid-local ids, not matrix's)
INSERT INTO meal_plan (id, title, start_date, end_date, created_by_household_id, created_by_user_id) VALUES
  ('00000000-0000-4000-8000-000000009101', 'Grid P1 private A', '2098-01-01', '2098-01-07',
   '00000000-0000-4000-8000-0000000000a0', '00000000-0000-4000-8000-0000000000a1'),
  ('00000000-0000-4000-8000-000000009102', 'Grid P2 shared A+B', '2098-01-01', '2098-01-07',
   '00000000-0000-4000-8000-0000000000a0', '00000000-0000-4000-8000-0000000000a1');
INSERT INTO meal_plan_household (meal_plan_id, household_id) VALUES
  ('00000000-0000-4000-8000-000000009101', '00000000-0000-4000-8000-0000000000a0'),
  ('00000000-0000-4000-8000-000000009102', '00000000-0000-4000-8000-0000000000a0'),
  ('00000000-0000-4000-8000-000000009102', '00000000-0000-4000-8000-0000000000b0');
INSERT INTO meal_plan_assignment (id, meal_plan_id, recipe_id, assignment_date, meal_slot) VALUES
  ('00000000-0000-4000-8000-000000009103', '00000000-0000-4000-8000-000000009102',
   '00000000-0000-4000-8000-000000009001', '2098-01-02', 'dinner');
INSERT INTO meal_plan_portion_requirement (meal_plan_id, portion_category_id, count, athlete_count) VALUES
  ('00000000-0000-4000-8000-000000009102', '00000000-0000-4000-8000-000000000207', 2, 0);
INSERT INTO household_invite (id, email, household_id) VALUES
  ('00000000-0000-4000-8000-000000009104', 'grid-fixture@example.com',
   '00000000-0000-4000-8000-0000000000c0');
-- audit_log rows exist as a side effect of the fixture writes above.

-- ===========================================================================
-- Manifest: every public table → shape + probe templates.
--   %ME% is replaced with the persona's profile uuid at probe time.
-- ===========================================================================
CREATE TEMP TABLE grid_manifest (
  tbl     text PRIMARY KEY,
  shape   text NOT NULL,
  ins_sql text NOT NULL,
  upd_sql text NOT NULL,
  del_sql text NOT NULL
) ON COMMIT DROP;

INSERT INTO grid_manifest VALUES
-- Shape A1: family-global content entities
('recipe', 'A1',
 $$INSERT INTO recipe (title, created_by_user_id, yield_servings) VALUES ('grid-probe', '%ME%', 1)$$,
 $$UPDATE recipe SET title = 'grid-upd' WHERE id = '00000000-0000-4000-8000-000000009001'$$,
 $$DELETE FROM recipe WHERE id = '00000000-0000-4000-8000-000000009011'$$),
('ingredient', 'A1',
 $$INSERT INTO ingredient (name, created_by_user_id) VALUES ('grid-probe-zz-' || '%ME%', '%ME%')$$,
 $$UPDATE ingredient SET description = 'grid-upd' WHERE id = '00000000-0000-4000-8000-000000009002'$$,
 $$DELETE FROM ingredient WHERE id = '00000000-0000-4000-8000-000000009012'$$),
('chef_idea', 'A1',
 $$INSERT INTO chef_idea (title, created_by_user_id) VALUES ('grid-probe', '%ME%')$$,
 $$UPDATE chef_idea SET notes = 'grid-upd' WHERE id = '00000000-0000-4000-8000-000000009003'$$,
 $$DELETE FROM chef_idea WHERE id = '00000000-0000-4000-8000-000000009003'$$),
('recipe_combination', 'A1',
 $$INSERT INTO recipe_combination (name, created_by_user_id) VALUES ('grid-probe', '%ME%')$$,
 $$UPDATE recipe_combination SET notes = 'grid-upd' WHERE id = '00000000-0000-4000-8000-000000009004'$$,
 $$DELETE FROM recipe_combination WHERE id = '00000000-0000-4000-8000-000000009004'$$),
-- Shape A2: content junctions
('recipe_ingredient', 'A2',
 $$INSERT INTO recipe_ingredient (recipe_id, ingredient_id, quantity, unit_id)
   VALUES ('00000000-0000-4000-8000-000000009001', '00000000-0000-4000-8000-000000009002', 2,
           '00000000-0000-4000-8000-000000000102')$$,
 $$UPDATE recipe_ingredient SET preparation_note = 'grid-upd' WHERE id = '00000000-0000-4000-8000-000000009005'$$,
 $$DELETE FROM recipe_ingredient WHERE id = '00000000-0000-4000-8000-000000009005'$$),
('recipe_category', 'A2',
 $$INSERT INTO recipe_category (recipe_id, category_id)
   VALUES ('00000000-0000-4000-8000-000000009001', '00000000-0000-4000-8000-000000000402')$$,
 $$UPDATE recipe_category SET created_at = created_at WHERE recipe_id = '00000000-0000-4000-8000-000000009001'$$,
 $$DELETE FROM recipe_category WHERE recipe_id = '00000000-0000-4000-8000-000000009001'$$),
('recipe_tag', 'A2',
 $$INSERT INTO recipe_tag (recipe_id, tag_id)
   VALUES ('00000000-0000-4000-8000-000000009001', '00000000-0000-4000-8000-000000000501')$$,
 $$UPDATE recipe_tag SET created_at = created_at WHERE recipe_id = '00000000-0000-4000-8000-000000009001'$$,
 $$DELETE FROM recipe_tag WHERE recipe_id = '00000000-0000-4000-8000-000000009001'$$),
('ingredient_category', 'A2',
 $$INSERT INTO ingredient_category (ingredient_id, category_id)
   VALUES ('00000000-0000-4000-8000-000000009002', '00000000-0000-4000-8000-000000000402')$$,
 $$UPDATE ingredient_category SET created_at = created_at WHERE ingredient_id = '00000000-0000-4000-8000-000000009002'$$,
 $$DELETE FROM ingredient_category WHERE ingredient_id = '00000000-0000-4000-8000-000000009002'$$),
('ingredient_tag', 'A2',
 $$INSERT INTO ingredient_tag (ingredient_id, tag_id)
   VALUES ('00000000-0000-4000-8000-000000009002', '00000000-0000-4000-8000-000000000501')$$,
 $$UPDATE ingredient_tag SET created_at = created_at WHERE ingredient_id = '00000000-0000-4000-8000-000000009002'$$,
 $$DELETE FROM ingredient_tag WHERE ingredient_id = '00000000-0000-4000-8000-000000009002'$$),
('recipe_combination_recipe', 'A2',
 $$INSERT INTO recipe_combination_recipe (recipe_combination_id, recipe_id, role_in_meal)
   VALUES ('00000000-0000-4000-8000-000000009004', '00000000-0000-4000-8000-000000009011', 'side')$$,
 $$UPDATE recipe_combination_recipe SET notes = 'grid-upd'
   WHERE recipe_combination_id = '00000000-0000-4000-8000-000000009004'$$,
 $$DELETE FROM recipe_combination_recipe
   WHERE recipe_combination_id = '00000000-0000-4000-8000-000000009004'$$),
('chef_idea_category', 'A2',
 $$INSERT INTO chef_idea_category (chef_idea_id, category_id)
   VALUES ('00000000-0000-4000-8000-000000009003', '00000000-0000-4000-8000-000000000402')$$,
 $$UPDATE chef_idea_category SET created_at = created_at WHERE chef_idea_id = '00000000-0000-4000-8000-000000009003'$$,
 $$DELETE FROM chef_idea_category WHERE chef_idea_id = '00000000-0000-4000-8000-000000009003'$$),
('chef_idea_tag', 'A2',
 $$INSERT INTO chef_idea_tag (chef_idea_id, tag_id)
   VALUES ('00000000-0000-4000-8000-000000009003', '00000000-0000-4000-8000-000000000501')$$,
 $$UPDATE chef_idea_tag SET created_at = created_at WHERE chef_idea_id = '00000000-0000-4000-8000-000000009003'$$,
 $$DELETE FROM chef_idea_tag WHERE chef_idea_id = '00000000-0000-4000-8000-000000009003'$$),
-- Shape C: admin vocabularies
('unit', 'C',
 $$INSERT INTO unit (name, abbreviation, dimension, factor_to_base) VALUES ('grid-probe-unit', 'gp', 'mass', 2)$$,
 $$UPDATE unit SET sort_order = 999 WHERE name = 'gram'$$,
 $$DELETE FROM unit WHERE name = 'gram'$$),
('portion_category', 'C',
 $$INSERT INTO portion_category (name, slug, base_protein_oz) VALUES ('grid-probe', 'grid-probe-pc', 1)$$,
 $$UPDATE portion_category SET description = 'grid-upd' WHERE slug = 'adult-male'$$,
 $$DELETE FROM portion_category WHERE slug = 'child'$$),
('family_settings', 'C',
 $$INSERT INTO family_settings (athlete_multiplier) VALUES (1.7)$$,
 $$UPDATE family_settings SET athlete_multiplier = athlete_multiplier$$,
 $$DELETE FROM family_settings$$),
('category', 'C',
 $$INSERT INTO category (name, slug) VALUES ('grid-probe', 'grid-probe-cat')$$,
 $$UPDATE category SET description = 'grid-upd' WHERE slug = 'protein'$$,
 $$DELETE FROM category WHERE slug = 'seafood'$$),
('tag', 'C',
 $$INSERT INTO tag (name, slug, tag_group) VALUES ('grid-probe', 'grid-probe-tag', 'cuisine')$$,
 $$UPDATE tag SET description = 'grid-upd' WHERE slug = 'dinner'$$,
 $$DELETE FROM tag WHERE slug = 'dinner'$$),
('household', 'C',
 $$INSERT INTO household (name, family_id) VALUES ('grid-probe', 'menuboss-family')$$,
 $$UPDATE household SET name = name WHERE id = '00000000-0000-4000-8000-0000000000c0'$$,
 $$DELETE FROM household WHERE id = '00000000-0000-4000-8000-0000000000c0'$$),
-- Shape D: profile (self-service limited to cosmetic fields)
('profile', 'D',
 $$INSERT INTO profile (id, household_id, display_name)
   VALUES (gen_random_uuid(), '00000000-0000-4000-8000-0000000000a0', 'grid-probe')$$,
 $$UPDATE profile SET display_name = display_name WHERE id = '%ME%'$$,
 $$DELETE FROM profile WHERE id = '%ME%'$$),
-- Shape B: plans and children (fixtures: P1 private A, P2 shared A+B)
('meal_plan', 'B_PLAN',
 $$INSERT INTO meal_plan (title, start_date, end_date, created_by_household_id, created_by_user_id)
   SELECT 'grid-probe', '2098-02-01', '2098-02-02', household_id, id FROM profile WHERE id = '%ME%'$$,
 $$UPDATE meal_plan SET description = 'grid-upd' WHERE id = '00000000-0000-4000-8000-000000009102'$$,
 $$DELETE FROM meal_plan WHERE id = '00000000-0000-4000-8000-000000009102'$$),
('meal_plan_assignment', 'B_CHILD',
 $$INSERT INTO meal_plan_assignment (meal_plan_id, recipe_id, assignment_date, meal_slot)
   VALUES ('00000000-0000-4000-8000-000000009102', '00000000-0000-4000-8000-000000009001',
           '2098-01-03', 'lunch')$$,
 $$UPDATE meal_plan_assignment SET notes = 'grid-upd' WHERE id = '00000000-0000-4000-8000-000000009103'$$,
 $$DELETE FROM meal_plan_assignment WHERE id = '00000000-0000-4000-8000-000000009103'$$),
('meal_plan_portion_requirement', 'B_CHILD',
 $$INSERT INTO meal_plan_portion_requirement (meal_plan_id, portion_category_id, count, athlete_count)
   VALUES ('00000000-0000-4000-8000-000000009102', '00000000-0000-4000-8000-000000000201', 1, 0)$$,
 $$UPDATE meal_plan_portion_requirement SET count = count
   WHERE meal_plan_id = '00000000-0000-4000-8000-000000009102'$$,
 $$DELETE FROM meal_plan_portion_requirement WHERE meal_plan_id = '00000000-0000-4000-8000-000000009102'$$),
('meal_plan_household', 'B_MPH',
 $$INSERT INTO meal_plan_household (meal_plan_id, household_id, added_by_user_id)
   VALUES ('00000000-0000-4000-8000-000000009102', '00000000-0000-4000-8000-0000000000c0', '%ME%')$$,
 $$UPDATE meal_plan_household SET created_at = created_at
   WHERE meal_plan_id = '00000000-0000-4000-8000-000000009102'$$,
 $$DELETE FROM meal_plan_household
   WHERE meal_plan_id = '00000000-0000-4000-8000-000000009102'
     AND household_id = '00000000-0000-4000-8000-0000000000b0'$$),
-- Locked tables
('audit_log', 'AUDIT',
 $$INSERT INTO audit_log (table_name, action) VALUES ('grid-probe', 'INSERT')$$,
 $$UPDATE audit_log SET table_name = table_name$$,
 $$DELETE FROM audit_log$$),
('household_invite', 'INVITE',
 $$INSERT INTO household_invite (email, household_id)
   VALUES ('grid-probe-' || '%ME%' || '@example.com', '00000000-0000-4000-8000-0000000000c0')$$,
 $$UPDATE household_invite SET created_at = created_at WHERE id = '00000000-0000-4000-8000-000000009104'$$,
 $$DELETE FROM household_invite WHERE id = '00000000-0000-4000-8000-000000009104'$$);

-- ===========================================================================
-- Expected-verdict oracle: shape × persona × op → rows|empty|allowed|zero|denied
-- Personas: member_a (creator household), admin_a, member_b (shared),
--           member_c (stranger), anon.
-- ===========================================================================
CREATE FUNCTION pg_temp.grid_expected(p_shape text, p_persona text, p_op text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    -- ---------- anon: everything empty/zero/denied ----------
    -- (B_PLAN's INSERT probe is INSERT..SELECT sourced from profile, which is
    -- RLS-empty for anon → 0-row insert, i.e. 'zero' rather than 'denied'.)
    WHEN p_persona = 'anon' THEN
      CASE p_op WHEN 'select' THEN 'empty'
                WHEN 'insert' THEN CASE WHEN p_shape = 'B_PLAN' THEN 'zero' ELSE 'denied' END
                ELSE 'zero' END
    -- ---------- A1 content ----------
    WHEN p_shape = 'A1' THEN
      CASE p_op
        WHEN 'select' THEN 'rows'
        WHEN 'insert' THEN 'allowed'
        WHEN 'update' THEN 'allowed'
        WHEN 'delete' THEN CASE WHEN p_persona = 'admin_a' THEN 'allowed' ELSE 'zero' END
      END
    -- ---------- A2 junctions ----------
    WHEN p_shape = 'A2' THEN
      CASE p_op WHEN 'select' THEN 'rows' ELSE 'allowed' END
    -- ---------- C vocabularies ----------
    WHEN p_shape = 'C' THEN
      CASE p_op
        WHEN 'select' THEN 'rows'
        WHEN 'insert' THEN CASE WHEN p_persona = 'admin_a' THEN 'allowed' ELSE 'denied' END
        WHEN 'update' THEN CASE WHEN p_persona = 'admin_a' THEN 'allowed' ELSE 'zero' END
        WHEN 'delete' THEN 'zero'  -- no DELETE policy for anyone: deactivate only
      END
    -- ---------- D profile ----------
    WHEN p_shape = 'D' THEN
      CASE p_op
        WHEN 'select' THEN 'rows'
        WHEN 'insert' THEN CASE WHEN p_persona = 'admin_a' THEN 'allowed' ELSE 'denied' END
        WHEN 'update' THEN 'allowed'   -- own-row cosmetic update
        WHEN 'delete' THEN 'zero'
      END
    -- ---------- B plans ----------
    WHEN p_shape = 'B_PLAN' THEN
      CASE p_op
        WHEN 'select' THEN CASE WHEN p_persona = 'member_c' THEN 'empty' ELSE 'rows' END
        WHEN 'insert' THEN 'allowed'   -- anyone may create for their own household
        WHEN 'update' THEN CASE WHEN p_persona IN ('member_a', 'admin_a') THEN 'allowed' ELSE 'zero' END
        WHEN 'delete' THEN 'zero'      -- soft delete only
      END
    -- ---------- B children (probe rows live on shared P2) ----------
    WHEN p_shape = 'B_CHILD' THEN
      CASE p_op
        WHEN 'select' THEN CASE WHEN p_persona = 'member_c' THEN 'empty' ELSE 'rows' END
        WHEN 'insert' THEN CASE WHEN p_persona IN ('member_a', 'admin_a') THEN 'allowed' ELSE 'denied' END
        WHEN 'update' THEN CASE WHEN p_persona IN ('member_a', 'admin_a') THEN 'allowed' ELSE 'zero' END
        WHEN 'delete' THEN CASE WHEN p_persona IN ('member_a', 'admin_a') THEN 'allowed' ELSE 'zero' END
      END
    -- ---------- B membership ----------
    WHEN p_shape = 'B_MPH' THEN
      CASE p_op
        WHEN 'select' THEN CASE WHEN p_persona = 'member_c' THEN 'empty' ELSE 'rows' END
        WHEN 'insert' THEN CASE WHEN p_persona IN ('member_a', 'admin_a') THEN 'allowed' ELSE 'denied' END
        WHEN 'update' THEN 'zero'      -- no UPDATE policy: rows are insert/delete only
        WHEN 'delete' THEN CASE WHEN p_persona IN ('member_a', 'admin_a') THEN 'allowed' ELSE 'zero' END
      END
    -- ---------- audit ----------
    WHEN p_shape = 'AUDIT' THEN
      CASE p_op
        WHEN 'select' THEN CASE WHEN p_persona = 'admin_a' THEN 'rows' ELSE 'empty' END
        WHEN 'insert' THEN 'denied'
        ELSE 'zero'
      END
    -- ---------- invites ----------
    WHEN p_shape = 'INVITE' THEN
      CASE p_op
        WHEN 'select' THEN CASE WHEN p_persona = 'admin_a' THEN 'rows' ELSE 'empty' END
        WHEN 'insert' THEN CASE WHEN p_persona = 'admin_a' THEN 'allowed' ELSE 'denied' END
        WHEN 'update' THEN CASE WHEN p_persona = 'admin_a' THEN 'allowed' ELSE 'zero' END
        WHEN 'delete' THEN CASE WHEN p_persona = 'admin_a' THEN 'allowed' ELSE 'zero' END
      END
  END;
$$;

-- ===========================================================================
-- Probe executor. Write probes run inside an ALWAYS-ABORTED inner block
-- (custom SQLSTATE GR001 smuggles the rowcount out) so nothing persists.
-- ===========================================================================
CREATE FUNCTION pg_temp.grid_probe(
  p_tbl text, p_persona text, p_uid text, p_op text, p_sql text, p_expected text
)
RETURNS text LANGUAGE plpgsql AS $fn$
DECLARE
  v_sql      text := replace(p_sql, '%ME%',
                COALESCE(NULLIF(p_uid, ''), '00000000-0000-0000-0000-000000000000'));
  v_n        integer;
  v_verdict  text;
  v_desc     text := format('GRID %s × %s × %s', p_tbl, p_persona, p_op);
BEGIN
  -- Impersonate (reverted by caller via RESET ROLE after each persona batch).
  IF p_persona = 'anon' THEN
    PERFORM set_config('request.jwt.claims', '', true);
    EXECUTE 'SET LOCAL ROLE anon';
  ELSE
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
    EXECUTE 'SET LOCAL ROLE authenticated';
  END IF;

  IF p_op = 'select' THEN
    EXECUTE format('SELECT count(*) FROM %I', p_tbl) INTO v_n;
    v_verdict := CASE WHEN v_n > 0 THEN 'rows' ELSE 'empty' END;
  ELSE
    BEGIN
      EXECUTE v_sql;
      GET DIAGNOSTICS v_n = ROW_COUNT;
      RAISE SQLSTATE 'GR001' USING MESSAGE = v_n::text;  -- always undo
    EXCEPTION
      WHEN SQLSTATE 'GR001' THEN
        v_verdict := CASE WHEN v_n > 0 THEN 'allowed' ELSE 'zero' END;
      WHEN insufficient_privilege THEN
        v_verdict := 'denied';
      WHEN OTHERS THEN
        v_verdict := 'error:' || SQLSTATE || ' ' || SQLERRM;
    END;
  END IF;

  EXECUTE 'RESET ROLE';
  RETURN ok(v_verdict = p_expected,
            v_desc || CASE WHEN v_verdict = p_expected THEN ''
                           ELSE format(' [got %s, want %s]', v_verdict, p_expected) END);
END;
$fn$;

-- ===========================================================================
-- Plan + run the grid: tables × personas × ops, plus completeness check.
-- ===========================================================================
SELECT plan((SELECT count(*)::integer * 20 FROM grid_manifest) + 1);

SELECT pg_temp.grid_probe(
  m.tbl,
  p.persona,
  p.uid,
  o.op,
  CASE o.op WHEN 'insert' THEN m.ins_sql WHEN 'update' THEN m.upd_sql
            WHEN 'delete' THEN m.del_sql ELSE '' END,
  pg_temp.grid_expected(m.shape, p.persona, o.op)
)
FROM grid_manifest m
CROSS JOIN (VALUES
  ('member_a', '00000000-0000-4000-8000-0000000000a1'),
  ('admin_a',  '00000000-0000-4000-8000-0000000000a2'),
  ('member_b', '00000000-0000-4000-8000-0000000000b1'),
  ('member_c', '00000000-0000-4000-8000-0000000000c1'),
  ('anon',     '')
) AS p(persona, uid)
CROSS JOIN (VALUES ('select'), ('insert'), ('update'), ('delete')) AS o(op)
ORDER BY m.tbl, p.persona, o.op;

-- Completeness: any public table missing from the manifest fails the grid.
SELECT is(
  (SELECT count(*) FROM pg_tables t
   WHERE t.schemaname = 'public'
     AND NOT EXISTS (SELECT 1 FROM grid_manifest m WHERE m.tbl = t.tablename)),
  0::bigint,
  'GRID completeness: every public table has a manifest entry');

SELECT * FROM finish();
ROLLBACK;
