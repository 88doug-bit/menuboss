import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { IngredientLine } from "./IngredientLine";
import { SafetyNoteCallout, hasMercuryProfile } from "./SafetyNoteCallout";

describe("SafetyNoteCallout", () => {
  it("renders warning callout with FDA category and frequency when mercury profile present", () => {
    render(
      <SafetyNoteCallout
        mercury={{
          fda_category: "Good Choice",
          recommended_frequency: "1 serving/week",
          risk_level: "moderate",
        }}
      />,
    );

    const callout = screen.getByTestId("safety-note-callout");
    expect(callout).toHaveAttribute("role", "alert");
    expect(callout).toHaveTextContent("Good Choice");
    expect(callout).toHaveTextContent("1 serving/week");
    expect(callout).toHaveTextContent("moderate");
  });

  it("hasMercuryProfile detects mercury block only", () => {
    expect(hasMercuryProfile({ mercury: { fda_category: "Best" } })).toBe(
      true,
    );
    expect(hasMercuryProfile({ general: { cooking_temperature: "165F" } })).toBe(
      false,
    );
    expect(hasMercuryProfile(null)).toBe(false);
    expect(hasMercuryProfile({})).toBe(false);
  });

  it("IngredientLine shows callout only when profile has mercury", () => {
    const { rerender } = render(
      <IngredientLine
        name="Swordfish"
        quantity={6}
        unitLabel="oz"
        foodSafetyProfile={{
          mercury: {
            fda_category: "Choices to Avoid",
            recommended_frequency: "Avoid",
          },
        }}
      />,
    );
    expect(screen.getByTestId("safety-note-callout")).toBeInTheDocument();
    expect(screen.getByText(/Choices to Avoid/)).toBeInTheDocument();

    rerender(
      <IngredientLine
        name="Chicken"
        quantity={1}
        unitLabel="lb"
        foodSafetyProfile={{}}
      />,
    );
    expect(screen.queryByTestId("safety-note-callout")).not.toBeInTheDocument();
  });
});
