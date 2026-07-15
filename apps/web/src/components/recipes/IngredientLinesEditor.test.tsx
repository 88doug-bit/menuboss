/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as React from "react";

import { SEED_UNITS, DEFAULT_UNIT_ID } from "@/lib/units";

import {
  IngredientLinesEditor,
  emptyIngredientLine,
  validateIngredientLine,
  type IngredientLineDraft,
  type CreateIngredientResult,
} from "./IngredientLinesEditor";

function ControlledEditor({
  initial = [] as IngredientLineDraft[],
  onCreate,
  searchResults = [],
}: {
  initial?: IngredientLineDraft[];
  onCreate?: (input: {
    name: string;
    defaultUnitId: string;
  }) => Promise<CreateIngredientResult>;
  searchResults?: Array<{ id: string; name: string }>;
}) {
  const [value, setValue] = React.useState(initial);
  const [searchQuery, setSearchQuery] = React.useState("");
  const [showValidation, setShowValidation] = React.useState(false);

  return (
    <div>
      <IngredientLinesEditor
        value={value}
        onChange={setValue}
        units={SEED_UNITS}
        searchQuery={searchQuery}
        onSearchQueryChange={setSearchQuery}
        searchResults={
          searchQuery.trim()
            ? searchResults.filter((r) =>
                r.name.toLowerCase().includes(searchQuery.toLowerCase()),
              )
            : []
        }
        onCreateIngredient={
          onCreate ??
          (async () => ({
            ok: true as const,
            id: "new-id",
            name: "Created",
            defaultUnitId: DEFAULT_UNIT_ID,
          }))
        }
        showValidation={showValidation}
      />
      <button
        type="button"
        data-testid="force-validate"
        onClick={() => setShowValidation(true)}
      >
        Validate
      </button>
    </div>
  );
}

describe("validateIngredientLine", () => {
  it("rejects quantity 0", () => {
    const line = emptyIngredientLine({
      ingredientId: "00000000-0000-4000-8000-000000000001",
      ingredientName: "Salt",
      quantity: 0,
      unitId: DEFAULT_UNIT_ID,
    });
    const result = validateIngredientLine(line);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message.toLowerCase()).toMatch(/quantity|0|>/);
    }
  });

  it("accepts positive quantity", () => {
    const line = emptyIngredientLine({
      ingredientId: "00000000-0000-4000-8000-000000000001",
      ingredientName: "Salt",
      quantity: 1.5,
      unitId: DEFAULT_UNIT_ID,
    });
    expect(validateIngredientLine(line)).toEqual({ ok: true });
  });
});

describe("IngredientLinesEditor", () => {
  it("surfaces quantity 0 validation error", async () => {
    const user = userEvent.setup();
    const line = emptyIngredientLine({
      ingredientId: "00000000-0000-4000-8000-000000000001",
      ingredientName: "Olive oil",
      quantity: 0,
      unitId: DEFAULT_UNIT_ID,
    });

    render(<ControlledEditor initial={[line]} />);

    expect(screen.queryByTestId("ingredient-line-error-0")).toBeNull();

    await user.click(screen.getByTestId("force-validate"));

    expect(screen.getByTestId("ingredient-line-error-0")).toBeInTheDocument();
    expect(screen.getByTestId("ingredient-line-error-0").textContent).toMatch(
      /quantity/i,
    );
  });

  it("shows merge suggestion on duplicate-name CONFLICT and accepts it", async () => {
    const user = userEvent.setup();
    const existingId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const onCreate = vi.fn().mockResolvedValue({
      ok: false,
      conflict: true,
      existingId,
      existingName: "olive oil",
      message: 'Ingredient name already exists: "Olive Oil"',
    } satisfies CreateIngredientResult);

    render(
      <ControlledEditor
        onCreate={onCreate}
        searchResults={[]}
      />,
    );

    await user.type(screen.getByTestId("ingredient-search"), "Olive Oil");

    // no search hits → create inline
    expect(screen.getByTestId("ingredient-create-inline")).toBeInTheDocument();
    await user.click(screen.getByTestId("ingredient-create-submit"));

    await waitFor(() => {
      expect(screen.getByTestId("ingredient-merge-suggestion")).toBeInTheDocument();
    });
    expect(screen.getByTestId("ingredient-merge-suggestion")).toHaveTextContent(
      /already exists/i,
    );

    await user.click(screen.getByTestId("ingredient-merge-accept"));

    await waitFor(() => {
      expect(screen.getByTestId("ingredient-line-edit-0")).toHaveTextContent(
        "olive oil",
      );
    });
    expect(screen.queryByTestId("ingredient-merge-suggestion")).toBeNull();
  });
});
