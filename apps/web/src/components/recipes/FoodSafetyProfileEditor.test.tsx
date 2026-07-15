/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { FoodSafetyProfileEditor } from "./FoodSafetyProfileEditor";

describe("FoodSafetyProfileEditor admin gate", () => {
  it("hides safety editor form for non-admin (read-only only)", () => {
    render(
      <FoodSafetyProfileEditor
        isAdmin={false}
        value={{
          mercury: {
            fda_category: "Best Choices",
            recommended_frequency: "2–3 / week",
          },
        }}
        onChange={vi.fn()}
      />,
    );

    expect(screen.queryByTestId("safety-editor")).toBeNull();
    expect(screen.getByTestId("safety-admin-only-badge")).toBeInTheDocument();
    expect(screen.getByTestId("safety-readonly")).toBeInTheDocument();
    expect(screen.getByTestId("safety-note-callout")).toBeInTheDocument();
  });

  it("shows structured mercury + contaminant editor for admin", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(
      <FoodSafetyProfileEditor
        isAdmin
        value={{ mercury: { fda_category: "Good Choices" } }}
        onChange={onChange}
      />,
    );

    expect(screen.getByTestId("safety-editor")).toBeInTheDocument();
    expect(screen.queryByTestId("safety-admin-only-badge")).toBeNull();

    await user.selectOptions(
      screen.getByTestId("safety-mercury-fda"),
      "Best Choices",
    );
    expect(onChange).toHaveBeenCalled();
    const last = onChange.mock.calls.at(-1)?.[0] as {
      mercury?: { fda_category?: string };
    };
    expect(last.mercury?.fda_category).toBe("Best Choices");

    await user.type(screen.getByTestId("safety-add-contaminant-key"), "lead");
    await user.click(screen.getByTestId("safety-add-contaminant"));
    const added = onChange.mock.calls.at(-1)?.[0] as Record<string, unknown>;
    expect(added).toHaveProperty("lead");
  });
});
