# Claude-Authored Spec Sections (High-Risk Components) — rev 2

**Purpose:** These sections are authored directly by the coordinating agent (not delegated) because they define the security boundary and the integrity-critical schema that every aggregate and every RLS policy depends on.
**Rev 2 (2026-07-15):** incorporates all findings from the adversarial security review — profile-table RLS (critical), soft-delete removed from authorization policies, child-table INSERT policies, plan-creation bootstrap fix, shape-A split for junction tables, audit-table RLS, Realtime replica-identity requirement, ingredient uniqueness, attribution immutability.
**Integration rule:** Grok drafts contain literal markers (`<!-- CLAUDE_SECTION: <NAME> -->`). The Integrator replaces each marker with the section body **below** the `## CLAUDE_SECTION:` heading and the italic `*(Target: …)*` line — those two scaffold lines are excluded from the paste; real internal headings (e.g., `## 7. Security and Access Control`) are kept. Any Grok text overlapping these topics is superseded by this file.

---

## CLAUDE_SECTION: NEW_TABLE_SCHEMAS
*(Target: Database PRD v0.4, §4.1 — inserted as full entity definitions)*

### MealPlanHousehold (junction — replaces `visible_to_households` JSONB)

```sql
CREATE TABLE meal_plan_household (
  meal_plan_id      uuid NOT NULL REFERENCES meal_plan(id) ON DELETE CASCADE,
  household_id      uuid NOT NULL REFERENCES household(id) ON DELETE RESTRICT,
  added_by_user_id  uuid REFERENCES profile(id),
  created_at        timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (meal_plan_id, household_id)
);
CREATE INDEX idx_mph_household ON meal_plan_household (household_id);
-- Serves: RLS EXISTS subqueries and "plans visible to my household" calendar queries.
```

**Invariants:**
1. The creating household always has a membership row; `mealPlan.createOrUpdate` (the single plan-creation code path) inserts it in the same transaction as the plan. Creator access does **not** depend on this row — the `meal_plan` SELECT policy also admits the creating household directly (see §7), which resolves the first-row bootstrap and means a membership-less plan degrades to creator-only visibility rather than leaking or deadlocking.
2. `is_shared` on MealPlan is **dropped** as a stored column. "Shared" is derived: membership count > 1. One source of truth; the UI computes the badge from membership.
3. The creating household's row cannot be removed: the DELETE policy on this table excludes rows where `household_id` equals the parent plan's `created_by_household_id`.
4. `ON DELETE RESTRICT` on `household_id`: households are deactivated via `is_active`, never hard-deleted.

### MealPlanPortionRequirement (normalized — replaces `protein_portions` JSONB)

```sql
CREATE TABLE meal_plan_portion_requirement (
  meal_plan_id         uuid NOT NULL REFERENCES meal_plan(id) ON DELETE CASCADE,
  portion_category_id  uuid NOT NULL REFERENCES portion_category(id) ON DELETE RESTRICT,
  count                smallint NOT NULL CHECK (count >= 0),
  athlete_count        smallint NOT NULL DEFAULT 0 CHECK (athlete_count >= 0),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (meal_plan_id, portion_category_id),
  CONSTRAINT athlete_within_count CHECK (athlete_count <= count)
);
-- Serves: portion totals per plan; weekly protein roll-ups; shopping-list scaling context.
```

**Semantics:**
- `count` = total people in this portion category eating from this plan; `athlete_count` = how many of those `count` people get the athlete multiplier. A household with 2 adult males, 1 of whom is an athlete, is `(count=2, athlete_count=1)` — expressible here, inexpressible in the old boolean-per-group JSONB.
- Rows with `count = 0` are not stored (delete on save); absence of a row means zero.
- `ON DELETE RESTRICT` on `portion_category_id`: categories referenced by any plan (including historical) cannot be deleted — deactivate via `PortionCategory.is_active` instead. Deactivated categories remain readable in existing plans but are not offered for new entries (edge-case AC, decision 11).

**Canonical portion formula** (the single business rule; implemented once as a pure TypeScript function in the shared package per decision 3, and mirrored *only* inside the sanctioned weekly protein roll-up function of decision 14, pinned by a contract test):

```
effective_protein_oz(plan) =
  Σ over requirement rows r:
    ( (r.count − r.athlete_count)
      + r.athlete_count × family_settings.athlete_multiplier )
    × portion_category.base_protein_oz
```

**DRY consequence — FamilySettings change:** `PortionCategory.base_protein_oz` is the *only* source of per-category base ounces. `FamilySettings.adult_reference_protein_oz` is **removed** from the model — it duplicated the Adult Male row's `base_protein_oz` and created a second source of truth. FamilySettings retains `athlete_multiplier` (family-wide) and `other_global_defaults` JSONB. The "editable adult base 6 oz" requirement is satisfied by editing the Adult Male PortionCategory row (admin UI already planned for PortionCategory curation).

### Unit (lookup — previously referenced but undefined)

```sql
CREATE TABLE unit (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text NOT NULL UNIQUE,        -- 'gram', 'cup', 'each'
  abbreviation    text NOT NULL,               -- 'g', 'cup', 'ea'
  dimension       text NOT NULL CHECK (dimension IN ('mass', 'volume', 'count')),
  factor_to_base  numeric NOT NULL CHECK (factor_to_base > 0),
  is_active       boolean NOT NULL DEFAULT true,
  sort_order      integer,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
-- Base units per dimension: mass → gram (factor 1), volume → milliliter (factor 1), count → each (factor 1).
-- Examples: oz = ('mass', 28.3495), lb = ('mass', 453.592), cup = ('volume', 236.588), tbsp = ('volume', 14.7868).
```

**Conversion rule (decision 12A):** quantities convert and sum **only within one dimension** via `quantity × factor_to_base`. Cross-dimension pairs (e.g., grams of flour + cups of flour) are **never converted by guessing** — the shopping list renders them as separate lines under the same ingredient. Density-based mass↔volume conversion is explicitly deferred (Phase 3 candidate).

### Additional integrity constraints

- **Ingredient name uniqueness (backs the §8.1 duplicate-prevention AC):** `CREATE UNIQUE INDEX uq_ingredient_name ON ingredient (lower(name)) WHERE deleted_at IS NULL;` — case-insensitive, scoped to non-deleted rows so a soft-deleted ingredient's name can be reused. The "merge suggestion" UX is application logic; the index is the enforcement backstop.
- **Attribution immutability:** on all content entities (`recipe`, `ingredient`, `chef_idea`, `recipe_combination`), a `BEFORE UPDATE` trigger rejects changes to `created_by_user_id` and `created_at`. Any family member may edit content (explicit family-trust decision, see §7 shape A1), but authorship cannot be rewritten.

### Assignment-date range constraint (decision 8A — implementation note)

A plain `CHECK` cannot reference the parent table, so `assignment_date BETWEEN plan.start_date AND plan.end_date` is enforced by **two layers, both required**:
1. **Database (authoritative):** a `BEFORE INSERT OR UPDATE` trigger on `meal_plan_assignment` that raises an exception when `assignment_date` falls outside the parent plan's `[start_date, end_date]`; a companion trigger on `meal_plan` rejects shrinking a plan's range while assignments would fall outside it.
2. **Application (UX):** Zod validation in the tRPC procedure so users get a friendly error before the trigger ever fires.

Both triggers get explicit unit coverage in the integration test suite (attempt out-of-range insert; attempt range shrink with stranded assignments).

---

## CLAUDE_SECTION: SHOPPING_LIST_VIEW
*(Target: Database PRD v0.4 §6 and referenced from Product PRD §10.3 — the sanctioned set-based aggregation, decision 14)*

**Contract — `generate_shopping_list(p_meal_plan_ids uuid[])`** (SQL function, `LANGUAGE sql STABLE`, **SECURITY INVOKER** so RLS filters the caller's visible plans automatically; plan IDs the caller cannot see contribute zero rows rather than erroring).

**Shape (single set-based query, no per-recipe round trips):**
```
meal_plan (filtered to p_meal_plan_ids, RLS-visible)
  JOIN meal_plan_assignment      ON plan
  JOIN recipe                    ON assignment    -- soft-deleted recipes INCLUDED (see note)
  JOIN recipe_ingredient         ON recipe
  JOIN unit                      ON recipe_ingredient.unit_id
  JOIN ingredient                ON recipe_ingredient.ingredient_id
  LEFT JOIN ingredient_category  ON ingredient (top-level category for grouping)
GROUP BY ingredient_id, unit.dimension, recipe_ingredient.is_optional
```

**Returns:**
| column | meaning |
|---|---|
| `ingredient_id`, `ingredient_name` | identity |
| `dimension` | mass / volume / count — one output row per (ingredient × dimension) |
| `total_quantity_base` | Σ `quantity × factor_to_base × scale_factor` |
| `is_optional` | optional ingredients aggregate separately and render in an "Optional" group (decision 11) |
| `category_name` | top-level ingredient category for store-aisle grouping |
| `source_recipe_ids` | array — lets the UI answer "why is this on my list?" |
| `includes_deleted_recipe` | true when any contributing recipe is soft-deleted, so the UI can badge the line |

Display-unit selection (rendering `total_quantity_base` as "1.5 lb" instead of "680 g") is a **backend formatting concern**: the tRPC wrapper picks the largest active unit of the row's dimension that yields a quantity ≥ 1. The SQL function returns base quantities only.

**Scaling rule (explicit v1 simplification):** `scale_factor = meal_plan_assignment.servings / recipe.yield_servings`. The protein requirement (portion formula above) **informs the user's choice of `servings`** — it is displayed alongside the assignment editor — but does **not** silently rescale individual ingredients, because mapping "oz of protein needed" to "which ingredient line is the protein" is not decidable from the v1 data model. Automatic protein-driven scaling is a Phase 3 item and requires tagging the protein ingredient(s) per recipe.

**Soft-delete rule:** RLS does **not** filter `deleted_at` (authorization and lifecycle are separate concerns — see §7); browse/search queries apply `deleted_at IS NULL` themselves. This function therefore correctly includes soft-deleted recipes so historical and current plans keep aggregating, flagged via `includes_deleted_recipe`.

**Weekly protein roll-up** is a sibling function over `meal_plan` × `meal_plan_portion_requirement` × `portion_category` × `family_settings` implementing the canonical portion formula — the only sanctioned SQL copy of it, pinned to the TypeScript implementation by a contract test that runs both against identical fixtures. (The shopping list's `scale_factor` is servings-based and deliberately *not* part of that contract.)

---

## CLAUDE_SECTION: RLS_POLICIES
*(Target: Database PRD v0.4 §7 — full replacement)*

## 7. Security and Access Control

**Authority model (decision 1A):** RLS is the **sole** authorization authority. Every tRPC procedure creates a Supabase client with the **caller's JWT**; there is no service-role write path for user-facing operations. The service role key exists only for system jobs (migrations, audit backfills, seed data) and is never reachable from request handling. Consequence: any authorization bug is an RLS bug, findable in exactly one place and covered by the test matrix.

**Tenancy assumption (explicit):** this deployment serves exactly one family (per §1); policies scope by "has a profile row," not by `family_id`. `Household.family_id` is retained as informational grouping only. **Precondition for any future multi-family use:** every policy below must gain `family_id` scoping first — this is a stated migration gate, not an oversight.

**Blanket rule:** `ALTER TABLE … ENABLE ROW LEVEL SECURITY` on **every table in the schema, no exceptions** — including `profile`, audit tables, and lookups. The CI coverage check (see test matrix) asserts both that RLS is enabled on all tables *and* that each table has matrix coverage; a table with RLS disabled fails CI. `anon` has no policies anywhere: unauthenticated access is denied by default on every table, and Storage buckets (recipe images) are authenticated-only.

**Helper functions:** `current_household_id()` (`SELECT household_id FROM profile WHERE id = auth.uid()`) and `is_family_admin()` (over `profile.role`), both `SECURITY DEFINER STABLE` so policies stay one-line and are planned once per statement. Because these helpers read `profile`, the integrity of `profile.role` and `profile.household_id` is the root of the entire model — hence shape D below.

**Shape D — identity tables (`profile`):** the privilege-escalation surface; deliberately the most restrictive.
- `SELECT`: any authenticated family member (profiles are visible family-wide — needed for attribution display and plan sharing UI).
- `INSERT`: no user policy. Profiles are provisioned by a `SECURITY DEFINER` on-signup trigger (Supabase auth hook); household assignment happens via admin invite flow.
- `UPDATE`: users may update their own row (`id = auth.uid()`), **but** a `BEFORE UPDATE` trigger rejects any change to `role` or `household_id` unless `is_family_admin()`. Cosmetic fields (`display_name`) are self-service; privilege and membership fields are admin-only. (RLS cannot express column-level rules; the trigger closes that gap and is itself matrix-tested.)
- `DELETE`: nobody (deactivation flag if ever needed).

**Shape A1 — family-global content entities (decision 7A):** `recipe`, `ingredient`, `chef_idea`, `recipe_combination`.
- `SELECT`: any authenticated family member. **No `deleted_at` filtering in policies** — lifecycle filtering is a query concern (browse/search apply `deleted_at IS NULL`; historical plan views and `generate_shopping_list` intentionally read soft-deleted rows). Policies express authorization only.
- `INSERT`: any authenticated family member, `WITH CHECK (created_by_user_id = auth.uid())`.
- `UPDATE`: any authenticated family member (explicit family-trust decision: anyone may edit shared family content); `created_by_user_id` is frozen by the attribution-immutability trigger (§4.1).
- `DELETE`: nobody — soft delete only (`UPDATE … SET deleted_at`); hard delete reserved for admins doing data-hygiene corrections.

**Shape A2 — content junctions:** `recipe_ingredient`, `recipe_combination_recipe`, all tag/category junction tables. Same as A1 but **without** the attribution `WITH CHECK` — these tables have composite keys and no `created_by_user_id` column, so an attribution predicate would reference a nonexistent column. Read/write for any authenticated family member; rows live and die with their parent entities (`ON DELETE CASCADE`).

**Shape B — household-visibility tables:** `meal_plan`, `meal_plan_assignment`, `meal_plan_portion_requirement`, `meal_plan_household`.
- `SELECT` on `meal_plan`:
  `created_by_household_id = current_household_id() OR EXISTS (SELECT 1 FROM meal_plan_household mph WHERE mph.meal_plan_id = meal_plan.id AND mph.household_id = current_household_id()) OR is_family_admin()`.
  The first disjunct resolves the creation bootstrap (the creator sees the plan before any membership row exists) and makes a membership-less plan degrade to creator-only visibility.
- `SELECT` on child tables: same predicate applied through the parent `meal_plan_id`.
- `INSERT` on `meal_plan`: `WITH CHECK (created_by_household_id = current_household_id())`.
- `INSERT` on `meal_plan_assignment` and `meal_plan_portion_requirement` (explicitly defined — absence would deny all inserts): `WITH CHECK` that the parent plan's `created_by_household_id = current_household_id() OR is_family_admin()`. Membership alone does **not** grant insert — shared households are read-only in v1.
- `UPDATE` / soft-delete on `meal_plan` and children: creating household's members or `is_family_admin()`. Members of merely-shared households read but do not edit (v1 rule; per-plan edit grants are a future enhancement).
- `INSERT` on `meal_plan_household` (sharing): creating household or family admin, verified via a predicate on the parent plan's `created_by_household_id` (readable by the creator per the SELECT disjunct above — no circularity).
- `DELETE` on `meal_plan_household` (unsharing): creating household or family admin, `USING` clause additionally excludes the row whose `household_id` equals the parent plan's `created_by_household_id` — the creating household's membership is irremovable at the policy level.

**Shape C — admin vocabularies:** `category`, `tag`, `portion_category`, `unit`, `family_settings`, `household`.
- `SELECT`: any authenticated family member.
- `INSERT` / `UPDATE` / deactivation: `is_family_admin()` only.

**Audit tables:** RLS enabled; **no user-facing read or write policies except `SELECT` for `is_family_admin()`**. Rows are written exclusively by `SECURITY DEFINER` trigger functions on `meal_plan`, `recipe`, `family_settings`, `portion_category` (who, when, before/after) — users cannot skip or read around them. Audit rows contain private-plan before/after images, which is precisely why non-admin read must be denied.

**Realtime:** Supabase Realtime authorization must equal RLS. Because shape B's SELECT policies join to another table (`meal_plan_household`), two hardening requirements apply: (1) `REPLICA IDENTITY FULL` on all `meal_plan*` tables so policy evaluation sees full row images; (2) an integration test verifying the cross-table policy is actually enforced on the Realtime path — including the **unshare cutoff** (a household stops receiving events immediately after its membership row is deleted). If platform limitations prevent reliable enforcement of the joined policy on Realtime, fall back to notify-then-refetch (events carry only ids; clients refetch through ordinary RLS-filtered queries) rather than trusting channel filters.

---

## CLAUDE_SECTION: RLS_TEST_MATRIX
*(Target: Product PRD v0.2, Testing Strategy section — the hardened subsection, decision 10A)*

### RLS Verification Matrix (CI-blocking, Phase 1 acceptance criterion)

SQL-level tests (pgTAP or `supabase_test_helpers`) executed against a migrated local Supabase instance in CI. Tests authenticate as **five fixed personas** created by seed fixtures:

| Persona | Definition |
|---|---|
| `member_a` | Regular member of Household A (plan-creating household) |
| `member_b` | Member of Household B (shared into some plans) |
| `member_c` | Member of Household C (never shared) |
| `admin_a` | Family admin (Household A) |
| `anon` | Unauthenticated client |

**Required coverage — every table × every persona × {SELECT, INSERT, UPDATE, DELETE}**, with the expected outcome (`allowed`, `denied`, `filtered-to-empty`) asserted explicitly. Minimum scenario set beyond the grid:

1. Private plan (Household A only): `member_b`/`member_c` SELECT returns zero rows; UPDATE affects zero rows; child tables (`assignment`, `portion_requirement`, `meal_plan_household`) equally invisible.
2. Shared plan (A + B): `member_b` reads plan + children; `member_b` UPDATE affects zero rows and `member_b` INSERT of assignments/portion rows is denied (read-only share); `member_c` sees nothing.
3. Sharing mutation: `member_b` cannot INSERT/DELETE `meal_plan_household` rows on A's plan; `admin_a` can; DELETE of the creating household's own membership row is denied for **everyone**, including `admin_a`.
4. Bootstrap & orphan guard: `member_a` creates a plan and can SELECT it before any membership row exists (creator disjunct); the same plan is invisible to `member_b`/`member_c`/`anon` — membership-less plans fail closed to creator-only.
5. **Privilege escalation (profile):** `member_a` UPDATE of own `profile.display_name` succeeds; UPDATE of own `role` or `household_id` is rejected; `member_a` cannot UPDATE another member's profile; `admin_a` can change `role`/`household_id`.
6. Content attribution: `member_a` INSERT of a recipe with `created_by_user_id` ≠ own id is rejected by `WITH CHECK`; UPDATE attempting to change `created_by_user_id` is rejected by the immutability trigger.
7. Vocabulary protection: `member_a` UPDATE on `portion_category`/`family_settings`/`unit` denied; `admin_a` allowed.
8. Hard-delete denial: `member_a` `DELETE FROM recipe` affects zero rows even for rows they created.
9. **Audit isolation:** `member_a`/`member_b` SELECT on audit tables returns zero rows / denied; `admin_a` can read; direct INSERT into audit tables denied for all personas.
10. `anon`: every table, every operation → denied/empty.
11. Realtime parity: subscription as `member_c` receives no events for A's private plan; **unshare cutoff** — after B's membership row is deleted, `member_b` receives no further events for that plan (or, under the notify-then-refetch fallback, refetch returns zero rows).

**Process rule:** any migration that touches a policy, a policy-referenced function (`current_household_id`, `is_family_admin`), a security trigger (profile-field guard, attribution immutability, audit writers), or adds a table MUST extend the matrix in the same PR. CI fails if (a) any table has RLS disabled, or (b) any RLS-enabled table lacks matrix coverage — both checks enforced by a coverage-manifest test over `pg_tables`/`pg_policies`.

---

*End of Claude-authored sections rev 2. The Integrator pastes section bodies per the Integration rule at the top; any Grok text overlapping these topics is superseded by this file.*
