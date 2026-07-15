# Review: Database PRD v0.4 Revision (Grok Task 01) — Final

**Reviewer:** Review agent (`review/grok-01-db-prd-v04`)  
**Date:** 2026-07-15  
**Brief:** `grok_01_database_prd_v0.4_revision.md`  
**Draft under review:** `C:\Users\dougr\01gitprojects\menu_boss\drafts\grok_out_database_prd_v0.4.md` (also copied to worktree `drafts/`)  
**Prior mode:** Pre-implementation risk report superseded by this final fidelity review  

---

## Verdict

**Approve with nits**

**Rationale:** The draft is a faithful revision of v0.3 to v0.4. It implements D1–D3, D5–D8, D12–D15, and D17 in prose; places all three coordinator placeholders exactly; removes resolved §8 items; preserves voice and structure; and keeps residual strings (`protein_portions`, `visible_to_households`, `adult_reference_protein_oz`, `plan_date`, `level`/`path`) only in changelog, INTEGRATION NOTES, or explicit “removed / not part of model” sentences. No blockers. Remaining items are polish-only and do not violate the brief.

**Integrator gate:** Replace the three `<!-- CLAUDE_SECTION:* -->` markers with `drafts/claude_authored_sections.md` content verbatim before final merge. No further Grok rewrite required for acceptance.

---

## Findings (numbered)

### 1. No blockers against the brief
- **Severity:** N/A (positive)
- **File:location:** Draft as a whole
- **Problem:** None that violate section-by-section instructions, placeholders, or Constraints.
- **Recommended fix:** Ship; run placeholder substitution only.

### 2. Vague “optional open-ended metadata” JSONB use (nit)
- **Severity:** Nit
- **File:location:** `grok_out_database_prd_v0.4.md` §5, ~line 233
- **Problem:** Bullet lists JSONB for `leftover_decay_path`, `food_safety_profile`, `other_global_defaults`, **and** “optional open-ended metadata.” The last phrase is slightly open-ended relative to the constraint “do not invent new features/fields,” though it does not introduce a named column or entity.
- **Recommended fix (optional):** Drop “optional open-ended metadata” or bind it to an existing field name only (`other_global_defaults`). Not required for approval.

### 3. §8 density conversion bullet is extra but aligned (nit)
- **Severity:** Nit
- **File:location:** §8 ~line 268
- **Problem:** Brief KEEP list did not name density conversion; D12 defers it. Adding it as an open item is helpful and consistent, not a feature invention.
- **Recommended fix (optional):** Keep as-is (recommended) or fold into the multi-macro / unit paragraph if the open-item list must stay minimal.

### 4. Assignment-date enforcement hint (nit / acceptable)
- **Severity:** Nit
- **File:location:** MealPlanAssignment ~line 159
- **Problem:** Brief: state the invariant only; enforcement in coordinator section. Draft states the invariant and correctly defers enforcement, while parenthetically naming “trigger and application validation.” That is mild foreshadowing of coordinator content, not a dual schema.
- **Recommended fix (optional):** Shorten to “Enforcement is specified with the coordinator-authored schemas.” Current wording is acceptable.

### 5. Residual-string audit (pass — for the record)
- **Severity:** N/A (pass)
- **File:location:** Residual occurrences of retired design terms
- **Problem:** None as current key fields. Occurrences are changelog / INTEGRATION NOTES / explicit negation (e.g. MealPlan line 153: “no stored `plan_date`… no stored `is_shared`… no `visible_to_households`”; Category line 121: “Materialized `level` / `path` … not part of the v1 model”).
- **Recommended fix:** None. Treat as PASS per verifier guidance.

---

## Checklist

| # | Criterion | Status |
|---|-----------|--------|
| C1 | Begins with `## INTEGRATION NOTES` (one line per change) | **Pass** |
| C2 | Full revised PRD follows notes | **Pass** |
| C3 | Output is complete Database PRD v0.4 | **Pass** |
| C4 | Version **0.4** | **Pass** |
| C5 | Date **July 15, 2026** | **Pass** |
| C6 | Status **"Revised per design review"** | **Pass** |
| C7 | Changes in v0.4 covers D5–D8, D12–D15, D17, D1, D2 | **Pass** |
| C8 | Critical Note retained; architecture decided; 2026-07 design review | **Pass** |
| C9 | §4.1 after MealPlan/MealPlanAssignment: exact `<!-- CLAUDE_SECTION: NEW_TABLE_SCHEMAS -->` | **Pass** (line 161) |
| C10 | No implementer DDL for MealPlanHousehold / MealPlanPortionRequirement / Unit | **Pass** (names/relationships only) |
| C11 | §6: exact `<!-- CLAUDE_SECTION: SHOPPING_LIST_VIEW -->` | **Pass** (line 254) |
| C12 | §7 body only `<!-- CLAUDE_SECTION: RLS_POLICIES -->` | **Pass** (line 258) |
| C13 | §3: tRPC inside Next.js (D2) | **Pass** |
| C14 | §3: RLS sole auth + user JWT; service role system-only (D1) | **Pass** |
| C15 | §3: portion calc shared TS package; DB functions shopping-list/roll-up (D3, D14) | **Pass** |
| C16 | Architecture-hedging removed except genuine opens | **Pass** |
| C17 | Household: `is_active` only removal path | **Pass** |
| C18 | Ingredient family-global (D7) | **Pass** |
| C19 | Ingredient: `created_by_user_id` + `is_user_added` | **Pass** |
| C20 | Recipe family-global; `created_by_user_id` | **Pass** |
| C21 | RecipeCombination family-global; `created_by_user_id` | **Pass** |
| C22 | ChefIdea family-global; **`created_by_user_id` added** | **Pass** |
| C23 | Category: no `level`/`path` as fields; parent_id + CTEs; ltree future | **Pass** |
| C24 | PortionCategory: `base_protein_oz` single source (D17) | **Pass** |
| C25 | PortionCategory: deactivate not delete when referenced | **Pass** |
| C26 | FamilySettings: no `adult_reference_protein_oz` | **Pass** |
| C27 | FamilySettings: `athlete_multiplier` (1.5) + `other_global_defaults` | **Pass** |
| C28 | Adult base via Adult Male PortionCategory | **Pass** |
| C29 | MealPlan: `start_date`/`end_date` only | **Pass** |
| C30 | No stored `visible_to_households` / `is_shared` | **Pass** |
| C31 | Shared-ness derived from MealPlanHousehold membership | **Pass** |
| C32 | No current `protein_portions` on MealPlan | **Pass** |
| C33 | `created_by_household_id`, `created_by_user_id` kept | **Pass** |
| C34 | Relationships: Assignment, MealPlanHousehold, MealPlanPortionRequirement | **Pass** |
| C35 | Assignment-date range invariant stated | **Pass** |
| C36 | No per-assignment protein_portions override | **Pass** |
| C37 | protein_portions example deleted | **Pass** |
| C38 | Old JSONB portion rationale deleted | **Pass** |
| C39 | 2–3 sentences: FK, athlete_count, SQL aggregation; JSONB for fluid unfiltered | **Pass** |
| C40 | leftover_decay_path example unchanged vs v0.3 | **Pass** |
| C41 | food_safety_profile example unchanged vs v0.3 | **Pass** |
| C42 | §5: portion profiles as rows | **Pass** |
| C43 | §5: recursive CTEs for categories | **Pass** |
| C44 | §5: Unit admin-editable lookup (dimension + factor_to_base) | **Pass** |
| C45 | §6: index-by-query-pattern with serving queries named | **Pass** |
| C46 | FTS via generated tsvector only (not triggers) | **Pass** |
| C47 | No blanket GIN on all JSONB | **Pass** |
| C48 | JSONB unindexed until needed | **Pass** |
| C49 | Soft-delete retained | **Pass** |
| C50 | Check constraints retained | **Pass** |
| C51 | Assignment-date invariant in §6 | **Pass** |
| C52 | SHOPPING_LIST_VIEW placeholder present | **Pass** |
| C53 | §7 placeholder only | **Pass** |
| C54 | §8: JSONB-vs-normalized portions removed as open | **Pass** |
| C55 | §8: visibility storage not open | **Pass** |
| C56 | §8: RLS pending architecture not open | **Pass** |
| C57 | §8: FTS implementation fork not open | **Pass** |
| C58 | §8: pantry/inventory kept | **Pass** |
| C59 | §8: AI integration kept | **Pass** |
| C60 | §8: multi-macro scaling kept | **Pass** |
| C61 | §8: food-safety lookup normalization kept | **Pass** |
| C62 | §8: performance validation kept | **Pass** |
| C63 | Voice / heading structure / formality preserved | **Pass** |
| C64 | No invented entities/fields beyond decisions | **Pass** (nit #2 is prose only) |
| C65 | No unsupported guessing (no TODO needed) | **Pass** |
| C66 | Residual search clean for current model fields | **Pass** |
| C67 | §1–§2 consistent with D5/D6/D7/D13 | **Pass** |

**Checklist summary:** 67/67 pass; 0 fail; 0 blockers. Nits #2–#4 optional polish only.

---

## Decision coverage (quick map)

| Decision | Result |
|----------|--------|
| D1 RLS sole auth / user JWT | Pass (§3, Critical Note; detail via §7 placeholder) |
| D2 tRPC in Next.js | Pass |
| D3 Shared TS portion calc | Pass |
| D4 Offline | Correctly out of DB body (out-of-scope offline sync) |
| D5 MealPlanPortionRequirement | Pass |
| D6 MealPlanHousehold; derived shared | Pass |
| D7 Family-global content + attribution | Pass (incl. ChefIdea + Ingredient) |
| D8 Date-ranged plan + assignment invariant | Pass |
| D9–D11 Testing | Correctly not authored here |
| D12 Unit conversion rules (prose + placeholder) | Pass |
| D13 Index-by-query; generated tsvector; no blanket JSONB GIN | Pass |
| D14 Shopping/roll-up placeholder | Pass |
| D15 parent_id + CTEs; drop level/path | Pass |
| D16 Performance budgets | Correctly not in DB PRD |
| D17 Remove adult_reference; base via PortionCategory | Pass |

---

## Top residual / prior-risk items (closed)

| Prior pre-review risk | Draft status |
|----------------------|--------------|
| Missing draft | Closed — draft present and complete |
| Placeholder invention of schemas/RLS | Closed — exact comments only |
| Residual protein_portions as current design | Closed — past-tense / negation only |
| Dual visibility (`is_shared` stored) | Closed — derived only |
| adult_reference_protein_oz retained | Closed — removed from FamilySettings |
| ChefIdea missing created_by_user_id | Closed — present |
| §8 reopening D5/D6/RLS | Closed — resolved items removed |
| Architecture still “not finalized” | Closed — Critical Note + §3 updated |

---

## Recommended integrator next steps

1. Accept Grok draft as Database PRD v0.4 body.  
2. Substitute placeholders from `claude_authored_sections.md` (NEW_TABLE_SCHEMAS, SHOPPING_LIST_VIEW, RLS_POLICIES).  
3. Optionally apply nits #2–#4 in a one-line polish pass (not blocking).  
4. Track Product PRD v0.1 separately — it still describes v0.3-era protein_portions / service-role paths; do not regress this DB PRD to match it.

---

*End of final review — `drafts/review_grok_01.md`*
