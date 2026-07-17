/**
 * @vitest-environment jsdom
 *
 * MealDialog — the hybrid plan-attachment rule (decision 2A), all three
 * branches plus the FORBIDDEN error path and change-recipe mode. tRPC
 * mocked; upsert payloads captured for assertion.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { MealPlanUpsertInput } from "@menu-boss/schemas";
import { MealDialog, type CoveringPlanLite } from "./MealDialog";

const state = vi.hoisted(() => ({
  upsertPayloads: [] as MealPlanUpsertInput[],
  failUpsert: false,
}));

const DETAILS: Record<string, object> = {
  "plan-1": {
    id: "plan-1",
    title: "Week plan",
    description: null,
    startDate: "2026-07-13",
    endDate: "2026-07-19",
    createdByHouseholdId: "hh-a",
    householdIds: ["hh-a"],
    portionRequirements: [],
    assignments: [
      {
        id: "asg-1",
        recipeId: "rec-old",
        assignmentDate: "2026-07-16",
        mealSlot: "dinner",
        servings: 2,
        notes: null,
      },
    ],
  },
  "plan-2": {
    id: "plan-2",
    title: "Other plan",
    description: null,
    startDate: "2026-07-16",
    endDate: "2026-07-16",
    createdByHouseholdId: "hh-a",
    householdIds: ["hh-a", "hh-b"],
    portionRequirements: [],
    assignments: [],
  },
};

vi.mock("@/lib/trpc/client", () => ({
  useTRPC: () => ({
    family: {
      me: {
        queryOptions: () => ({
          queryKey: ["family.me"],
          queryFn: async () => ({
            profile: { id: "p1", householdId: "hh-a", role: "member" },
            household: null,
          }),
        }),
      },
    },
    mealPlan: {
      pathFilter: () => ({ queryKey: [["mealPlan"]] }),
      byId: {
        queryOptions: (input: { id: string }) => ({
          queryKey: ["mealPlan.byId", input],
          queryFn: async () => DETAILS[input.id] ?? null,
        }),
      },
      upsert: {
        mutationOptions: (opts: Record<string, unknown>) => ({
          ...opts,
          mutationKey: ["mealPlan.upsert"],
          mutationFn: async (payload: MealPlanUpsertInput) => {
            if (state.failUpsert) {
              throw Object.assign(new Error("permission denied"), {
                data: { code: "FORBIDDEN" },
              });
            }
            state.upsertPayloads.push(payload);
            return { id: payload.id ?? "created" };
          },
        }),
      },
    },
    tag: {
      list: {
        queryOptions: (input: unknown) => ({
          queryKey: ["tag.list", input],
          queryFn: async () => [],
        }),
      },
    },
    recipe: {
      list: {
        queryOptions: (input: { q?: string }) => ({
          queryKey: ["recipe.list", input],
          queryFn: async () => ({
            items: [{ id: "rec-new", title: "Salmon Bowl" }],
            nextCursor: null,
          }),
        }),
      },
    },
  }),
}));

function renderDialog(
  props: Partial<Parameters<typeof MealDialog>[0]> = {},
  coveringPlans: CoveringPlanLite[] = [],
) {
  const onClose = vi.fn();
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={qc}>
      <MealDialog
        dayIso="2026-07-16"
        coveringPlans={coveringPlans}
        defaultSlot="dinner"
        onClose={onClose}
        {...props}
      />
    </QueryClientProvider>,
  );
  return onClose;
}

async function pickRecipe() {
  await userEvent.type(screen.getByTestId("recipe-picker-search"), "salmon");
  await userEvent.click(await screen.findByTestId("recipe-picker-result"));
  await screen.findByTestId("meal-dialog-recipe-selected");
}

beforeEach(() => {
  state.upsertPayloads.length = 0;
  state.failUpsert = false;
});

describe("MealDialog — no covering plan (auto-create branch)", () => {
  it("announces the auto-created plan and saves a single-day plan", async () => {
    const onClose = renderDialog({}, []);
    expect(screen.getByTestId("meal-dialog-autocreate-note")).toHaveTextContent(
      "Thu Jul 16, 2026",
    );

    // With no covering plan and no recipe, the save is the empty-plan path.
    await waitFor(() =>
      expect(screen.getByTestId("meal-dialog-save")).toHaveTextContent(
        /save empty plan/i,
      ),
    );

    await pickRecipe();
    // Once a recipe is picked, it's a normal meal save again.
    expect(screen.getByTestId("meal-dialog-save")).toHaveTextContent(
      /save to menu plan/i,
    );
    const save = screen.getByTestId("meal-dialog-save");
    await waitFor(() => expect(save).toBeEnabled());
    await userEvent.click(save);

    await waitFor(() => expect(state.upsertPayloads).toHaveLength(1));
    expect(state.upsertPayloads[0]).toMatchObject({
      title: "Thu Jul 16, 2026",
      startDate: "2026-07-16",
      endDate: "2026-07-16",
      householdIds: ["hh-a"],
      assignments: [
        {
          recipeId: "rec-new",
          assignmentDate: "2026-07-16",
          mealSlot: "dinner",
          servings: 1,
        },
      ],
    });
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it("saves an empty single-day plan when no recipe is picked", async () => {
    const onClose = renderDialog({}, []);
    const save = screen.getByTestId("meal-dialog-save");
    await waitFor(() => expect(save).toBeEnabled());
    expect(save).toHaveTextContent(/save empty plan/i);

    await userEvent.click(save);
    await waitFor(() => expect(state.upsertPayloads).toHaveLength(1));
    expect(state.upsertPayloads[0]).toMatchObject({
      title: "Thu Jul 16, 2026",
      startDate: "2026-07-16",
      endDate: "2026-07-16",
      householdIds: ["hh-a"],
      assignments: [],
    });
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });
});

describe("MealDialog — exactly one covering plan", () => {
  const plans = [{ id: "plan-1", title: "Week plan", isShared: true }];

  it("uses the plan silently (named, no picker) and appends the assignment", async () => {
    renderDialog({}, plans);
    expect(screen.getByTestId("meal-dialog-plan-target")).toHaveTextContent(
      "Week plan",
    );
    expect(screen.queryByTestId("meal-dialog-plan-select")).toBeNull();

    // A covering plan exists, so saving requires a recipe — dimmed with a
    // visible reason (empty-plan saves only apply to new plans).
    expect(screen.getByTestId("meal-dialog-save")).toBeDisabled();
    expect(screen.getByTestId("meal-dialog-save-hint")).toHaveTextContent(
      /pick a recipe/i,
    );

    await pickRecipe();
    // Slot pre-selected from the band zone; switch to lunch to prove it saves.
    await userEvent.selectOptions(
      screen.getByTestId("meal-dialog-slot"),
      "lunch",
    );
    const save = screen.getByTestId("meal-dialog-save");
    await waitFor(() => expect(save).toBeEnabled());
    await userEvent.click(save);

    await waitFor(() => expect(state.upsertPayloads).toHaveLength(1));
    const payload = state.upsertPayloads[0];
    expect(payload.id).toBe("plan-1");
    expect(payload.assignments).toHaveLength(2);
    expect(payload.assignments[1]).toMatchObject({
      recipeId: "rec-new",
      assignmentDate: "2026-07-16",
      mealSlot: "lunch",
    });
  });
});

describe("MealDialog — several covering plans", () => {
  const plans = [
    { id: "plan-1", title: "Week plan", isShared: true },
    { id: "plan-2", title: "Other plan", isShared: false },
  ];

  it("requires an explicit plan choice before saving", async () => {
    renderDialog({}, plans);
    const select = screen.getByTestId("meal-dialog-plan-select");
    await pickRecipe();

    // No plan chosen → save stays disabled, with a visible reason.
    expect(screen.getByTestId("meal-dialog-save")).toBeDisabled();
    expect(screen.getByTestId("meal-dialog-save-hint")).toHaveTextContent(
      /choose a plan/i,
    );

    await userEvent.selectOptions(select, "plan-2");
    const save = screen.getByTestId("meal-dialog-save");
    await waitFor(() => expect(save).toBeEnabled());
    await userEvent.click(save);

    await waitFor(() => expect(state.upsertPayloads).toHaveLength(1));
    expect(state.upsertPayloads[0].id).toBe("plan-2");
    expect(state.upsertPayloads[0].assignments).toHaveLength(1);
  });
});

describe("MealDialog — change-recipe mode", () => {
  it("updates the assignment's recipe in place", async () => {
    renderDialog(
      {
        existing: {
          planId: "plan-1",
          assignmentId: "asg-1",
          mealSlot: "dinner",
        },
      },
      [{ id: "plan-1", title: "Week plan", isShared: true }],
    );
    // No plan-attachment UI in change mode.
    expect(screen.queryByTestId("meal-dialog-plan-target")).toBeNull();
    expect(screen.queryByTestId("meal-dialog-autocreate-note")).toBeNull();

    await pickRecipe();
    const save = screen.getByTestId("meal-dialog-save");
    await waitFor(() => expect(save).toBeEnabled());
    await userEvent.click(save);

    await waitFor(() => expect(state.upsertPayloads).toHaveLength(1));
    const payload = state.upsertPayloads[0];
    expect(payload.id).toBe("plan-1");
    expect(payload.assignments).toHaveLength(1);
    expect(payload.assignments[0]).toMatchObject({
      id: "asg-1",
      recipeId: "rec-new",
      mealSlot: "dinner",
      servings: 2,
    });
  });
});

describe("MealDialog — error paths", () => {
  it("surfaces FORBIDDEN as a permission message and stays open", async () => {
    state.failUpsert = true;
    const onClose = renderDialog(
      {},
      [{ id: "plan-1", title: "Week plan", isShared: true }],
    );
    await pickRecipe();
    const save = screen.getByTestId("meal-dialog-save");
    await waitFor(() => expect(save).toBeEnabled());
    await userEvent.click(save);

    expect(await screen.findByRole("alert")).toHaveTextContent(/permission/i);
    expect(onClose).not.toHaveBeenCalled();
  });
});
