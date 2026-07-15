# Research Brief — Tasks 06 & 07 (Schema Migration + Portion-Calc Package)

**Agent:** Researcher  
**Branch:** `research/grok-06-07`  
**Date:** 2026-07-15  
**Audience:** Implementers for `grok_06_schema_migration_and_seed.md` and `grok_07_portion_calc_package.md`  
**Scope:** Investigation only. **Do not** treat this as migration SQL or package source. **Do not** invent features beyond the briefs + PRD.

**Primary inputs (read fully):**

| File | Role |
|------|------|
| `grok_06_schema_migration_and_seed.md` | Task 06 brief: `0001_schema.sql` + `seed.sql` |
| `grok_07_portion_calc_package.md` | Task 07 brief: `@menu-boss/portion-calc` |
| `Recipe_Meal_Planning_Database_PRD_v0.4.md` | Schema SoT (§4.1, §4.2, §6, formula, soft-delete, indexes) |
| `drafts/claude_authored_sections.md` | **Verbatim** NEW_TABLE_SCHEMAS DDL + formula + integrity notes |
| `PHASE1_PLAN.md` | Migration split (0001/0002/0003), monorepo paths, seed fixtures |

**Secondary (context only):** Product PRD v0.2 soft-delete ACs; prior research briefs for naming consistency.

---

## 1. Complete table list + junction names (snake_case recommendations)

### 1.1 Primary tables (0001 — ordered for FK creation)

Recommended physical create order (parents before children):

| # | Entity (PRD) | SQL table | Notes |
|---|--------------|-----------|--------|
| 1 | Household | `household` | No FK to family table; `family_id` informational |
| 2 | User / Profile | `profile` | `id` ties to Auth (see §7 ambiguities) |
| 3 | Unit | `unit` | **Verbatim DDL** from Claude |
| 4 | Category | `category` | Self-FK `parent_id` → `category(id)`; **no** `level`/`path` |
| 5 | Tag | `tag` | Flat; `tag_group` text |
| 6 | PortionCategory | `portion_category` | Nine seed rows; deactivate not hard-delete |
| 7 | FamilySettings | `family_settings` | Single logical row; **no** `adult_reference_protein_oz` |
| 8 | Ingredient | `ingredient` | Family-global; `deleted_at`; unique lower(name) partial |
| 9 | Recipe | `recipe` | Family-global; `deleted_at`; leftover_decay_path JSONB |
| 10 | RecipeIngredient | `recipe_ingredient` | Junction-like but has own `id` per PRD |
| 11 | RecipeCombination | `recipe_combination` | Family-global; `deleted_at` |
| 12 | RecipeCombinationRecipe | `recipe_combination_recipe` | Composite / role_in_meal |
| 13 | ChefIdea | `chef_idea` | Family-global; `deleted_at` |
| 14 | MealPlan | `meal_plan` | Date-ranged container; **no** `is_shared` / `visible_to_households` / `protein_portions` / `plan_date` |
| 15 | MealPlanAssignment | `meal_plan_assignment` | Date-range invariant via **0002** triggers (not 0001) |
| 16 | MealPlanHousehold | `meal_plan_household` | **Verbatim DDL** from Claude |
| 17 | MealPlanPortionRequirement | `meal_plan_portion_requirement` | **Verbatim DDL** from Claude |

### 1.2 Content junctions (snake_case — PRD names only “via junction table”)

PRD never names these tables explicitly except `recipe_ingredient`, `recipe_combination_recipe`, and shopping-list shape referencing `ingredient_category`. Recommendations (all composite PK on the two FKs unless noted; `ON DELETE CASCADE` on both parents for content junctions):

| Logical M2M | Recommended table | PK / columns | ON DELETE |
|-------------|-------------------|--------------|-----------|
| Recipe × Category | `recipe_category` | `(recipe_id, category_id)` | CASCADE both |
| Recipe × Tag | `recipe_tag` | `(recipe_id, tag_id)` | CASCADE both |
| Ingredient × Category | `ingredient_category` | `(ingredient_id, category_id)` | CASCADE both — **required name** for shopping-list contract (`LEFT JOIN ingredient_category`) |
| Ingredient × Tag | `ingredient_tag` | `(ingredient_id, tag_id)` | CASCADE both |
| RecipeCombination × Recipe | `recipe_combination_recipe` | composite + `role_in_meal`, `sequence_order`, `notes` (PRD) | CASCADE on combination; RESTRICT or CASCADE on recipe — **flag:** prefer `ON DELETE RESTRICT` on `recipe_id` so deleting a recipe cannot silently strip a meal combo, *or* CASCADE if soft-delete-only recipes never hard-delete (v1: soft-delete only → CASCADE OK) |
| ChefIdea × Category | `chef_idea_category` | `(chef_idea_id, category_id)` | CASCADE both |
| ChefIdea × Tag | `chef_idea_tag` | `(chef_idea_id, tag_id)` | CASCADE both |
| Recipe × Ingredient | `recipe_ingredient` | Surrogate `id` PK + FKs (PRD lists `id`) | CASCADE on recipe; **RESTRICT** on ingredient (or CASCADE) — prefer RESTRICT so hard-delete of ingredient fails; soft-delete leaves row |
| Plan × Household | `meal_plan_household` | verbatim composite PK | CASCADE plan; **RESTRICT** household |
| Plan × PortionCategory | `meal_plan_portion_requirement` | verbatim composite PK | CASCADE plan; **RESTRICT** portion_category |

### 1.3 Explicit exclusions from 0001 (Phase1 plan + brief)

Do **not** put in `0001_schema.sql`:

- RLS `ENABLE` / policies / helper functions (`current_household_id`, `is_family_admin`) → `0002_security.sql`
- Profile role/household guard trigger, attribution immutability trigger, assignment-date triggers, audit tables/triggers → `0002`
- `generate_shopping_list`, `weekly_protein_rollup` → `0003_functions.sql`
- Audit tables (not listed in grok_06 table list)

**Allowed in 0001:** `CREATE EXTENSION`, `CREATE TABLE`, constraints, indexes, generated columns, generic `updated_at` touch trigger.

### 1.4 Full table count checklist (for matrix / CI later)

**Core (17):**  
`household`, `profile`, `unit`, `category`, `tag`, `portion_category`, `family_settings`, `ingredient`, `recipe`, `recipe_ingredient`, `recipe_combination`, `recipe_combination_recipe`, `chef_idea`, `meal_plan`, `meal_plan_assignment`, `meal_plan_household`, `meal_plan_portion_requirement`

**M2M junctions (6 additional):**  
`recipe_category`, `recipe_tag`, `ingredient_category`, `ingredient_tag`, `chef_idea_category`, `chef_idea_tag`

**Total application tables in 0001: 23** (plus no audit tables).

---

## 2. Which DDL blocks must be verbatim

Source: `drafts/claude_authored_sections.md` → `## CLAUDE_SECTION: NEW_TABLE_SCHEMAS` (also embedded in DB PRD v0.4 §4.1).

### 2.1 Must reproduce character-for-character (SQL body)

| Block | Lines in `claude_authored_sections.md` | Must include |
|-------|----------------------------------------|--------------|
| `meal_plan_household` | L15–24 | Full `CREATE TABLE` + `CREATE INDEX idx_mph_household` + serving-query comment |
| `meal_plan_portion_requirement` | L35–45 | Full `CREATE TABLE` including both CHECKs + `athlete_within_count` + serving comment |
| `unit` | L67–79 | Full `CREATE TABLE` including dimension CHECK, `factor_to_base > 0`, timestamps, base-unit comments |

**Ingredient uniqueness index** (Claude “Additional integrity constraints” + grok_06 explicit requirement):

```sql
CREATE UNIQUE INDEX uq_ingredient_name ON ingredient (lower(name)) WHERE deleted_at IS NULL;
```

Reproduce this exact predicate and name. Requires `ingredient.deleted_at` to exist.

### 2.2 Verbatim-adjacent (formula text — Task 07, not SQL)

Canonical formula (Claude L54–60 / PRD L178–184 / grok_07 L11–16) — implement **exactly** this algebra; do not “simplify” athlete term:

```
effective_protein_oz(plan) =
  Σ over requirement rows r:
    ( (r.count − r.athlete_count)
      + r.athlete_count × family_settings.athlete_multiplier )
    × portion_category.base_protein_oz
```

### 2.3 Do **not** paste into 0001

| Content | Why |
|---------|-----|
| MealPlanHousehold **invariants prose** (membership, derived is_shared, DELETE policy) | App / 0002 policies |
| Assignment-date **triggers** | 0002 security migration |
| Attribution immutability **trigger** | 0002 |
| SHOPPING_LIST_VIEW / `generate_shopping_list` contract | 0003 |
| RLS_POLICIES / RLS_TEST_MATRIX | 0002 + Claude harness |

### 2.4 Column types locked by verbatim DDL (do not “improve”)

- `meal_plan_portion_requirement.count` / `athlete_count`: **`smallint`**, not integer  
- `unit.factor_to_base`: **`numeric`**, not float  
- `meal_plan_household`: **no** `updated_at`; only `created_at`  
- `meal_plan_portion_requirement`: **no** `created_at`; only `updated_at`  
- Composite PKs as written — no surrogate `id` on these two tables

---

## 3. Soft-delete entities list

### 3.1 Authority for “who gets `deleted_at`”

| Source | Statement |
|--------|-----------|
| DB PRD §6 | Soft-delete on **most user-facing content entities** to preserve historical plans |
| Claude Shape A1 | `recipe`, `ingredient`, `chef_idea`, `recipe_combination` — hard DELETE denied; soft via `UPDATE … SET deleted_at` |
| Claude Shape B | Soft-delete language on **`meal_plan` and children** (policy level) |
| Product PRD §8.1 | Soft-delete recipes/ingredients; un-delete restores browse; soft-deleted recipes still on plans / shopping list |
| grok_06 | `deleted_at timestamptz` on user-facing content entities per §6; unique index assumes ingredient soft-delete |

### 3.2 Recommended: **must** have `deleted_at timestamptz NULL`

| Table | Rationale |
|-------|-----------|
| `recipe` | Shape A1 + shopping list `includes_deleted_recipe` |
| `ingredient` | Shape A1 + `uq_ingredient_name … WHERE deleted_at IS NULL` |
| `chef_idea` | Shape A1 content entity |
| `recipe_combination` | Shape A1 content entity |
| `meal_plan` | Shape B soft-delete; historical calendar integrity |

### 3.3 Recommended: **no** `deleted_at` (use other lifecycle)

| Table | Lifecycle mechanism |
|-------|---------------------|
| `household` | `is_active` only (RESTRICT FKs; never hard-delete) |
| `portion_category` | `is_active` only (RESTRICT from portion requirements) |
| `category`, `tag`, `unit` | `is_active` (Shape C admin vocabularies) |
| `family_settings` | Single config row; UPDATE only |
| `profile` | No DELETE policy; optional future deactivation flag — **not** specified as soft-delete |
| `recipe_ingredient`, `recipe_combination_recipe`, all tag/category junctions | Rows live/die with parents (`ON DELETE CASCADE`); no independent soft-delete |
| `meal_plan_household` | Hard DELETE for unshare (policy-controlled); creating household row irremovable |
| `meal_plan_portion_requirement` | Delete-on-save when `count = 0`; no soft-delete |
| `meal_plan_assignment` | Prefer hard delete / replace on plan edit; **see ambiguity** if Shape B “children” implies soft-delete |

### 3.4 Ambiguous soft-delete (flag for NOTES)

| Table | Conservative recommendation |
|-------|----------------------------|
| `meal_plan_assignment` | **No `deleted_at` in v1** — assignments are rewritten with the plan; orphans cleaned by CASCADE on plan hard-delete (rare). If implementer adds soft-delete, document why. |
| `recipe_ingredient` | **No `deleted_at`** — edit path rewrites lines; soft-deleted **ingredient** still referenced (Product AC badges recipe). |

RLS must **not** filter `deleted_at` (Claude soft-delete rule); browse/search apply `deleted_at IS NULL` in app queries. 0001 only adds the column.

---

## 4. Index inventory with serving queries

Every index in 0001 must carry a SQL comment of the form `-- Serves: …` (grok_06 + D13).

### 4.1 Mandatory (brief + Claude + PRD §6)

| Index (recommended name) | Definition | Serves |
|--------------------------|------------|--------|
| `idx_mph_household` | `meal_plan_household (household_id)` | **Verbatim** — RLS EXISTS subqueries; “plans visible to my household” calendar queries |
| `uq_ingredient_name` | `UNIQUE (lower(name)) WHERE deleted_at IS NULL` | Case-insensitive duplicate prevention; name reuse after soft-delete |
| `meal_plan (start_date, end_date)` | B-tree composite | Plan-window / calendar range fetches overlapping a visible window |
| `meal_plan_assignment (assignment_date)` | B-tree | Day-grid / “what’s on date D” queries |
| FTS recipe | Generated `tsvector` on `title` + `description` + **GIN** | Recipe full-text search |
| FTS ingredient | Generated `tsvector` on `name` (+ optional description if present) + **GIN** | Ingredient search |

**Generated column pattern (PRD: not trigger-maintained):**

```sql
-- example shape; exact expression is implementer choice if PRD silent
search_vector tsvector GENERATED ALWAYS AS (
  to_tsvector('english', coalesce(title, '') || ' ' || coalesce(description, ''))
) STORED;
CREATE INDEX idx_recipe_search ON recipe USING GIN (search_vector);
-- Serves: recipe full-text search by title/description
```

### 4.2 Strongly recommended FK / junction indexes (PRD §6 “FK indexes on all junctions”)

Postgres does **not** auto-index the referencing side of FKs. Index every FK used in joins / RLS / CASCADE:

| Index | Serves |
|-------|--------|
| `recipe_ingredient (recipe_id)` | Shopping-list join recipe → lines; recipe detail |
| `recipe_ingredient (ingredient_id)` | “Which recipes use this ingredient?”; soft-delete badge |
| `recipe_ingredient (unit_id)` | Optional; unit conversion join |
| `meal_plan_assignment (meal_plan_id)` | Plan detail + shopping list |
| `meal_plan_assignment (meal_plan_id, assignment_date)` | Day-grid within a plan (PRD §6 explicit example) |
| `meal_plan_assignment (recipe_id)` | Reverse: plans using recipe |
| `meal_plan_portion_requirement (portion_category_id)` | Portion roll-ups; referential / admin “in use?” checks (PRD §6) |
| `meal_plan_household (meal_plan_id)` | Often covered by PK leading column; still fine if composite PK exists — **no extra index required** if PK is `(meal_plan_id, household_id)` |
| `recipe_category (category_id)` | Recipes by category (PK covers recipe_id lead) |
| `recipe_tag (tag_id)` | Recipes by tag |
| `ingredient_category (category_id)` | Ingredients by category; shopping aisle group helper |
| `ingredient_tag (tag_id)` | Ingredients by tag |
| `chef_idea_category (category_id)` / `chef_idea_tag (tag_id)` | Filter inspiration lists |
| `recipe_combination_recipe (recipe_id)` | Combos containing recipe |
| `profile (household_id)` | Members of household; admin invite UX |
| `category (parent_id)` | Recursive CTE children |
| `ingredient (default_unit_id)` | Optional FK index |
| `meal_plan (created_by_household_id)` | Creator-household plan lists + RLS predicate support |
| `meal_plan (created_by_user_id)` / content `created_by_user_id` | Attribution filters (lower priority) |

### 4.3 Uniqueness / lookup indexes (PRD §6 “where proven”)

| Constraint / index | Serves |
|--------------------|--------|
| `unit.name` UNIQUE (in verbatim DDL) | Stable unit lookup by name |
| `category.slug` UNIQUE (global or per `category_type` — **see ambiguities**) | Stable taxonomy URLs / seed upsert |
| `tag.slug` UNIQUE (global or per `tag_group`) | Same for tags |
| `portion_category.slug` UNIQUE | Seed + TS package refs by slug |
| Optional: `unit.abbreviation` unique | Seed by `g`, `cup`, etc. |

### 4.4 Explicitly **out** of 0001

- No GIN on JSONB (`leftover_decay_path`, `food_safety_profile`, `nutrition_data`, `other_global_defaults`) until a real filter query exists (D13).
- No index solely “for audit” (audit tables not in 0001).

### 4.5 Extensions required for clean apply

| Extension | Why |
|-----------|-----|
| `pgcrypto` or use `gen_random_uuid()` from `pgcrypto` / PG13+ `pg_catalog` | UUID defaults — on Supabase/PG15 often `gen_random_uuid()` is built-in; brief asks `CREATE EXTENSION IF NOT EXISTS pgcrypto` if needed |
| `pg_trgm` | Brief says available; **not required** if FTS uses only `tsvector`+GIN. Include only if implementer adds trigram indexes (not required by PRD). Prefer **not** depending on trgm for v1 FTS. |

---

## 5. Seed UUID conventions for RLS matrix personas

### 5.1 Personas (Claude RLS_TEST_MATRIX + grok_06)

| Persona | Definition | Needs DB row? |
|---------|------------|---------------|
| `member_a` | Regular member, Household A (plan creator household) | `profile` + Auth user |
| `member_b` | Member of Household B (shared into some plans) | yes |
| `member_c` | Member of Household C (never shared) | yes |
| `admin_a` | Family admin, Household A | yes (`role = 'admin'`) |
| `anon` | Unauthenticated | **no** profile row |

Also seed: **3 households** A, B, C.

### 5.2 Recommended fixed UUID scheme

Follow brief example style (`00000000-0000-0000-0000-…`) so pgTAP can hard-code. Prefer **valid UUID version nibble** optional; nil-version is fine for tests if PG accepts (it does for uuid type).

| Entity | Recommended UUID | Notes |
|--------|------------------|-------|
| Household A | `00000000-0000-4000-a000-0000000000a1` | `family_id` same family constant |
| Household B | `00000000-0000-4000-a000-0000000000b1` | |
| Household C | `00000000-0000-4000-a000-0000000000c1` | |
| Family grouping constant | `00000000-0000-4000-a000-0000000000f1` | Used as `household.family_id` for all three if type is UUID |
| `member_a` profile/auth id | `00000000-0000-4000-a000-0000000000a1` | **Conflict risk** with household A if same suffix — use distinct spaces |
| Better profile ids | | |
| `member_a` | `00000000-0000-4000-a000-0000000000a2` | Household A, role `member` |
| `admin_a` | `00000000-0000-4000-a000-0000000000aa` | Household A, role `admin` |
| `member_b` | `00000000-0000-4000-a000-0000000000b2` | Household B, role `member` |
| `member_c` | `00000000-0000-4000-a000-0000000000c2` | Household C, role `member` |

**Simpler scheme matching brief literal example** (acceptable if documented in seed header):

| Key | UUID |
|-----|------|
| household_a | `00000000-0000-0000-0000-0000000000a1` |
| household_b | `00000000-0000-0000-0000-0000000000b1` |
| household_c | `00000000-0000-0000-0000-0000000000c1` |
| member_a | `00000000-0000-0000-0000-0000000000a2` |
| admin_a | `00000000-0000-0000-0000-0000000000a3` |
| member_b | `00000000-0000-0000-0000-0000000000b2` |
| member_c | `00000000-0000-0000-0000-0000000000c2` |
| family_settings | `00000000-0000-0000-0000-0000000000f1` |

Export constants in a comment block at top of `seed.sql` for Claude’s pgTAP harness.

### 5.3 Auth users vs profile rows

- RLS helpers: `profile.id = auth.uid()`.
- Seed **must** create matching `auth.users` rows (or use Supabase test helpers) **or** document that matrix harness inserts Auth users separately and seed only fills `profile` / `household`.
- **Conservative recommendation for NOTES:** seed.sql inserts `household` + `profile` with fixed UUIDs; Auth user insertion is harness-owned **or** seed uses `extensions`/service role insert into `auth.users` if local Supabase allows — **do not silently assume profile-only is enough for JWT tests**.

### 5.4 Other seed content (non-UUID)

| Domain | Content |
|--------|---------|
| `unit` | mass: g(1), kg(1000), oz(28.3495), lb(453.592); volume: ml(1), l(1000), tsp(**4.92892** recommended US), tbsp(14.7868), cup(236.588), fl_oz(**29.5735** US); count: each(1), dozen(12), clove(1), head(1). Names: prefer full names matching Unit DDL comments (`gram`/`g`, `cup`/`cup`) — see ambiguities |
| `portion_category` | Nine PRD names + slugs + `base_protein_oz` + `sort_order` (see §6.2 recommended oz values) |
| `family_settings` | One row: `athlete_multiplier = 1.5`, `other_global_defaults = '{}'::jsonb` |
| `category` | Protein → Seafood/Poultry/Pork/Beef; Starch → Grains/Potatoes; Vegetable; Fruit; Dairy (parent_id tree) |
| `tag` | Starter per `tag_group`: applicable_meal, cuisine, preparation_method, dietary_restriction, difficulty |
| Fixtures guard | Comment or `WHERE`/`current_setting` pattern so production deploy can skip personas; use `ON CONFLICT DO NOTHING` + fixed PKs |

### 5.5 Portion category seed values (recommended; not locked by PRD)

| sort_order | name | slug | base_protein_oz |
|------------|------|------|-----------------|
| 10 | Child | `child` | 3.0 |
| 20 | Adolescent Female Under 15 | `adolescent_female_under_15` | 4.0 |
| 30 | Adolescent Female Over 15 | `adolescent_female_over_15` | 5.0 |
| 40 | Adolescent Male Under 15 | `adolescent_male_under_15` | 5.0 |
| 50 | Adolescent Male Over 15 | `adolescent_male_over_15` | 6.0 |
| 60 | Adult Female | `adult_female` | 5.0 |
| 70 | Adult Male | `adult_male` | **6.0** (reference) |
| 80 | Senior Female | `senior_female` | 4.5 |
| 90 | Senior Male | `senior_male` | 5.0 |

Fixed UUIDs for each slug recommended so contract fixtures and portion-calc tests can share IDs if desired (optional; portion-calc package uses in-memory category objects).

---

## 6. Portion-calc test matrix (brief + formula edge cases)

Package: `packages/portion-calc` — pure TS, zero runtime deps, Vitest. Reference implementation of the canonical formula (D3); SQL mirror only in `weekly_protein_rollup` (Task 09) via coordinator contract test.

### 6.1 Types / API surface (from grok_07 — implement exactly)

- `PortionCategoryRef { id; slug; baseProteinOz; isActive }`
- `PortionRequirement { portionCategoryId; count; athleteCount }`
- `FamilySettings { athleteMultiplier }`
- `calculateEffectiveProteinOz(requirements, categories, settings): number`
- `calculatePerCategoryBreakdown(...): { portionCategoryId, slug, people, athleteCount, effectiveOz }[]`
- `hasDeactivatedCategories(requirements, categories): boolean`
- `roundOz(n)` → 1 decimal display only
- Errors: `UnknownPortionCategoryError`, `InvalidPortionRequirementError`, `InvalidFamilySettingsError` extending `PortionCalcError`

### 6.2 Minimum table-driven cases (brief)

| # | Case | Inputs (sketch) | Expected |
|---|------|-----------------|----------|
| T1 | **PRD worked example** | adult_male count=2 athlete=1, base=6.0, mult=1.5 | `(1 + 1×1.5)×6 = 15.0` |
| T2 | Zero requirement rows | `[]` | `0` |
| T3 | Zero counts | count=0 athlete=0 (if allowed through API) | `0` (DB won’t store such rows; function still pure) |
| T4 | All-athlete group | count=3 athlete=3, base=6, mult=1.5 | `3×1.5×6 = 27.0` |
| T5 | Multi-category sum | e.g. T1 + child count=2 athlete=0 base=3 → 15 + 6 = 21 | Sum of per-row |
| T6 | Boundary athleteCount === count | count=2 athlete=2 | `2 × mult × base` |
| T7 | athleteCount > count | count=1 athlete=2 | **throws** `InvalidPortionRequirementError` |
| T8 | Negative count / athlete | any | **throws** |
| T9 | NaN / Infinity in count, athlete, base, or mult | | **throws** (typed) |
| T10 | Unknown portionCategoryId | | **throws** `UnknownPortionCategoryError` |
| T11 | multiplier ≤ 0 | 0 or negative | **throws** `InvalidFamilySettingsError` |
| T12 | Deactivated category | `isActive: false`, still in map | Still calculates total; `hasDeactivatedCategories` → true |
| T13 | Active-only plan | all active | `hasDeactivatedCategories` → false |
| T14 | Multiplier change | same reqs, mult 1.5 then 2.0 | Different totals; no internal cache |
| T15 | Floating-point | base 5.3, mult 1.5, count=2 athlete=1 | `toBeCloseTo((1+1.5)×5.3 = 13.25)` |
| T16 | Breakdown alignment | multi-row | Sum of `effectiveOz` === `calculateEffectiveProteinOz` |
| T17 | roundOz | 15.04 → 15.0; 15.05 banker's vs half-up — **document choice** | Display only |

### 6.3 Additional edge cases (formula / product — recommend including)

| # | Case | Why |
|---|------|-----|
| E1 | athlete_count=0, count>0 | Pure base: `count × base` |
| E2 | Empty categories map + empty requirements | 0, not throw |
| E3 | Empty categories map + non-empty requirements | Unknown category throw |
| E4 | Duplicate portionCategoryId in requirements array | **Ambiguity** — throw vs sum; recommend **throw** InvalidPortionRequirementError (DB PK enforces uniqueness) |
| E5 | Requirements reference deactivated + active | Total includes both; hasDeactivated true |
| E6 | baseProteinOz = 0 | Allowed mathematically → 0 contribution; **or** throw if non-positive base? PRD silent — recommend allow 0, throw if base < 0 or non-finite |
| E7 | Very large counts (smallint max ~32767) | No overflow in JS number for oz totals at family scale; optional smoke |
| E8 | Multiplier fractional (1.25) | Exact algebra, `toBeCloseTo` |
| E9 | Breakdown `people` field | Equals `count` (brief: `people: count`) |
| E10 | Order independence | Shuffle requirement rows → same total |

### 6.4 Hand-computed contract fixtures (`fixtures/contract-fixtures.json`)

≥8 scenarios; `expectedEffectiveOz` to **4 decimal places** by hand:

| name | requirements | categories | settings | expectedEffectiveOz |
|------|--------------|------------|----------|---------------------|
| `worked_example_adult_male` | AM 2/1 | AM 6.0 active | 1.5 | `15.0000` |
| `zero_rows` | [] | any | 1.5 | `0.0000` |
| `all_athlete` | AM 3/3 | AM 6.0 | 1.5 | `27.0000` |
| `deactivated_category` | child 2/0 | child 3.0 **inactive** | 1.5 | `6.0000` |
| `floating_point_base` | X 2/1 | base 5.3 | 1.5 | `13.2500` |
| `mixed_two_categories` | AM 2/1 + AF 1/0 | 6.0 + 5.0 | 1.5 | `15+5=20.0000` |
| `non_athlete_only` | AM 2/0 | 6.0 | 1.5 | `12.0000` |
| `high_multiplier` | AM 1/1 | 6.0 | 2.0 | `12.0000` |
| *(optional 9th)* `zero_count_row` | AM 0/0 | 6.0 | 1.5 | `0.0000` |

Coordinator TS↔SQL contract test will import this file against `weekly_protein_rollup` — keep IDs/slugs stable.

### 6.5 What portion-calc does **not** own

- Servings-based shopping `scale_factor` (D14 — separate)
- Persistence / caching of totals
- RLS or household visibility
- Unit conversion

---

## 7. Ambiguities for `## NOTES` (schema + package implementers)

Flag these rather than resolving silently. **Conservative default** given where one is needed.

### 7.1 Identity & tenancy

| # | Ambiguity | Options | Conservative recommendation |
|---|-----------|---------|------------------------------|
| A1 | **`profile.id` vs `auth.users`** | (a) `id uuid PRIMARY KEY REFERENCES auth.users(id)`; (b) `id uuid PK` equal to auth uid without FK (local tests without auth schema); (c) separate `user_id` | **(a)** on Supabase: `profile.id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE` (or RESTRICT). Seed/harness must insert auth users first. |
| A2 | **`household.family_id` type** | uuid vs text vs unused null | **uuid** (or text constant) NOT NULL for the three households with one shared family UUID; no `family` table in v1 |
| A3 | **`profile.role` type** | free text vs CHECK (`admin`,`member`) vs enum | `text NOT NULL CHECK (role IN ('admin','member'))` |
| A4 | **`profile` timestamps** | PRD lists `created_at` only | Add `updated_at` for consistency with generic touch trigger; nullable-free DEFAULT now() |

### 7.2 Enums vs text

| # | Field | Options | Recommendation |
|---|-------|---------|----------------|
| A5 | **`meal_plan_assignment.meal_slot`** | Postgres ENUM; text CHECK; free text; lookup table (PRD §5 says meal slots are “lookup tables”) | **v1: `text NOT NULL`** with optional CHECK `IN ('breakfast','lunch','dinner','snack')` **or** unconstrained text for admin extensibility. Full `meal_slot` lookup table is **out of grok_06 list** — do not invent table unless NOTES escalate. Prefer CHECK list matching PRD examples. |
| A6 | **`chef_idea.status`** | enum vs text | `text` + CHECK `(idea, researching, tested, adopted, abandoned)` |
| A7 | **`recipe_combination_recipe.role_in_meal`** | enum vs text | `text` (`main`/`side`/`dessert`/…) |
| A8 | **`unit.dimension`** | locked by verbatim CHECK | Keep `('mass','volume','count')` only |

### 7.3 Column shape gaps (PRD lists alternatives)

| # | Ambiguity | Recommendation |
|---|-----------|----------------|
| A9 | Recipe `source_url` **or** `source_book` | Two nullable text columns: `source_url`, `source_book` |
| A10 | Recipe `instructions` “structured JSON or rich text” | `jsonb` nullable **or** `text`; prefer **`jsonb`** for structured steps, allow string later |
| A11 | RecipeCombination `served_date` **or** link to MealPlan | Nullable `served_date date` only in v1; no `meal_plan_id` unless product requires (avoids extra FK scope) |
| A12 | Ingredient `nutrition_data` “JSONB or normalized” | **`jsonb`** nullable in v1 |
| A13 | ChefIdea optional link to Recipe | Nullable `adopted_recipe_id uuid REFERENCES recipe(id)` — useful; if silent, omit and NOTES |
| A14 | Category `slug` uniqueness scope | `UNIQUE(slug)` global vs `UNIQUE(category_type, slug)` | Prefer **`UNIQUE(slug)`** for simpler seed |
| A15 | Tag `color` or `icon` | Both nullable text |
| A16 | `make_again_rating` | `smallint CHECK (BETWEEN 1 AND 5)` **nullable** |
| A17 | Times (`prep_time_minutes`, etc.) | `integer CHECK (>= 0)` nullable |
| A18 | `recipe_ingredient.quantity` | `numeric NOT NULL CHECK (quantity > 0)` |
| A19 | `meal_plan.start_date` / `end_date` | `date NOT NULL` + CHECK `end_date >= start_date` |
| A20 | `family_settings` single-row enforcement | App convention only vs table CHECK / partial unique constant | Seed one row; optional `CHECK (id IS NOT NULL)` only — no DB single-row lock unless desired (`bool PRIMARY KEY DEFAULT true` pattern) |

### 7.4 Soft-delete / ON DELETE

| # | Ambiguity | Recommendation |
|---|-----------|----------------|
| A21 | `meal_plan.deleted_at` | **Include** (Shape B) |
| A22 | `meal_plan_assignment.deleted_at` | **Omit** |
| A23 | FKs to soft-deletable content | Keep FKs; do not SET NULL on soft-delete (soft-delete is UPDATE) |
| A24 | `recipe_ingredient` ON DELETE ingredient | **RESTRICT** hard delete; soft-delete OK |
| A25 | `created_by_user_id` ON DELETE | **RESTRICT** or SET NULL? Prefer **RESTRICT** (profiles not deleted) |

### 7.5 Unit seed naming vs abbreviation

| # | Ambiguity | Recommendation |
|---|-----------|----------------|
| A26 | Verbatim comments use name `'gram'`, abbreviation `'g'`; brief lists `g`, `kg`, `oz` | Store **name** = full (`gram`, `kilogram`, `ounce`, …) and **abbreviation** = brief tokens (`g`, `kg`, `oz`). Seed upsert on `name`. |
| A27 | tsp / fl_oz factors not in Claude examples | Use US culinary: tsp **4.92892** ml, fl_oz **29.5735** ml; document in NOTES |
| A28 | clove / head as count base 1 | `factor_to_base = 1` each dimension count |

### 7.6 Portion-calc formula / API

| # | Ambiguity | Recommendation |
|---|-----------|----------------|
| A29 | Duplicate category ids in requirements array | **Throw** (align with DB PK) |
| A30 | `baseProteinOz <= 0` | Allow 0; throw if `< 0` or non-finite |
| A31 | `roundOz` rounding mode | `Math.round(n * 10) / 10` half-away-from-zero; document |
| A32 | Whether to filter `count === 0` rows before sum | Sum as 0 contribution; optional strip |
| A33 | Integer vs number for count | Accept `number`; reject non-integers? PRD smallint — recommend **reject non-integer** counts in validation |
| A34 | `athleteMultiplier` upper bound | None in PRD; only `> 0` and finite |

### 7.7 Process / migration boundaries

| # | Ambiguity | Recommendation |
|---|-----------|----------------|
| A35 | Generic `updated_at` trigger function | Allowed in 0001; one shared `set_updated_at()` + triggers on tables with `updated_at` |
| A36 | Tables without `updated_at` in PRD (`profile`, `tag`, `meal_plan_assignment`, junctions) | Add only where PRD lists them **or** all root entities for consistency — prefer **PRD fields + verbatim**; optional `updated_at` on profile only |
| A37 | Auth seed in `seed.sql` vs test harness | Document dual path; fixed profile UUIDs stable either way |
| A38 | Production exclusion of test personas | Guard with comment + optional `IF current_setting('app.seed_fixtures', true) = 'on'` or separate `seed_fixtures.sql` — brief says “guarded” |

---

## 8. Implementer quick checklist

### Task 06 (`drafts/grok_out_schema_migration.md`)

- [ ] `### FILE: supabase/migrations/0001_schema.sql` — 23 tables, constraints, indexes, extensions; **verbatim** three Claude DDL blocks + `uq_ingredient_name`
- [ ] No RLS/policies/security triggers/functions/audit
- [ ] No Category `level`/`path`; no FamilySettings `adult_reference_protein_oz`; no MealPlan `is_shared` / `visible_to_households` / `protein_portions` / `plan_date`
- [ ] `### FILE: supabase/seed.sql` — units, 9 portion categories, family_settings, category/tag taxonomy, 3 households, 4 profile personas (anon omitted), fixed UUIDs, `ON CONFLICT DO NOTHING`
- [ ] Leading `## NOTES` for every A1–A38 decision taken

### Task 07 (`drafts/grok_out_portion_calc.md`)

- [ ] package.json / tsconfig / src/index.ts / src/index.test.ts / fixtures/contract-fixtures.json
- [ ] Formula algebra exact; validation throws; deactivated categories still compute
- [ ] ≥ minimum brief tests + contract fixtures ≥8 with 4-dp hand values
- [ ] `## NOTES` for formula ambiguities (A29–A34)

---

## 9. Source anchors (absolute paths)

| Path |
|------|
| `C:\Users\dougr\.grok\worktrees\01gitprojects-menu-boss\subagent-019f644d-cccd-7f32-843f-f1687a1e1f51\grok_06_schema_migration_and_seed.md` |
| `C:\Users\dougr\.grok\worktrees\01gitprojects-menu-boss\subagent-019f644d-cccd-7f32-843f-f1687a1e1f51\grok_07_portion_calc_package.md` |
| `C:\Users\dougr\.grok\worktrees\01gitprojects-menu-boss\subagent-019f644d-cccd-7f32-843f-f1687a1e1f51\Recipe_Meal_Planning_Database_PRD_v0.4.md` |
| `C:\Users\dougr\.grok\worktrees\01gitprojects-menu-boss\subagent-019f644d-cccd-7f32-843f-f1687a1e1f51\drafts\claude_authored_sections.md` |
| `C:\Users\dougr\.grok\worktrees\01gitprojects-menu-boss\subagent-019f644d-cccd-7f32-843f-f1687a1e1f51\PHASE1_PLAN.md` |

---

*End of research findings for grok_06 / grok_07. No migration or package code authored.*
