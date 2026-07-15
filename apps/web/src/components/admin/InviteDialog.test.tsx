/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { InviteDialog } from "./InviteDialog";
import {
  isValidInviteEmail,
  normalizeInviteEmail,
} from "./adminValidation";

const HOUSEHOLDS = [
  { id: "hh-a", name: "Household A" },
  { id: "hh-b", name: "Household B" },
];

describe("normalizeInviteEmail / isValidInviteEmail", () => {
  it("trims and lowercases email", () => {
    expect(normalizeInviteEmail("  Alice@Example.COM ")).toBe(
      "alice@example.com",
    );
  });

  it("rejects invalid emails", () => {
    expect(isValidInviteEmail("")).toBe(false);
    expect(isValidInviteEmail("   ")).toBe(false);
    expect(isValidInviteEmail("not-an-email")).toBe(false);
    expect(isValidInviteEmail("ok@example.com")).toBe(true);
  });
});

describe("InviteDialog", () => {
  it("normalizes email (trim + lowercase) on submit", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <InviteDialog
        open
        households={HOUSEHOLDS}
        onClose={vi.fn()}
        onSubmit={onSubmit}
      />,
    );

    await user.type(
      screen.getByTestId("invite-email"),
      "  NewCook@Example.COM ",
    );
    await user.click(screen.getByTestId("invite-submit"));

    expect(onSubmit).toHaveBeenCalledWith({
      email: "newcook@example.com",
      householdId: "hh-a",
      role: "member",
    });
  });

  it("shows validation error for bad email", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <InviteDialog
        open
        households={HOUSEHOLDS}
        onClose={vi.fn()}
        onSubmit={onSubmit}
      />,
    );

    await user.type(screen.getByTestId("invite-email"), "not-valid");
    await user.click(screen.getByTestId("invite-submit"));

    expect(screen.getByTestId("invite-error")).toHaveTextContent(
      /valid email/i,
    );
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("shows 0005 invite copy", () => {
    render(
      <InviteDialog
        open
        households={HOUSEHOLDS}
        onClose={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );
    expect(screen.getByTestId("invite-dialog")).toHaveTextContent(
      /sign up/i,
    );
    expect(screen.getByTestId("invite-dialog")).toHaveTextContent(
      /already have an account/i,
    );
  });
});
