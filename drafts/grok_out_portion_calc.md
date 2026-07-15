## NOTES

- Formula implemented exactly as PRD §4.1: `((count − athleteCount) + athleteCount × athleteMultiplier) × baseProteinOz`, summed over requirement rows. No silent coercion; typed errors only.
- Non-finite `athleteMultiplier` (NaN/±Infinity) is rejected as `InvalidFamilySettingsError` in addition to the brief’s `≤ 0` rule — keeps “never silently coerce” consistent with requirement validation. Multiplier must be finite and `> 0`.
- `baseProteinOz` is not validated inside the package (callers/DB own PortionCategory integrity). Non-finite or negative base would propagate into the sum; coordinator may want a Zod layer at the API boundary.
- Duplicate category ids in the lookup array: last write wins in the internal `Map` (same as typical id-keyed maps). Duplicate requirement rows for the same category id both contribute (callers should de-dupe if the DB PK invariant is not already applied).
- `count = 0` rows are accepted and yield 0; DB layer is expected not to persist them (PRD semantics). Pure function remains total over any valid array.
- Integer-vs-float counts: DB uses `smallint`; package accepts any finite number ≥ 0 so tests and previews can pass JS numbers without casting. Fractional people are not rejected (not specified as invalid).
- `roundOz` uses `Math.round((n + Number.EPSILON) * 10) / 10` for 1-decimal display only; calculation paths never call it.
- Package materializes under `packages/portion-calc/` with zero runtime deps. DevDeps: vitest, typescript, @types/node (test fixture loader only).
- Vitest: 39 tests passed; `tsc --noEmit` clean.

### FILE: packages/portion-calc/package.json
```json
{
  "name": "@menu-boss/portion-calc",
  "version": "0.1.0",
  "description": "Canonical pure TypeScript protein portion calculation for MenuBoss (decision D3).",
  "type": "module",
  "main": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "files": [
    "src",
    "fixtures"
  ],
  "keywords": [
    "menu-boss",
    "portion",
    "protein"
  ],
  "license": "UNLICENSED",
  "private": true,
  "dependencies": {},
  "devDependencies": {
    "@types/node": "^22.10.7",
    "typescript": "^5.7.3",
    "vitest": "^3.0.5"
  },
  "engines": {
    "node": ">=20"
  }
}
```

### FILE: packages/portion-calc/src/index.ts
```typescript
/**
 * @menu-boss/portion-calc
 *
 * Canonical pure TypeScript implementation of the MealPlanPortionRequirement
 * protein formula (Database PRD v0.4 Â§4.1 / decision D3).
 *
 * effective_protein_oz(plan) =
 *   Î£ over requirement rows r:
 *     ( (r.count âˆ’ r.athlete_count)
 *       + r.athlete_count Ã— family_settings.athlete_multiplier )
 *     Ã— portion_category.base_protein_oz
 *
 * Zero runtime deps. No I/O. Deterministic. Full precision internally;
 * use `roundOz` only for display.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Lookup row for a portion category (camelCase; DB maps snake_case at boundary). */
export interface PortionCategoryRef {
  id: string;
  slug: string;
  baseProteinOz: number;
  isActive: boolean;
}

/** One MealPlanPortionRequirement row (plan association is external). */
export interface PortionRequirement {
  portionCategoryId: string;
  /** Total people in this category eating from the plan. */
  count: number;
  /** How many of `count` receive the athlete multiplier. Must be â‰¤ count. */
  athleteCount: number;
}

/** Family-wide settings needed for portion math. */
export interface FamilySettings {
  /** Family-wide athlete multiplier; must be > 0. */
  athleteMultiplier: number;
}

/** Per-category line used by the UI summary strip. */
export interface CategoryBreakdownLine {
  portionCategoryId: string;
  slug: string;
  /** Same as requirement `count` (total people in category). */
  people: number;
  athleteCount: number;
  /** Full-precision effective ounces for this row (not rounded). */
  effectiveOz: number;
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/** Base error for all portion-calc validation / domain failures. */
export class PortionCalcError extends Error {
  override readonly name: string = "PortionCalcError";

  constructor(message: string) {
    super(message);
    // Maintain prototype chain under ES5 targets / older runtimes.
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** Thrown when a requirement references a category id not present in the lookup. */
export class UnknownPortionCategoryError extends PortionCalcError {
  override readonly name = "UnknownPortionCategoryError";
  readonly portionCategoryId: string;

  constructor(portionCategoryId: string) {
    super(`Unknown portion category id: ${portionCategoryId}`);
    Object.setPrototypeOf(this, new.target.prototype);
    this.portionCategoryId = portionCategoryId;
  }
}

/** Thrown when a requirement has invalid counts (negative, non-finite, athlete > count). */
export class InvalidPortionRequirementError extends PortionCalcError {
  override readonly name = "InvalidPortionRequirementError";

  constructor(message: string) {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** Thrown when FamilySettings values are invalid (e.g. athleteMultiplier â‰¤ 0). */
export class InvalidFamilySettingsError extends PortionCalcError {
  override readonly name = "InvalidFamilySettingsError";

  constructor(message: string) {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

function isFiniteNumber(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n);
}

function assertFamilySettings(settings: FamilySettings): void {
  if (!isFiniteNumber(settings.athleteMultiplier) || settings.athleteMultiplier <= 0) {
    throw new InvalidFamilySettingsError(
      `athleteMultiplier must be a finite number > 0; got ${String(settings.athleteMultiplier)}`,
    );
  }
}

function assertRequirement(req: PortionRequirement, index: number): void {
  const label = `requirements[${index}]`;

  if (!isFiniteNumber(req.count) || req.count < 0) {
    throw new InvalidPortionRequirementError(
      `${label}.count must be a finite number â‰¥ 0; got ${String(req.count)}`,
    );
  }
  if (!isFiniteNumber(req.athleteCount) || req.athleteCount < 0) {
    throw new InvalidPortionRequirementError(
      `${label}.athleteCount must be a finite number â‰¥ 0; got ${String(req.athleteCount)}`,
    );
  }
  // Use > only (athleteCount === count is a valid all-athlete boundary).
  if (req.athleteCount > req.count) {
    throw new InvalidPortionRequirementError(
      `${label}: athleteCount (${req.athleteCount}) must be â‰¤ count (${req.count})`,
    );
  }
}

function indexCategories(
  categories: readonly PortionCategoryRef[],
): Map<string, PortionCategoryRef> {
  const map = new Map<string, PortionCategoryRef>();
  for (const cat of categories) {
    map.set(cat.id, cat);
  }
  return map;
}

/**
 * Weighted headcount for one requirement row:
 *   nonAthletes + athletes Ã— multiplier
 * = (count âˆ’ athleteCount) + athleteCount Ã— athleteMultiplier
 */
function weightedPeople(
  count: number,
  athleteCount: number,
  athleteMultiplier: number,
): number {
  return count - athleteCount + athleteCount * athleteMultiplier;
}

function effectiveOzForRow(
  req: PortionRequirement,
  category: PortionCategoryRef,
  athleteMultiplier: number,
): number {
  return (
    weightedPeople(req.count, req.athleteCount, athleteMultiplier) *
    category.baseProteinOz
  );
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Sum effective protein ounces over all requirement rows.
 * Pure: no I/O, no Date, no randomness. Full floating-point precision.
 *
 * Deactivated categories (`isActive: false`) still contribute (historical plans).
 */
export function calculateEffectiveProteinOz(
  requirements: readonly PortionRequirement[],
  categories: readonly PortionCategoryRef[],
  settings: FamilySettings,
): number {
  assertFamilySettings(settings);
  const byId = indexCategories(categories);

  let total = 0;
  for (let i = 0; i < requirements.length; i++) {
    const req = requirements[i]!;
    assertRequirement(req, i);

    const category = byId.get(req.portionCategoryId);
    if (!category) {
      throw new UnknownPortionCategoryError(req.portionCategoryId);
    }

    total += effectiveOzForRow(req, category, settings.athleteMultiplier);
  }
  return total;
}

/**
 * Per-category breakdown for UI summary strips.
 * Same validation and formula as `calculateEffectiveProteinOz`.
 * Order matches the `requirements` input order.
 */
export function calculatePerCategoryBreakdown(
  requirements: readonly PortionRequirement[],
  categories: readonly PortionCategoryRef[],
  settings: FamilySettings,
): CategoryBreakdownLine[] {
  assertFamilySettings(settings);
  const byId = indexCategories(categories);

  const lines: CategoryBreakdownLine[] = [];
  for (let i = 0; i < requirements.length; i++) {
    const req = requirements[i]!;
    assertRequirement(req, i);

    const category = byId.get(req.portionCategoryId);
    if (!category) {
      throw new UnknownPortionCategoryError(req.portionCategoryId);
    }

    lines.push({
      portionCategoryId: req.portionCategoryId,
      slug: category.slug,
      people: req.count,
      athleteCount: req.athleteCount,
      effectiveOz: effectiveOzForRow(req, category, settings.athleteMultiplier),
    });
  }
  return lines;
}

/**
 * True if any requirement references a category with `isActive: false`.
 * Unknown ids throw (same as calculation) so callers can surface data issues.
 */
export function hasDeactivatedCategories(
  requirements: readonly PortionRequirement[],
  categories: readonly PortionCategoryRef[],
): boolean {
  const byId = indexCategories(categories);
  for (const req of requirements) {
    const category = byId.get(req.portionCategoryId);
    if (!category) {
      throw new UnknownPortionCategoryError(req.portionCategoryId);
    }
    if (!category.isActive) {
      return true;
    }
  }
  return false;
}

/**
 * Round ounces to 1 decimal place for display only.
 * Calculation paths must keep full precision; do not feed this back into math.
 */
export function roundOz(n: number): number {
  if (!Number.isFinite(n)) {
    return n;
  }
  // Avoid binary FP artifacts of n * 10 / 10 for common display values.
  return Math.round((n + Number.EPSILON) * 10) / 10;
}
```

### FILE: packages/portion-calc/src/index.test.ts
```typescript
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  calculateEffectiveProteinOz,
  calculatePerCategoryBreakdown,
  hasDeactivatedCategories,
  InvalidFamilySettingsError,
  InvalidPortionRequirementError,
  PortionCalcError,
  roundOz,
  UnknownPortionCategoryError,
  type FamilySettings,
  type PortionCategoryRef,
  type PortionRequirement,
} from "./index.js";

// ---------------------------------------------------------------------------
// Helpers / fixtures
// ---------------------------------------------------------------------------

const adultMale: PortionCategoryRef = {
  id: "cat-adult-male",
  slug: "adult_male",
  baseProteinOz: 6.0,
  isActive: true,
};

const adultFemale: PortionCategoryRef = {
  id: "cat-adult-female",
  slug: "adult_female",
  baseProteinOz: 5.0,
  isActive: true,
};

const child: PortionCategoryRef = {
  id: "cat-child",
  slug: "child",
  baseProteinOz: 3.0,
  isActive: true,
};

const defaultSettings: FamilySettings = { athleteMultiplier: 1.5 };

const __dirname = dirname(fileURLToPath(import.meta.url));

interface ContractFixture {
  name: string;
  categories: PortionCategoryRef[];
  settings: FamilySettings;
  requirements: PortionRequirement[];
  expectedEffectiveOz: number;
}

function loadContractFixtures(): ContractFixture[] {
  const path = join(__dirname, "..", "fixtures", "contract-fixtures.json");
  return JSON.parse(readFileSync(path, "utf8")) as ContractFixture[];
}

// ---------------------------------------------------------------------------
// Table-driven happy-path calculations
// ---------------------------------------------------------------------------

describe("calculateEffectiveProteinOz", () => {
  const cases: Array<{
    name: string;
    requirements: PortionRequirement[];
    categories: PortionCategoryRef[];
    settings: FamilySettings;
    expected: number;
  }> = [
    {
      name: "PRD worked example: adult_male count=2 athlete=1 base=6 mult=1.5 â†’ 15.0",
      requirements: [
        { portionCategoryId: "cat-adult-male", count: 2, athleteCount: 1 },
      ],
      categories: [adultMale],
      settings: defaultSettings,
      expected: 15.0,
    },
    {
      name: "zero rows â†’ 0",
      requirements: [],
      categories: [adultMale],
      settings: defaultSettings,
      expected: 0,
    },
    {
      name: "zero counts â†’ 0",
      requirements: [
        { portionCategoryId: "cat-adult-male", count: 0, athleteCount: 0 },
      ],
      categories: [adultMale],
      settings: defaultSettings,
      expected: 0,
    },
    {
      name: "all-athlete group: count=3 athlete=3 â†’ 27.0",
      requirements: [
        { portionCategoryId: "cat-adult-male", count: 3, athleteCount: 3 },
      ],
      categories: [adultMale],
      settings: defaultSettings,
      expected: 27.0,
    },
    {
      name: "athleteCount === count boundary: count=2 athlete=2 base=4 mult=2 â†’ 16",
      requirements: [
        { portionCategoryId: "cat-adult-male", count: 2, athleteCount: 2 },
      ],
      categories: [{ ...adultMale, baseProteinOz: 4.0 }],
      settings: { athleteMultiplier: 2.0 },
      expected: 16.0,
    },
    {
      name: "mixed multi-category plan sums correctly â†’ 28.0",
      requirements: [
        { portionCategoryId: "cat-adult-male", count: 2, athleteCount: 1 },
        { portionCategoryId: "cat-adult-female", count: 2, athleteCount: 0 },
        { portionCategoryId: "cat-child", count: 1, athleteCount: 0 },
      ],
      categories: [adultMale, adultFemale, child],
      settings: defaultSettings,
      expected: 28.0,
    },
    {
      name: "no athletes: multiplier unused â†’ 24.0",
      requirements: [
        { portionCategoryId: "cat-adult-male", count: 4, athleteCount: 0 },
      ],
      categories: [adultMale],
      settings: defaultSettings,
      expected: 24.0,
    },
    {
      name: "deactivated category still calculates â†’ 15.0",
      requirements: [
        { portionCategoryId: "cat-adult-male", count: 2, athleteCount: 1 },
      ],
      categories: [{ ...adultMale, isActive: false }],
      settings: defaultSettings,
      expected: 15.0,
    },
  ];

  it.each(cases)("$name", ({ requirements, categories, settings, expected }) => {
    const result = calculateEffectiveProteinOz(requirements, categories, settings);
    expect(result).toBe(expected);
  });

  it("floating-point: base 5.3 mult 1.5 count 2 athlete 1 â†’ 13.25 (toBeCloseTo)", () => {
    const result = calculateEffectiveProteinOz(
      [{ portionCategoryId: "cat-custom", count: 2, athleteCount: 1 }],
      [
        {
          id: "cat-custom",
          slug: "custom",
          baseProteinOz: 5.3,
          isActive: true,
        },
      ],
      { athleteMultiplier: 1.5 },
    );
    // 2.5 * 5.3 = 13.25 â€” use toBeCloseTo for binary FP
    expect(result).toBeCloseTo(13.25, 10);
  });

  it("multiplier change is reflected on recompute (no caching)", () => {
    const requirements: PortionRequirement[] = [
      { portionCategoryId: "cat-adult-male", count: 2, athleteCount: 1 },
    ];
    const categories = [adultMale];

    const at1_5 = calculateEffectiveProteinOz(requirements, categories, {
      athleteMultiplier: 1.5,
    });
    const at2_0 = calculateEffectiveProteinOz(requirements, categories, {
      athleteMultiplier: 2.0,
    });

    expect(at1_5).toBe(15.0); // (1 + 1.5) * 6
    expect(at2_0).toBe(18.0); // (1 + 2.0) * 6
    expect(at2_0).not.toBe(at1_5);
  });
});

// ---------------------------------------------------------------------------
// Validation / typed errors
// ---------------------------------------------------------------------------

describe("input validation", () => {
  const categories = [adultMale];
  const settings = defaultSettings;

  it("throws UnknownPortionCategoryError for unknown portionCategoryId", () => {
    expect(() =>
      calculateEffectiveProteinOz(
        [{ portionCategoryId: "does-not-exist", count: 1, athleteCount: 0 }],
        categories,
        settings,
      ),
    ).toThrow(UnknownPortionCategoryError);

    try {
      calculateEffectiveProteinOz(
        [{ portionCategoryId: "does-not-exist", count: 1, athleteCount: 0 }],
        categories,
        settings,
      );
    } catch (e) {
      expect(e).toBeInstanceOf(PortionCalcError);
      expect(e).toBeInstanceOf(UnknownPortionCategoryError);
      expect((e as UnknownPortionCategoryError).portionCategoryId).toBe(
        "does-not-exist",
      );
    }
  });

  it("throws InvalidPortionRequirementError when athleteCount > count", () => {
    expect(() =>
      calculateEffectiveProteinOz(
        [{ portionCategoryId: "cat-adult-male", count: 1, athleteCount: 2 }],
        categories,
        settings,
      ),
    ).toThrow(InvalidPortionRequirementError);
  });

  it.each([
    {
      name: "negative count",
      req: { portionCategoryId: "cat-adult-male", count: -1, athleteCount: 0 },
    },
    {
      name: "negative athleteCount",
      req: { portionCategoryId: "cat-adult-male", count: 2, athleteCount: -1 },
    },
    {
      name: "NaN count",
      req: { portionCategoryId: "cat-adult-male", count: Number.NaN, athleteCount: 0 },
    },
    {
      name: "Infinity athleteCount",
      req: {
        portionCategoryId: "cat-adult-male",
        count: 2,
        athleteCount: Number.POSITIVE_INFINITY,
      },
    },
    {
      name: "-Infinity count",
      req: {
        portionCategoryId: "cat-adult-male",
        count: Number.NEGATIVE_INFINITY,
        athleteCount: 0,
      },
    },
  ])("throws InvalidPortionRequirementError for $name", ({ req }) => {
    expect(() =>
      calculateEffectiveProteinOz([req], categories, settings),
    ).toThrow(InvalidPortionRequirementError);
  });

  it.each([
    { name: "multiplier 0", athleteMultiplier: 0 },
    { name: "multiplier negative", athleteMultiplier: -1.5 },
    { name: "multiplier NaN", athleteMultiplier: Number.NaN },
    { name: "multiplier Infinity", athleteMultiplier: Number.POSITIVE_INFINITY },
  ])("throws InvalidFamilySettingsError for $name", ({ athleteMultiplier }) => {
    expect(() =>
      calculateEffectiveProteinOz(
        [{ portionCategoryId: "cat-adult-male", count: 1, athleteCount: 0 }],
        categories,
        { athleteMultiplier },
      ),
    ).toThrow(InvalidFamilySettingsError);
  });
});

// ---------------------------------------------------------------------------
// Breakdown + deactivated helper + roundOz
// ---------------------------------------------------------------------------

describe("calculatePerCategoryBreakdown", () => {
  it("returns one line per requirement with full-precision effectiveOz", () => {
    const lines = calculatePerCategoryBreakdown(
      [
        { portionCategoryId: "cat-adult-male", count: 2, athleteCount: 1 },
        { portionCategoryId: "cat-child", count: 1, athleteCount: 0 },
      ],
      [adultMale, child],
      defaultSettings,
    );

    expect(lines).toHaveLength(2);
    expect(lines[0]).toEqual({
      portionCategoryId: "cat-adult-male",
      slug: "adult_male",
      people: 2,
      athleteCount: 1,
      effectiveOz: 15.0,
    });
    expect(lines[1]).toEqual({
      portionCategoryId: "cat-child",
      slug: "child",
      people: 1,
      athleteCount: 0,
      effectiveOz: 3.0,
    });

    const sum = lines.reduce((acc, l) => acc + l.effectiveOz, 0);
    expect(sum).toBe(
      calculateEffectiveProteinOz(
        [
          { portionCategoryId: "cat-adult-male", count: 2, athleteCount: 1 },
          { portionCategoryId: "cat-child", count: 1, athleteCount: 0 },
        ],
        [adultMale, child],
        defaultSettings,
      ),
    );
  });

  it("throws the same typed errors as the aggregate function", () => {
    expect(() =>
      calculatePerCategoryBreakdown(
        [{ portionCategoryId: "missing", count: 1, athleteCount: 0 }],
        [adultMale],
        defaultSettings,
      ),
    ).toThrow(UnknownPortionCategoryError);
  });
});

describe("hasDeactivatedCategories", () => {
  it("returns false when all referenced categories are active", () => {
    expect(
      hasDeactivatedCategories(
        [{ portionCategoryId: "cat-adult-male", count: 1, athleteCount: 0 }],
        [adultMale],
      ),
    ).toBe(false);
  });

  it("returns true when any referenced category is deactivated", () => {
    expect(
      hasDeactivatedCategories(
        [{ portionCategoryId: "cat-adult-male", count: 2, athleteCount: 1 }],
        [{ ...adultMale, isActive: false }],
      ),
    ).toBe(true);
  });

  it("throws UnknownPortionCategoryError for unknown ids", () => {
    expect(() =>
      hasDeactivatedCategories(
        [{ portionCategoryId: "ghost", count: 1, athleteCount: 0 }],
        [adultMale],
      ),
    ).toThrow(UnknownPortionCategoryError);
  });
});

describe("roundOz", () => {
  it("rounds to 1 decimal for display", () => {
    expect(roundOz(15)).toBe(15.0);
    expect(roundOz(13.25)).toBe(13.3);
    expect(roundOz(13.24)).toBe(13.2);
    expect(roundOz(0)).toBe(0);
  });

  it("does not alter calculation results when only used for display", () => {
    const raw = calculateEffectiveProteinOz(
      [{ portionCategoryId: "cat-custom", count: 2, athleteCount: 1 }],
      [
        {
          id: "cat-custom",
          slug: "custom",
          baseProteinOz: 5.3,
          isActive: true,
        },
      ],
      { athleteMultiplier: 1.5 },
    );
    expect(raw).toBeCloseTo(13.25, 10);
    expect(roundOz(raw)).toBe(13.3);
  });
});

// ---------------------------------------------------------------------------
// Contract fixtures (shared with SQL roll-up coordinator test)
// ---------------------------------------------------------------------------

describe("contract-fixtures.json", () => {
  const fixtures = loadContractFixtures();

  it("includes at least 8 scenarios", () => {
    expect(fixtures.length).toBeGreaterThanOrEqual(8);
  });

  it.each(fixtures.map((f) => [f.name, f] as const))(
    "scenario %s matches hand-computed expectedEffectiveOz",
    (_name, fixture) => {
      const actual = calculateEffectiveProteinOz(
        fixture.requirements,
        fixture.categories,
        fixture.settings,
      );
      // Compare to 4 decimal places (fixture contract precision).
      expect(actual).toBeCloseTo(fixture.expectedEffectiveOz, 4);
    },
  );
});
```

### FILE: packages/portion-calc/tsconfig.json
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "bundler",
    "lib": ["ES2022"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "exactOptionalPropertyTypes": true,
    "isolatedModules": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "rootDir": "src",
    "outDir": "dist",
    "noEmit": true,
    "types": ["node", "vitest/globals"]
  },
  "include": ["src/**/*.ts"],
  "exclude": ["node_modules", "dist"]
}
```

### FILE: packages/portion-calc/fixtures/contract-fixtures.json
```json
[
  {
    "name": "prd_worked_example_adult_male",
    "description": "PRD worked example: adult_male count=2 athlete=1 base=6.0 mult=1.5 â†’ ((2-1)+1Ã—1.5)Ã—6 = 15",
    "categories": [
      {
        "id": "cat-adult-male",
        "slug": "adult_male",
        "baseProteinOz": 6.0,
        "isActive": true
      }
    ],
    "settings": { "athleteMultiplier": 1.5 },
    "requirements": [
      {
        "portionCategoryId": "cat-adult-male",
        "count": 2,
        "athleteCount": 1
      }
    ],
    "expectedEffectiveOz": 15.0
  },
  {
    "name": "zero_rows",
    "description": "Empty requirements array â†’ 0",
    "categories": [
      {
        "id": "cat-adult-male",
        "slug": "adult_male",
        "baseProteinOz": 6.0,
        "isActive": true
      }
    ],
    "settings": { "athleteMultiplier": 1.5 },
    "requirements": [],
    "expectedEffectiveOz": 0.0
  },
  {
    "name": "zero_counts",
    "description": "count=0 athlete=0 â†’ (0+0)Ã—base = 0 (row would not be persisted, but pure fn accepts it)",
    "categories": [
      {
        "id": "cat-adult-male",
        "slug": "adult_male",
        "baseProteinOz": 6.0,
        "isActive": true
      }
    ],
    "settings": { "athleteMultiplier": 1.5 },
    "requirements": [
      {
        "portionCategoryId": "cat-adult-male",
        "count": 0,
        "athleteCount": 0
      }
    ],
    "expectedEffectiveOz": 0.0
  },
  {
    "name": "all_athlete_group",
    "description": "count=3 athlete=3 base=6 mult=1.5 â†’ (0+3Ã—1.5)Ã—6 = 27",
    "categories": [
      {
        "id": "cat-adult-male",
        "slug": "adult_male",
        "baseProteinOz": 6.0,
        "isActive": true
      }
    ],
    "settings": { "athleteMultiplier": 1.5 },
    "requirements": [
      {
        "portionCategoryId": "cat-adult-male",
        "count": 3,
        "athleteCount": 3
      }
    ],
    "expectedEffectiveOz": 27.0
  },
  {
    "name": "multi_category_mixed",
    "description": "adult_male 15 + adult_female ((2-0)+0)Ã—5=10 + child 1Ã—3=3 â†’ 28",
    "categories": [
      {
        "id": "cat-adult-male",
        "slug": "adult_male",
        "baseProteinOz": 6.0,
        "isActive": true
      },
      {
        "id": "cat-adult-female",
        "slug": "adult_female",
        "baseProteinOz": 5.0,
        "isActive": true
      },
      {
        "id": "cat-child",
        "slug": "child",
        "baseProteinOz": 3.0,
        "isActive": true
      }
    ],
    "settings": { "athleteMultiplier": 1.5 },
    "requirements": [
      {
        "portionCategoryId": "cat-adult-male",
        "count": 2,
        "athleteCount": 1
      },
      {
        "portionCategoryId": "cat-adult-female",
        "count": 2,
        "athleteCount": 0
      },
      {
        "portionCategoryId": "cat-child",
        "count": 1,
        "athleteCount": 0
      }
    ],
    "expectedEffectiveOz": 28.0
  },
  {
    "name": "deactivated_category_still_calculates",
    "description": "isActive=false adult_male same as worked example â†’ 15 (D11 historical plans)",
    "categories": [
      {
        "id": "cat-adult-male",
        "slug": "adult_male",
        "baseProteinOz": 6.0,
        "isActive": false
      }
    ],
    "settings": { "athleteMultiplier": 1.5 },
    "requirements": [
      {
        "portionCategoryId": "cat-adult-male",
        "count": 2,
        "athleteCount": 1
      }
    ],
    "expectedEffectiveOz": 15.0
  },
  {
    "name": "floating_point_base_5_3",
    "description": "base 5.3 mult 1.5 count 2 athlete 1 â†’ 2.5Ã—5.3 = 13.25",
    "categories": [
      {
        "id": "cat-custom",
        "slug": "custom",
        "baseProteinOz": 5.3,
        "isActive": true
      }
    ],
    "settings": { "athleteMultiplier": 1.5 },
    "requirements": [
      {
        "portionCategoryId": "cat-custom",
        "count": 2,
        "athleteCount": 1
      }
    ],
    "expectedEffectiveOz": 13.25
  },
  {
    "name": "athlete_equals_count_boundary",
    "description": "count=2 athlete=2 base=4 mult=2 â†’ (0+2Ã—2)Ã—4 = 16",
    "categories": [
      {
        "id": "cat-adult-male",
        "slug": "adult_male",
        "baseProteinOz": 4.0,
        "isActive": true
      }
    ],
    "settings": { "athleteMultiplier": 2.0 },
    "requirements": [
      {
        "portionCategoryId": "cat-adult-male",
        "count": 2,
        "athleteCount": 2
      }
    ],
    "expectedEffectiveOz": 16.0
  },
  {
    "name": "hand_computed_4dp_mixed_multiplier",
    "description": "base 4.25 mult 1.33 count 3 athlete 2 â†’ (1+2Ã—1.33)Ã—4.25 = 3.66Ã—4.25 = 15.555",
    "categories": [
      {
        "id": "cat-teen",
        "slug": "adolescent_male_over_15",
        "baseProteinOz": 4.25,
        "isActive": true
      }
    ],
    "settings": { "athleteMultiplier": 1.33 },
    "requirements": [
      {
        "portionCategoryId": "cat-teen",
        "count": 3,
        "athleteCount": 2
      }
    ],
    "expectedEffectiveOz": 15.555
  },
  {
    "name": "no_athletes_plain_sum",
    "description": "count=4 athlete=0 base=6 mult=1.5 â†’ 4Ã—6 = 24 (multiplier unused)",
    "categories": [
      {
        "id": "cat-adult-male",
        "slug": "adult_male",
        "baseProteinOz": 6.0,
        "isActive": true
      }
    ],
    "settings": { "athleteMultiplier": 1.5 },
    "requirements": [
      {
        "portionCategoryId": "cat-adult-male",
        "count": 4,
        "athleteCount": 0
      }
    ],
    "expectedEffectiveOz": 24.0
  }
]
```
