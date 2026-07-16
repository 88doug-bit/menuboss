/**
 * ChefIdea detail + convertToRecipe flow.
 */
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { StatusChip } from "@/components/shared/StatusChip";
import { useTRPC } from "@/lib/trpc/client";

export function ChefIdeaDetail({ ideaId }: { ideaId: string }) {
  const trpc = useTRPC();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [converting, setConverting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ideaQuery = useQuery(trpc.chefIdea.byId.queryOptions({ id: ideaId }));

  const convertMutation = useMutation(
    trpc.chefIdea.convertToRecipe.mutationOptions({
      onSuccess: async (result) => {
        await queryClient.invalidateQueries(
          trpc.chefIdea.byId.queryFilter({ id: ideaId }),
        );
        // Route to recipe detail (edit view arrives with Task 11/later edit page).
        router.push(`/recipes/${result.recipe.id}`);
      },
    }),
  );

  if (ideaQuery.isLoading) {
    return <p className="text-sm text-zinc-500">Loading idea…</p>;
  }
  if (ideaQuery.isError || !ideaQuery.data) {
    return (
      <p className="text-sm text-red-600" role="alert">
        Idea not found.
      </p>
    );
  }

  const idea = ideaQuery.data;

  async function convert() {
    setError(null);
    setConverting(true);
    try {
      await convertMutation.mutateAsync({ id: ideaId });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Conversion failed");
      setConverting(false);
    }
  }

  return (
    <article className="mx-auto max-w-xl space-y-4" data-testid="chef-idea-detail">
      {/* Post-save redirect lands here — this row doubles as the §9.3 "save
          succeeded" affordance (contract: capture-idea-success). */}
      <div
        className="flex flex-wrap items-center gap-2"
        data-testid="capture-idea-success"
      >
        <StatusChip
          tone={
            idea.status === "idea" ||
            idea.status === "researching" ||
            idea.status === "tested" ||
            idea.status === "adopted" ||
            idea.status === "abandoned"
              ? idea.status
              : "neutral"
          }
        >
          {idea.status}
        </StatusChip>
        {idea.priority != null ? (
          <span className="text-sm text-zinc-500">Priority {idea.priority}</span>
        ) : null}
      </div>
      <h1 className="text-2xl font-bold text-zinc-900" data-testid="chef-idea-title">
        {idea.title}
      </h1>
      {idea.source ? (
        <p className="text-sm text-zinc-500">Source: {idea.source}</p>
      ) : null}
      {idea.notes ? (
        <p className="whitespace-pre-wrap text-zinc-700">{idea.notes}</p>
      ) : null}

      {idea.convertedRecipeId ? (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          Adopted —{" "}
          <Link
            href={`/recipes/${idea.convertedRecipeId}`}
            className="font-medium underline"
            data-testid="adopted-recipe-link"
          >
            open converted recipe
          </Link>
        </p>
      ) : (
        <button
          type="button"
          data-testid="convert-to-recipe"
          disabled={converting}
          onClick={() => void convert()}
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          {converting ? "Converting…" : "Convert to Recipe"}
        </button>
      )}

      {error ? (
        <p className="text-sm text-red-600" role="alert">
          {error}
        </p>
      ) : null}
    </article>
  );
}
