import { describe, it, expect } from "vitest";
import {
  BANDS,
  BAND_DEFAULT_SLOT,
  BAND_LABELS,
  MEAL_SLOTS,
  normalizeMealSlot,
  slotToBand,
} from "./mealSlots";

describe("normalizeMealSlot", () => {
  it("lowercases", () => {
    expect(normalizeMealSlot("Breakfast")).toBe("breakfast");
    expect(normalizeMealSlot("DINNER")).toBe("dinner");
  });

  it("trims whitespace", () => {
    expect(normalizeMealSlot("  lunch ")).toBe("lunch");
    expect(normalizeMealSlot("\tsnack\n")).toBe("snack");
  });

  it("is idempotent", () => {
    for (const slot of ["breakfast", " Lunch ", "DINNER", "weird slot"]) {
      const once = normalizeMealSlot(slot);
      expect(normalizeMealSlot(once)).toBe(once);
    }
  });
});

describe("slotToBand", () => {
  it("maps canonical slots", () => {
    expect(slotToBand("breakfast")).toBe("morning");
    expect(slotToBand("lunch")).toBe("midday");
    expect(slotToBand("snack")).toBe("midday");
    expect(slotToBand("dinner")).toBe("evening");
  });

  it("maps common aliases", () => {
    expect(slotToBand("brunch")).toBe("morning");
    expect(slotToBand("supper")).toBe("evening");
  });

  it("is case- and whitespace-insensitive", () => {
    expect(slotToBand("Breakfast")).toBe("morning");
    expect(slotToBand(" LUNCH ")).toBe("midday");
    expect(slotToBand("Dinner\t")).toBe("evening");
  });

  it("falls back to midday for unknown slots (never drops a meal)", () => {
    expect(slotToBand("second breakfast")).toBe("midday");
    expect(slotToBand("dessert")).toBe("midday");
    expect(slotToBand("")).toBe("midday");
    expect(slotToBand("   ")).toBe("midday");
  });

  it("invariant: every input maps to a visible band", () => {
    const inputs = [
      ...MEAL_SLOTS,
      "Brunch",
      "SUPPER",
      "midnight snack",
      "",
      " ",
      "🍕",
      "breakfast ", // non-breaking space is not trimmed — still lands in a band
    ];
    for (const input of inputs) {
      expect(BANDS).toContain(slotToBand(input));
    }
  });
});

describe("band constants", () => {
  it("every band has a label and a default slot", () => {
    for (const band of BANDS) {
      expect(BAND_LABELS[band]).toBeTruthy();
      expect(MEAL_SLOTS).toContain(BAND_DEFAULT_SLOT[band]);
    }
  });

  it("each default slot round-trips to its own band", () => {
    for (const band of BANDS) {
      expect(slotToBand(BAND_DEFAULT_SLOT[band])).toBe(band);
    }
  });
});
