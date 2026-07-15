/**
 * Recipe browser: filters, interleaved ChefIdeas on search, Meals tab, load more.
 */
"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useMemo, useState } from "react";

import {
  ContentFilters,
  emptyFilters,
  type ContentFilterState,
} from "@/components/shared/ContentFilters";
import { EmptyState } from "@/components/shell/EmptyState";
import { useTRPC } from "@/lib/trpc/client";

import { CombinationCard } from "@/components/combinations/CombinationCard";
import { ChefIdeaSearchCard, RecipeCard } from "./RecipeCard";

type Tab = "recipes" | "meals";

export function RecipeBrowser() {
  const trpc = useTRPC();
  const [tab, setTab] = useState<Tab>("recipes");
  const [filters, setFilters] = useState<ContentFilterState>(emptyFilters);
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [pages, setPages] = useState<
    Array<{ items: Array<Record<string, unknown>>; nextCursor: string | null }>
  >([]);

  const listInput = useMemo(() => {
    const input: {
      q?: string;
      categoryIds?: string[];
      tagIds?: string[];
      maxTotalMinutes?: number;
      minRating?: number;
      cursor?: string;
      limit: number;
    } = { limit: 20 };
    if (filters.q.trim()) input.q = filters.q.trim();
    if (filters.categoryIds.length) input.categoryIds = filters.categoryIds;
    if (filters.tagIds.length) input.tagIds = filters.tagIds;
    if (filters.maxTotalMinutes !== "") {
      const n = Number(filters.maxTotalMinutes);
      if (!Number.isNaN(n)) input.maxTotalMinutes = n;
    }
    if (filters.minRating !== "") {
      const n = Number(filters.minRating);
      if (n >= 1 && n <= 5) input.minRating = n as 1 | 2 | 3 | 4 | 5;
    }
    if (cursor) input.cursor = cursor;
    return input;
  }, [filters, cursor]);

  const categoriesQuery = useQuery(
    trpc.category.list.queryOptions({ activeOnly: true }),
  );
  const tagsQuery = useQuery(trpc.tag.list.queryOptions({ activeOnly: true }));

  const recipesQuery = useQuery({
    ...trpc.recipe.list.queryOptions(listInput),
    enabled: tab === "recipes",
  });

  // Interleave ChefIdeas when search is non-empty (§9.2).
  const ideasQuery = useQuery({
    ...trpc.chefIdea.list.queryOptions({
      q: filters.q.trim() || undefined,
      categoryIds: filters.categoryIds.length
        ? filters.categoryIds
        : undefined,
      tagIds: filters.tagIds.length ? filters.tagIds : undefined,
      limit: 10,
    }),
    enabled: tab === "recipes" && filters.q.trim().length > 0,
  });

  const combosQuery = useQuery({
    ...trpc.recipeCombination.list.queryOptions({ limit: 20 }),
    enabled: tab === "meals",
  });

  // Accumulate pages when cursor advances
  const currentPage = recipesQuery.data;
  const allRecipes = useMemo(() => {
    if (!currentPage) return pages.flatMap((p) => p.items);
    if (!cursor) return currentPage.items;
    const prior = pages.flatMap((p) => p.items);
    // avoid dup if same page
    const ids = new Set(prior.map((r) => r.id as string));
    const merged = [
      ...prior,
      ...currentPage.items.filter((r) => !ids.has(r.id as string)),
    ];
    return merged;
  }, [currentPage, pages, cursor]);

  function onFilterChange(next: ContentFilterState) {
    setFilters(next);
    setCursor(undefined);
    setPages([]);
  }

  function loadMore() {
    if (!currentPage?.nextCursor) return;
    setPages((prev) => [
      ...prev,
      {
        items: currentPage.items as Array<Record<string, unknown>>,
        nextCursor: currentPage.nextCursor,
      },
    ]);
    setCursor(currentPage.nextCursor);
  }

  const catTree = categoriesQuery.data?.tree ?? [];
  const tags = Array.isArray(tagsQuery.data) ? tagsQuery.data : [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div
          role="tablist"
          aria-label="Recipes or meals"
          className="inline-flex rounded-lg border border-zinc-200 bg-zinc-50 p-0.5"
        >
          <button
            type="button"
            role="tab"
            aria-selected={tab === "recipes"}
            className={[
              "rounded-md px-3 py-1.5 text-sm font-medium",
              tab === "recipes"
                ? "bg-white text-zinc-900 shadow-sm"
                : "text-zinc-600",
            ].join(" ")}
            onClick={() => setTab("recipes")}
          >
            Recipes
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "meals"}
            className={[
              "rounded-md px-3 py-1.5 text-sm font-medium",
              tab === "meals"
                ? "bg-white text-zinc-900 shadow-sm"
                : "text-zinc-600",
            ].join(" ")}
            onClick={() => setTab("meals")}
          >
            Meals
          </button>
        </div>
        {tab === "meals" ? (
          <Link
            href="/recipes/combinations/new"
            className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700"
          >
            New combination
          </Link>
        ) : null}
      </div>

      {tab === "recipes" ? (
        <>
          <ContentFilters
            value={filters}
            onChange={onFilterChange}
            categories={catTree}
            tags={tags}
            searchPlaceholder="Search recipes (and ideas)…"
          />

          {recipesQuery.isLoading ? (
            <p className="text-sm text-zinc-500">Loading recipes…</p>
          ) : null}
          {recipesQuery.isError ? (
            <p className="text-sm text-red-600" role="alert">
              Could not load recipes.
            </p>
          ) : null}

          {!recipesQuery.isLoading &&
          allRecipes.length === 0 &&
          !(ideasQuery.data?.items.length) ? (
            <EmptyState
              title="No recipes yet"
              description="Add a family recipe or convert a ChefIdea when you're ready."
            />
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {(ideasQuery.data?.items ?? []).map((idea) => (
                <ChefIdeaSearchCard
                  key={`idea-${idea.id}`}
                  id={idea.id}
                  title={idea.title}
                  notes={idea.notes}
                  status={idea.status}
                />
              ))}
              {allRecipes.map((r) => (
                <RecipeCard
                  key={r.id as string}
                  id={r.id as string}
                  title={r.title as string}
                  description={(r.description as string | null) ?? null}
                  totalTimeMinutes={
                    (r.totalTimeMinutes as number | null) ?? null
                  }
                  makeAgainRating={
                    (r.makeAgainRating as number | null) ?? null
                  }
                  isDeleted={Boolean(r.isDeleted)}
                />
              ))}
            </div>
          )}

          {currentPage?.nextCursor ? (
            <div className="flex justify-center pt-2">
              <button
                type="button"
                data-testid="recipes-load-more"
                className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50"
                onClick={loadMore}
                disabled={recipesQuery.isFetching}
              >
                {recipesQuery.isFetching ? "Loading…" : "Load more"}
              </button>
            </div>
          ) : null}
        </>
      ) : (
        <>
          {combosQuery.isLoading ? (
            <p className="text-sm text-zinc-500">Loading meals…</p>
          ) : null}
          {!combosQuery.isLoading &&
          (combosQuery.data?.items.length ?? 0) === 0 ? (
            <EmptyState
              title="No meal combinations yet"
              description="Group recipes into a complete meal with roles and order."
              action={
                <Link
                  href="/recipes/combinations/new"
                  className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white"
                >
                  Create combination
                </Link>
              }
            />
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {(combosQuery.data?.items ?? []).map((c) => (
                <CombinationCard
                  key={c.id}
                  id={c.id}
                  name={c.name}
                  notes={c.notes}
                  makeAgainRating={c.makeAgainRating}
                  isTemplate={c.isTemplate}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
