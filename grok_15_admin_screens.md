# Brief for Grok — Task 15 (Wave 3): Family admin screens

**Context:** Every admin capability so far is API/RLS-only. This task adds the admin UI: invites (the only way people join — migration 0005), vocabularies, family settings, audit viewer. RLS is the enforcement authority; the UI's admin-gating is display-only convenience.

**Attachments required:** `Product_PRD_v0.2.md` (§8.1 admin curation, §12 NFR), `supabase/migrations/0005_auth_provisioning.sql` (invite semantics — read carefully), DB PRD v0.4 §4.1 (PortionCategory, FamilySettings, Unit).

**Output:** one markdown file, saved as `drafts/grok_out_admin_screens.md`, files as `### FILE:` headers + fenced blocks. Wave 2 conventions (extensionless imports, tRPC via `@/lib/trpc/client`, `data-testid`s).

## 0. Backend additions (the ONE task allowed to add procedures this wave)
New `admin` tRPC router — every procedure `adminProcedure`, thin Supabase pass-throughs (RLS enforces; surface 42501 as FORBIDDEN):
- `invites.list / create / revoke` (revoke = DELETE of a pending invite; accepted invites are read-only history). Create takes email (trim client-side too), householdId, role.
- `households.list / create / rename / setActive`
- `portionCategories.list / create / update / setActive / reorder`
- `units.list / create / update / setActive`
- `familySettings.get / update` (athleteMultiplier)
- `audit.list` (paged, filter by table_name/record_id — reads `audit_log`, admin-only via RLS)
- Zod schemas in `packages/schemas/src/admin.ts` (email: trimmed + lowercase transform + `.email()`; multiplier positive finite; role enum).

## 1. `/admin` section (nav entry visible only when `family.me` role = admin; route still safe for non-admins — RLS returns empty/denied → show a friendly "admins only" state)
- **Invites & members:** pending invites table (email, household, role, created, revoke button), accepted history, member list per household (from `profile` via existing family router or a small `admin.members` addition), "Invite someone" dialog. Show the 0005 behavior in the UI copy: "They'll get access when they sign up — or immediately if they already have an account."
- **Portion categories:** editable table (name, base oz numeric input, sort order, active toggle) — this is where the "Adult Male 6.0 oz reference" is edited (decision D17); include that hint text. Deactivate, never delete (no delete button).
- **Units:** table grouped by dimension; add/edit (name, abbreviation, dimension, factor_to_base), active toggle. Warn copy: factors are conversion-critical.
- **Categories & Tags:** tree editor for categories (add child, rename, reorder, deactivate — reparenting deferred, note it), grouped tag list editor.
- **Family settings:** athlete multiplier stepper with live example ("An athlete adult male counts as 9.0 oz at 1.5×") computed via `@menu-boss/portion-calc` breakdown helper — do not inline the math.
- **Audit log:** read-only table (when, who, table, action) with before/after JSON diff expander.

## 2. Tests
- Component: invite dialog validation (email trim/lowercase), portion-category editor rejects base oz ≤ 0, non-admin sees "admins only" state (mocked role).
- Integration (env-guarded, pg client pattern from Wave 2): admin.invites.create → row present; revoke pending works; revoke accepted rejected (or filtered) — align with 0005 semantics.

## Constraints
- No service-role; no RLS/migration changes (if a needed capability is missing at the DB layer, STOP and emit `<!-- TODO(coordinator): … -->` instead of adding SQL).
- Route group: `/admin` inside the authed `(app)` tree.
