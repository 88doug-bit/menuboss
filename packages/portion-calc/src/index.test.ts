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
      name: "PRD worked example: adult_male count=2 athlete=1 base=6 mult=1.5 → 15.0",
      requirements: [
        { portionCategoryId: "cat-adult-male", count: 2, athleteCount: 1 },
      ],
      categories: [adultMale],
      settings: defaultSettings,
      expected: 15.0,
    },
    {
      name: "zero rows → 0",
      requirements: [],
      categories: [adultMale],
      settings: defaultSettings,
      expected: 0,
    },
    {
      name: "zero counts → 0",
      requirements: [
        { portionCategoryId: "cat-adult-male", count: 0, athleteCount: 0 },
      ],
      categories: [adultMale],
      settings: defaultSettings,
      expected: 0,
    },
    {
      name: "all-athlete group: count=3 athlete=3 → 27.0",
      requirements: [
        { portionCategoryId: "cat-adult-male", count: 3, athleteCount: 3 },
      ],
      categories: [adultMale],
      settings: defaultSettings,
      expected: 27.0,
    },
    {
      name: "athleteCount === count boundary: count=2 athlete=2 base=4 mult=2 → 16",
      requirements: [
        { portionCategoryId: "cat-adult-male", count: 2, athleteCount: 2 },
      ],
      categories: [{ ...adultMale, baseProteinOz: 4.0 }],
      settings: { athleteMultiplier: 2.0 },
      expected: 16.0,
    },
    {
      name: "mixed multi-category plan sums correctly → 28.0",
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
      name: "no athletes: multiplier unused → 24.0",
      requirements: [
        { portionCategoryId: "cat-adult-male", count: 4, athleteCount: 0 },
      ],
      categories: [adultMale],
      settings: defaultSettings,
      expected: 24.0,
    },
    {
      name: "deactivated category still calculates → 15.0",
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

  it("floating-point: base 5.3 mult 1.5 count 2 athlete 1 → 13.25 (toBeCloseTo)", () => {
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
    // 2.5 * 5.3 = 13.25 — use toBeCloseTo for binary FP
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
