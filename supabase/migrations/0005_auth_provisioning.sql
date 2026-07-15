-- MenuBoss 0005_auth_provisioning.sql
-- Coordinator-authored (NOT delegated): profile provisioning is the only path
-- that creates identities, so it is security-critical (DB PRD v0.4 §7 shape D).
--
-- Model: INVITE-BASED, matching in both directions so ordering never matters:
--   * admin creates a household_invite (email → household + role)
--   * signup-then-invite: creating the invite provisions the profile if the
--     auth user already exists
--   * invite-then-signup: the auth.users AFTER INSERT hook provisions the
--     profile when the invited email signs up
-- No self-service registration path exists; a session without a profile row
-- sees only the "waiting for family invite" screen (RLS returns nothing).
--
-- profile.id ↔ auth.users(id): equality is guaranteed by construction here
-- (NEW.id / au.id). A hard FK remains deliberately absent — seed fixtures and
-- the local no-auth gate have no auth.users rows (decision documented in 0002).

-- ===========================================================================
-- 1. household_invite
-- ===========================================================================

CREATE TABLE household_invite (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email          text NOT NULL,
  household_id   uuid NOT NULL REFERENCES household(id) ON DELETE RESTRICT,
  role           text NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
  invited_by     uuid REFERENCES profile(id),
  accepted_at    timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- One live invite per address (case-insensitive, whitespace-tolerant);
-- accepted invites are history.
CREATE UNIQUE INDEX uq_household_invite_email
  ON household_invite (lower(trim(email)))
  WHERE accepted_at IS NULL;
COMMENT ON INDEX uq_household_invite_email IS
  'Serves: one pending invite per email; provisioning lookup by lower(email).';

ALTER TABLE household_invite ENABLE ROW LEVEL SECURITY;

-- Invites carry emails and grant identity: family-admin only, all operations.
CREATE POLICY household_invite_admin_all ON household_invite
  FOR ALL TO authenticated
  USING (is_family_admin())
  WITH CHECK (is_family_admin());

GRANT SELECT, INSERT, UPDATE, DELETE ON household_invite TO authenticated;
-- anon gets table privileges to mirror Supabase defaults (0002 §6 convention);
-- with no anon policies, every anon query returns zero rows rather than a
-- permission error.
GRANT SELECT, INSERT, UPDATE, DELETE ON household_invite TO anon;

-- ===========================================================================
-- 2. Provisioning core (SECURITY DEFINER — writes profile regardless of the
--    caller's own RLS surface; reachable ONLY via the two triggers below).
-- ===========================================================================

CREATE OR REPLACE FUNCTION provision_profile_from_invite(
  p_user_id uuid,
  p_email   text
)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invite household_invite%ROWTYPE;
BEGIN
  SELECT * INTO v_invite
  FROM household_invite
  WHERE lower(trim(email)) = lower(trim(p_email))
    AND accepted_at IS NULL
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN false;  -- no invite → no identity; user waits.
  END IF;

  INSERT INTO profile (id, household_id, display_name, role)
  VALUES (
    p_user_id,
    v_invite.household_id,
    split_part(p_email, '@', 1),
    v_invite.role
  )
  ON CONFLICT (id) DO NOTHING;  -- already provisioned → invite just closes.

  UPDATE household_invite
  SET accepted_at = now()
  WHERE id = v_invite.id;

  RETURN true;
END;
$$;

-- Not user-callable: only trigger functions (definer contexts) reach it.
REVOKE ALL ON FUNCTION provision_profile_from_invite(uuid, text) FROM PUBLIC;

-- ===========================================================================
-- 3. Direction A — invite created after signup: provision immediately if the
--    auth user already exists. Runs guarded so the local no-auth gate works.
-- ===========================================================================

CREATE OR REPLACE FUNCTION handle_new_invite()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  IF to_regclass('auth.users') IS NOT NULL THEN
    EXECUTE 'SELECT id FROM auth.users WHERE lower(trim(email)) = lower(trim($1)) LIMIT 1'
      INTO v_user_id USING NEW.email;
    IF v_user_id IS NOT NULL THEN
      PERFORM provision_profile_from_invite(v_user_id, NEW.email);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION handle_new_invite() FROM PUBLIC;

CREATE TRIGGER trg_invite_provision
  AFTER INSERT ON household_invite
  FOR EACH ROW EXECUTE PROCEDURE handle_new_invite();

-- ===========================================================================
-- 4. Direction B — signup after invite: classic Supabase on-signup hook.
--    Created only where auth.users exists (Supabase stack or stubbed local).
-- ===========================================================================

CREATE OR REPLACE FUNCTION handle_new_auth_user()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.email IS NOT NULL THEN
    PERFORM provision_profile_from_invite(NEW.id, NEW.email);
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION handle_new_auth_user() FROM PUBLIC;

DO $$
BEGIN
  IF to_regclass('auth.users') IS NOT NULL THEN
    EXECUTE 'DROP TRIGGER IF EXISTS trg_auth_user_provision ON auth.users';
    EXECUTE 'CREATE TRIGGER trg_auth_user_provision
               AFTER INSERT ON auth.users
               FOR EACH ROW EXECUTE PROCEDURE public.handle_new_auth_user()';
  ELSE
    RAISE NOTICE 'auth.users absent — on-signup provisioning trigger skipped (local gate)';
  END IF;
END $$;

-- ===========================================================================
-- 5. Audit: identity provisioning is a sensitive change.
-- ===========================================================================

CREATE TRIGGER trg_audit_household_invite
  AFTER INSERT OR UPDATE OR DELETE ON household_invite
  FOR EACH ROW EXECUTE PROCEDURE write_audit_log();
