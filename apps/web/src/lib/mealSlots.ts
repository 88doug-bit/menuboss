/**
 * Single source of truth for meal slots and day-part bands (UI Increment 1).
 *
 * `mealSlot` is deliberately a free-form string in the shared schema
 * (holds space for expansion), so band mapping must be tolerant: any
 * unknown slot lands in a visible band — meals never silently disappear
 * from the calendar or day planner.
 */

export const MEAL_SLOTS = ["breakfast", "lunch", "dinner", "snack"] as const;
export type MealSlot = (typeof MEAL_SLOTS)[number];

export const BANDS = ["morning", "midday", "evening"] as const;
export type Band = (typeof BANDS)[number];

export const BAND_LABELS: Record<Band, string> = {
  morning: "Morning",
  midday: "Mid-day",
  evening: "Evening",
};

/** Canonical form used for storage and band lookup. */
export function normalizeMealSlot(slot: string): string {
  return slot.trim().toLowerCase();
}

const SLOT_TO_BAND: Record<string, Band> = {
  breakfast: "morning",
  brunch: "morning",
  lunch: "midday",
  snack: "midday",
  dinner: "evening",
  supper: "evening",
};

/** Unknown slots fall back to midday so they stay visible. */
export function slotToBand(slot: string): Band {
  return SLOT_TO_BAND[normalizeMealSlot(slot)] ?? "midday";
}

/** Slot pre-selected when adding a meal from a band zone. */
export const BAND_DEFAULT_SLOT: Record<Band, MealSlot> = {
  morning: "breakfast",
  midday: "lunch",
  evening: "dinner",
};
