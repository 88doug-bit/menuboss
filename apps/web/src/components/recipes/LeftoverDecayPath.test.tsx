import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { LeftoverDecayPath } from "./LeftoverDecayPath";

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
  }: {
    children: React.ReactNode;
    href: string;
  }) => <a href={href}>{children}</a>,
}));

describe("LeftoverDecayPath", () => {
  it("adds a new decay-path entry via inline form", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);

    render(<LeftoverDecayPath entries={[]} onSave={onSave} />);

    // Expand empty section
    await user.click(screen.getByRole("button", { name: /Creative Leftovers/i }));

    await user.type(screen.getByTestId("decay-add-use"), "Cuban sandwiches");
    await user.type(screen.getByTestId("decay-add-notes"), "Use crusty rolls");
    await user.click(screen.getByTestId("decay-add-submit"));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith([
        { use: "Cuban sandwiches", notes: "Use crusty rolls" },
      ]);
    });
  });

  it("edits an existing entry and links navigate by recipe id", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);
    const linkedId = "11111111-1111-1111-1111-111111111111";

    render(
      <LeftoverDecayPath
        entries={[
          {
            use: "Tacos",
            notes: "Soft shells",
            linkedRecipeIds: [linkedId],
          },
        ]}
        onSave={onSave}
        recipeTitles={{ [linkedId]: "Pork Tacos" }}
      />,
    );

    expect(screen.getByTestId("decay-entry-0")).toHaveTextContent("Tacos");
    const link = screen.getByRole("link", { name: "Pork Tacos" });
    expect(link).toHaveAttribute("href", `/recipes/${linkedId}`);

    await user.click(screen.getByTestId("decay-edit-0"));
    const useInput = screen.getByTestId("decay-edit-use");
    await user.clear(useInput);
    await user.type(useInput, "Carnitas bowls");
    await user.click(screen.getByTestId("decay-save-edit"));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith([
        {
          use: "Carnitas bowls",
          notes: "Soft shells",
          linkedRecipeIds: [linkedId],
        },
      ]);
    });
  });

  it("removes an entry", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);

    render(
      <LeftoverDecayPath
        entries={[{ use: "Soup" }, { use: "Hash" }]}
        onSave={onSave}
      />,
    );

    await user.click(screen.getByTestId("decay-remove-0"));
    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith([{ use: "Hash" }]);
    });
  });
});
