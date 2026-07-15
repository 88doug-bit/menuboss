/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  PortionGrid,
  clampAthleteCount,
  type PortionCategoryOption,
  type PortionRequirementValue,
} from "./PortionGrid";

const CATS: PortionCategoryOption[] = [
  {
    id: "cat-male",
    name: "Adult Male",
    slug: "adult-male",
    baseProteinOz: 6,
    isActive: true,
  },
  {
    id: "cat-female",
    name: "Adult Female",
    slug: "adult-female",
    baseProteinOz: 5,
    isActive: true,
  },
  {
    id: "cat-old",
    name: "Legacy Group",
    slug: "legacy-group",
    baseProteinOz: 4,
    isActive: false,
  },
];

function Controlled({
  initial = [] as PortionRequirementValue[],
  categories = CATS,
}: {
  initial?: PortionRequirementValue[];
  categories?: PortionCategoryOption[];
}) {
  const [value, setValue] = React.useState(initial);
  return (
    <PortionGrid
      categories={categories}
      value={value}
      onChange={setValue}
      athleteMultiplier={1.5}
    />
  );
}

// React import for useState in Controlled
import * as React from "react";

describe("clampAthleteCount", () => {
  it("clamps athleteCount to count", () => {
    expect(clampAthleteCount(2, 5)).toBe(2);
    expect(clampAthleteCount(3, 1)).toBe(1);
    expect(clampAthleteCount(0, 2)).toBe(0);
  });
});

describe("PortionGrid", () => {
  it("shows deactivated badge for inactive categories with data", () => {
    render(
      <PortionGrid
        categories={CATS}
        value={[
          { portionCategoryId: "cat-old", count: 1, athleteCount: 0 },
        ]}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByTestId("deactivated-badge")).toHaveTextContent(
      "deactivated",
    );
    // Stepper buttons disabled for deactivated row
    const dec = screen.getByLabelText("Decrease Legacy Group count");
    expect(dec).toBeDisabled();
  });

  it("does not show inactive categories without requirement rows", () => {
    render(
      <PortionGrid categories={CATS} value={[]} onChange={vi.fn()} />,
    );
    expect(screen.queryByText("Legacy Group")).toBeNull();
    expect(screen.getByText("Adult Male")).toBeTruthy();
  });

  it("clamps athlete steppers to count in the UI", async () => {
    const user = userEvent.setup();
    render(<Controlled />);

    // Increase Adult Male count to 1
    await user.click(screen.getByLabelText("Increase Adult Male count"));
    expect(screen.getByTestId("count-stepper-adult-male-value")).toHaveTextContent(
      "1",
    );

    // Increase athlete once → 1
    await user.click(
      screen.getByLabelText("Increase Adult Male athlete count"),
    );
    expect(
      screen.getByTestId("athlete-stepper-adult-male-value"),
    ).toHaveTextContent("1");

    // Cannot go above count
    const incAthlete = screen.getByLabelText(
      "Increase Adult Male athlete count",
    );
    expect(incAthlete).toBeDisabled();
  });

  it("updates live protein total when counts change", async () => {
    const user = userEvent.setup();
    render(<Controlled />);

    // 0 people → 0 oz
    expect(screen.getByTestId("portion-total")).toHaveTextContent("0 oz");

    // 2 adult males × 6 oz = 12
    await user.click(screen.getByLabelText("Increase Adult Male count"));
    await user.click(screen.getByLabelText("Increase Adult Male count"));
    expect(screen.getByTestId("portion-total")).toHaveTextContent("12 oz");

    // 1 athlete: (1 + 1*1.5) * 6 = 15
    await user.click(
      screen.getByLabelText("Increase Adult Male athlete count"),
    );
    expect(screen.getByTestId("portion-total")).toHaveTextContent("15 oz");
  });
});
