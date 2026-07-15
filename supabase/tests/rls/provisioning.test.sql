-- MenuBoss provisioning tests (coordinator-authored) — 0005_auth_provisioning.
-- Verifies the invite-based identity path in BOTH directions plus its RLS.
-- Personas per supabase/seed.sql; runs under real pgTAP (CI) or the local shim.

BEGIN;
SELECT plan(13);

-- ===========================================================================
-- Invite RLS: admin-only surface
-- ===========================================================================
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$INSERT INTO household_invite (email, household_id)
    VALUES ('sneaky@example.com', '00000000-0000-4000-8000-0000000000a0')$$,
  '42501', NULL, 'P1: member cannot create invites');
SELECT throws_ok(
  $$SELECT provision_profile_from_invite('00000000-0000-4000-8000-0000000000a1', 'x@example.com')$$,
  '42501', NULL, 'P1: provisioning core is not user-callable');
RESET ROLE;

SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000000a2","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$INSERT INTO household_invite (email, household_id, role, invited_by)
    VALUES ('newcook@example.com', '00000000-0000-4000-8000-0000000000c0', 'member',
            '00000000-0000-4000-8000-0000000000a2')$$,
  'P2: admin can create invites');
SELECT throws_ok(
  $$INSERT INTO household_invite (email, household_id)
    VALUES ('NEWCOOK@example.com', '00000000-0000-4000-8000-0000000000a0')$$,
  '23505', NULL, 'P2: duplicate pending invite (case-insensitive) rejected');
RESET ROLE;

-- ===========================================================================
-- Direction B: invite exists, then signup → profile provisioned
-- ===========================================================================
INSERT INTO auth.users (id, email)
VALUES ('00000000-0000-4000-8000-0000000000d1', 'NewCook@Example.com');

SELECT is(
  (SELECT count(*) FROM profile WHERE id = '00000000-0000-4000-8000-0000000000d1'),
  1::bigint, 'P3: signup after invite provisions the profile (case-insensitive match)');
SELECT is(
  (SELECT household_id FROM profile WHERE id = '00000000-0000-4000-8000-0000000000d1'),
  '00000000-0000-4000-8000-0000000000c0'::uuid, 'P3: provisioned into the invited household');
SELECT is(
  (SELECT role FROM profile WHERE id = '00000000-0000-4000-8000-0000000000d1'),
  'member', 'P3: provisioned with the invited role');
SELECT ok(
  (SELECT accepted_at IS NOT NULL FROM household_invite
   WHERE lower(email) = 'newcook@example.com'),
  'P3: invite marked accepted');

-- ===========================================================================
-- No invite → no identity
-- ===========================================================================
INSERT INTO auth.users (id, email)
VALUES ('00000000-0000-4000-8000-0000000000d2', 'stranger@example.com');
SELECT is(
  (SELECT count(*) FROM profile WHERE id = '00000000-0000-4000-8000-0000000000d2'),
  0::bigint, 'P4: signup without invite creates NO profile (waits for invite)');

-- ===========================================================================
-- Direction A: signup exists, then invite → provisioned immediately
-- ===========================================================================
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000000a2","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$INSERT INTO household_invite (email, household_id, role)
    VALUES ('Stranger@example.com', '00000000-0000-4000-8000-0000000000b0', 'member')$$,
  'P5: admin invites an already-signed-up email');
RESET ROLE;
SELECT is(
  (SELECT count(*) FROM profile WHERE id = '00000000-0000-4000-8000-0000000000d2'),
  1::bigint, 'P5: invite-after-signup provisions immediately');

-- ===========================================================================
-- Read isolation
-- ===========================================================================
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000000b1","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT is((SELECT count(*) FROM household_invite), 0::bigint,
  'P6: members see zero invites (emails are admin-only)');
RESET ROLE;

SELECT set_config('request.jwt.claims', '', true);
SET LOCAL ROLE anon;
SELECT is((SELECT count(*) FROM household_invite), 0::bigint,
  'P6: anon sees zero invites');
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
