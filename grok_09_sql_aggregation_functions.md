# Brief for Grok — Task 09: `0003_functions.sql` — sanctioned SQL aggregation functions

**Context:** Decision D14 — shopping-list aggregation and the weekly protein roll-up are the ONLY sanctioned SQL implementations of business logic. The contracts are coordinator-authored in the DB PRD; your job is a faithful implementation. The coordinator personally reviews this file before merge.

**Attachment required:** `Recipe_Meal_Planning_Database_PRD_v0.4.md` — §6 contains the full `generate_shopping_list` contract (join shape, return columns, scaling rule, soft-delete rule) and §4.1 the canonical portion formula. Implement those contracts exactly; where this brief and the PRD differ, the PRD wins.

**Output:** one markdown file, saved as `drafts/grok_out_sql_functions.md`, files as `### FILE:` headers + fenced blocks.

## Files to produce

### FILE: supabase/migrations/0003_functions.sql

**Function 1 — `generate_shopping_list(p_meal_plan_ids uuid[])`**
- `LANGUAGE sql STABLE SECURITY INVOKER` — RLS on `meal_plan` filters visibility; invisible plan ids contribute zero rows, never an error.
- Single set-based query per the PRD contract: plans → assignments → recipe (soft-deleted INCLUDED) → recipe_ingredient → unit → ingredient → LEFT JOIN top-level category.
- `scale_factor = meal_plan_assignment.servings::numeric / NULLIF(recipe.yield_servings, 0)` — guard divide-by-zero; a NULL scale factor row should surface with `total_quantity_base` NULL rather than being dropped (flag in NOTES if you choose differently).
- Group by `(ingredient_id, unit.dimension, is_optional)`; return exactly the PRD's columns: `ingredient_id, ingredient_name, dimension, total_quantity_base, is_optional, category_name, source_recipe_ids (uuid[]), includes_deleted_recipe (bool)`.
- Top-level category = the root ancestor of the ingredient's primary category via a recursive CTE (parent_id model, D15).
- NO display-unit selection (backend formatting concern) and NO cross-dimension conversion (D12 — separate rows per dimension is the contract).

**Function 2 — `weekly_protein_rollup(p_start date, p_end date)`**
- `SECURITY INVOKER`; over RLS-visible `meal_plan` rows overlapping `[p_start, p_end]`.
- Per plan: the canonical formula — `Σ ((count − athlete_count) + athlete_count × fs.athlete_multiplier) × pc.base_protein_oz` from `meal_plan_portion_requirement` × `portion_category` × `family_settings`.
- Returns `(meal_plan_id, title, start_date, end_date, effective_protein_oz numeric)` plus a grand-total row or a companion function `weekly_protein_total(p_start, p_end) returns numeric` — your choice, state it in NOTES.
- This is the ONLY SQL copy of the portion formula (a contract test pins it to `@menu-boss/portion-calc` using `packages/portion-calc/fixtures/contract-fixtures.json` — keep numeric behavior exact: full precision, no rounding inside the function).

### FILE: supabase/tests/functions/aggregation.test.sql
pgTAP smoke tests (the coordinator's RLS matrix covers authorization; you cover arithmetic): fixture inserts (superuser), then assert — multi-recipe dedup sums correctly within a dimension; cross-dimension same ingredient yields two rows; optional ingredient isolated in its own group; soft-deleted recipe still contributes with `includes_deleted_recipe = true`; yield_servings 0 handled per your NULL rule; empty plan array → zero rows; roll-up matches a hand-computed value for a two-plan fixture.

## Constraints
- Functions must not bypass RLS (no SECURITY DEFINER, no service-role assumptions).
- Pure SQL preferred; PL/pgSQL only if genuinely needed (justify in NOTES).
- Deterministic ordering (`ORDER BY category_name NULLS LAST, ingredient_name, dimension`).
