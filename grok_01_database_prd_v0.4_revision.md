# Brief for Grok — Task 01: Revise Database PRD to v0.4

**You are revising a document you originally authored.** A structured design review of the MenuBoss PRDs was completed on 2026-07-14; sixteen decisions were made. Your task: produce the full revised **Database PRD v0.4**.

**Attachment required:** `Recipe_Meal_Planning_Database_PRD_v0.3.md` (the current document — revise it, do not rewrite from scratch).

**Output:** a single complete markdown document. The user will save it as `drafts/grok_out_database_prd_v0.4.md`. Begin the file with an `## INTEGRATION NOTES` block listing every change you made (one line each), then the full revised PRD.

---

## Decision register (global context — all 16 review decisions)

- **D1** RLS is the *sole* authorization authority; backend forwards the user's JWT; service role only for system jobs (migrations, audit).
- **D2** Backend = tRPC hosted inside the Next.js app; no NestJS; Supabase Edge Functions not used in v1.
- **D3** Protein portion calculation = one pure TypeScript function in a shared package; persisted totals are derived/cached, recomputed on settings change.
- **D4** v1 offline = read-only cache; offline writes/background sync deferred to Phase 2.
- **D5** `protein_portions` JSONB replaced by `MealPlanPortionRequirement` table (`count`, `athlete_count` per portion category).
- **D6** `visible_to_households` JSONB replaced by `MealPlanHousehold` junction table; `is_shared` becomes derived, not stored.
- **D7** Content entities (Recipe, Ingredient, ChefIdea, RecipeCombination) are family-global with `created_by_user_id` attribution; private/shared visibility applies *only* to MealPlans.
- **D8** MealPlan = date-ranged container (`start_date`/`end_date`); assignments carry `assignment_date` constrained to the plan range.
- **D9–D11** Testing decisions (handled in other briefs; D10's RLS matrix is referenced by §7, which you will NOT write — see placeholders).
- **D12** Deterministic unit conversion: `Unit` table with `dimension` + `factor_to_base`; sum only within a dimension; cross-dimension pairs listed separately, never guessed; density conversion deferred.
- **D13** Indexes by query pattern only: B-tree/FK indexes on junctions and date columns; full-text search via **generated tsvector columns** (drop the trigger alternative); NO blanket "GIN on all JSONB"; JSONB columns unindexed until a query needs one; every index documented with the query it serves.
- **D14** Shopping-list aggregation and weekly protein roll-up = one set-based SQL function (defined by the coordinator — placeholder below).
- **D15** Category hierarchy = `parent_id` + recursive CTEs only; drop `level` and `path`; note ltree as a future optimization.
- **D16** Performance budgets (Product PRD concern; not yours).
- **D17 (consequence of D5)** `FamilySettings.adult_reference_protein_oz` is **removed** — it duplicated the Adult Male PortionCategory row's `base_protein_oz`, which is now the single source of per-category base ounces. FamilySettings retains `athlete_multiplier` and `other_global_defaults` (JSONB).

## Placeholders — do NOT write these sections yourself

The coordinator authored the security- and integrity-critical text separately. Insert these literal HTML comments at the indicated positions and write **nothing else** there:

1. In §4.1, where the detailed definitions of `MealPlanHousehold`, `MealPlanPortionRequirement`, and `Unit` belong (after the MealPlan/MealPlanAssignment entries):
   `<!-- CLAUDE_SECTION: NEW_TABLE_SCHEMAS -->`
   (You may still *mention* these tables by name in relationship notes of other entities.)
2. In §6, where the shopping-list/roll-up function belongs:
   `<!-- CLAUDE_SECTION: SHOPPING_LIST_VIEW -->`
3. §7 (Security and Access Control): replace the ENTIRE section body with:
   `<!-- CLAUDE_SECTION: RLS_POLICIES -->`

## Section-by-section instructions

- **Header:** Version 0.4, date July 15 2026, status "Revised per design review". Add a "Changes in v0.4" changelog entry summarizing D5–D8, D12–D15, D17 and the architecture now being decided (D1, D2).
- **§3 Assumptions:** The architecture is now decided — replace "has not yet been finalized" hedging with: tRPC inside Next.js (D2), RLS as sole authorization authority with user-JWT clients (D1), portion calc in a shared TS package with DB functions limited to shopping-list/roll-up aggregation (D3, D14). Keep "revisions expected" language only for genuinely open items (pantry, AI, multi-macro).
- **§4.1 Household:** unchanged except note `is_active` deactivation is the only removal path (no hard delete).
- **§4.1 Ingredient / Recipe / RecipeCombination / ChefIdea:** add family-global visibility note (D7). Ensure `created_by_user_id` present on Recipe, RecipeCombination, **and ChefIdea** (it is currently missing on ChefIdea). Ingredient keeps `is_user_added`; add `created_by_user_id` there too for attribution symmetry.
- **§4.1 Category:** remove `level` and `path`; hierarchy = `parent_id` + recursive CTEs; one sentence noting ltree as a future optimization if the taxonomy grows very large (D15).
- **§4.1 PortionCategory:** unchanged structurally; note that `base_protein_oz` is now the single source of base ounces (D17) and that rows are deactivated (`is_active = false`), never deleted, once referenced by plans.
- **§4.1 FamilySettings:** remove `adult_reference_protein_oz` (D17); keep `athlete_multiplier` (default 1.5) and `other_global_defaults` JSONB; note the adult base is edited via the Adult Male PortionCategory row.
- **§4.1 MealPlan:** `start_date`/`end_date` (remove the `plan_date` alternative, D8); remove `visible_to_households` and `is_shared` as stored fields (D6 — shared-ness is derived from `MealPlanHousehold` membership count); remove the `protein_portions` JSONB reference (D5); keep `created_by_household_id`, `created_by_user_id`. Relationships: has many MealPlanAssignment, MealPlanHousehold, MealPlanPortionRequirement.
- **§4.1 MealPlanAssignment:** `assignment_date` must fall within the parent plan's range (enforcement detail is in the coordinator's section — just state the invariant); remove the "may optionally override plan-level protein_portions" sentence (D5 removes that mechanism; per-assignment overrides are out of scope v1).
- **§4.2 JSONB structures:** DELETE the `protein_portions` example and its rationale block entirely; replace with 2–3 sentences explaining the normalization decision (D5): FK integrity to PortionCategory, `athlete_count` expressing mixed groups, trivial SQL aggregation — and noting JSONB remains where data is fluid and never filtered on. KEEP `leftover_decay_path` and `food_safety_profile` examples unchanged.
- **§5 Extensibility:** update — new portion profiles are *rows* (PortionCategory + MealPlanPortionRequirement), no JSONB keys and no schema changes; category depth via recursive CTEs; `Unit` is now an explicit admin-editable lookup (D12).
- **§6 Integrity/Indexing:** rewrite per D13 (index-by-query-pattern with each index's serving query named; generated tsvector columns for FTS — remove the trigger option; keep soft-delete pattern and check constraints; add the assignment-date invariant mention). Insert the SHOPPING_LIST_VIEW placeholder where DB functions are discussed.
- **§7:** placeholder only (see above).
- **§8 Open items:** REMOVE resolved items (JSONB-vs-normalized portions; visibility storage; RLS pending architecture; full-text details). KEEP genuinely open: pantry/inventory, AI integration strategy, multi-macro scaling, food-safety lookup normalization, performance validation at real volumes.

## Constraints

- Preserve the existing document voice, heading structure, and level of formality.
- Do not invent new features, entities, or fields beyond what the decisions require.
- Do not remove the `Critical Note to Reader` block, but update it: the system architecture is now decided; the note should say the document reflects the 2026-07 design review.
- Where you are uncertain, insert `<!-- TODO(coordinator): question -->` rather than guessing.
