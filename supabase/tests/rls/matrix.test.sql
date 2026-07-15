-- MenuBoss RLS Verification Matrix (coordinator-authored, CI-blocking).
-- Runs under `supabase test db` (pgTAP). Whole file is one rolled-back txn.
-- Personas (fixed UUIDs from supabase/seed.sql):
--   member_a 00000000-0000-4000-8000-0000000000a1  (Household A, member)
--   admin_a  00000000-0000-4000-8000-0000000000a2  (Household A, admin)
--   member_b 00000000-0000-4000-8000-0000000000b1  (Household B, member)
--   member_c 00000000-0000-4000-8000-0000000000c1  (Household C, member)
--   anon     (no profile row, role anon)
-- Scenario numbering follows Product PRD v0.2 §11 (RLS Verification Matrix).
-- Scenario 11 (Realtime parity / unshare cutoff) is NOT testable in pgTAP —
-- it lives in the integration suite; see supabase/tests/rls/README.md.

BEGIN;
SELECT plan(54);

-- ===========================================================================
-- Fixtures (as superuser; audit triggers fire with actor NULL — expected)
-- NOTE: deliberately NO test-side GRANTs — role privileges come from
-- 0002_security.sql §6, so this suite exercises the production grant state.
-- ===========================================================================

INSERT INTO recipe (id, title, created_by_user_id, yield_servings)
VALUES ('00000000-0000-4000-8000-00000000f001', 'Fixture Roast',
        '00000000-0000-4000-8000-0000000000a1', 4);

-- P1: private plan, Household A only
INSERT INTO meal_plan (id, title, start_date, end_date, created_by_household_id, created_by_user_id)
VALUES ('00000000-0000-4000-8000-00000000e001', 'P1 private A',
        '2026-07-20', '2026-07-26',
        '00000000-0000-4000-8000-0000000000a0', '00000000-0000-4000-8000-0000000000a1');
INSERT INTO meal_plan_household VALUES
  ('00000000-0000-4000-8000-00000000e001', '00000000-0000-4000-8000-0000000000a0');
INSERT INTO meal_plan_portion_requirement (meal_plan_id, portion_category_id, count, athlete_count)
VALUES ('00000000-0000-4000-8000-00000000e001', '00000000-0000-4000-8000-000000000207', 2, 1);

-- P2: shared plan, A (creator) + B
INSERT INTO meal_plan (id, title, start_date, end_date, created_by_household_id, created_by_user_id)
VALUES ('00000000-0000-4000-8000-00000000e002', 'P2 shared A+B',
        '2026-07-20', '2026-07-26',
        '00000000-0000-4000-8000-0000000000a0', '00000000-0000-4000-8000-0000000000a1');
INSERT INTO meal_plan_household VALUES
  ('00000000-0000-4000-8000-00000000e002', '00000000-0000-4000-8000-0000000000a0'),
  ('00000000-0000-4000-8000-00000000e002', '00000000-0000-4000-8000-0000000000b0');
INSERT INTO meal_plan_assignment (id, meal_plan_id, recipe_id, assignment_date, meal_slot, servings)
VALUES ('00000000-0000-4000-8000-00000000d001', '00000000-0000-4000-8000-00000000e002',
        '00000000-0000-4000-8000-00000000f001', '2026-07-22', 'dinner', 6);
INSERT INTO meal_plan_portion_requirement (meal_plan_id, portion_category_id, count, athlete_count)
VALUES ('00000000-0000-4000-8000-00000000e002', '00000000-0000-4000-8000-000000000207', 3, 0);

-- P3: ORPHAN plan (no membership rows) — must fail closed to creator-only
INSERT INTO meal_plan (id, title, start_date, end_date, created_by_household_id, created_by_user_id)
VALUES ('00000000-0000-4000-8000-00000000e003', 'P3 orphan A',
        '2026-07-20', '2026-07-26',
        '00000000-0000-4000-8000-0000000000a0', '00000000-0000-4000-8000-0000000000a1');

-- ===========================================================================
-- Scenario 1 — private plan isolation
-- ===========================================================================
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000000b1","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;

SELECT is((SELECT count(*) FROM meal_plan WHERE id = '00000000-0000-4000-8000-00000000e001'),
  0::bigint, 'S1: member_b cannot see private plan P1');
SELECT is((SELECT count(*) FROM meal_plan_portion_requirement
           WHERE meal_plan_id = '00000000-0000-4000-8000-00000000e001'),
  0::bigint, 'S1: member_b cannot see P1 portion requirements');
UPDATE meal_plan SET title = 'hacked' WHERE id = '00000000-0000-4000-8000-00000000e001';
RESET ROLE;
SELECT is((SELECT title FROM meal_plan WHERE id = '00000000-0000-4000-8000-00000000e001'),
  'P1 private A', 'S1: member_b UPDATE on P1 affected zero rows');

SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000000c1","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT is((SELECT count(*) FROM meal_plan WHERE id = '00000000-0000-4000-8000-00000000e001'),
  0::bigint, 'S1: member_c cannot see private plan P1');
RESET ROLE;

SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT is((SELECT count(*) FROM meal_plan WHERE id = '00000000-0000-4000-8000-00000000e001'),
  1::bigint, 'S1: member_a (owner household) sees P1');
RESET ROLE;

-- ===========================================================================
-- Scenario 2 — shared plan: B reads, B cannot write
-- ===========================================================================
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000000b1","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;

SELECT is((SELECT count(*) FROM meal_plan WHERE id = '00000000-0000-4000-8000-00000000e002'),
  1::bigint, 'S2: member_b sees shared plan P2');
SELECT is((SELECT count(*) FROM meal_plan_assignment
           WHERE meal_plan_id = '00000000-0000-4000-8000-00000000e002'),
  1::bigint, 'S2: member_b sees P2 assignments');
SELECT is((SELECT count(*) FROM meal_plan_portion_requirement
           WHERE meal_plan_id = '00000000-0000-4000-8000-00000000e002'),
  1::bigint, 'S2: member_b sees P2 portion requirements');
UPDATE meal_plan SET title = 'hacked' WHERE id = '00000000-0000-4000-8000-00000000e002';
SELECT throws_ok(
  $$INSERT INTO meal_plan_assignment (meal_plan_id, recipe_id, assignment_date, meal_slot)
    VALUES ('00000000-0000-4000-8000-00000000e002',
            '00000000-0000-4000-8000-00000000f001', '2026-07-23', 'lunch')$$,
  '42501', NULL, 'S2: member_b INSERT assignment on shared plan denied (read-only share)');
SELECT throws_ok(
  $$INSERT INTO meal_plan_portion_requirement (meal_plan_id, portion_category_id, count, athlete_count)
    VALUES ('00000000-0000-4000-8000-00000000e002',
            '00000000-0000-4000-8000-000000000201', 1, 0)$$,
  '42501', NULL, 'S2: member_b INSERT portion requirement on shared plan denied');
RESET ROLE;
SELECT is((SELECT title FROM meal_plan WHERE id = '00000000-0000-4000-8000-00000000e002'),
  'P2 shared A+B', 'S2: member_b UPDATE on P2 affected zero rows');

SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000000c1","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT is((SELECT count(*) FROM meal_plan WHERE id = '00000000-0000-4000-8000-00000000e002'),
  0::bigint, 'S2: member_c cannot see shared plan P2');
RESET ROLE;

-- ===========================================================================
-- Scenario 3 — sharing mutations
-- ===========================================================================
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000000b1","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$INSERT INTO meal_plan_household (meal_plan_id, household_id)
    VALUES ('00000000-0000-4000-8000-00000000e002', '00000000-0000-4000-8000-0000000000c0')$$,
  '42501', NULL, 'S3: member_b cannot share P2 with Household C');
DELETE FROM meal_plan_household
  WHERE meal_plan_id = '00000000-0000-4000-8000-00000000e002'
    AND household_id = '00000000-0000-4000-8000-0000000000b0';
RESET ROLE;
SELECT is((SELECT count(*) FROM meal_plan_household
           WHERE meal_plan_id = '00000000-0000-4000-8000-00000000e002'),
  2::bigint, 'S3: member_b DELETE of membership rows affected zero rows');

SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000000a2","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$INSERT INTO meal_plan_household (meal_plan_id, household_id, added_by_user_id)
    VALUES ('00000000-0000-4000-8000-00000000e001', '00000000-0000-4000-8000-0000000000c0',
            '00000000-0000-4000-8000-0000000000a2')$$,
  'S3: admin_a can share P1 with Household C');
SELECT throws_ok(
  $$UPDATE meal_plan SET created_by_household_id = '00000000-0000-4000-8000-0000000000b0'
    WHERE id = '00000000-0000-4000-8000-00000000e002'$$,
  '42501', NULL, 'S3: even admin cannot transfer plan ownership (immutability trigger)');
DELETE FROM meal_plan_household
  WHERE meal_plan_id = '00000000-0000-4000-8000-00000000e002'
    AND household_id = '00000000-0000-4000-8000-0000000000a0';
RESET ROLE;
SELECT is((SELECT count(*) FROM meal_plan_household
           WHERE meal_plan_id = '00000000-0000-4000-8000-00000000e002'
             AND household_id = '00000000-0000-4000-8000-0000000000a0'),
  1::bigint, 'S3: creating household membership is irremovable even for admin');

-- ===========================================================================
-- Scenario 4 — bootstrap + orphan fail-closed
-- ===========================================================================
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$INSERT INTO meal_plan (id, title, start_date, end_date, created_by_household_id, created_by_user_id)
    VALUES ('00000000-0000-4000-8000-00000000e004', 'P4 bootstrap',
            '2026-08-01', '2026-08-07',
            '00000000-0000-4000-8000-0000000000a0', '00000000-0000-4000-8000-0000000000a1')$$,
  'S4: creator can INSERT a plan');
SELECT is((SELECT count(*) FROM meal_plan WHERE id = '00000000-0000-4000-8000-00000000e004'),
  1::bigint, 'S4: creator sees own plan BEFORE any membership row exists (bootstrap disjunct)');
SELECT throws_ok(
  $$INSERT INTO meal_plan (title, start_date, end_date, created_by_household_id, created_by_user_id)
    VALUES ('spoof', '2026-08-01', '2026-08-07',
            '00000000-0000-4000-8000-0000000000b0', '00000000-0000-4000-8000-0000000000a1')$$,
  '42501', NULL, 'S4: cannot create a plan attributed to another household');
SELECT is((SELECT count(*) FROM meal_plan WHERE id = '00000000-0000-4000-8000-00000000e003'),
  1::bigint, 'S4: orphan plan P3 visible to creating household');
RESET ROLE;

SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000000b1","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT is((SELECT count(*) FROM meal_plan WHERE id = '00000000-0000-4000-8000-00000000e003'),
  0::bigint, 'S4: orphan plan P3 invisible to member_b (fails closed)');
RESET ROLE;

-- ===========================================================================
-- Scenario 5 — profile privilege escalation
-- ===========================================================================
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$UPDATE profile SET display_name = 'Member A (renamed)'
    WHERE id = '00000000-0000-4000-8000-0000000000a1'$$,
  'S5: member can update own display_name');
SELECT throws_ok(
  $$UPDATE profile SET role = 'admin' WHERE id = '00000000-0000-4000-8000-0000000000a1'$$,
  '42501', NULL, 'S5: member CANNOT self-promote to admin');
SELECT throws_ok(
  $$UPDATE profile SET household_id = '00000000-0000-4000-8000-0000000000b0'
    WHERE id = '00000000-0000-4000-8000-0000000000a1'$$,
  '42501', NULL, 'S5: member CANNOT move own household');
UPDATE profile SET display_name = 'hacked'
  WHERE id = '00000000-0000-4000-8000-0000000000b1';
RESET ROLE;
SELECT is((SELECT display_name FROM profile WHERE id = '00000000-0000-4000-8000-0000000000b1'),
  'Member B', 'S5: member_a UPDATE on member_b profile affected zero rows');

SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000000a2","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$UPDATE profile SET role = 'admin' WHERE id = '00000000-0000-4000-8000-0000000000b1'$$,
  'S5: admin CAN change roles');
SELECT lives_ok(
  $$UPDATE profile SET role = 'member' WHERE id = '00000000-0000-4000-8000-0000000000b1'$$,
  'S5: admin role change reverted');
SELECT lives_ok(
  $$INSERT INTO profile (id, household_id, display_name)
    VALUES ('00000000-0000-4000-8000-0000000000c2',
            '00000000-0000-4000-8000-0000000000c0', 'Invited C2')$$,
  'S5: admin CAN provision profiles (invite flow)');
RESET ROLE;

-- member INSERT profile must be denied
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$INSERT INTO profile (id, household_id, display_name)
    VALUES ('00000000-0000-4000-8000-0000000000a9',
            '00000000-0000-4000-8000-0000000000a0', 'Sock Puppet')$$,
  '42501', NULL, 'S5: member cannot INSERT profiles');
RESET ROLE;

-- ===========================================================================
-- Scenario 6 — content attribution
-- ===========================================================================
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000000b1","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$INSERT INTO recipe (title, created_by_user_id)
    VALUES ('Forged', '00000000-0000-4000-8000-0000000000a1')$$,
  '42501', NULL, 'S6: INSERT with foreign attribution rejected by WITH CHECK');
SELECT lives_ok(
  $$INSERT INTO recipe (id, title, created_by_user_id)
    VALUES ('00000000-0000-4000-8000-00000000f002', 'B Recipe',
            '00000000-0000-4000-8000-0000000000b1')$$,
  'S6: INSERT with own attribution succeeds');
SELECT throws_ok(
  $$UPDATE recipe SET created_by_user_id = '00000000-0000-4000-8000-0000000000b1'
    WHERE id = '00000000-0000-4000-8000-00000000f001'$$,
  '42501', NULL, 'S6: attribution is immutable on UPDATE (trigger)');
RESET ROLE;
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$UPDATE meal_plan SET created_by_user_id = '00000000-0000-4000-8000-0000000000a2'
    WHERE id = '00000000-0000-4000-8000-00000000e001'$$,
  '42501', NULL, 'S6: meal plan attribution is immutable even for the creating household');
RESET ROLE;
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000000b1","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$UPDATE recipe SET title = 'Fixture Roast (B edit)'
    WHERE id = '00000000-0000-4000-8000-00000000f001'$$,
  'S6: any family member may edit content (family-trust rule)');
RESET ROLE;

-- ===========================================================================
-- Scenario 7 — vocabulary protection
-- ===========================================================================
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
UPDATE portion_category SET base_protein_oz = 99
  WHERE slug = 'adult-male';
UPDATE family_settings SET athlete_multiplier = 9;
UPDATE unit SET factor_to_base = 99 WHERE name = 'gram';
RESET ROLE;
SELECT is((SELECT base_protein_oz FROM portion_category WHERE slug = 'adult-male'),
  6.0::numeric, 'S7: member UPDATE on portion_category affected zero rows');
SELECT is((SELECT athlete_multiplier FROM family_settings LIMIT 1),
  1.5::numeric, 'S7: member UPDATE on family_settings affected zero rows');
SELECT is((SELECT factor_to_base FROM unit WHERE name = 'gram'),
  1::numeric, 'S7: member UPDATE on unit affected zero rows');

SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000000a2","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$UPDATE family_settings SET athlete_multiplier = 1.6$$,
  'S7: admin CAN update family_settings');
RESET ROLE;

-- ===========================================================================
-- Scenario 8 — hard-delete denial (soft delete only)
-- ===========================================================================
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000000b1","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DELETE FROM recipe WHERE id = '00000000-0000-4000-8000-00000000f002';
RESET ROLE;
SELECT is((SELECT count(*) FROM recipe WHERE id = '00000000-0000-4000-8000-00000000f002'),
  1::bigint, 'S8: member DELETE affected zero rows even on own recipe');

SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000000a2","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$DELETE FROM recipe WHERE id = '00000000-0000-4000-8000-00000000f002'$$,
  'S8: admin CAN hard-delete (data hygiene)');
RESET ROLE;

-- ===========================================================================
-- Scenario 9 — audit isolation
-- ===========================================================================
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT is((SELECT count(*) FROM audit_log), 0::bigint,
  'S9: member sees zero audit rows');
SELECT throws_ok(
  $$INSERT INTO audit_log (table_name, action) VALUES ('x', 'INSERT')$$,
  '42501', NULL, 'S9: member cannot INSERT audit rows');
RESET ROLE;

SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000000b1","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$INSERT INTO audit_log (table_name, action) VALUES ('x', 'INSERT')$$,
  '42501', NULL, 'S9: member_b cannot INSERT audit rows either');
RESET ROLE;

SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000000a2","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT ok((SELECT count(*) FROM audit_log) > 0,
  'S9: admin can read audit rows (fixtures generated some)');
SELECT throws_ok(
  $$INSERT INTO audit_log (table_name, action) VALUES ('x', 'INSERT')$$,
  '42501', NULL, 'S9: even admin cannot INSERT audit rows directly (trigger-only writes)');
RESET ROLE;

-- ===========================================================================
-- Scenario 10 — anon denied everywhere (spot checks; grid covers the rest)
-- ===========================================================================
SELECT set_config('request.jwt.claims', '', true);
SET LOCAL ROLE anon;
SELECT is((SELECT count(*) FROM recipe), 0::bigint, 'S10: anon sees no recipes');
SELECT is((SELECT count(*) FROM meal_plan), 0::bigint, 'S10: anon sees no plans');
SELECT is((SELECT count(*) FROM profile), 0::bigint, 'S10: anon sees no profiles');
SELECT throws_ok(
  $$INSERT INTO recipe (title) VALUES ('anon recipe')$$,
  '42501', NULL, 'S10: anon INSERT denied');
RESET ROLE;

-- ===========================================================================
-- Date-range triggers (D8) — exercised as the creating household
-- ===========================================================================
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$INSERT INTO meal_plan_assignment (meal_plan_id, recipe_id, assignment_date, meal_slot)
    VALUES ('00000000-0000-4000-8000-00000000e002',
            '00000000-0000-4000-8000-00000000f001', '2026-09-01', 'dinner')$$,
  '23514', NULL, 'D8: assignment outside plan range rejected');
SELECT throws_ok(
  $$UPDATE meal_plan SET end_date = '2026-07-21'
    WHERE id = '00000000-0000-4000-8000-00000000e002'$$,
  '23514', NULL, 'D8: shrinking plan range that strands assignments rejected');
RESET ROLE;

-- ===========================================================================
-- Coverage manifest — RLS must be ENABLED on every table (no blind spots)
-- ===========================================================================
SELECT is(
  (SELECT count(*) FROM pg_tables
   WHERE schemaname = 'public' AND NOT rowsecurity),
  0::bigint, 'Coverage (a): every public table has RLS enabled');

-- Coverage (b): every RLS-enabled table must carry at least one policy —
-- an ENABLE without policies fails closed but silently; this makes it loud.
SELECT is(
  (SELECT count(*) FROM pg_tables t
   WHERE t.schemaname = 'public'
     AND t.rowsecurity
     AND NOT EXISTS (
       SELECT 1 FROM pg_policies p
       WHERE p.schemaname = t.schemaname AND p.tablename = t.tablename
     )),
  0::bigint, 'Coverage (b): every RLS-enabled table has at least one policy');

SELECT * FROM finish();
ROLLBACK;
