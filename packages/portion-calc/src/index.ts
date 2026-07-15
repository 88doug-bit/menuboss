/**
 * @menu-boss/portion-calc
 *
 * Canonical pure TypeScript implementation of the MealPlanPortionRequirement
 * protein formula (Database PRD v0.4 §4.1 / decision D3).
 *
 * effective_protein_oz(plan) =
 *   Σ over requirement rows r:
 *     ( (r.count − r.athlete_count)
 *       + r.athlete_count × family_settings.athlete_multiplier )
 *     × portion_category.base_protein_oz
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
  /** How many of `count` receive the athlete multiplier. Must be ≤ count. */
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

/** Thrown when FamilySettings values are invalid (e.g. athleteMultiplier ≤ 0). */
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
      `${label}.count must be a finite number ≥ 0; got ${String(req.count)}`,
    );
  }
  if (!isFiniteNumber(req.athleteCount) || req.athleteCount < 0) {
    throw new InvalidPortionRequirementError(
      `${label}.athleteCount must be a finite number ≥ 0; got ${String(req.athleteCount)}`,
    );
  }
  // Use > only (athleteCount === count is a valid all-athlete boundary).
  if (req.athleteCount > req.count) {
    throw new InvalidPortionRequirementError(
      `${label}: athleteCount (${req.athleteCount}) must be ≤ count (${req.count})`,
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
 *   nonAthletes + athletes × multiplier
 * = (count − athleteCount) + athleteCount × athleteMultiplier
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
