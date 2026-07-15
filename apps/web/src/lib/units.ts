/**
 * Active unit catalog for recipe/ingredient editors.
 *
 * <!-- TODO(coordinator): no unit.list tRPC procedure exists (Task 14 constraint:
 * no new routers/procedures). IDs match supabase/seed.sql fixed UUIDs so
 * create/update payloads resolve FKs in local + seeded envs. When admin unit
 * CRUD ships, replace with a thin family.units (or unit.list) query. -->
 */

export type UnitDimension = "mass" | "volume" | "count";

export type UnitOption = {
  id: string;
  name: string;
  abbreviation: string;
  dimension: UnitDimension;
  sortOrder: number;
};

/** Deterministic seed units (see supabase/seed.sql). */
export const SEED_UNITS: readonly UnitOption[] = [
  {
    id: "00000000-0000-4000-8000-000000000101",
    name: "gram",
    abbreviation: "g",
    dimension: "mass",
    sortOrder: 10,
  },
  {
    id: "00000000-0000-4000-8000-000000000102",
    name: "kilogram",
    abbreviation: "kg",
    dimension: "mass",
    sortOrder: 20,
  },
  {
    id: "00000000-0000-4000-8000-000000000103",
    name: "ounce",
    abbreviation: "oz",
    dimension: "mass",
    sortOrder: 30,
  },
  {
    id: "00000000-0000-4000-8000-000000000104",
    name: "pound",
    abbreviation: "lb",
    dimension: "mass",
    sortOrder: 40,
  },
  {
    id: "00000000-0000-4000-8000-000000000111",
    name: "milliliter",
    abbreviation: "ml",
    dimension: "volume",
    sortOrder: 50,
  },
  {
    id: "00000000-0000-4000-8000-000000000112",
    name: "liter",
    abbreviation: "l",
    dimension: "volume",
    sortOrder: 60,
  },
  {
    id: "00000000-0000-4000-8000-000000000113",
    name: "teaspoon",
    abbreviation: "tsp",
    dimension: "volume",
    sortOrder: 70,
  },
  {
    id: "00000000-0000-4000-8000-000000000114",
    name: "tablespoon",
    abbreviation: "tbsp",
    dimension: "volume",
    sortOrder: 80,
  },
  {
    id: "00000000-0000-4000-8000-000000000115",
    name: "cup",
    abbreviation: "cup",
    dimension: "volume",
    sortOrder: 90,
  },
  {
    id: "00000000-0000-4000-8000-000000000116",
    name: "fluid_ounce",
    abbreviation: "fl_oz",
    dimension: "volume",
    sortOrder: 100,
  },
  {
    id: "00000000-0000-4000-8000-000000000121",
    name: "each",
    abbreviation: "ea",
    dimension: "count",
    sortOrder: 110,
  },
  {
    id: "00000000-0000-4000-8000-000000000122",
    name: "dozen",
    abbreviation: "doz",
    dimension: "count",
    sortOrder: 120,
  },
  {
    id: "00000000-0000-4000-8000-000000000123",
    name: "clove",
    abbreviation: "clove",
    dimension: "count",
    sortOrder: 130,
  },
  {
    id: "00000000-0000-4000-8000-000000000124",
    name: "head",
    abbreviation: "head",
    dimension: "count",
    sortOrder: 140,
  },
] as const;

export const DEFAULT_UNIT_ID = SEED_UNITS.find((u) => u.name === "each")!.id;

const DIMENSION_ORDER: UnitDimension[] = ["mass", "volume", "count"];

/** Units grouped by dimension for <optgroup> selects. */
export function unitsByDimension(
  units: readonly UnitOption[] = SEED_UNITS,
): Array<{ dimension: UnitDimension; units: UnitOption[] }> {
  return DIMENSION_ORDER.map((dimension) => ({
    dimension,
    units: units
      .filter((u) => u.dimension === dimension)
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder),
  })).filter((g) => g.units.length > 0);
}

export function unitLabel(unit: UnitOption): string {
  return `${unit.name} (${unit.abbreviation})`;
}
