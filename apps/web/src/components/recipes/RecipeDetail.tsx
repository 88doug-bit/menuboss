/**
 * Recipe detail: ingredients + safety callouts, instructions, rating,
 * leftovers decay path, soft-delete badge, Add to Plan / Combination.
 */
"use client";

import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useMemo } from "react";

import { DeletedBadge } from "@/components/shared/DeletedBadge";
import { useTRPC } from "@/lib/trpc/client";
import type { LeftoverDecayPathEntry } from "@menu-boss/schemas";

import { IngredientLine } from "./IngredientLine";
import { InstructionSteps, parseInstructions } from "./InstructionSteps";
import {
  LeftoverDecayPath,
  type DecayPathEntry,
} from "./LeftoverDecayPath";
import { MakeAgainRating, useOptimisticRating } from "./MakeAgainRating";

function parseDecayPath(raw: unknown): DecayPathEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: DecayPathEntry[] = [];
  for (const e of raw) {
    if (!e || typeof e !== "object") continue;
    const o = e as Record<string, unknown>;
    if (typeof o.use !== "string" || !o.use.trim()) continue;
    const entry: DecayPathEntry = { use: o.use };
    if (typeof o.notes === "string") entry.notes = o.notes;
    if (Array.isArray(o.linkedRecipeIds)) {
      entry.linkedRecipeIds = o.linkedRecipeIds.filter(
        (id): id is string => typeof id === "string",
      );
    }
    out.push(entry);
  }
  return out;
}

export function RecipeDetail({ recipeId }: { recipeId: string }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const detailQuery = useQuery(trpc.recipe.byId.queryOptions({ id: recipeId }));

  const ingredientIds = useMemo(
    () =>
      (detailQuery.data?.ingredients ?? []).map((i) => i.ingredientId),
    [detailQuery.data?.ingredients],
  );

  const ingredientQueries = useQueries({
    queries: ingredientIds.map((id) =>
      trpc.ingredient.byId.queryOptions({ id }),
    ),
  });

  const ingredientById = useMemo(() => {
    const map = new Map<
      string,
      { name: string; foodSafetyProfile: unknown }
    >();
    for (const q of ingredientQueries) {
      if (q.data) {
        map.set(q.data.id, {
          name: q.data.name,
          foodSafetyProfile: q.data.foodSafetyProfile,
        });
      }
    }
    return map;
  }, [ingredientQueries]);

  const rateMutation = useMutation(
    trpc.recipe.rate.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries(
          trpc.recipe.byId.queryFilter({ id: recipeId }),
        );
      },
    }),
  );

  const decayMutation = useMutation(
    trpc.recipe.setLeftoverDecayPath.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries(
          trpc.recipe.byId.queryFilter({ id: recipeId }),
        );
      },
    }),
  );

  const {
    value: ratingValue,
    pending: ratingPending,
    error: ratingError,
    rate,
  } = useOptimisticRating(
    detailQuery.data?.makeAgainRating,
    async (makeAgainRating) => {
      await rateMutation.mutateAsync({ id: recipeId, makeAgainRating });
    },
  );

  if (detailQuery.isLoading) {
    return <p className="text-sm text-zinc-500">Loading recipe…</p>;
  }
  if (detailQuery.isError || !detailQuery.data) {
    return (
      <p className="text-sm text-red-600" role="alert">
        Recipe not found or inaccessible.
      </p>
    );
  }

  const recipe = detailQuery.data;
  const steps = parseInstructions(recipe.instructions);
  const decay = parseDecayPath(recipe.leftoverDecayPath);
  const linkedIds = decay.flatMap((e) => e.linkedRecipeIds ?? []);
  // Titles for linked recipes — best-effort via parallel queries would be heavy;
  // links still navigate by id.
  const recipeTitles: Record<string, string> = {};
  for (const id of linkedIds) {
    recipeTitles[id] = "Linked recipe";
  }

  return (
    <article data-testid="recipe-detail" className="mx-auto max-w-2xl space-y-6">
      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-bold text-zinc-900">{recipe.title}</h1>
          {recipe.isDeleted ? <DeletedBadge /> : null}
        </div>
        {recipe.description ? (
          <p className="text-zinc-600">{recipe.description}</p>
        ) : null}
        <div className="flex flex-wrap gap-3 text-sm text-zinc-500">
          {recipe.totalTimeMinutes != null ? (
            <span>{recipe.totalTimeMinutes} min total</span>
          ) : null}
          {recipe.prepTimeMinutes != null ? (
            <span>Prep {recipe.prepTimeMinutes} min</span>
          ) : null}
          {recipe.cookTimeMinutes != null ? (
            <span>Cook {recipe.cookTimeMinutes} min</span>
          ) : null}
          <span>Serves {recipe.yieldServings}</span>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-4">
        <div>
          <p className="mb-1 text-xs font-medium uppercase text-zinc-500">
            Make again
          </p>
          <MakeAgainRating
            value={ratingValue}
            onRate={rate}
            pending={ratingPending}
            disabled={recipe.isDeleted}
          />
          {ratingError ? (
            <p className="mt-1 text-xs text-red-600" role="alert">
              {ratingError}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/calendar?addRecipe=${recipe.id}`}
            className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700"
          >
            Add to Plan
          </Link>
          {/* <!-- TODO(coordinator): Task 11 plan editor preselect via ?addRecipe= --> */}
          <Link
            href={`/recipes/combinations/new?recipeId=${recipe.id}`}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50"
          >
            Add to Combination
          </Link>
        </div>
      </div>

      <section>
        <h2 className="mb-2 text-lg font-semibold text-zinc-900">Ingredients</h2>
        <ul className="divide-y divide-zinc-100 rounded-xl border border-zinc-200 bg-white px-3">
          {[...(recipe.ingredients ?? [])]
            .sort((a, b) => a.sequenceOrder - b.sequenceOrder)
            .map((ing) => {
              const meta = ingredientById.get(ing.ingredientId);
              return (
                <IngredientLine
                  key={ing.id}
                  name={meta?.name ?? "Ingredient"}
                  quantity={ing.quantity}
                  unitLabel={null}
                  preparationNote={ing.preparationNote}
                  isOptional={ing.isOptional}
                  foodSafetyProfile={meta?.foodSafetyProfile}
                />
              );
            })}
        </ul>
      </section>

      <section>
        <h2 className="mb-2 text-lg font-semibold text-zinc-900">Instructions</h2>
        <InstructionSteps steps={steps} />
      </section>

      <LeftoverDecayPath
        entries={decay}
        saving={decayMutation.isPending}
        recipeTitles={recipeTitles}
        onSave={async (next) => {
          await decayMutation.mutateAsync({
            id: recipeId,
            leftoverDecayPath: next as LeftoverDecayPathEntry[],
          });
        }}
      />
    </article>
  );
}
