/**
 * @vitest-environment jsdom
 *
 * RecipePicker — debounced search, tag filter chips, pick + clear, empty
 * state. Pins the E2E testid contract (`recipe-picker-search` /
 * `recipe-picker-result`). tRPC mocked; the mock queryFn records each
 * executed fetch so debouncing is observable.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RecipePicker } from "./RecipePicker";

type RecipeListInput = { q?: string; tagIds?: string[]; limit?: number };

const calls = vi.hoisted(() => ({ recipeList: [] as RecipeListInput[] }));

const RECIPES = [
  { id: "r1", title: "Salmon Bowl", tagIds: ["t2"] },
  { id: "r2", title: "Pasta Night", tagIds: ["t1"] },
];

vi.mock("@/lib/trpc/client", () => ({
  useTRPC: () => ({
    tag: {
      list: {
        queryOptions: (input: unknown) => ({
          queryKey: ["tag.list", input],
          queryFn: async () => [
            { id: "t1", name: "Quick" },
            { id: "t2", name: "Seafood" },
          ],
        }),
      },
    },
    recipe: {
      list: {
        queryOptions: (input: RecipeListInput) => ({
          queryKey: ["recipe.list", input],
          queryFn: async () => {
            calls.recipeList.push(input);
            const items = RECIPES.filter(
              (r) =>
                (!input.q ||
                  r.title.toLowerCase().includes(input.q.toLowerCase())) &&
                (!input.tagIds ||
                  input.tagIds.some((t) => r.tagIds.includes(t))),
            ).map(({ id, title }) => ({ id, title }));
            return { items, nextCursor: null };
          },
        }),
      },
    },
  }),
}));

function renderPicker(onPick = vi.fn()) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={qc}>
      <RecipePicker onPick={onPick} />
    </QueryClientProvider>,
  );
  return onPick;
}

beforeEach(() => {
  calls.recipeList.length = 0;
});

describe("RecipePicker", () => {
  it("lists first recipes immediately (browsable without typing)", async () => {
    renderPicker();
    const results = await screen.findAllByTestId("recipe-picker-result");
    expect(results).toHaveLength(2);
    expect(calls.recipeList).toContainEqual({
      q: undefined,
      tagIds: undefined,
      limit: 8,
    });
  });

  it("searches after debounce (one query, not per keystroke)", async () => {
    renderPicker();
    await userEvent.type(screen.getByTestId("recipe-picker-search"), "salmon");

    await waitFor(() =>
      expect(calls.recipeList).toContainEqual({
        q: "salmon",
        tagIds: undefined,
        limit: 8,
      }),
    );
    await waitFor(() =>
      expect(screen.getAllByTestId("recipe-picker-result")).toHaveLength(1),
    );
    expect(screen.getByTestId("recipe-picker-result")).toHaveTextContent(
      "Salmon Bowl",
    );

    // Debounce collapsed the keystrokes: only the idle query + the final
    // search ran — never the intermediate prefixes.
    const partials = calls.recipeList.filter(
      (c) => c.q && c.q !== "salmon",
    );
    expect(partials).toEqual([]);
  });

  it("filters by tag chips without any search text", async () => {
    renderPicker();
    await userEvent.click(await screen.findByTestId("recipe-picker-tag-t2"));

    await waitFor(() =>
      expect(screen.getAllByTestId("recipe-picker-result")).toHaveLength(1),
    );
    expect(screen.getByTestId("recipe-picker-result")).toHaveTextContent(
      "Salmon Bowl",
    );
    await waitFor(() =>
      expect(calls.recipeList).toContainEqual({
        q: undefined,
        tagIds: ["t2"],
        limit: 8,
      }),
    );
  });

  it("composes tag filters with search text", async () => {
    renderPicker();
    await userEvent.click(await screen.findByTestId("recipe-picker-tag-t1"));
    await userEvent.type(screen.getByTestId("recipe-picker-search"), "pasta");

    await waitFor(() =>
      expect(screen.getAllByTestId("recipe-picker-result")).toHaveLength(1),
    );
    expect(screen.getByTestId("recipe-picker-result")).toHaveTextContent(
      "Pasta Night",
    );
    await waitFor(() =>
      expect(calls.recipeList).toContainEqual({
        q: "pasta",
        tagIds: ["t1"],
        limit: 8,
      }),
    );
  });

  it("fires onPick and clears the search box", async () => {
    const onPick = renderPicker();
    const search = screen.getByTestId("recipe-picker-search");
    await userEvent.type(search, "salmon");
    await waitFor(() =>
      expect(screen.getAllByTestId("recipe-picker-result")).toHaveLength(1),
    );
    await userEvent.click(screen.getByTestId("recipe-picker-result"));

    expect(onPick).toHaveBeenCalledWith({ id: "r1", title: "Salmon Bowl" });
    expect(search).toHaveValue("");
  });

  it("showIdleResults=false renders and fetches nothing until a search/filter", async () => {
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={qc}>
        <RecipePicker onPick={vi.fn()} showIdleResults={false} />
      </QueryClientProvider>,
    );
    expect(screen.queryByTestId("recipe-picker-result")).toBeNull();
    expect(screen.queryByTestId("recipe-picker-empty")).toBeNull();
    expect(calls.recipeList).toEqual([]);

    await userEvent.type(screen.getByTestId("recipe-picker-search"), "salmon");
    await waitFor(() =>
      expect(screen.getAllByTestId("recipe-picker-result")).toHaveLength(1),
    );
  });

  it("shows the empty state when nothing matches", async () => {
    renderPicker();
    await userEvent.type(screen.getByTestId("recipe-picker-search"), "zzz");
    expect(await screen.findByTestId("recipe-picker-empty")).toBeInTheDocument();
  });

});
