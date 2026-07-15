-- MenuBoss 0002_security.sql
-- Coordinator-authored (NOT delegated): RLS policies, helper functions,
-- security triggers, audit infrastructure. Source of truth: DB PRD v0.4 §7.
--
-- Authority model (D1): RLS is the SOLE authorization authority. All request
-- paths use the caller's JWT; the service role never appears in request
-- handling. anon has no policies anywhere → denied by default.
--
-- NOTE on profile ↔ auth.users: profile.id equals auth.uid() by provisioning
-- convention (the on-signup SECURITY DEFINER hook, added with the auth flow in
-- a later wave, will also add the FK to auth.users). The FK is deliberately
-- NOT added here so seed fixtures and local pgTAP runs don't require
-- auth.users rows. The RLS model does not depend on the FK.

-- ===========================================================================
-- 1. Helper functions (SECURITY DEFINER: they must read profile/meal_plan
--    tables WITHOUT triggering policy recursion — meal_plan policies reference
--    meal_plan_household and vice versa; definer functions break the cycle).
--    All pin search_path; EXECUTE revoked from public/anon.
-- ===========================================================================

CREATE OR REPLACE FUNCTION current_household_id()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT household_id FROM profile WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION is_family_member()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM profile WHERE id = auth.uid());
$$;

CREATE OR REPLACE FUNCTION is_family_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profile WHERE id = auth.uid() AND role = 'admin'
  );
$$;

-- Visibility: creator-household disjunct (bootstrap fix) OR membership OR admin.
CREATE OR REPLACE FUNCTION can_view_meal_plan(p_meal_plan_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM meal_plan mp
    WHERE mp.id = p_meal_plan_id
      AND (
        mp.created_by_household_id = current_household_id()
        OR is_family_admin()
        OR EXISTS (
          SELECT 1 FROM meal_plan_household mph
          WHERE mph.meal_plan_id = mp.id
            AND mph.household_id = current_household_id()
        )
      )
  );
$$;

-- Edit rights: creating household or admin. Shared households are READ-ONLY (v1).
CREATE OR REPLACE FUNCTION can_edit_meal_plan(p_meal_plan_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM meal_plan mp
    WHERE mp.id = p_meal_plan_id
      AND (
        mp.created_by_household_id = current_household_id()
        OR is_family_admin()
      )
  );
$$;

CREATE OR REPLACE FUNCTION plan_creating_household(p_meal_plan_id uuid)
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT created_by_household_id FROM meal_plan WHERE id = p_meal_plan_id;
$$;

-- Membership check WITHOUT touching meal_plan itself. Used by meal_plan's own
-- SELECT policy, which must otherwise be expressible over the row's own
-- columns: INSERT ... RETURNING applies the SELECT policy to the new row
-- BEFORE it is visible to any snapshot, so a policy that looks the row up
-- by id (as can_view_meal_plan does) fails closed on every insert-returning.
CREATE OR REPLACE FUNCTION is_plan_member(p_meal_plan_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM meal_plan_household mph
    WHERE mph.meal_plan_id = p_meal_plan_id
      AND mph.household_id = current_household_id()
  );
$$;

DO $$
DECLARE fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'current_household_id()', 'is_family_member()', 'is_family_admin()',
    'can_view_meal_plan(uuid)', 'can_edit_meal_plan(uuid)',
    'plan_creating_household(uuid)', 'is_plan_member(uuid)'
  ] LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', fn);
  END LOOP;
END $$;

-- ===========================================================================
-- 2. Security triggers
--    Trigger guards allow auth.uid() IS NULL (migrations/seed/system jobs run
--    outside a request context; anon can never reach these tables — no
--    policies — so NULL uid here always means a privileged non-request path).
-- ===========================================================================

-- 2a. Profile privilege guard: role/household_id changes are admin-only.
CREATE OR REPLACE FUNCTION guard_profile_privileged_fields()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (NEW.role IS DISTINCT FROM OLD.role
      OR NEW.household_id IS DISTINCT FROM OLD.household_id)
     AND auth.uid() IS NOT NULL
     AND NOT is_family_admin() THEN
    RAISE EXCEPTION 'profile.role and profile.household_id may only be changed by a family admin'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_profile_privilege_guard
  BEFORE UPDATE ON profile
  FOR EACH ROW EXECUTE PROCEDURE guard_profile_privileged_fields();

-- 2b. Attribution immutability on content entities.
CREATE OR REPLACE FUNCTION guard_attribution_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF (NEW.created_by_user_id IS DISTINCT FROM OLD.created_by_user_id
      OR NEW.created_at IS DISTINCT FROM OLD.created_at)
     AND auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'created_by_user_id and created_at are immutable'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

-- meal_plan additionally freezes created_by_household_id: it is the ownership
-- anchor for every shape-B policy and the RPC's irremovable-creator invariant;
-- a mutable value (even admin-mutated) would silently transfer edit rights.
CREATE OR REPLACE FUNCTION guard_meal_plan_ownership_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF (NEW.created_by_user_id IS DISTINCT FROM OLD.created_by_user_id
      OR NEW.created_by_household_id IS DISTINCT FROM OLD.created_by_household_id
      OR NEW.created_at IS DISTINCT FROM OLD.created_at)
     AND auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'meal plan ownership and attribution are immutable'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_meal_plan_ownership
  BEFORE UPDATE ON meal_plan
  FOR EACH ROW EXECUTE PROCEDURE guard_meal_plan_ownership_immutable();

CREATE TRIGGER trg_recipe_attribution
  BEFORE UPDATE ON recipe
  FOR EACH ROW EXECUTE PROCEDURE guard_attribution_immutable();
CREATE TRIGGER trg_ingredient_attribution
  BEFORE UPDATE ON ingredient
  FOR EACH ROW EXECUTE PROCEDURE guard_attribution_immutable();
CREATE TRIGGER trg_chef_idea_attribution
  BEFORE UPDATE ON chef_idea
  FOR EACH ROW EXECUTE PROCEDURE guard_attribution_immutable();
CREATE TRIGGER trg_recipe_combination_attribution
  BEFORE UPDATE ON recipe_combination
  FOR EACH ROW EXECUTE PROCEDURE guard_attribution_immutable();

-- 2c. Assignment-date range (D8): CHECK cannot cross tables → triggers, both
--     directions, plus Zod at the API layer for friendly errors.
CREATE OR REPLACE FUNCTION guard_assignment_in_plan_range()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_start date;
  v_end   date;
BEGIN
  SELECT mp.start_date, mp.end_date INTO v_start, v_end
  FROM meal_plan mp WHERE mp.id = NEW.meal_plan_id;
  IF NEW.assignment_date < v_start OR NEW.assignment_date > v_end THEN
    RAISE EXCEPTION 'assignment_date % outside plan range [%, %]',
      NEW.assignment_date, v_start, v_end
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_assignment_in_range
  BEFORE INSERT OR UPDATE ON meal_plan_assignment
  FOR EACH ROW EXECUTE PROCEDURE guard_assignment_in_plan_range();

CREATE OR REPLACE FUNCTION guard_plan_range_covers_assignments()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF (NEW.start_date IS DISTINCT FROM OLD.start_date
      OR NEW.end_date IS DISTINCT FROM OLD.end_date)
     AND EXISTS (
       SELECT 1 FROM meal_plan_assignment mpa
       WHERE mpa.meal_plan_id = NEW.id
         AND (mpa.assignment_date < NEW.start_date
              OR mpa.assignment_date > NEW.end_date)
     ) THEN
    RAISE EXCEPTION 'plan range change strands assignments outside [%, %] — move or remove them first',
      NEW.start_date, NEW.end_date
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_plan_range_covers_assignments
  BEFORE UPDATE ON meal_plan
  FOR EACH ROW EXECUTE PROCEDURE guard_plan_range_covers_assignments();

-- ===========================================================================
-- 3. Audit infrastructure
--    Written ONLY by SECURITY DEFINER triggers; readable ONLY by admins.
--    Audit rows contain private-plan before/after images — non-admin read
--    would bypass shape B entirely.
-- ===========================================================================

CREATE TABLE audit_log (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  table_name  text NOT NULL,
  record_id   uuid,
  action      text NOT NULL CHECK (action IN ('INSERT', 'UPDATE', 'DELETE')),
  actor_id    uuid,
  before_data jsonb,
  after_data  jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_log_table_record ON audit_log (table_name, record_id);
COMMENT ON INDEX idx_audit_log_table_record IS
  'Serves: admin audit-history lookups per record.';

CREATE OR REPLACE FUNCTION write_audit_log()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO audit_log (table_name, record_id, action, actor_id, before_data, after_data)
  VALUES (
    TG_TABLE_NAME,
    COALESCE(NEW.id, OLD.id),
    TG_OP,
    auth.uid(),
    CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) END,
    CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) END
  );
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER trg_audit_meal_plan
  AFTER INSERT OR UPDATE OR DELETE ON meal_plan
  FOR EACH ROW EXECUTE PROCEDURE write_audit_log();
CREATE TRIGGER trg_audit_recipe
  AFTER INSERT OR UPDATE OR DELETE ON recipe
  FOR EACH ROW EXECUTE PROCEDURE write_audit_log();
CREATE TRIGGER trg_audit_family_settings
  AFTER INSERT OR UPDATE OR DELETE ON family_settings
  FOR EACH ROW EXECUTE PROCEDURE write_audit_log();
CREATE TRIGGER trg_audit_portion_category
  AFTER INSERT OR UPDATE OR DELETE ON portion_category
  FOR EACH ROW EXECUTE PROCEDURE write_audit_log();

-- ===========================================================================
-- 4. Enable RLS on EVERY table — no exceptions (blanket rule, DB PRD §7).
--    The CI coverage test asserts this list matches pg_tables exactly.
-- ===========================================================================

ALTER TABLE unit                          ENABLE ROW LEVEL SECURITY;
ALTER TABLE portion_category              ENABLE ROW LEVEL SECURITY;
ALTER TABLE family_settings               ENABLE ROW LEVEL SECURITY;
ALTER TABLE household                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE profile                       ENABLE ROW LEVEL SECURITY;
ALTER TABLE category                      ENABLE ROW LEVEL SECURITY;
ALTER TABLE tag                           ENABLE ROW LEVEL SECURITY;
ALTER TABLE ingredient                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE recipe                        ENABLE ROW LEVEL SECURITY;
ALTER TABLE recipe_ingredient             ENABLE ROW LEVEL SECURITY;
ALTER TABLE recipe_category               ENABLE ROW LEVEL SECURITY;
ALTER TABLE recipe_tag                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE ingredient_category           ENABLE ROW LEVEL SECURITY;
ALTER TABLE ingredient_tag                ENABLE ROW LEVEL SECURITY;
ALTER TABLE recipe_combination            ENABLE ROW LEVEL SECURITY;
ALTER TABLE recipe_combination_recipe     ENABLE ROW LEVEL SECURITY;
ALTER TABLE chef_idea                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE chef_idea_category            ENABLE ROW LEVEL SECURITY;
ALTER TABLE chef_idea_tag                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE meal_plan                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE meal_plan_assignment          ENABLE ROW LEVEL SECURITY;
ALTER TABLE meal_plan_household           ENABLE ROW LEVEL SECURITY;
ALTER TABLE meal_plan_portion_requirement ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log                     ENABLE ROW LEVEL SECURITY;

-- ===========================================================================
-- 5. Policies
--    NOTE: no `deleted_at` predicates anywhere — RLS expresses AUTHORIZATION
--    only; lifecycle filtering is a query concern (browse filters deleted,
--    historical reads and generate_shopping_list intentionally do not).
-- ===========================================================================

-- ---- Shape D: profile (the privilege-escalation surface) ------------------
CREATE POLICY profile_select ON profile FOR SELECT TO authenticated
  USING (is_family_member());
CREATE POLICY profile_update ON profile FOR UPDATE TO authenticated
  USING (id = auth.uid() OR is_family_admin())
  WITH CHECK (id = auth.uid() OR is_family_admin());
-- role/household_id column guard = trg_profile_privilege_guard (RLS cannot
-- express column rules). INSERT: admin only until the on-signup auth hook
-- lands (that hook is SECURITY DEFINER and unaffected by this policy).
CREATE POLICY profile_insert_admin ON profile FOR INSERT TO authenticated
  WITH CHECK (is_family_admin());
-- No DELETE policy: profiles are never deleted.

-- ---- Shape A1: family-global content entities (D7) ------------------------
-- recipe / ingredient / chef_idea / recipe_combination:
--   read + edit for any family member (explicit family-trust decision);
--   INSERT pins attribution; UPDATE attribution frozen by trigger;
--   hard DELETE admin-only (soft delete = UPDATE deleted_at).
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['recipe', 'ingredient', 'chef_idea', 'recipe_combination'] LOOP
    EXECUTE format($f$
      CREATE POLICY %1$s_select ON %1$I FOR SELECT TO authenticated
        USING (is_family_member());
      CREATE POLICY %1$s_insert ON %1$I FOR INSERT TO authenticated
        WITH CHECK (is_family_member() AND created_by_user_id = auth.uid());
      CREATE POLICY %1$s_update ON %1$I FOR UPDATE TO authenticated
        USING (is_family_member())
        WITH CHECK (is_family_member());
      CREATE POLICY %1$s_delete_admin ON %1$I FOR DELETE TO authenticated
        USING (is_family_admin());
    $f$, t);
  END LOOP;
END $$;

-- ---- Shape A2: content junctions (no created_by_user_id column) -----------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'recipe_ingredient', 'recipe_category', 'recipe_tag',
    'ingredient_category', 'ingredient_tag',
    'recipe_combination_recipe', 'chef_idea_category', 'chef_idea_tag'
  ] LOOP
    EXECUTE format($f$
      CREATE POLICY %1$s_all ON %1$I FOR ALL TO authenticated
        USING (is_family_member())
        WITH CHECK (is_family_member());
    $f$, t);
  END LOOP;
END $$;

-- ---- Shape B: household-visibility tables ----------------------------------
-- meal_plan: its OWN policies are expressed over the ROW'S OWN COLUMNS plus
-- definer helpers that never read meal_plan itself. Reason: INSERT/UPDATE
-- with RETURNING applies the SELECT policy to the new row before any snapshot
-- can see it — a self-lookup (can_view_meal_plan) fails closed there.
-- SELECT = creator disjunct OR admin OR membership (bootstrap + fail-closed
-- orphan handling); INSERT pins both household and user attribution;
-- UPDATE (incl. soft delete) = creating household or admin.
CREATE POLICY meal_plan_select ON meal_plan FOR SELECT TO authenticated
  USING (
    created_by_household_id = current_household_id()
    OR is_family_admin()
    OR is_plan_member(id)
  );
CREATE POLICY meal_plan_insert ON meal_plan FOR INSERT TO authenticated
  WITH CHECK (
    created_by_household_id = current_household_id()
    AND created_by_user_id = auth.uid()
  );
CREATE POLICY meal_plan_update ON meal_plan FOR UPDATE TO authenticated
  USING (
    created_by_household_id = current_household_id()
    OR is_family_admin()
  )
  WITH CHECK (
    created_by_household_id = current_household_id()
    OR is_family_admin()
  );
-- No DELETE policy: soft delete only.
-- can_view_meal_plan / can_edit_meal_plan remain the policy surface for the
-- CHILD tables below — there the parent row is already committed/visible.

-- Children: visible with the parent; writable by the creating household/admin.
-- Membership alone grants READ ONLY (v1 rule).
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['meal_plan_assignment', 'meal_plan_portion_requirement'] LOOP
    EXECUTE format($f$
      CREATE POLICY %1$s_select ON %1$I FOR SELECT TO authenticated
        USING (can_view_meal_plan(meal_plan_id));
      CREATE POLICY %1$s_insert ON %1$I FOR INSERT TO authenticated
        WITH CHECK (can_edit_meal_plan(meal_plan_id));
      CREATE POLICY %1$s_update ON %1$I FOR UPDATE TO authenticated
        USING (can_edit_meal_plan(meal_plan_id))
        WITH CHECK (can_edit_meal_plan(meal_plan_id));
      CREATE POLICY %1$s_delete ON %1$I FOR DELETE TO authenticated
        USING (can_edit_meal_plan(meal_plan_id));
    $f$, t);
  END LOOP;
END $$;

-- meal_plan_household: sharing/unsharing by creating household or admin;
-- the creating household's own membership row is irremovable AT POLICY LEVEL.
CREATE POLICY mph_select ON meal_plan_household FOR SELECT TO authenticated
  USING (can_view_meal_plan(meal_plan_id));
CREATE POLICY mph_insert ON meal_plan_household FOR INSERT TO authenticated
  WITH CHECK (
    can_edit_meal_plan(meal_plan_id)
    AND (added_by_user_id IS NULL OR added_by_user_id = auth.uid())
  );
CREATE POLICY mph_delete ON meal_plan_household FOR DELETE TO authenticated
  USING (
    can_edit_meal_plan(meal_plan_id)
    AND household_id IS DISTINCT FROM plan_creating_household(meal_plan_id)
  );
-- No UPDATE policy: membership rows are inserted/deleted, never mutated.

-- ---- Shape C: admin vocabularies -------------------------------------------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'category', 'tag', 'portion_category', 'unit', 'family_settings', 'household'
  ] LOOP
    EXECUTE format($f$
      CREATE POLICY %1$s_select ON %1$I FOR SELECT TO authenticated
        USING (is_family_member());
      CREATE POLICY %1$s_insert_admin ON %1$I FOR INSERT TO authenticated
        WITH CHECK (is_family_admin());
      CREATE POLICY %1$s_update_admin ON %1$I FOR UPDATE TO authenticated
        USING (is_family_admin())
        WITH CHECK (is_family_admin());
    $f$, t);
  END LOOP;
END $$;
-- No DELETE policies on vocabularies: deactivate via is_active.

-- ---- audit_log: admin read only; writes only via SECURITY DEFINER trigger --
CREATE POLICY audit_log_select_admin ON audit_log FOR SELECT TO authenticated
  USING (is_family_admin());
-- No INSERT/UPDATE/DELETE policies for any user role.

-- ===========================================================================
-- 6. Explicit role grants (do not rely on Supabase default privileges).
--    RLS is necessary but not sufficient — roles also need table privileges.
--    Making them explicit here means the pgTAP matrix exercises the SAME
--    privilege state as production (no test-side grant masking).
--    NOTE: `ON ALL TABLES` covers tables existing NOW — later migrations that
--    add tables must repeat their own grants (the coverage-manifest test
--    catches a missing-policy table; a missing GRANT fails closed).
-- ===========================================================================

GRANT USAGE ON SCHEMA public TO authenticated, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
-- anon gets table privileges too (mirrors Supabase defaults); RLS has no anon
-- policies anywhere, so every anon query returns zero rows / is denied.
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO anon;

-- ===========================================================================
-- 7. Realtime hardening: shape-B SELECT policies join across tables, so
--    Realtime needs full row images to evaluate them (DB PRD §7).
-- ===========================================================================

ALTER TABLE meal_plan                     REPLICA IDENTITY FULL;
ALTER TABLE meal_plan_assignment          REPLICA IDENTITY FULL;
ALTER TABLE meal_plan_household           REPLICA IDENTITY FULL;
ALTER TABLE meal_plan_portion_requirement REPLICA IDENTITY FULL;
