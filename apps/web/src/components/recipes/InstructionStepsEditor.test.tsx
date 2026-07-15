/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as React from "react";

import {
  InstructionStepsEditor,
  reorderSteps,
} from "./InstructionStepsEditor";
import type { InstructionStep } from "@menu-boss/schemas";

function Controlled({
  initial,
}: {
  initial: InstructionStep[];
}) {
  const [value, setValue] = React.useState(initial);
  return (
    <div>
      <InstructionStepsEditor value={value} onChange={setValue} />
      <ol data-testid="order-mirror">
        {value.map((s, i) => (
          <li key={i} data-testid={`mirror-${i}`}>
            {s.text}
          </li>
        ))}
      </ol>
    </div>
  );
}

describe("reorderSteps", () => {
  it("swaps neighbors and no-ops at edges", () => {
    const steps = [
      { text: "A" },
      { text: "B" },
      { text: "C" },
    ];
    expect(reorderSteps(steps, 0, -1)).toEqual(steps);
    expect(reorderSteps(steps, 2, 1)).toEqual(steps);
    expect(reorderSteps(steps, 1, -1).map((s) => s.text)).toEqual([
      "B",
      "A",
      "C",
    ]);
  });
});

describe("InstructionStepsEditor", () => {
  it("reorders steps with Up/Down controls", async () => {
    const user = userEvent.setup();
    render(
      <Controlled
        initial={[
          { text: "Sear pork" },
          { text: "Braise low" },
          { text: "Rest and slice" },
        ]}
      />,
    );

    expect(screen.getByTestId("mirror-0")).toHaveTextContent("Sear pork");
    expect(screen.getByTestId("mirror-1")).toHaveTextContent("Braise low");

    await user.click(screen.getByTestId("instruction-down-0"));

    expect(screen.getByTestId("mirror-0")).toHaveTextContent("Braise low");
    expect(screen.getByTestId("mirror-1")).toHaveTextContent("Sear pork");
    expect(screen.getByTestId("mirror-2")).toHaveTextContent("Rest and slice");

    await user.click(screen.getByTestId("instruction-up-2"));

    expect(screen.getByTestId("mirror-1")).toHaveTextContent("Rest and slice");
    expect(screen.getByTestId("mirror-2")).toHaveTextContent("Sear pork");
  });

  it("adds and removes steps", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <InstructionStepsEditor
        value={[{ text: "Only step" }]}
        onChange={onChange}
      />,
    );

    await user.click(screen.getByTestId("instruction-add"));
    expect(onChange).toHaveBeenCalledWith([
      { text: "Only step" },
      { text: "" },
    ]);

    await user.click(screen.getByTestId("instruction-remove-0"));
    expect(onChange).toHaveBeenCalledWith([]);
  });
});
