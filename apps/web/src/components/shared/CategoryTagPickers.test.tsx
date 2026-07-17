/**
 * @vitest-environment jsdom
 *
 * TagPicker inline tag creation (admin-gated by the caller via onCreate).
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TagPicker } from "./CategoryTagPickers";
import type { TagDto } from "@/server/routers/tagMapper";

function tag(id: string, name: string): TagDto {
  return {
    id,
    name,
    slug: name.toLowerCase().replace(/\s+/g, "-"),
    tagGroup: "custom",
    description: null,
    color: null,
    icon: null,
    isActive: true,
    createdAt: "2026-07-16T00:00:00Z",
    updatedAt: "2026-07-16T00:00:00Z",
  };
}

const existing = [tag("t1", "Quick")];

describe("TagPicker — inline tag creation", () => {
  it("hides the new-tag input without onCreate (non-admins)", () => {
    render(
      <TagPicker tags={existing} selectedIds={[]} onChange={vi.fn()} />,
    );
    expect(screen.queryByTestId("tag-picker-new-name")).toBeNull();
  });

  it("disables Add until the name slugifies to something usable", async () => {
    render(
      <TagPicker
        tags={existing}
        selectedIds={[]}
        onChange={vi.fn()}
        onCreate={vi.fn()}
      />,
    );
    const add = screen.getByTestId("tag-picker-add");
    expect(add).toBeDisabled();
    await userEvent.type(screen.getByTestId("tag-picker-new-name"), "!!!");
    expect(add).toBeDisabled();
    await userEvent.clear(screen.getByTestId("tag-picker-new-name"));
    await userEvent.type(screen.getByTestId("tag-picker-new-name"), "Spicy");
    expect(add).toBeEnabled();
  });

  it("creates in the chosen group, auto-selects, and clears the input", async () => {
    const onChange = vi.fn();
    const onCreate = vi.fn(async (name: string) => tag("t9", name));
    render(
      <TagPicker
        tags={existing}
        selectedIds={["t1"]}
        onChange={onChange}
        onCreate={onCreate}
      />,
    );
    const input = screen.getByTestId("tag-picker-new-name");
    await userEvent.type(input, "  Spicy ");
    await userEvent.click(screen.getByTestId("tag-picker-add"));

    await waitFor(() =>
      expect(onCreate).toHaveBeenCalledWith("Spicy", "custom"),
    );
    expect(onChange).toHaveBeenCalledWith(["t1", "t9"]);
    expect(input).toHaveValue("");
  });

  it("offers existing tag groups in the group select", async () => {
    const onCreate = vi.fn(async (name: string) => tag("t9", name));
    render(
      <TagPicker
        tags={[
          { ...tag("t1", "Quick"), tagGroup: "difficulty" },
          { ...tag("t2", "Thai"), tagGroup: "cuisine" },
        ]}
        selectedIds={[]}
        onChange={vi.fn()}
        onCreate={onCreate}
      />,
    );
    const select = screen.getByTestId("tag-picker-new-group");
    const options = Array.from(select.querySelectorAll("option")).map(
      (o) => o.value,
    );
    expect(options).toEqual(["cuisine", "custom", "difficulty"]);

    await userEvent.type(screen.getByTestId("tag-picker-new-name"), "Lao");
    await userEvent.selectOptions(select, "cuisine");
    await userEvent.click(screen.getByTestId("tag-picker-add"));
    await waitFor(() => expect(onCreate).toHaveBeenCalledWith("Lao", "cuisine"));
  });

  it("blocks names that slugify to an existing slug in the same group", async () => {
    const onCreate = vi.fn();
    render(
      <TagPicker
        tags={existing} // "Quick" → slug "quick", group "custom"
        selectedIds={[]}
        onChange={vi.fn()}
        onCreate={onCreate}
      />,
    );
    // Different name, same slug ("Quick!" → "quick") in the same group.
    await userEvent.type(screen.getByTestId("tag-picker-new-name"), "Quick!");
    expect(screen.getByTestId("tag-picker-add")).toBeDisabled();
    expect(onCreate).not.toHaveBeenCalled();
  });

  it("maps CONFLICT errors (e.g. deactivated twin) to a friendly message", async () => {
    const onCreate = vi.fn(async () => {
      throw Object.assign(new Error("duplicate key value violates unique constraint"), {
        data: { code: "CONFLICT" },
      });
    });
    render(
      <TagPicker
        tags={existing}
        selectedIds={[]}
        onChange={vi.fn()}
        onCreate={onCreate}
      />,
    );
    await userEvent.type(screen.getByTestId("tag-picker-new-name"), "Spicy");
    await userEvent.click(screen.getByTestId("tag-picker-add"));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      /already exists.*deactivated/i,
    );
  });

  it("blocks duplicate names (case-insensitive) with a pointer to the chip", async () => {
    const onCreate = vi.fn();
    render(
      <TagPicker
        tags={existing}
        selectedIds={[]}
        onChange={vi.fn()}
        onCreate={onCreate}
      />,
    );
    await userEvent.type(screen.getByTestId("tag-picker-new-name"), "quick");
    expect(screen.getByTestId("tag-picker-add")).toBeDisabled();
    expect(
      screen.getByText(/already exists — click it above/i),
    ).toBeInTheDocument();
    expect(onCreate).not.toHaveBeenCalled();
  });

  it("surfaces creation failures inline", async () => {
    const onCreate = vi.fn(async () => {
      throw new Error("FORBIDDEN: admins only");
    });
    render(
      <TagPicker
        tags={existing}
        selectedIds={[]}
        onChange={vi.fn()}
        onCreate={onCreate}
      />,
    );
    await userEvent.type(screen.getByTestId("tag-picker-new-name"), "Spicy");
    await userEvent.click(screen.getByTestId("tag-picker-add"));
    expect(await screen.findByRole("alert")).toHaveTextContent(/admins only/i);
  });
});
