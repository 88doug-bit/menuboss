# Brief for Grok — Task 07: `packages/portion-calc` — the canonical portion calculation package

**Context:** Decision D3 — the protein portion formula lives in exactly ONE pure TypeScript function, used by UI live preview, tRPC procedures, and offline reads. A SQL mirror exists only in `weekly_protein_rollup` (Task 09) and is pinned by a coordinator-owned contract test. Your implementation is therefore the reference implementation.

**Attachment required:** `Recipe_Meal_Planning_Database_PRD_v0.4.md` (§4.1 MealPlanPortionRequirement — canonical formula block).

**Output:** one markdown file, saved as `drafts/grok_out_portion_calc.md`, files as `### FILE:` headers + fenced blocks.

## Canonical formula (implement exactly)

```
effective_protein_oz(plan) =
  Σ over requirement rows r:
    ( (r.count − r.athlete_count) + r.athlete_count × athlete_multiplier )
    × base_protein_oz(r.portion_category)
```

## Files to produce

### FILE: packages/portion-calc/package.json
Name `@menu-boss/portion-calc`, type module, zero runtime dependencies, vitest devDependency, scripts: `test`, `typecheck`.

### FILE: packages/portion-calc/src/index.ts
- Types: `PortionCategoryRef { id: string; slug: string; baseProteinOz: number; isActive: boolean }`, `PortionRequirement { portionCategoryId: string; count: number; athleteCount: number }`, `FamilySettings { athleteMultiplier: number }`.
- `calculateEffectiveProteinOz(requirements, categories, settings): number` — pure, no I/O, no Date/random.
- `calculatePerCategoryBreakdown(...)`: same inputs → array of `{ portionCategoryId, slug, people: count, athleteCount, effectiveOz }` for the UI summary strip.
- **Input validation (throw typed errors, never silently coerce):** unknown `portionCategoryId` → `UnknownPortionCategoryError`; `athleteCount > count` or negative values or non-finite numbers → `InvalidPortionRequirementError`; `athleteMultiplier <= 0` → `InvalidFamilySettingsError`.
- Deactivated categories (`isActive: false`) still calculate (historical plans keep working — D11 edge case); expose `hasDeactivatedCategories(requirements, categories): boolean` so UIs can badge.
- Rounding: keep full precision internally; export `roundOz(n)` (1 decimal) for display only.

### FILE: packages/portion-calc/src/index.test.ts (Vitest)
Table-driven tests covering AT MINIMUM:
- Worked example from the PRD: adult_male (count 2, athlete 1) with base 6.0 and multiplier 1.5 → (1 + 1×1.5) × 6 = 15.0.
- Zero rows → 0; zero counts → 0; all-athlete group; mixed multi-category plan summing correctly.
- athleteCount === count boundary; athleteCount > count throws; negative/NaN/Infinity throw; unknown category throws; multiplier 0/negative throws.
- Deactivated category still calculates + `hasDeactivatedCategories` true.
- Multiplier change reflected (recompute, no caching inside the package).
- Floating-point: e.g. base 5.3, multiplier 1.5 — assert with `toBeCloseTo`.

### FILE: packages/portion-calc/tsconfig.json
Strict, ES2022, isolated modules.

### FILE: packages/portion-calc/fixtures/contract-fixtures.json
Shared fixtures for the coordinator's TS↔SQL contract test: an array of ≥8 scenarios, each `{ name, categories: [...], settings: {...}, requirements: [...], expectedEffectiveOz }` — include the worked example, a zero case, an all-athlete case, a deactivated-category case, and a floating-point case. Expected values computed by hand to 4 decimals.

## Constraints
- Zero runtime deps; no I/O; deterministic. Errors as exported classes extending a common `PortionCalcError`.
- camelCase in TS; the DB layer maps snake_case at its boundary (not your concern).
- Note any formula ambiguity you find in `## NOTES` rather than resolving silently.
