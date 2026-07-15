# Brief for Grok — Task 04: Rewrite Functional Requirements §8.1–§8.3, §8.7, §8.8 (Product PRD v0.2)

**You are revising sections you originally authored.** The 2026-07-14 design review found the acceptance criteria happy-path-only and several behaviors unspecified. Your task: produce replacement text for Product PRD **§8.1, §8.2, §8.3, §8.7, §8.8** (leave §8.4, §8.5, §8.6 untouched — do not include them).

**Attachment required:** `Product_PRD_v0.1.md`.

**Output:** a single markdown file the user saves as `drafts/grok_out_functional_reqs.md`. Begin with `## INTEGRATION NOTES`, then each replacement under delimiters `=== REPLACEMENT: §8.x ===`.

---

## Decisions you are implementing

- **D3** Portion calculation = one pure TypeScript function in a shared package; displayed totals are always derived (recomputed when FamilySettings/PortionCategory change — never stale stored numbers).
- **D5** Portion counts = `MealPlanPortionRequirement` rows (`portionCategoryId`, `count`, `athleteCount`); the boolean athlete flag is gone; `athleteCount ≤ count` is validated.
- **D6/D7** Sharing = household membership rows on MealPlans only; recipes/ingredients/ideas/combinations are family-global with creator attribution.
- **D8** Plans have `start_date`/`end_date`; assignments have `assignment_date` within the range.
- **D11** Explicit edge-case acceptance criteria (the core of this task — list below).
- **D12** Deterministic unit conversion: convert and sum only within a dimension (mass/volume/count) using `Unit.factor_to_base`; **cross-dimension pairs are listed as separate lines under the ingredient, never guessed**; density-based conversion is explicitly out of scope for v1 (Phase 3 candidate).
- **D14** Shopping-list aggregation is a single set-based SQL function; `is_optional` ingredients aggregate separately.

## Section instructions

### §8.1 Recipe & Ingredient Management
Keep existing content; adjust: recipes/ingredients are family-global (D7) with `created_by` attribution; add edge-case ACs:
- Soft-deleted recipes remain visible in historical AND active future plans (badged as deleted), hidden from browsing/search; un-deleting restores them.
- Deleting (soft) an ingredient still referenced by recipes is allowed but badges affected recipes; hard delete never available in UI.
- Duplicate ingredient names are prevented case-insensitively at creation with a merge suggestion.

### §8.2 Portion Scaling & Food Safety
Rewrite around D3/D5: family admins edit per-category base ounces on PortionCategory rows (the Adult Male row is the 6 oz reference) and the family-wide athlete multiplier in FamilySettings. Users enter `count` + `athleteCount` per category. Add edge-case ACs:
- `athleteCount > count` is rejected with a clear message.
- A plan where every count is zero shows 0 oz required and generates an empty (not erroring) shopping list.
- Deactivating a PortionCategory: existing plans still display and calculate with it; it is not offered for new/edited requirement rows.
- Changing FamilySettings or a category's base ounces mid-week immediately changes displayed totals on ALL plans (totals are derived, D3); an AC states no stored stale total is ever shown.
- Live preview updates in <100 ms as counts change (ties to the performance budgets).

### §8.3 Meal Planning & Calendar
Adjust to D6/D8: plans span `start_date`–`end_date`; assignments must fall inside the range (attempting otherwise is rejected with a clear error); sharing = selecting households (membership rows); "shared" badge is derived from membership count. Add ACs:
- Shrinking a plan's date range while assignments would fall outside is rejected until those assignments are moved/removed.
- Unsharing a household removes their visibility immediately (calendar updates in realtime); the creating household can never be removed.
- Members of a shared (non-creating) household can view but not edit in v1.

### §8.7 Shopping List Generation
Rewrite "handled intelligently" into the deterministic D12/D14 spec:
- Aggregation is one set-based query across the selected plans (respecting visibility automatically via RLS).
- Quantities scale by `assignment.servings / recipe.yield_servings`. State explicitly: the calculated protein requirement *informs the user's servings choice* (displayed in the editor); it does not silently rescale individual ingredient lines in v1.
- Same-dimension quantities convert via `factor_to_base` and sum; cross-dimension appear as separate lines under one ingredient heading with an AC example (flour: "500 g" and "2 cups" listed separately).
- `is_optional` ingredients aggregate into a separate "Optional" group (AC: an optional garnish never inflates the main quantity).
- Soft-deleted recipes in included plans still contribute (badged); ACs for empty plans (empty list, no error) and for multi-plan dedup across households.

### §8.8 Search, Filtering & Discovery
Adjust visibility language to D7: all family members search the whole family's recipes/ideas/combinations; only meal plans are visibility-filtered. Remove "results respect household visibility" for content; keep it for plan-derived surfaces. Keep the rest.

## Constraints
- Preserve the existing voice, structure (requirements bullets + "Acceptance Criteria (examples)" blocks), and level of detail.
- Every new edge case must appear as a concrete, testable acceptance criterion.
- Do not touch §8.4–§8.6; do not renumber; where uncertain, insert `<!-- TODO(coordinator): question -->`.
