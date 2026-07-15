/**
 * Zod boundary tests for content-domain schemas.
 * (Also materializes as apps/web/src/server/routers/__tests__/schemas.test.ts)
 *
 * Covers: invalid enums, quantity 0, rating 6, empty combination recipes,
 * decay-path without `use`, novel foodSafetyProfile contaminant key accepted.
 * Athlete/portion inputs are out of scope for this domain.
 */
import { describe, expect, it } from "vitest";
import {
  chefIdeaCreateInputSchema,
  chefIdeaStatusSchema,
  foodSafetyProfileSchema,
  ingredientCreateInputSchema,
  leftoverDecayPathEntrySchema,
  leftoverDecayPathSchema,
  ratingSchema,
  recipeCombinationCreateInputSchema,
  recipeCreateInputSchema,
  recipeIngredientInputSchema,
  roleInMealSchema,
} from "./index";

const UUID = "11111111-1111-4111-8111-111111111111";
const UUID2 = "22222222-2222-4222-8222-222222222222";

describe("ratingSchema", () => {
  it("accepts integers 1–5", () => {
    for (const n of [1, 2, 3, 4, 5]) {
      expect(ratingSchema.parse(n)).toBe(n);
    }
  });

  it("rejects rating 6", () => {
    const r = ratingSchema.safeParse(6);
    expect(r.success).toBe(false);
  });

  it("rejects rating 0 and non-integers", () => {
    expect(ratingSchema.safeParse(0).success).toBe(false);
    expect(ratingSchema.safeParse(3.5).success).toBe(false);
  });
});

describe("recipeIngredientInputSchema", () => {
  const base = {
    ingredientId: UUID,
    unitId: UUID2,
    sequenceOrder: 0,
    isOptional: false,
  };

  it("accepts quantity > 0", () => {
    expect(
      recipeIngredientInputSchema.parse({ ...base, quantity: 0.5 }),
    ).toMatchObject({ quantity: 0.5 });
  });

  it("rejects quantity 0", () => {
    const r = recipeIngredientInputSchema.safeParse({
      ...base,
      quantity: 0,
    });
    expect(r.success).toBe(false);
  });

  it("rejects negative quantity", () => {
    expect(
      recipeIngredientInputSchema.safeParse({ ...base, quantity: -1 })
        .success,
    ).toBe(false);
  });
});

describe("roleInMealSchema / enums", () => {
  it("accepts known roles", () => {
    for (const role of ["main", "side", "dessert", "appetizer", "other"]) {
      expect(roleInMealSchema.parse(role)).toBe(role);
    }
  });

  it("rejects invalid role enum", () => {
    expect(roleInMealSchema.safeParse("entree").success).toBe(false);
    expect(roleInMealSchema.safeParse("MAIN").success).toBe(false);
  });

  it("rejects invalid chefIdea status", () => {
    expect(chefIdeaStatusSchema.safeParse("draft").success).toBe(false);
    expect(chefIdeaStatusSchema.parse("abandoned")).toBe("abandoned");
  });
});

describe("recipeCombinationCreateInputSchema", () => {
  it("rejects empty recipes array", () => {
    const r = recipeCombinationCreateInputSchema.safeParse({
      name: "Sunday Dinner",
      recipes: [],
    });
    expect(r.success).toBe(false);
  });

  it("accepts at least one recipe", () => {
    const r = recipeCombinationCreateInputSchema.parse({
      name: "Sunday Dinner",
      recipes: [
        {
          recipeId: UUID,
          roleInMeal: "main",
          sequenceOrder: 0,
        },
      ],
    });
    expect(r.recipes).toHaveLength(1);
  });
});

describe("leftoverDecayPath", () => {
  it("rejects entry without use", () => {
    const r = leftoverDecayPathEntrySchema.safeParse({
      notes: "something",
    });
    expect(r.success).toBe(false);
  });

  it("rejects empty use after trim", () => {
    expect(
      leftoverDecayPathEntrySchema.safeParse({ use: "   " }).success,
    ).toBe(false);
  });

  it("accepts use-only and full entry", () => {
    expect(leftoverDecayPathEntrySchema.parse({ use: "Cuban Sandwiches" })).toEqual({
      use: "Cuban Sandwiches",
    });
    expect(
      leftoverDecayPathSchema.parse([
        {
          use: "Bolognese",
          notes: "freezes well",
          linkedRecipeIds: [UUID],
        },
      ]),
    ).toHaveLength(1);
  });
});

describe("foodSafetyProfileSchema", () => {
  it("accepts mercury + general known keys", () => {
    const profile = foodSafetyProfileSchema.parse({
      mercury: {
        fda_category: "Good Choices",
        risk_level: "moderate",
        recommended_frequency: "2-3/week",
        source: "FDA/EPA",
        last_reviewed: "2026-06",
      },
      general: {
        cooking_temperature: "145F",
        storage_notes: "1-2 days",
      },
    });
    expect(profile.mercury?.fda_category).toBe("Good Choices");
  });

  it("accepts novel contaminant key via catchall", () => {
    const profile = foodSafetyProfileSchema.parse({
      pfas: {
        risk_level: "unknown",
        notes: "emerging guidance",
        source: "EPA draft",
      },
    });
    expect(profile.pfas).toBeDefined();
    expect(profile.pfas?.risk_level).toBe("unknown");
  });

  it("accepts empty object", () => {
    expect(foodSafetyProfileSchema.parse({})).toEqual({});
  });
});

describe("recipeCreateInputSchema", () => {
  it("requires title and positive yield", () => {
    expect(recipeCreateInputSchema.safeParse({ title: "" }).success).toBe(
      false,
    );
    const r = recipeCreateInputSchema.parse({
      title: "  Roast Chicken  ",
      yieldServings: 4,
    });
    expect(r.title).toBe("Roast Chicken");
    expect(r.yieldServings).toBe(4);
    expect(r.instructions).toEqual([]);
  });

  it("rejects yieldServings 0", () => {
    expect(
      recipeCreateInputSchema.safeParse({
        title: "X",
        yieldServings: 0,
      }).success,
    ).toBe(false);
  });

  it("rejects makeAgainRating 6 on create", () => {
    expect(
      recipeCreateInputSchema.safeParse({
        title: "X",
        makeAgainRating: 6,
      }).success,
    ).toBe(false);
  });
});

describe("ingredientCreateInputSchema", () => {
  it("enforces name length 1–120", () => {
    expect(
      ingredientCreateInputSchema.safeParse({ name: "" }).success,
    ).toBe(false);
    expect(
      ingredientCreateInputSchema.safeParse({ name: "a".repeat(121) })
        .success,
    ).toBe(false);
    expect(
      ingredientCreateInputSchema.parse({ name: "  Olive Oil  " }).name,
    ).toBe("Olive Oil");
  });
});

describe("chefIdeaCreateInputSchema", () => {
  it("defaults status to idea and validates priority 1–3", () => {
    const r = chefIdeaCreateInputSchema.parse({ title: "Try Greek pork" });
    expect(r.status).toBe("idea");
    expect(
      chefIdeaCreateInputSchema.safeParse({
        title: "X",
        priority: 4,
      }).success,
    ).toBe(false);
  });
});
