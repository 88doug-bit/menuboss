/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { PortionCategoriesPanel } from "./PortionCategoriesPanel";
import { parseBaseProteinOz } from "./adminValidation";

const CATS = [
  {
    id: "c1",
    name: "Adult Male",
    slug: "adult-male",
    baseProteinOz: 6,
    description: "Reference",
    sortOrder: 70,
    isActive: true,
  },
  {
    id: "c2",
    name: "Child",
    slug: "child",
    baseProteinOz: 3,
    description: null,
    sortOrder: 10,
    isActive: true,
  },
];

describe("parseBaseProteinOz", () => {
  it("accepts positive values", () => {
    expect(parseBaseProteinOz(6)).toEqual({ ok: true, value: 6 });
    expect(parseBaseProteinOz("4.5")).toEqual({ ok: true, value: 4.5 });
  });

  it("rejects base oz ≤ 0", () => {
    expect(parseBaseProteinOz(0).ok).toBe(false);
    expect(parseBaseProteinOz(-1).ok).toBe(false);
    expect(parseBaseProteinOz("0").ok).toBe(false);
  });
});

describe("PortionCategoriesPanel", () => {
  it("shows Adult Male D17 hint", () => {
    render(
      <PortionCategoriesPanel
        categories={CATS}
        onUpdate={vi.fn()}
        onCreate={vi.fn()}
        onSetActive={vi.fn()}
      />,
    );
    expect(screen.getByTestId("adult-male-hint")).toHaveTextContent(/6\.0 oz/i);
    expect(screen.getByTestId("adult-male-hint")).toHaveTextContent(/D17/);
  });

  it("rejects base oz ≤ 0 on save", async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn();
    render(
      <PortionCategoriesPanel
        categories={CATS}
        onUpdate={onUpdate}
        onCreate={vi.fn()}
        onSetActive={vi.fn()}
      />,
    );

    const input = screen.getByTestId("portion-base-oz-adult-male");
    await user.clear(input);
    await user.type(input, "0");
    await user.click(screen.getByTestId("portion-save-adult-male"));

    expect(screen.getByTestId("portion-error-adult-male")).toHaveTextContent(
      /greater than 0/i,
    );
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it("rejects base oz ≤ 0 on create", async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn();
    render(
      <PortionCategoriesPanel
        categories={CATS}
        onUpdate={vi.fn()}
        onCreate={onCreate}
        onSetActive={vi.fn()}
      />,
    );

    await user.type(screen.getByTestId("portion-new-name"), "Teen");
    const base = screen.getByTestId("portion-new-base-oz");
    await user.clear(base);
    await user.type(base, "-2");
    await user.click(screen.getByRole("button", { name: /add category/i }));

    expect(screen.getByTestId("portion-create-error")).toHaveTextContent(
      /greater than 0/i,
    );
    expect(onCreate).not.toHaveBeenCalled();
  });

  it("has no hard-delete control", () => {
    render(
      <PortionCategoriesPanel
        categories={CATS}
        onUpdate={vi.fn()}
        onCreate={vi.fn()}
        onSetActive={vi.fn()}
      />,
    );
    expect(screen.queryByRole("button", { name: /delete/i })).toBeNull();
    expect(
      screen.getByTestId("portion-toggle-adult-male"),
    ).toHaveTextContent(/deactivate/i);
  });
});
