/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ShareChecklist } from "./ShareChecklist";

const HOUSEHOLDS = [
  { id: "hh-a", name: "Household A" },
  { id: "hh-b", name: "Household B" },
  { id: "hh-c", name: "Household C" },
];

describe("ShareChecklist", () => {
  it("disables the creator household checkbox", () => {
    render(
      <ShareChecklist
        households={HOUSEHOLDS}
        creatorHouseholdId="hh-a"
        value={["hh-a"]}
        onChange={vi.fn()}
      />,
    );
    const creator = screen.getByTestId("share-checkbox-creator");
    expect(creator).toBeDisabled();
    expect(creator).toBeChecked();
    expect(screen.getByTestId("share-row-creator")).toHaveTextContent(
      "your household",
    );
  });

  it("toggles non-creator households and always keeps creator", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <ShareChecklist
        households={HOUSEHOLDS}
        creatorHouseholdId="hh-a"
        value={["hh-a"]}
        onChange={onChange}
      />,
    );

    await user.click(screen.getByTestId("share-checkbox-hh-b"));
    expect(onChange).toHaveBeenCalled();
    const next = onChange.mock.calls.at(-1)?.[0] as string[];
    expect(next).toContain("hh-a");
    expect(next).toContain("hh-b");
  });

  it("does not fire onChange when clicking the creator row", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <ShareChecklist
        households={HOUSEHOLDS}
        creatorHouseholdId="hh-a"
        value={["hh-a", "hh-b"]}
        onChange={onChange}
      />,
    );
    await user.click(screen.getByTestId("share-checkbox-creator"));
    expect(onChange).not.toHaveBeenCalled();
  });
});
