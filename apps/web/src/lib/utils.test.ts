import { describe, it, expect } from "vitest";
import { slugify } from "./utils";

describe("slugify", () => {
  it("kebab-cases simple names", () => {
    expect(slugify("Quick Dinner")).toBe("quick-dinner");
    expect(slugify("dairy free")).toBe("dairy-free");
  });

  it("collapses punctuation and repeated separators", () => {
    expect(slugify("Kid's  Favorite!!")).toBe("kid-s-favorite");
    expect(slugify("--already--kebab--")).toBe("already-kebab");
  });

  it("strips diacritics", () => {
    expect(slugify("Crème Brûlée")).toBe("creme-brulee");
    expect(slugify("Jalapeño")).toBe("jalapeno");
  });

  it("matches the tag schema's kebab-case contract", () => {
    const kebab = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
    for (const name of ["Quick Dinner", "Crème Brûlée", "30-Minute MEALS"]) {
      expect(slugify(name)).toMatch(kebab);
    }
  });

  it("returns empty string when nothing usable remains", () => {
    expect(slugify("")).toBe("");
    expect(slugify("   ")).toBe("");
    expect(slugify("!!!")).toBe("");
    expect(slugify("🍕🍕")).toBe("");
  });
});
