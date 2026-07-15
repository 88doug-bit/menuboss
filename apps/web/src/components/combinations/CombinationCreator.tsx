/**
 * RecipeCombination creator: pick recipes, role + order (up/down, no dnd lib),
 * notes, rating, save-as-template.
 */
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import type { RoleInMeal } from "@menu-boss/schemas";
import { useTRPC } from "@/lib/trpc/client";

const ROLES: RoleInMeal[] = [
  "main",
  "side",
  "dessert",
  "appetizer",
  "other",
];

type DraftLine = {
  key: string;
  recipeId: string;
  recipeTitle: string;
  roleInMeal: RoleInMeal;
  notes: string;
};

let keySeq = 0;
function nextKey() {
  keySeq += 1;
  return `line-${keySeq}`;
}

export function CombinationCreator() {
  const trpc = useTRPC();
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();

  const preselectId = searchParams.get("recipeId");

  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [rating, setRating] = useState<string>("");
  const [isTemplate, setIsTemplate] = useState(true);
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);

  const searchQuery = useQuery({
    ...trpc.recipe.list.queryOptions({
      q: search.trim() || undefined,
      limit: 12,
    }),
    enabled: search.trim().length > 0,
  });

  // Prefill recipe from query string once.
  const preselectQuery = useQuery({
    ...trpc.recipe.byId.queryOptions({ id: preselectId! }),
    enabled: Boolean(preselectId),
  });

  useEffect(() => {
    if (!preselectQuery.data) return;
    const r = preselectQuery.data;
    setLines((prev) => {
      if (prev.some((l) => l.recipeId === r.id)) return prev;
      return [
        ...prev,
        {
          key: nextKey(),
          recipeId: r.id,
          recipeTitle: r.title,
          roleInMeal: "main",
          notes: "",
        },
      ];
    });
  }, [preselectQuery.data]);

  const createMutation = useMutation(
    trpc.recipeCombination.create.mutationOptions({
      onSuccess: async (created) => {
        await queryClient.invalidateQueries(
          trpc.recipeCombination.list.queryFilter(),
        );
        router.push(`/recipes/combinations/${created.id}`);
      },
    }),
  );

  function addRecipe(id: string, title: string) {
    setLines((prev) => {
      if (prev.some((l) => l.recipeId === id)) return prev;
      return [
        ...prev,
        {
          key: nextKey(),
          recipeId: id,
          recipeTitle: title,
          roleInMeal: prev.length === 0 ? "main" : "side",
          notes: "",
        },
      ];
    });
    setSearch("");
  }

  function move(index: number, dir: -1 | 1) {
    setLines((prev) => {
      const next = [...prev];
      const target = index + dir;
      if (target < 0 || target >= next.length) return prev;
      const tmp = next[index]!;
      next[index] = next[target]!;
      next[target] = tmp;
      return next;
    });
  }

  function updateLine(index: number, patch: Partial<DraftLine>) {
    setLines((prev) =>
      prev.map((l, i) => (i === index ? { ...l, ...patch } : l)),
    );
  }

  function removeLine(index: number) {
    setLines((prev) => prev.filter((_, i) => i !== index));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) {
      setError("Name is required");
      return;
    }
    if (lines.length === 0) {
      setError("Add at least one recipe");
      return;
    }
    try {
      await createMutation.mutateAsync({
        name: name.trim(),
        notes: notes.trim() || undefined,
        makeAgainRating: rating
          ? (Number(rating) as 1 | 2 | 3 | 4 | 5)
          : undefined,
        isTemplate,
        recipes: lines.map((l, i) => ({
          recipeId: l.recipeId,
          roleInMeal: l.roleInMeal,
          sequenceOrder: i,
          notes: l.notes.trim() || undefined,
        })),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    }
  }

  return (
    <form
      data-testid="combination-creator"
      onSubmit={(e) => void submit(e)}
      className="mx-auto max-w-xl space-y-4"
    >
      <label className="block text-sm font-medium text-zinc-700">
        Meal name
        <input
          data-testid="combo-name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
          placeholder="Sunday roast plate"
        />
      </label>

      <label className="block text-sm font-medium text-zinc-700">
        Notes
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
          placeholder="Timing / pairing comments"
        />
      </label>

      <div className="flex flex-wrap gap-4">
        <label className="text-sm font-medium text-zinc-700">
          Make-again
          <select
            value={rating}
            onChange={(e) => setRating(e.target.value)}
            className="mt-1 block rounded-lg border border-zinc-300 px-2 py-1.5 text-sm"
          >
            <option value="">—</option>
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={String(n)}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm text-zinc-700">
          <input
            type="checkbox"
            checked={isTemplate}
            onChange={(e) => setIsTemplate(e.target.checked)}
            className="h-4 w-4 rounded border-zinc-300"
          />
          Save as template
        </label>
      </div>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-zinc-800">Recipes</h2>
        <label className="block text-sm text-zinc-600">
          Search recipes to add
          <input
            data-testid="combo-recipe-search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
            placeholder="Type to search…"
          />
        </label>
        {search.trim() && searchQuery.data?.items.length ? (
          <ul className="max-h-40 overflow-y-auto rounded-lg border border-zinc-200 bg-white">
            {searchQuery.data.items.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  className="w-full px-3 py-2 text-left text-sm hover:bg-emerald-50"
                  onClick={() => addRecipe(r.id, r.title)}
                >
                  {r.title}
                </button>
              </li>
            ))}
          </ul>
        ) : null}

        {lines.length === 0 ? (
          <p className="text-sm text-zinc-500">No recipes yet — search above.</p>
        ) : (
          <ul className="space-y-2" data-testid="combo-lines">
            {lines.map((line, index) => (
              <li
                key={line.key}
                data-testid={`combo-line-${index}`}
                className="rounded-lg border border-zinc-200 bg-white p-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium text-zinc-900">
                    {index + 1}. {line.recipeTitle}
                  </p>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      data-testid={`combo-up-${index}`}
                      aria-label="Move up"
                      disabled={index === 0}
                      onClick={() => move(index, -1)}
                      className="rounded border border-zinc-300 px-2 py-0.5 text-xs disabled:opacity-40"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      data-testid={`combo-down-${index}`}
                      aria-label="Move down"
                      disabled={index === lines.length - 1}
                      onClick={() => move(index, 1)}
                      className="rounded border border-zinc-300 px-2 py-0.5 text-xs disabled:opacity-40"
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      onClick={() => removeLine(index)}
                      className="rounded border border-red-200 px-2 py-0.5 text-xs text-red-700"
                    >
                      Remove
                    </button>
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <label className="text-xs text-zinc-600">
                    Role
                    <select
                      value={line.roleInMeal}
                      onChange={(e) =>
                        updateLine(index, {
                          roleInMeal: e.target.value as RoleInMeal,
                        })
                      }
                      className="ml-1 rounded border border-zinc-300 px-1.5 py-0.5 text-xs"
                    >
                      {ROLES.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="min-w-[12rem] flex-1 text-xs text-zinc-600">
                    Notes
                    <input
                      value={line.notes}
                      onChange={(e) =>
                        updateLine(index, { notes: e.target.value })
                      }
                      className="mt-0.5 w-full rounded border border-zinc-300 px-2 py-1 text-xs"
                    />
                  </label>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {error ? (
        <p className="text-sm text-red-600" role="alert">
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        data-testid="combo-save"
        disabled={createMutation.isPending}
        className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {createMutation.isPending ? "Saving…" : "Save combination"}
      </button>
    </form>
  );
}
